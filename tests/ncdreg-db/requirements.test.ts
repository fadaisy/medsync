/**
 * PGlite lane: requirements without a test of their own until P11 — E2 call outcomes, F2 drill-down
 * audit, F4 own panel, I3 settings, G3 query resolution — and the failure paths of continueLoad and
 * the legacy import (atomic; out-of-range values only with an explicit acceptance).
 */
import { randomUUID } from "node:crypto";
import type { Lane } from "../emr-db/_pglite";
import type { NcdFacility } from "./_ncd";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";

import { DemoEmpty } from "@/app/ncd/_components/demo-empty";
import { getSettings, updateSettings } from "@/lib/ncdreg/admin";
import { continueLoad, turnOn } from "@/lib/ncdreg/demo/service";
import { DEMO_COPY } from "@/lib/ncdreg/demo/source";
import { fullExport } from "@/lib/ncdreg/exchange";
import { LEGACY_TEMPLATE, legacyApply, legacyDryRun } from "@/lib/ncdreg/exchange/legacy";
import { computeIndicators } from "@/lib/ncdreg/indicators/engine";
import { loadDataset } from "@/lib/ncdreg/indicators/load";
import { enabledModules } from "@/lib/ncdreg/indicators/snapshot";
import { dashboardBoard, drillDown } from "@/lib/ncdreg/read/dashboard";
import { myPanel } from "@/lib/ncdreg/read/views";
import { ctxFor, enrol, ok, refused, run } from "./_engine";
import { bootLane, laneOn, ncdFacility } from "./_ncd";

describe.skipIf(!laneOn)("requirements without a test until P11", () => {
  let lane: Lane;
  let f: NcdFacility;
  beforeAll(async () => {
    lane = await bootLane();
    f = await ncdFacility(lane.pg, "Requirements facility");
  }, 120_000);

  const closedVisit = async (
    role: "clinician" | "registry_lead",
    personId: string,
    bp: [number, number][],
  ) => {
    const c = await ctxFor(lane.db, f, role);
    await ok(c, "visit.record", {
      visitId: randomUUID(),
      personId,
      visitDate: c.today,
      visitType: "scheduled",
      isHistorical: false,
      bp,
      nextAppointmentDate: "2027-01-05",
    });
  };

  it("E2: each call outcome does what it says, and only recall workers log calls", async () => {
    const officer = await ctxFor(lane.db, f, "registry_officer");
    const clin = await ctxFor(lane.db, f, "clinician");
    const call = (personId: string, outcome: string, o: Record<string, unknown> = {}) =>
      run(officer, "call.log", { callId: randomUUID(), personId, outcome, ...o });
    const p = await enrol(clin, { phone: "0772 100 200" });
    const flags = async () =>
      (
        await lane.pg.query<{ phone1_invalid: boolean; removed: boolean }>(
          `SELECT phone1_invalid, recall_removed_at IS NOT NULL AS removed FROM public.ncd_person WHERE id = $1`,
          [p.personId],
        )
      ).rows[0]!;

    expect((await call(p.personId, "no_answer")).ok).toBe(true);
    expect(await flags()).toEqual({ phone1_invalid: false, removed: false });
    await call(p.personId, "wrong_number", { phoneSlot: 1 });
    expect((await flags()).phone1_invalid).toBe(true);

    // D-22: a will-return date is a promise on the call, not a booked appointment.
    const appts = async () =>
      (
        await lane.pg.query(`SELECT 1 FROM public.ncd_appointment WHERE person_id = $1`, [
          p.personId,
        ])
      ).rows.length;
    const before = await appts();
    refused(await call(p.personId, "will_return", { newAppointmentDate: clin.today }), "invalid");
    expect((await call(p.personId, "will_return", { newAppointmentDate: "2027-02-01" })).ok).toBe(
      true,
    );
    expect(await appts()).toBe(before);

    const died = await call(p.personId, "died");
    expect(died.ok && died.result).toMatchObject({ opensEvent: "death" });
    const moved = await call(p.personId, "moved_or_transferred");
    expect(moved.ok && moved.result).toMatchObject({ opensEvent: "transfer_out" });
    await call(p.personId, "declined");
    expect((await flags()).removed).toBe(true);

    // An appointment named on the call must be the person's own.
    const q = await enrol(clin);
    await closedVisit("clinician", q.personId, [[130, 80]]);
    const other = (
      await lane.pg.query<{ id: string }>(
        `SELECT id FROM public.ncd_appointment WHERE person_id = $1`,
        [q.personId],
      )
    ).rows[0]!.id;
    refused(await call(p.personId, "no_answer", { appointmentId: other }), "invalid");

    refused(
      await run(clin, "call.log", {
        callId: randomUUID(),
        personId: p.personId,
        outcome: "no_answer",
      }),
      "forbidden",
    );
  });

  it("F2: a drill-down is recorded in the access log; roles without drill-down are refused", async () => {
    const hod = await ctxFor(lane.db, f, "head_of_department");
    const month = hod.today.slice(0, 7);
    const before = (
      await lane.pg.query(
        `SELECT 1 FROM public.ncd_access_event WHERE facility_id = $1 AND action = 'drilldown'`,
        [f.facilityId],
      )
    ).rows.length;
    const r = await drillDown(hod, { code: "C01", part: "num", month, filters: {} });
    expect(r.count).toBeGreaterThan(0);
    const { rows } = await lane.pg.query<{
      user_id: string;
      detail: { code: string; count: number };
    }>(
      `SELECT user_id, detail FROM public.ncd_access_event WHERE facility_id = $1 AND action = 'drilldown' ORDER BY at DESC`,
      [f.facilityId],
    );
    expect(rows.length).toBe(before + 1);
    expect(rows[0]).toMatchObject({
      user_id: f.users.head_of_department,
      detail: { code: "C01", count: r.count },
    });
    for (const role of ["administrator", "auditor", "registry_officer"] as const)
      await expect(
        drillDown(await ctxFor(lane.db, f, role), { code: "C01", part: "num", month, filters: {} }),
      ).rejects.toThrow(/drill_down/);
  });

  it("F4: My patients lists a rule-classified result out of range, not a missing one", async () => {
    const clin = await ctxFor(lane.db, f, "clinician");
    const high = await enrol(clin);
    const none = await enrol(clin);
    const inRange = await enrol(clin);
    await closedVisit("clinician", high.personId, [[168, 104]]);
    await closedVisit("clinician", none.personId, []);
    await closedVisit("clinician", inRange.personId, [[122, 76]]);
    const { lists } = await myPanel(clin, false);
    expect(lists.not_leading).toContain(high.personId);
    expect(lists.not_leading).not.toContain(none.personId);
    expect(lists.not_leading).not.toContain(inRange.personId);
    // Another clinician's patients are not in this panel.
    const lead = await ctxFor(lane.db, f, "registry_lead");
    expect((await myPanel(lead, false)).lists.not_leading).not.toContain(high.personId);
    await expect(myPanel(await ctxFor(lane.db, f, "auditor"), false)).rejects.toThrow();
  });

  it("I3: facility settings are versioned, validated, and changed only by code-list managers", async () => {
    const lead = await ctxFor(lane.db, f, "registry_lead");
    const v0 = (await getSettings(lead)).version;
    const s = await updateSettings(lead, {
      reminderAfterDays: 5,
      sendWindowStart: "09:00",
      clinicPhone: "0414 000 000",
    });
    expect(s.version).toBe(v0 + 1);
    expect(await getSettings(lead)).toMatchObject({
      reminderAfterDays: 5,
      sendWindowStart: expect.stringMatching(/^09:00/),
      clinicPhone: "0414 000 000",
      version: v0 + 1,
    });
    await expect(updateSettings(lead, { reminderAfterDays: 0 })).rejects.toThrow();
    await expect(
      updateSettings(await ctxFor(lane.db, f, "clinician"), { reminderAfterDays: 3 }),
    ).rejects.toThrow(/code_list_manage/);
  });

  it("G3: a query is resolved once, with a note, by a data-quality holder", async () => {
    const clin = await ctxFor(lane.db, f, "clinician");
    const p = await enrol(clin);
    for (let i = 0; i < 2; i++)
      await ok(clin, "visit.arrive", {
        visitId: randomUUID(),
        personId: p.personId,
        visitType: "unscheduled",
      });
    const q = (
      await lane.pg.query<{ id: string }>(
        `SELECT id FROM public.ncd_query WHERE person_id = $1 AND rule_id = 'same_day_duplicate_visit' AND status = 'open'`,
        [p.personId],
      )
    ).rows[0]!;
    const body = {
      queryId: q.id,
      personId: p.personId,
      status: "resolved",
      note: "Second arrival entered in error",
    };
    refused(await run(clin, "query.resolve", body), "forbidden");
    const lead = await ctxFor(lane.db, f, "registry_lead");
    refused(await run(lead, "query.resolve", { ...body, note: "" }), "invalid");
    await ok(lead, "query.resolve", body);
    expect(
      (
        await lane.pg.query(
          `SELECT status, resolution_note, resolved_by FROM public.ncd_query WHERE id = $1`,
          [q.id],
        )
      ).rows[0],
    ).toEqual({
      status: "resolved",
      resolution_note: "Second arrival entered in error",
      resolved_by: f.users.registry_lead,
    });
    refused(await run(lead, "query.resolve", body), "conflict");
  });

  it("continueLoad: needs demo_data_manage, and writes nothing for a load that is no longer loading", async () => {
    await expect(continueLoad(await ctxFor(lane.db, f, "auditor"), 1)).rejects.toThrow(
      /demo_data_manage/,
    );
    const lead = await ctxFor(lane.db, f, "registry_lead");
    await lane.pg.query(
      `INSERT INTO public.ncd_demo_load (facility_id, mode, catalogue_version, seed, day0, status, started_by) VALUES ($1, 'full_clinic', '1', 1, $2, 'off', $3)`,
      [f.facilityId, lead.today, f.users.registry_lead],
    );
    expect(await continueLoad(lead, 1_000)).toEqual({ done: true, next: 0, total: 0 });
    expect(
      (
        await lane.pg.query(
          `SELECT 1 FROM public.ncd_person WHERE facility_id = $1 AND demo_load_id IS NOT NULL`,
          [f.facilityId],
        )
      ).rows,
    ).toEqual([]);
  });

  it("legacy import: all or nothing, and out-of-range values only with an explicit acceptance", async () => {
    const officer = await ctxFor(lane.db, f, "registry_officer");
    const row = (given: string, o: Record<number, string> = {}) =>
      [
        "",
        given,
        "Legacyfamily",
        "female",
        "1961-02-02",
        "",
        "hypertension",
        "primary",
        "unknown",
        "2015",
        "2024-01-10",
        "2024-01-10",
        "150",
        "92",
        "70",
        "",
        "",
        "",
        "amlodipine",
        "2024-03-10",
      ]
        .map((v, i) => o[i] ?? v)
        .join(",");
    const count = async () =>
      (
        await lane.pg.query(
          `SELECT 1 FROM public.ncd_visit WHERE facility_id = $1 AND is_historical`,
          [f.facilityId],
        )
      ).rows.length;
    const before = await count();

    // The dry run cannot see an unknown medicine; the apply refuses it, and the first patient is rolled back too.
    const failing =
      LEGACY_TEMPLATE +
      row("Atomicone") +
      "\n" +
      row("Atomictwo", { 2: "Otherfamily", 3: "male", 4: "1975-07-07", 18: "not_a_medicine" }) +
      "\n";
    expect((await legacyDryRun(officer, failing)).errors).toEqual([]);
    await expect(legacyApply(officer, failing, { acceptConfirmations: false })).rejects.toThrow(
      /medicine/i,
    );
    expect(await count()).toBe(before);
    expect(
      (
        await lane.pg.query(
          `SELECT 1 FROM public.ncd_command_log WHERE facility_id = $1 AND type = 'person.enrol' AND result::text LIKE '%Atomic%'`,
          [f.facilityId],
        )
      ).rows,
    ).toEqual([]);

    // Two near-identical patients in one file are caught by the dry run, not first at import.
    const twins = LEGACY_TEMPLATE + row("Twinname") + "\n" + row("Twinnane") + "\n";
    expect((await legacyDryRun(officer, twins)).duplicates).toMatchObject([
      { line: 3, tier: "probable" },
    ]);

    // A systolic of 320 is listed by the dry run and imported only once accepted.
    const high = LEGACY_TEMPLATE + row("Highreading", { 12: "320" }) + "\n";
    expect((await legacyDryRun(officer, high)).confirmations).toEqual([
      { line: 2, fields: ["systolic"] },
    ]);
    await expect(legacyApply(officer, high, { acceptConfirmations: false })).rejects.toThrow(
      /usual range/,
    );
    expect(await count()).toBe(before);
    expect(await legacyApply(officer, high, { acceptConfirmations: true })).toEqual({
      persons: 1,
      visits: 1,
    });
    expect(await count()).toBe(before + 1);
  });

  it("D2: an event needs only the person, the type and the date; further fields only where the type needs them", async () => {
    const clin = await ctxFor(lane.db, f, "clinician");
    const p = await enrol(clin);
    const ev = (o: Record<string, unknown>) =>
      run(clin, "event.record", {
        eventId: randomUUID(),
        personId: p.personId,
        eventDate: clin.today,
        ...o,
      });
    await ok(clin, "event.record", {
      eventId: randomUUID(),
      personId: p.personId,
      type: "stroke",
      eventDate: clin.today,
    });
    expect(
      (
        await lane.pg.query(`SELECT reporting_unit FROM public.ncd_event WHERE person_id = $1`, [
          p.personId,
        ])
      ).rows,
    ).toEqual([{ reporting_unit: "ncd_clinic" }]);
    refused(await ev({ type: "admission" }), "invalid");
    expect((await ev({ type: "admission", admissionReason: "severe_hypoglycaemia" })).ok).toBe(
      true,
    );
    refused(await ev({ type: "death" }), "invalid");
  });

  it("F1: the dashboard board shows one row per enabled condition, every figure from the engine; filters narrow it", async () => {
    const hod = await ctxFor(lane.db, f, "head_of_department");
    const month = hod.today.slice(0, 7);
    const b = await dashboardBoard(hod, month, {});
    const enabled = await enabledModules(hod);
    expect(b.rows.map((r) => r.code).sort()).toEqual([...enabled].sort());
    expect(b.trendMonths).toHaveLength(12);
    const engine = computeIndicators(await loadDataset(hod), {
      month,
      asOf: hod.today,
      catalogue: hod.catalogue,
      enabled,
    });
    expect(b.results.C01?.num).toBe(engine.results.C01?.num);
    for (const r of b.rows)
      expect(b.results[`G04.${r.code}`]?.den).toBe(engine.results[`G04.${r.code}`]?.den);
    const male = await dashboardBoard(hod, month, { sex: "male" });
    expect(male.results.C01!.num!).toBeLessThan(b.results.C01!.num!);
    await expect(dashboardBoard(await ctxFor(lane.db, f, "auditor"), month, {})).rejects.toThrow();
  });

  it("I5: an empty facility shows the empty-state line on every list; the demo switch only to holders of the capability", async () => {
    const g = await ncdFacility(lane.pg, "Empty facility");
    const html = async (role: "registry_lead" | "clinician") => {
      const el = await DemoEmpty({ ctx: await ctxFor(lane.db, g, role) });
      return el ? renderToStaticMarkup(el) : null;
    };
    const lead = await html("registry_lead");
    expect(lead).toContain(DEMO_COPY.empty_state);
    expect(lead).toContain(DEMO_COPY.switch_on);
    const clin = await html("clinician");
    expect(clin).toContain(DEMO_COPY.empty_state);
    expect(clin).not.toContain(DEMO_COPY.switch_on);
    await enrol(await ctxFor(lane.db, g, "clinician"));
    expect(await html("registry_lead")).toBeNull();
  });

  it("I7 / interlock 1: demo data cannot be turned on at a facility approved for patient data", async () => {
    const g = await ncdFacility(lane.pg, "Approved facility");
    const {
      rows: [gl],
    } = await lane.pg.query<{ id: string }>(
      `INSERT INTO public.ncd_go_live_request (facility_id, requested_by) VALUES ($1, $2) RETURNING id`,
      [g.facilityId, g.users.registry_lead],
    );
    await lane.pg.query(
      `UPDATE public.ncd_go_live_request SET status = 'approved', decided_by = $2 WHERE id = $1`,
      [gl!.id, g.users.clinical_safety_officer],
    );
    await expect(turnOn(await ctxFor(lane.db, g, "registry_lead"), "scenario")).rejects.toThrow(
      DEMO_COPY.blocked_after_go_live,
    );
    expect(
      (
        await lane.pg.query(`SELECT 1 FROM public.ncd_demo_load WHERE facility_id = $1`, [
          g.facilityId,
        ])
      ).rows,
    ).toEqual([]);
  });

  it("H4: the full export is refused to roles without export rights", async () => {
    for (const role of ["clinician", "triage_nurse", "auditor", "head_of_department"] as const)
      await expect(fullExport(await ctxFor(lane.db, f, role)), role).rejects.toThrow(
        /Needs one of/,
      );
  });
});

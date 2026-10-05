/**
 * §10.7 acceptance walk and §10.6 interlocks, PGlite lane. The scenario mode loads through the real
 * service (normal command path, demo_loader principal, day 0 fixed at 2026-10-05) and every
 * catalogue `expect` block is asserted; then a second load is a no-op and switching off leaves zero
 * synthetic rows.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { facilityStatus, requestGoLive } from "@/lib/ncdreg/admin";
import type { NcdContext } from "@/lib/ncdreg/context";
import { removeAllSynthetic, turnOff, turnOn } from "@/lib/ncdreg/demo/service";
import { DEMO_CATALOGUE as CAT } from "@/lib/ncdreg/demo/source";
import { dayIso, uuidv5, writeScenarioPatient } from "@/lib/ncdreg/demo/writer";
import { computeReport } from "@/lib/ncdreg/indicators/snapshot";
import { signSnapshot, storeSnapshot } from "@/lib/ncdreg/indicators/snapshot";
import { classesAtVisit, closedVisits, statusOf } from "@/lib/ncdreg/read/derive";
import { personView, recallList, todayClinic, visitView } from "@/lib/ncdreg/read/views";
import { searchPersons } from "@/lib/ncdreg/search";
import { loadDataset } from "@/lib/ncdreg/indicators/load";
import { egfr } from "@/lib/ncdreg/standard/calculations";
import type { Lane } from "../emr-db/_pglite";
import { ctxFor, enrol } from "./_engine";
import { bootLane, laneOn, ncdFacility, type NcdFacility } from "./_ncd";

const DAY0 = "2026-10-05";
const at = (c: NcdContext, iso = DAY0, hhmm = "17:00"): NcdContext => ({ ...c, today: iso, enteredAt: new Date(`${iso}T${hhmm}:00+03:00`) });

describe.skipIf(!laneOn)("demo data: the acceptance walk (§10.7)", () => {
  let lane: Lane;
  let f: NcdFacility;
  let lead: NcdContext;
  let loadId: string;
  const pid = (key: string) => uuidv5(`${loadId}:${key}:person`);
  const count = async (sql: string, p: unknown[] = []) => (await lane.pg.query<{ n: number }>(sql, p)).rows[0]!.n;

  beforeAll(async () => {
    lane = await bootLane();
    f = await ncdFacility(lane.pg, "Demo facility");
    lead = at(await ctxFor(lane.db, f, "registry_lead"), DAY0, "07:30");
    loadId = (await turnOn(lead, "scenario")).id;
    lead = at(lead);
  }, 600_000);

  it("the load is on, with the catalogue's 26 persons and 110 + 9 day-0 visits", async () => {
    const st = await facilityStatus(lead);
    expect(st.demo?.status).toBe("on");
    expect(st.syntheticPersons).toBe(CAT.counts.scenario_patients);
    const closedHistory = await count(
      `SELECT count(*)::int AS n FROM public.ncd_visit v JOIN public.ncd_person p ON p.id = v.person_id WHERE p.demo_load_id = $1 AND v.visit_date < $2`,
      [loadId, DAY0],
    );
    expect(closedHistory).toBe(CAT.counts.visits);
  });

  it("every catalogue expect block holds", async () => {
    for (const p of CAT.scenario_patients.filter((x) => x.expect)) {
      const e = p.expect as Record<string, unknown>;
      const v = (await personView(lead, pid(p.key), { audit: false }))!;
      const person = v.person;
      const where = `${p.key}`;
      if ("status" in e) expect(v.status, where).toBe(e.status);
      if ("status_before_today" in e) expect(statusOf(person, dayIso(DAY0, -1)), where).toBe(e.status_before_today);
      if ("review_due" in e)
        expect(v.reviews.filter((r) => r.due).map((r) => r.component).sort(), where).toEqual([...(e.review_due as string[])].sort());
      if ("care_band" in e) expect(v.careBand, where).toBe(e.care_band);
      if ("kdigo_g" in e) expect(v.kidney?.g, where).toBe(e.kdigo_g);
      if ("kdigo_a" in e) expect(v.kidney?.a, where).toBe(e.kdigo_a);
      if ("egfr_between" in e) {
        const [lo, hi] = e.egfr_between as [number, number];
        expect(v.kidney!.egfr, where).toBeGreaterThanOrEqual(lo);
        expect(v.kidney!.egfr, where).toBeLessThanOrEqual(hi);
      }
      if ("foot_risk_category" in e) {
        const feet = person.reviews.filter((r) => r.component === "feet").at(-1);
        expect(feet?.derived.footRisk, where).toBe(e.foot_risk_category);
      }
      const lastBefore = closedVisits(person).filter((x) => x.date < DAY0).at(-1)!;
      const cls = (code: "bp" | "glu", visit = lastBefore) =>
        classesAtVisit(person, visit, lead.catalogue).find((c) => c.module.outcome_classification.kind === "rule" && (code === "bp" ? c.module.visit_fields.length === 0 : c.module.visit_fields.length > 0))?.cls;
      if ("bp_class_last_closed_visit" in e) expect(cls("bp"), where).toBe(e.bp_class_last_closed_visit);
      if ("glucose_class_last_closed_visit" in e) expect(cls("glu"), where).toBe(e.glucose_class_last_closed_visit);
      if ("glucose_class_today" in e) expect(cls("glu", closedVisits(person).find((x) => x.date === DAY0)!), where).toBe(e.glucose_class_today);
      if ("reminders_pending" in e)
        expect(await count(`SELECT count(*)::int AS n FROM public.ncd_reminder WHERE person_id = $1 AND status = 'pending'`, [pid(p.key)]), where).toBe(e.reminders_pending);
      if ("visit_bp_today" in e || "bmi_today" in e) {
        const today = v.person.visits.find((x) => x.date === DAY0)!;
        const vv = (await visitView(lead, today.id))!;
        if ("visit_bp_today" in e) expect(vv.visit.visitBp, where).toBe(e.visit_bp_today);
        if ("bmi_today" in e) expect(vv.visit.bmi, where).toBe(e.bmi_today);
      }
    }
    // A cross-check the catalogue gives as a range.
    expect(egfr(88, 54 - 0, "female")).toBeGreaterThan(60);
  });

  it("Today's clinic lists the nine day-0 appointments with the stages and arrival times given", async () => {
    const t = await todayClinic(lead, DAY0);
    const want = CAT.scenario_patients.filter((p) => p.today);
    expect(t.rows).toHaveLength(CAT.counts.today_appointments);
    for (const p of want) {
      const row = t.rows.find((r) => r.personId === pid(p.key))!;
      expect(row, p.key).toBeDefined();
      expect(row.stage, p.key).toBe(p.today!.stage);
      const hhmm = row.arrivedAt ? new Date(row.arrivedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Kampala" }) : null;
      expect(hhmm, p.key).toBe(p.today!.arrived_at);
    }
  });

  it("the featured patient's trajectory shows six closed visits", async () => {
    const featured = CAT.scenario_patients.find((p) => p.preview_role?.startsWith("Featured"))!;
    const v = (await personView(lead, pid(featured.key), { audit: false }))!;
    expect(v.trajectory.filter((x) => x.date < DAY0)).toHaveLength(6);
  });

  it("the recall list holds the eight overdue patients, in order of days overdue, with their last call outcomes", async () => {
    const rows = await recallList(at(await ctxFor(lane.db, f, "registry_officer")));
    const want = CAT.scenario_patients.filter((p) => p.recall).sort((a, b) => b.recall!.days_overdue_at_day_0 - a.recall!.days_overdue_at_day_0);
    expect(rows.map((r) => r.identity.registryNumber)).toEqual(want.map((p) => p.registry_number));
    for (const p of want) {
      const r = rows.find((x) => x.identity.registryNumber === p.registry_number)!;
      expect(r.daysOverdue, p.key).toBe(p.recall!.days_overdue_at_day_0);
      expect(r.lastCall?.outcome ?? null, p.key).toBe(p.recall!.calls.at(-1)?.outcome ?? null);
    }
  });

  it("typing the duplicate_check_demo candidate into Search returns the expected tiers", async () => {
    const t = CAT.duplicate_check_demo.typed;
    const r = await searchPersons(lead, { givenName: t.given_name, familyName: t.family_name, sex: t.sex, birthYear: 2026 - t.age_years_at_day_0, phones: [t.phone_1], hospitalNumber: null, nationalId: null });
    const got = r.candidates.map((c) => ({ key: CAT.scenario_patients.find((p) => pid(p.key) === c.personId)?.key, tier: c.tier, matched: c.matched }));
    expect(got.sort((a, b) => String(a.key).localeCompare(String(b.key)))).toEqual(
      CAT.duplicate_check_demo.expected_candidates.map((e) => ({ key: e.key, tier: e.tier, matched: e.matched })).sort((a, b) => a.key.localeCompare(b.key)),
    );
  });

  it("the dashboard has one row for each enabled condition, every figure from the engine", async () => {
    const r = await computeReport(lead, "2026-09");
    for (const code of CAT.condition_modules_enabled_while_on) expect(r.results[`G04.${code}`], code).toBeDefined();
    const snaps = await count(`SELECT count(*)::int AS n FROM public.ncd_indicator_snapshot WHERE demo_load_id = $1 AND is_synthetic`, [loadId]);
    expect(snaps).toBe(12);
  });

  it("the query list is not empty (data_quality_demo: a same-day duplicate visit kept and queried)", async () => {
    expect(await count(`SELECT count(*)::int AS n FROM public.ncd_query WHERE rule_id = 'same_day_duplicate_visit' AND status = 'open'`)).toBe(1);
  });

  it("interlock 7: no report can be signed while demo data is on", async () => {
    const [s] = (await lane.pg.query<{ id: string }>(`SELECT id FROM public.ncd_indicator_snapshot WHERE demo_load_id = $1 LIMIT 1`, [loadId])).rows;
    await expect(signSnapshot(lead, s!.id)).rejects.toThrow();
  });

  it("interlock 2: go-live is refused while synthetic persons exist", async () => {
    await expect(requestGoLive(lead, null)).rejects.toThrow(/synthetic/);
  });

  it("a second switch-on is refused; replaying the load changes nothing", async () => {
    await expect(turnOn(lead, "scenario")).rejects.toThrow(/already on/);
    const before = await count(`SELECT count(*)::int AS n FROM public.ncd_command_log WHERE demo_load_id = $1`, [loadId]);
    const loader = { ...lead, principal: "demo_loader" as const, roles: ["demo_loader" as const], caps: new Set(["demo_write" as const]), demoLoadId: loadId };
    for (const p of CAT.scenario_patients.slice(0, 5)) await writeScenarioPatient(loader, p, { day0: DAY0, demoLoadId: loadId });
    expect(await count(`SELECT count(*)::int AS n FROM public.ncd_command_log WHERE demo_load_id = $1`, [loadId])).toBe(before);
    expect(await count(`SELECT count(*)::int AS n FROM public.ncd_person WHERE demo_load_id = $1`, [loadId])).toBe(26);
  });

  it("switching off removes every demo record, keeps a hand-entered synthetic person and the audit log, restores the modules", async () => {
    const hand = await enrol(at(await ctxFor(lane.db, f, "clinician")), { conditions: [{ condition: "hypertension" }] });
    const auditBefore = await count(`SELECT count(*)::int AS n FROM public.audit_log`);
    const enabledBefore = (await facilityStatus(lead)).enabled.sort();
    expect(enabledBefore).toEqual([...CAT.condition_modules_enabled_while_on].sort());
    await expect(turnOff(lead, false)).rejects.toThrow();
    const removed = await turnOff(lead, true);
    expect(removed.ncd_person).toBe(26);
    for (const t of ["ncd_person", "ncd_visit", "ncd_registration", "ncd_appointment", "ncd_reminder", "ncd_call", "ncd_review", "ncd_event", "ncd_query", "ncd_observation", "ncd_name_index"])
      expect(await count(`SELECT count(*)::int AS n FROM public.${t} x WHERE x.facility_id = $1 AND ${t === "ncd_person" ? "x.demo_load_id" : "(SELECT demo_load_id FROM public.ncd_person p WHERE p.id = x.person_id)"} = $2`, [f.facilityId, loadId]), t).toBe(0);
    expect(await count(`SELECT count(*)::int AS n FROM public.ncd_command_log WHERE demo_load_id = $1`, [loadId])).toBe(0);
    expect(await count(`SELECT count(*)::int AS n FROM public.ncd_indicator_snapshot WHERE demo_load_id = $1`, [loadId])).toBe(0);
    expect(await count(`SELECT count(*)::int AS n FROM public.ncd_person WHERE id = $1`, [hand.personId])).toBe(1);
    expect(await count(`SELECT count(*)::int AS n FROM public.audit_log`)).toBeGreaterThan(auditBefore);
    const st = await facilityStatus(lead);
    expect(st.demo?.status).toBe("off");
    expect(st.enabled.sort()).toEqual(["diabetes", "hypertension"]);
    // "Remove all synthetic records" takes the hand-entered one too.
    await removeAllSynthetic(lead);
    expect((await facilityStatus(lead)).syntheticPersons).toBe(0);
    expect((await loadDataset(lead)).persons).toHaveLength(0);
  });

  it("interlock 4: removal can never delete a record of a person who is not synthetic", async () => {
    await lane.pg.query(`INSERT INTO public.ncd_go_live_request (facility_id, status, requested_by, decided_by) VALUES ($1, 'approved', $2, $3)`, [f.facilityId, f.users.registry_lead, f.users.clinical_safety_officer]);
    const clin = at(await ctxFor(lane.db, f, "clinician"));
    const real = await enrol(clin, { conditions: [{ condition: "hypertension" }] }).catch(() => null);
    expect(real).toBeNull(); // the enrol helper writes synthetic persons; after go-live that is refused
    await lane.pg.query(
      `INSERT INTO public.ncd_person (facility_id, registry_number, is_synthetic, given_name_ciphertext, family_name_ciphertext, sex, birth_year, privacy_notice_version, privacy_notice_ack_at)
       VALUES ($1, 'NCD-2026-09999', false, 'x', 'y', 'male', 1970, 'v', now())`,
      [f.facilityId],
    );
    await expect(lane.pg.query(`DELETE FROM public.ncd_person WHERE facility_id = $1`, [f.facilityId])).rejects.toThrow(/never deleted/);
    await expect(removeAllSynthetic(lead)).resolves.toBeDefined(); // selects synthetic only: nothing to remove, nothing touched
    expect(await count(`SELECT count(*)::int AS n FROM public.ncd_person WHERE facility_id = $1`, [f.facilityId])).toBe(1);
    // interlock 1: switching on after go-live is refused with the catalogue's message.
    await expect(turnOn(lead, "scenario")).rejects.toThrow(CAT.ui_copy.blocked_after_go_live);
    await expect(storeSnapshot(lead, "2026-09")).rejects.toThrow(); // a person without snapshot_compute
  });
});

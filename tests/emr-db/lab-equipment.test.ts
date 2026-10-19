/**
 * Lab Phase 3, Step 5: equipment and temperature on the PGlite lane (S11–S14). Every machine, test, range,
 * reading and time is a FIXTURE. The services hub is injected: the fake records each call and writes what the
 * hub's report_problem / resolve_problem write (availability_events), so ordering reads the hub's own state.
 * Runs with EMR_PGLITE=1.
 */
import { randomUUID } from "node:crypto";
import type { Lane, Pg } from "./_pglite";
import type { HubCall } from "@/lib/lab/equipment-store";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadEquipment } from "@/lib/lab/equipment-read";
import {
  markBackInService,
  markDown,
  recordLog,
  recordTemperature,
  saveEquipment,
  saveSchedule,
} from "@/lib/lab/equipment-store";
import { menuToday } from "@/lib/lab/one-menu-read";
import { saveItem } from "@/lib/lab/stock-store";
import { bootLane, clinician, department, encounter, hospital, laneOn, patient } from "./_pglite";

const FBC = "test.fbc";
const OFFERING = FBC; // Lab test menu v2 (TM-3): the hub row is keyed by the test
/** FIXTURE fridge range (never a default). */
const FX_RANGE = { min: 2, max: 8, readingsPerDay: 2 };
const FLAGS = ["LAB_WORKSPACE", "LAB_EQUIPMENT", "LAB_STOCK", "LAB_ONE_MENU"];

describe.skipIf(!laneOn)("Lab Phase 3 equipment and temperature (Step 5)", () => {
  let lane: Lane;
  let pg: Pg;
  let h: string;
  let lead: { userId: string; hospitalId: string };
  let analyser: string;
  let fridge: string;
  const env = { ...process.env };
  const calls: Record<string, unknown>[] = [];
  const tx = <T>(fn: (t: Parameters<Parameters<Lane["db"]["transaction"]>[0]>[0]) => Promise<T>) =>
    lane.db.transaction(fn);
  const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
    (await pg.query<T>(sql, params)).rows[0] as T;
  /** The hub, faked: what ha-services-hub writes for the two ops (availability_events), nothing more. */
  /** The hub writes in its own transaction (its own connection): queued here, applied once ours is done. */
  const hubWrites: [string, unknown[]][] = [];
  const subjects = new Map<string, [unknown, unknown]>();
  const hub: HubCall = async (body) => {
    calls.push(body);
    if (body.op === "report_problem") {
      const problemId = randomUUID();
      subjects.set(problemId, [body.subject_kind, body.subject_ref]);
      hubWrites.push([
        `INSERT INTO availability_events (hospital_id, problem_id, subject_kind, subject_ref, subject_label, event, state, reason, note, actor_user_id)
         VALUES ($1, $2, $3, $4, 'Fixture FBC', 'reported', $5, $6, $7, $8)`,
        [
          h,
          problemId,
          body.subject_kind,
          body.subject_ref,
          body.state,
          body.reason_code,
          body.note,
          lead.userId,
        ],
      ]);
      return { ok: true, data: { problem_id: problemId } };
    }
    const [kind, ref] = subjects.get(String(body.problem_id))!;
    hubWrites.push([
      `INSERT INTO availability_events (hospital_id, problem_id, subject_kind, subject_ref, subject_label, event, actor_user_id)
       VALUES ($1, $2, $3, $4, 'Fixture FBC', 'resolved', $5)`,
      [h, body.problem_id, kind, ref, lead.userId],
    ]);
    return { ok: true, data: null };
  };
  /** Our transaction, then the hub's writes (what the edge function committed meanwhile). */
  const withHub = async <T>(fn: Parameters<typeof tx<T>>[0]) => {
    try {
      return await tx(fn);
    } finally {
      for (const [q, params] of hubWrites.splice(0)) await pg.query(q, params);
    }
  };
  let planVersion = 0;
  const qcRun = async (concept: string, decision: string, at: Date) => {
    const plan = (
      await one<{ id: string }>(
        `INSERT INTO lab_signed_configs (hospital_id, kind, key, version, payload, authored_by) VALUES ($1, 'qc_plan', $2, $4, '{}', $3) RETURNING id`,
        [h, `${analyser}:${concept}`, lead.userId, ++planVersion],
      )
    ).id;
    await pg.query(
      `INSERT INTO lab_qc_runs (hospital_id, device_id, concept_id, plan_config_id, plan_version, "values", decision, first_step, run_at, recorded_by)
       VALUES ($1, $2, $3, $4, 1, '[]', $5, $6, $7, $8)`,
      [
        h,
        analyser,
        concept,
        plan,
        decision,
        decision === "rejected" ? "Fixture: recalibrate" : null,
        at,
        lead.userId,
      ],
    );
  };

  beforeAll(async () => {
    for (const k of FLAGS) process.env[k] = "1";
    lane = await bootLane();
    pg = lane.pg;
    h = await hospital(pg, "Equipment");
    const lab = (
      await one<{ id: string }>(
        `INSERT INTO hospital_departments (hospital_id, name, slug, catalogue_code) VALUES ($1, 'Laboratory', $2, 'LABORATORY') RETURNING id`,
        [h, `lab-${randomUUID().slice(0, 8)}`],
      )
    ).id;
    const ward = await department(pg, h, "Ward");
    lead = {
      userId: (
        await clinician(pg, { hospitalId: h, departmentId: ward, cadre: "LAB_TECHNOLOGIST" })
      ).userId,
      hospitalId: h,
    };
    await pg.query(
      `INSERT INTO department_heads (hospital_id, department_id, user_id) VALUES ($1, $2, $3)`,
      [h, lab, lead.userId],
    );
    // FBC in house in the hub, linked to the lab's FBC (Phase 2's one menu).
    await pg.query(
      `INSERT INTO diagnostic_offerings (hospital_id, kind, code, provision, hours, stated_tat, confirmed_at)
       VALUES ($1, 'lab', $2, 'in_house', '24h', 'fixture 2 h', now())`,
      [h, OFFERING],
    );
    analyser = await tx((t) =>
      saveEquipment(
        t,
        lead,
        {
          kind: "analyser",
          model: "Fixture haematology analyser",
          serial: "FX-HA-1",
          sectionId: null,
          details: {
            location: "Fixture bench",
            provider: "Fixture service",
            contact: null,
            installedOn: null,
          },
          linkedConcepts: ["obs.haemoglobin", "obs.wbc"],
          linkedTests: [FBC],
        },
        new Date(),
      ),
    );
    fridge = await tx((t) =>
      saveEquipment(
        t,
        lead,
        {
          kind: "fridge",
          model: "Fixture reagent fridge",
          serial: null,
          sectionId: null,
          details: {},
          linkedConcepts: [],
          linkedTests: [],
        },
        new Date(),
      ),
    );
    // One FBC specimen received and not yet released: it moves to To refer when the analyser goes down.
    const p = await patient(pg);
    const doc = await clinician(pg, {
      hospitalId: h,
      departmentId: ward,
      cadre: "MEDICAL_OFFICER",
    });
    const enc = await encounter(pg, {
      hospitalId: h,
      patientUserId: p,
      clinicianUserId: doc.userId,
      departmentId: ward,
    });
    const order = (
      await one<{ id: string }>(
        `INSERT INTO encounter_orders (encounter_id, patient_user_id, kind, text, authored_by_user_id, lifecycle, hospital_id,
           priority, frequency, performer, intent_source, requester_cadre, effective_at, reason_text_ciphertext, test_id)
         VALUES ($1, $2, 'lab', 'FBC', $3, 'events', $4, 'routine', 'once', 'in_house', 'clinician', 'MEDICAL_OFFICER', now(), 'iv:tag:ct',
           (SELECT id FROM test_catalogue WHERE code = $5 AND hospital_id IS NULL)) RETURNING id`,
        [enc, p, doc.userId, h, FBC],
      )
    ).id;
    const sp = (
      await one<{ id: string }>(
        `INSERT INTO specimens (order_id, hospital_id, patient_user_id, specimen_type, container, collected_at,
           collected_by_user_id, collector_cadre, identifiers_confirmed)
         VALUES ($1, $2, $3, 'venous_whole_blood', 'edta', now(), $4, 'NURSE', true) RETURNING id`,
        [order, h, p, doc.userId],
      )
    ).id;
    await pg.query(
      `INSERT INTO specimen_events (specimen_id, hospital_id, patient_user_id, kind, actor_user_id, actor_cadre)
       VALUES ($1, $2, $3, 'received', $4, 'LAB_TECH')`,
      [sp, h, p, lead.userId],
    );
  }, 300_000);
  afterAll(() => {
    for (const k of FLAGS) process.env[k] = env[k];
  });

  const since = new Date(Date.now() - 2 * 3_600_000);

  it("S11: marking the analyser down reports the hub problem through the hub's action; ordering shows Down · referred; specimens move to To refer", async () => {
    expect((await menuToday(lane.db, h))(FBC).state).toBe("in_house");
    const id = await withHub((t) =>
      markDown(
        t,
        lead,
        {
          deviceId: analyser,
          since,
          cause: "Fixture: error E-1",
          reportedTo: "Fixture service",
          ticket: "FX-1",
        },
        hub,
        new Date(),
      ),
    );
    expect(calls).toEqual([
      {
        op: "report_problem",
        subject_kind: "test",
        subject_ref: OFFERING,
        state: "unavailable",
        reason_code: "equipment_down",
        note: "Fixture haematology analyser: Fixture: error E-1",
        reason: "Marked down in the laboratory: Fixture haematology analyser",
      },
    ]);
    // Same request: the hub's own availability now reads down at ordering (Phase 2 OM-2).
    const today = (await menuToday(lane.db, h))(FBC);
    expect(today.state).toBe("down_referred");
    expect(today.words).toMatch(/^Analyser down since/);
    const b = await one<{ specimens_to_refer: number; hub_problem_ids: string[] }>(
      `SELECT specimens_to_refer, hub_problem_ids FROM lab_breakdowns WHERE id = $1`,
      [id],
    );
    expect(b.specimens_to_refer).toBe(1);
    expect(b.hub_problem_ids).toHaveLength(1);
    expect(await one(`SELECT state FROM devices WHERE id = $1`, [analyser])).toEqual({
      state: "down",
    });
    const [row] = (await tx((t) => loadEquipment(t, h, new Date()))).filter(
      (d) => d.id === analyser,
    );
    expect(row!.doctorsSee).toEqual([
      {
        test: expect.any(String),
        state: "down_referred",
        words: expect.stringMatching(/^Analyser down/),
      },
    ]);
  });

  it("S12: back in service is refused without a repair, then until QC passes on every linked component after it; then the hub returns and downtime is recorded", async () => {
    const back = () =>
      withHub((t) => markBackInService(t, lead, { deviceId: analyser }, hub, new Date()));
    await expect(back()).rejects.toThrow(/Record the repair first/);
    const repairAt = new Date(Date.now() - 3_600_000);
    await tx((t) =>
      recordLog(
        t,
        lead,
        {
          deviceId: analyser,
          kind: "repair",
          taskKey: null,
          doneAt: repairAt,
          note: "Fixture: board replaced",
          filePath: null,
          clientKey: `k-${randomUUID()}`,
        },
        new Date(),
      ),
    );
    await qcRun("obs.haemoglobin", "accepted", new Date(repairAt.getTime() - 60_000)); // before the repair: does not count
    await qcRun("obs.wbc", "rejected", new Date(repairAt.getTime() + 60_000));
    await expect(back()).rejects.toThrow(
      /QC has not passed on obs\.haemoglobin since the repair\. QC has not passed on obs\.wbc/,
    );
    await qcRun("obs.haemoglobin", "accepted", new Date(repairAt.getTime() + 120_000));
    await expect(back()).rejects.toThrow(/obs\.wbc/);
    await qcRun("obs.wbc", "warning", new Date(repairAt.getTime() + 180_000));
    const before = calls.length;
    await back();
    expect(calls.slice(before)).toEqual([
      {
        op: "resolve_problem",
        problem_id: expect.any(String),
        reason: "Back in service in the laboratory: Fixture haematology analyser",
      },
    ]);
    expect((await menuToday(lane.db, h))(FBC).state).toBe("in_house");
    const b = await one<{
      downtime_minutes: number;
      back_by: string;
      repair_log_id: string | null;
    }>(`SELECT downtime_minutes, back_by, repair_log_id FROM lab_breakdowns WHERE device_id = $1`, [
      analyser,
    ]);
    expect(b.downtime_minutes).toBeGreaterThanOrEqual(119);
    expect(b.back_by).toBe(lead.userId);
    expect(b.repair_log_id).not.toBeNull();
    expect(await one(`SELECT state FROM devices WHERE id = $1`, [analyser])).toEqual({
      state: "in_use",
    });
  });

  it("S13: an overdue calibration shows amber (overdue) and blocks nothing", async () => {
    await tx((t) =>
      saveSchedule(
        t,
        lead,
        {
          deviceId: analyser,
          schedules: {
            tasks: [
              {
                key: "fx-calibration",
                kind: "calibration",
                every: { days: 30 },
                requiredBeforeUse: false,
              },
              {
                key: "fx-daily",
                kind: "maintenance",
                every: { days: 1 },
                requiredBeforeUse: false,
              },
            ],
            temperature: null,
          },
        },
        new Date(),
      ),
    );
    await tx((t) =>
      recordLog(
        t,
        lead,
        {
          deviceId: analyser,
          kind: "calibration",
          taskKey: "fx-calibration",
          doneAt: new Date(Date.now() - 40 * 86_400_000),
          note: null,
          filePath: null,
          clientKey: `k-${randomUUID()}`,
        },
        new Date(),
      ),
    );
    await tx((t) =>
      recordLog(
        t,
        lead,
        {
          deviceId: analyser,
          kind: "maintenance",
          taskKey: "fx-daily",
          doneAt: new Date(),
          note: null,
          filePath: null,
          clientKey: `k-${randomUUID()}`,
        },
        new Date(),
      ),
    );
    const [row] = (await tx((t) => loadEquipment(t, h, new Date()))).filter(
      (d) => d.id === analyser,
    );
    expect(row!.tasks.find((t) => t.key === "fx-calibration")).toMatchObject({
      overdue: true,
      blocks: false,
    });
    expect(row!.tasks.find((t) => t.key === "fx-daily")).toMatchObject({
      overdue: false,
      blocks: false,
    });
    // Nothing blocks: the analyser stays in service and can still be marked down and back as usual.
    expect(row!.state).toBe("in_use");
  });

  it("S14: a fridge reading out of range opens a nonconformity, notifies the lead and suggests (never forces) quarantine; a missed reading is listed", async () => {
    await tx((t) =>
      saveSchedule(
        t,
        lead,
        { deviceId: fridge, schedules: { tasks: [], temperature: FX_RANGE } },
        new Date(),
      ),
    );
    const reagent = await tx((t) =>
      saveItem(
        t,
        lead,
        {
          name: "Fixture reagent in the fridge",
          kind: "reagent",
          unitOfIssue: "box",
          packSize: null,
          testsPerUnit: null,
          testCodes: [],
          conceptIds: [],
          hmisTracerCode: null,
          storageDeviceId: fridge,
          minMonths: null,
          maxMonths: null,
        },
        new Date(),
      ),
    );
    const lot = (
      await one<{ id: string }>(
        `INSERT INTO lab_stock_lots (hospital_id, item_id, lot, state, accepted_basis, statement)
         VALUES ($1, $2, 'FX-FR-1', 'accepted', 'before_medsync', 'Fixture: on the shelf at switch-on.') RETURNING id`,
        [h, reagent],
      )
    ).id;
    const inRange = await tx((t) =>
      recordTemperature(
        t,
        lead,
        {
          deviceId: fridge,
          value: 5,
          unit: "°C",
          doneAt: new Date(),
          clientKey: `k-${randomUUID()}`,
        },
        new Date(),
      ),
    );
    expect(inRange).toMatchObject({ ncId: null, suggestQuarantine: [] });
    const out = await tx((t) =>
      recordTemperature(
        t,
        lead,
        {
          deviceId: fridge,
          value: 11.5,
          unit: "°C",
          doneAt: new Date(),
          clientKey: `k-${randomUUID()}`,
        },
        new Date(),
      ),
    );
    expect(out.ncId).toEqual(expect.any(String));
    expect(out.suggestQuarantine).toEqual([{ id: lot, lot: "FX-FR-1" }]);
    const nc = await one<{
      source: string;
      owner: string;
      what_happened: string;
      testing_halted: boolean;
    }>(
      `SELECT source, owner, what_happened, testing_halted FROM lab_nonconformities WHERE id = $1`,
      [out.ncId],
    );
    expect(nc).toMatchObject({ source: "temperature", owner: lead.userId, testing_halted: false });
    expect(nc.what_happened).toMatch(
      /^Fixture reagent fridge read 11\.5 °C at \d\d:\d\d, outside 2 to 8 °C\. A nonconformity is open\./,
    );
    expect(
      await one(`SELECT kind, payload FROM lab_nc_events WHERE nc_id = $1`, [out.ncId]),
    ).toEqual({
      kind: "notified",
      payload: { to: lead.userId },
    });
    // Suggested, never forced: the lot is untouched.
    expect(await one(`SELECT state FROM lab_stock_lots WHERE id = $1`, [lot])).toEqual({
      state: "accepted",
    });
    expect(await one(`SELECT in_range FROM lab_equipment_logs WHERE id = $1`, [out.logId])).toEqual(
      { in_range: false },
    );
    // A day with no reading (FIXTURE date): the morning window has ended unrecorded.
    const [later] = (await tx((t) => loadEquipment(t, h, new Date("2030-01-01T10:00:00Z")))).filter(
      (d) => d.id === fridge,
    );
    expect(later!.temperature!.missing).toHaveLength(1);
    expect(later!.stored).toEqual([
      { id: lot, lot: "FX-FR-1", item: "Fixture reagent in the fridge" },
    ]);
  });

  it("a hub refusal leaves nothing behind: no breakdown, the machine still in service", async () => {
    const failing: HubCall = async () => ({ ok: false, error: "Fixture: not a head" });
    await expect(
      tx((t) =>
        markDown(
          t,
          lead,
          { deviceId: analyser, since, cause: "Fixture", reportedTo: null, ticket: null },
          failing,
          new Date(),
        ),
      ),
    ).rejects.toThrow(/services hub refused/);
    expect(
      await one(
        `SELECT count(*)::int AS n FROM lab_breakdowns WHERE device_id = $1 AND back_at IS NULL`,
        [analyser],
      ),
    ).toEqual({
      n: 0,
    });
    expect(await one(`SELECT state FROM devices WHERE id = $1`, [analyser])).toEqual({
      state: "in_use",
    });
  });
});

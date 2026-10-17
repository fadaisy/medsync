/**
 * Lab Phase 5, Step 5 on the PGlite lane: the infection prevention feed through the real release path (S11–S20).
 * Every entry, precaution and route here is a FIXTURE shaped like gate-a §8, signed by an IPC lead and countersigned
 * by a laboratory lead as the product requires. Runs with EMR_PGLITE=1.
 */
import { randomUUID } from "node:crypto";
import type { Lane, Pg } from "./_pglite";
import type { EmrActor } from "@/lib/emr/actor";
import type { WriteCtx } from "@/lib/emr/write/context";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { withPatientWrite } from "@/lib/emr/write/context";
import { placeOrders } from "@/lib/emr/write/orders";
import { amendResults, enterResults } from "@/lib/emr/write/results";
import { collectSpecimen, receiveSpecimen } from "@/lib/emr/write/specimens";
import { encrypt, generateKey } from "@/lib/encryption";
import { epiWeekStart, idsrCounts } from "@/lib/ipc/lab-alerts";
import { clearPatientFlag, escalateIpcAlerts, recordIpcAction } from "@/lib/ipc/store";
import { saveConfigDraft, signConfig } from "@/lib/lab/catalogue-v2";
import { recordOutbreakReferral, savePartner } from "@/lib/lab/referral-store";
import {
  bootLane,
  clinician,
  department,
  encounter,
  hospital,
  intake,
  laneOn,
  patient,
  probe,
} from "./_pglite";

const FLAGS = ["LAB_WORKSPACE", "LAB_UNITS_RANGES", "IPC_LAB_FEED"];
const key = () => `k-${randomUUID()}`;

describe.skipIf(!laneOn)("Lab Phase 5 infection prevention feed (S11–S20)", () => {
  let lane: Lane;
  let pg: Pg;
  let h: string;
  let wardDept: string;
  let ward: string;
  const a: Record<string, EmrActor> = {};
  const env = { ...process.env };
  const tx = <T>(fn: (t: Parameters<Parameters<Lane["db"]["transaction"]>[0]>[0]) => Promise<T>) =>
    lane.db.transaction(fn);
  const as = <T>(actor: EmrActor, p: string, fn: (ctx: WriteCtx) => Promise<T>) =>
    withPatientWrite(actor, p, fn, { database: lane.db });
  const one = async <T = Record<string, unknown>>(q: string, params: unknown[] = []) =>
    (await pg.query<T>(q, params)).rows[0] as T;
  const rows = async <T = Record<string, unknown>>(q: string, params: unknown[] = []) =>
    (await pg.query<T>(q, params)).rows;
  const testId = async (code: string) =>
    (
      await one<{ id: string }>(
        `SELECT id FROM test_catalogue WHERE code = $1 AND hospital_id IS NULL`,
        [code],
      )
    ).id;
  const ipc = () => ({ userId: a.ipcNurse!.userId, hospitalId: h });

  /** Draft by the IPC link nurse, signed by the IPC lead, countersigned by a laboratory lead. */
  async function entry(k: string, payload: unknown) {
    const id = await tx((t) =>
      saveConfigDraft(
        t,
        { userId: a.ipcNurse!.userId, hospitalId: h },
        { kind: "ipc_alert_entry", key: k, payload },
        new Date(),
      ),
    );
    await tx((t) =>
      signConfig(
        t,
        { userId: a.ipcLead!.userId, hospitalId: h, as: "ipc_lead" },
        { configId: id, exceptionNote: null },
        new Date(),
      ),
    );
    await tx((t) =>
      signConfig(
        t,
        { userId: a.labLead!.userId, hospitalId: h, as: "lab_counter" },
        { configId: id, exceptionNote: null },
        new Date(),
      ),
    );
    return id;
  }
  const base = {
    scope: "every_ward",
    precaution: { type: "airborne", stopLine: "Fixture stop line", source: "Fixture: CDC App. A" },
    ipcAlert: true,
    confirmationNeeded: false,
    source: "Fixture",
  };
  async function newPatient() {
    const p = await patient(pg);
    await pg.query(
      `INSERT INTO patient_profiles (id, first_name_encrypted, surname_encrypted, sex, date_of_birth, id_type, phone_encrypted, district_id)
       VALUES ($1, $2, $3, 'female', '2000-01-01', 'none', $4, (SELECT id FROM districts LIMIT 1))`,
      [p, encrypt("Test"), encrypt("Patient"), encrypt("0700000001")],
    );
    await intake(pg, { hospitalId: h, patientUserId: p });
    return p;
  }
  async function released(p: string, code: string, conceptId: string, value: string) {
    const tid = await testId(code);
    const enc = await encounter(pg, {
      hospitalId: h,
      patientUserId: p,
      clinicianUserId: a.doctor!.userId,
      departmentId: wardDept,
    });
    const order = await as(a.doctor!, p, (ctx) =>
      placeOrders(ctx, {
        patientUserId: p,
        encounterId: enc,
        orders: [
          {
            clientKey: key(),
            testId: tid,
            priority: "routine",
            reasonText: "Check",
          },
        ],
      }),
    );
    const sp = await as(a.nurse!, p, (ctx) =>
      collectSpecimen(ctx, {
        patientUserId: p,
        orderId: order.id,
        identifiersConfirmed: true,
        ...(code === "test.tb_xpert" ? { specimenType: "sputum", container: "unknown" } : {}),
        clientKey: key(),
      }),
    );
    await as(a.lab!, p, (ctx) =>
      receiveSpecimen(ctx, { patientUserId: p, specimenId: sp.id, clientKey: key() }),
    );
    const r = await as(a.lab!, p, (ctx) =>
      enterResults(ctx, {
        patientUserId: p,
        orderId: order.id,
        status: "final",
        values: [{ conceptId, code: value }],
        clientKey: key(),
      }),
    );
    return { enc, reportId: r.id };
  }
  const alertsOf = (p: string) =>
    rows<{
      id: string;
      entry_key: string;
      trigger: string;
      route: string;
      screening: boolean;
      restricted_class: string | null;
      episode_key: string;
    }>(`SELECT * FROM ipc_alerts WHERE patient_user_id = $1 ORDER BY created_at`, [p]);

  beforeAll(async () => {
    process.env.MEDSYNC_PHI_KEY ??= generateKey();
    for (const k of FLAGS) process.env[k] = "1";
    lane = await bootLane();
    pg = lane.pg;
    h = await hospital(pg, "IPC");
    wardDept = await department(pg, h, "Medicine");
    const labDept = await department(pg, h, "Laboratory");
    await pg.query(`UPDATE hospital_departments SET catalogue_code = 'LABORATORY' WHERE id = $1`, [
      labDept,
    ]);
    const make = async (
      d: string,
      cadreCode: string,
      surface: EmrActor["surface"],
    ): Promise<EmrActor> => ({
      ...(await clinician(pg, { hospitalId: h, departmentId: d, cadre: cadreCode })),
      fullName: null,
      hospitalId: h,
      departmentId: d,
      cadreCode,
      isClinical: true,
      surface,
      ...(surface === "lab"
        ? {
            labPermissions: [
              "lab.view",
              "lab.receive",
              "lab.result.enter",
              "lab.result.release",
              "lab.manage",
            ],
          }
        : {}),
    });
    a.doctor = await make(wardDept, "MEDICAL_OFFICER", "doctor");
    a.nurse = await make(wardDept, "NURSE", "nurse");
    a.lab = await make(labDept, "LAB_TECHNOLOGIST", "lab");
    a.labLead = await make(labDept, "LAB_TECHNOLOGIST", "lab");
    const surgery = await department(pg, h, "Surgery");
    a.ipcNurse = await make(surgery, "NURSE", "nurse");
    a.ipcLead = await make(surgery, "NURSE", "nurse");
    a.focal = await make(surgery, "NURSE", "nurse");
    await pg.query(
      `INSERT INTO department_heads (hospital_id, department_id, user_id, acting) VALUES ($1, $2, $3, false)`,
      [h, labDept, a.labLead.userId],
    );
    await pg.query(
      `INSERT INTO hospital_designations (hospital_id, role, user_id, starts_on, set_by) VALUES
         ($1, 'ipc_link_nurse', $2, current_date - 1, $2), ($1, 'ipc_lead', $3, current_date - 1, $3),
         ($1, 'surveillance_focal_person', $4, current_date - 1, $4)`,
      [h, a.ipcNurse.userId, a.ipcLead.userId, a.focal.userId],
    );
    ward = (
      await one<{ id: string }>(
        `INSERT INTO hospital_wards (hospital_id, department_id, name, slug) VALUES ($1, $2, 'Ward FX', 'ward-fx') RETURNING id`,
        [h, wardDept],
      )
    ).id;
    await entry("rr_tb", {
      ...base,
      condition: "Rifampicin-resistant TB",
      trigger: {
        kind: "result",
        testCode: "test.tb_xpert",
        concept: "obs.tb_xpert",
        answers: ["mtb_detected_rif_detected"],
      },
      route: {
        kind: "weekly_item",
        idsrItem: "Rifampicin resistant TB cases (DR)",
        reference: "HMIS 033b row 15",
      },
    });
    await entry("vhf", {
      ...base,
      condition: "Suspected VHF",
      trigger: { kind: "outbreak_referral" },
      precaution: { ...base.precaution, type: "isolation" },
      route: {
        kind: "notify_now",
        idsrItem: "Acute haemorrhagic fever syndrome",
        reference: "IDSR Table 2 #1",
      },
    });
    await entry("screen_fx", {
      ...base,
      condition: "Fixture screening condition",
      trigger: {
        kind: "result",
        testCode: "test.malaria_rdt",
        concept: "obs.malaria_test",
        answers: ["positive"],
      },
      precaution: { ...base.precaution, type: "contact_if_incontinent" },
      confirmationNeeded: true,
      route: {
        kind: "weekly_item",
        idsrItem: "Fixture weekly item",
        reference: "Fixture reference",
      },
    });
  }, 300_000);
  afterAll(() => {
    for (const k of FLAGS) process.env[k] = env[k];
  });

  it("S11 a released RR-TB result raises one alert at once, with the route and no value; the table has no value column", async () => {
    const p = await newPatient();
    await released(p, "test.tb_xpert", "obs.tb_xpert", "mtb_detected_rif_detected");
    const [al] = await alertsOf(p);
    expect(al).toMatchObject({
      entry_key: "rr_tb",
      trigger: "result",
      route: "weekly_item",
      restricted_class: "tb",
    });
    const cols = (
      await rows<{ c: string }>(
        `SELECT column_name AS c FROM information_schema.columns WHERE table_name = 'ipc_alerts'`,
      )
    ).map((r) => r.c);
    expect(cols.some((c) => /value|answer|result_text/.test(c))).toBe(false);
  });

  it("S12 replay: each listed trigger raises exactly one alert per patient per condition per episode", async () => {
    const p1 = await newPatient();
    const p2 = await newPatient();
    await released(p1, "test.tb_xpert", "obs.tb_xpert", "mtb_detected_rif_not_detected"); // not listed
    await released(p2, "test.tb_xpert", "obs.tb_xpert", "mtb_detected_rif_detected");
    expect(await alertsOf(p1)).toHaveLength(0);
    expect(await alertsOf(p2)).toHaveLength(1);
  });

  it("S13 an IPC user without the tb class sees the alert, not the TB result; a view is recorded", async () => {
    const p = await newPatient();
    const r = await released(p, "test.tb_xpert", "obs.tb_xpert", "mtb_detected_rif_detected");
    // Close the visit: from here the IPC nurse has no clinical basis of her own (open-intake access is the
    // platform's own rule); the alert must not give one (Law 9).
    await pg.query(`UPDATE patient_intakes SET status = 'completed' WHERE patient_user_id = $1`, [
      p,
    ]);
    const ipcReader = {
      userId: a.ipcNurse!.userId,
      role: "medsync_clinical_reader" as const,
      hospitalId: h,
    };
    const alerts = await probe(
      pg,
      ipcReader,
      `SELECT count(*)::int AS n FROM ipc_alerts WHERE patient_user_id = $1`,
      [p],
    );
    expect(alerts.ok && alerts.rows[0]!.n).toBe(1);
    const report = await probe(
      pg,
      ipcReader,
      `SELECT count(*)::int AS n FROM diagnostic_reports WHERE id = $1`,
      [r.reportId],
    );
    expect(report.ok && report.rows[0]!.n).toBe(0);
    const [al] = await alertsOf(p);
    await pg.query(
      `INSERT INTO ipc_alert_actions (hospital_id, alert_id, kind, by_user) VALUES ($1, $2, 'viewed', $3)`,
      [h, al!.id, a.ipcNurse!.userId],
    );
    expect(
      (
        await one<{ n: number }>(
          `SELECT count(*)::int AS n FROM ipc_alert_actions WHERE alert_id = $1 AND kind = 'viewed'`,
          [al!.id],
        )
      ).n,
    ).toBe(1);
  });

  it("S14 no action within the window escalates once", async () => {
    const p = await newPatient();
    await released(p, "test.tb_xpert", "obs.tb_xpert", "mtb_detected_rif_detected");
    const [al] = await alertsOf(p);
    const later = new Date(Date.now() + 61 * 60_000);
    expect(await tx((t) => escalateIpcAlerts(t, later))).toBeGreaterThanOrEqual(1);
    await tx((t) => escalateIpcAlerts(t, later));
    expect(
      (
        await one<{ n: number }>(
          `SELECT count(*)::int AS n FROM ipc_alert_actions WHERE alert_id = $1 AND kind = 'escalated'`,
          [al!.id],
        )
      ).n,
    ).toBe(1);
  });

  it("S15, S16 precautions started set the flag; a flagged patient admitted later raises a readmission alert; only IPC clears it, with a reason", async () => {
    const p = await newPatient();
    await released(p, "test.tb_xpert", "obs.tb_xpert", "mtb_detected_rif_detected");
    const [al] = await alertsOf(p);
    await expect(
      tx((t) =>
        recordIpcAction(
          t,
          ipc(),
          {
            alertId: al!.id,
            kind: "precautions_started",
            detail: { type: "airborne" },
            clientKey: key(),
          },
          new Date(),
        ),
      ),
    ).rejects.toThrow(/where/);
    await tx((t) =>
      recordIpcAction(
        t,
        ipc(),
        {
          alertId: al!.id,
          kind: "precautions_started",
          detail: { type: "airborne", where: "side_room" },
          clientKey: key(),
        },
        new Date(),
      ),
    );
    expect(
      await one(`SELECT kind, entry_key FROM patient_ipc_flag_events WHERE patient_user_id = $1`, [
        p,
      ]),
    ).toEqual({ kind: "set", entry_key: "rr_tb" });
    const enc = await encounter(pg, {
      hospitalId: h,
      patientUserId: p,
      clinicianUserId: a.doctor!.userId,
      departmentId: wardDept,
    });
    await pg.query(
      `INSERT INTO admissions (hospital_id, patient_user_id, source_encounter_id, ward_id, status, decided_by) VALUES ($1, $2, $3, $4, 'bed_allocated', $5)`,
      [h, p, enc, ward, a.doctor!.userId],
    );
    const re = (await alertsOf(p)).filter((x) => x.trigger === "readmission");
    expect(re).toHaveLength(1);
    expect(re[0]!.episode_key).toMatch(/^admitted:/);
    await expect(
      tx((t) =>
        clearPatientFlag(
          t,
          ipc(),
          { patientUserId: p, entryKey: "nothing", reason: "Fixture" },
          new Date(),
        ),
      ),
    ).rejects.toThrow(/no flag/);
    await tx((t) =>
      clearPatientFlag(
        t,
        ipc(),
        { patientUserId: p, entryKey: "rr_tb", reason: "Fixture clearance criterion met" },
        new Date(),
      ),
    );
    expect(
      (
        await rows(
          `SELECT kind FROM patient_ipc_flag_events WHERE patient_user_id = $1 ORDER BY id`,
          [p],
        )
      ).map((r) => r.kind),
    ).toEqual(["set", "clear"]);
  });

  it("S17 a screening result is labelled for confirmation", async () => {
    const p = await newPatient();
    await released(p, "test.malaria_rdt", "obs.malaria_test", "positive");
    const [al] = await alertsOf(p);
    expect(al).toMatchObject({ entry_key: "screen_fx", screening: true });
  });

  it("S18 an outbreak referral raises an alert at referral, before any result", async () => {
    const p = await newPatient();
    const tid = await testId("test.fbc");
    const enc = await encounter(pg, {
      hospitalId: h,
      patientUserId: p,
      clinicianUserId: a.doctor!.userId,
      departmentId: wardDept,
    });
    const order = await as(a.doctor!, p, (ctx) =>
      placeOrders(ctx, {
        patientUserId: p,
        encounterId: enc,
        orders: [{ clientKey: key(), testId: tid, priority: "routine", reasonText: "Check" }],
      }),
    );
    const sp = await as(a.nurse!, p, (ctx) =>
      collectSpecimen(ctx, {
        patientUserId: p,
        orderId: order.id,
        identifiersConfirmed: true,
        clientKey: key(),
      }),
    );
    await as(a.lab!, p, (ctx) =>
      receiveSpecimen(ctx, { patientUserId: p, specimenId: sp.id, clientKey: key() }),
    );
    const lab = { userId: a.lab!.userId, hospitalId: h, cadreCode: "LAB_TECHNOLOGIST" };
    const partner = await tx((t) =>
      savePartner(
        t,
        { userId: a.labLead!.userId, hospitalId: h },
        {
          name: "Outbreak destination (fixture)",
          kind: "outbreak",
          contacts: [],
          transport: [{ code: "courier", words: "Outbreak team" }],
          resultsReturn: [{ channel: "paper", words: "Paper" }],
          active: true,
        },
        new Date(),
      ),
    );
    await tx((t) =>
      recordOutbreakReferral(
        t,
        lab,
        {
          specimenId: sp.id,
          partnerId: partner,
          informed: { ipcLead: "IPC lead (fixture)", surveillanceFocal: "DSFP (fixture)" },
          handedAt: new Date(),
          note: null,
          clientKey: key(),
        },
        new Date(),
      ),
    );
    const [al] = await alertsOf(p);
    expect(al).toMatchObject({ entry_key: "vhf", trigger: "referral", route: "notify_now" });
  });

  it("S19 an amendment that removes the answer closes the alert as 'Result corrected'", async () => {
    const p = await newPatient();
    const r = await released(p, "test.tb_xpert", "obs.tb_xpert", "mtb_detected_rif_detected");
    await as(a.lab!, p, (ctx) =>
      amendResults(ctx, {
        patientUserId: p,
        reportId: r.reportId,
        status: "corrected",
        values: [{ conceptId: "obs.tb_xpert", code: "mtb_detected_rif_not_detected" }],
        reasonText: "Fixture correction",
        clientKey: key(),
      }),
    );
    const [al] = await alertsOf(p);
    expect(
      (
        await one<{ n: number }>(
          `SELECT count(*)::int AS n FROM ipc_alert_actions WHERE alert_id = $1 AND kind = 'result_corrected'`,
          [al!.id],
        )
      ).n,
    ).toBe(1);
  });

  it("S20 IDSR counts per epi-week match a hand count of the fixture", async () => {
    const all = await rows<{
      idsr_item: string | null;
      route: string;
      released_at: Date | null;
      created_at: Date;
    }>(`SELECT idsr_item, route, released_at, created_at FROM ipc_alerts WHERE hospital_id = $1`, [
      h,
    ]);
    const week = epiWeekStart(new Date());
    const counts = idsrCounts(
      all.map((r) => ({
        idsrItem: r.idsr_item,
        route: r.route as never,
        releasedAt: r.released_at,
        createdAt: r.created_at,
      })),
      week,
    );
    const hand = all.filter(
      (r) =>
        r.idsr_item === "Rifampicin resistant TB cases (DR)" &&
        epiWeekStart(r.released_at ?? r.created_at) === week,
    ).length;
    expect(counts.find((c) => c.item === "Rifampicin resistant TB cases (DR)")?.n).toBe(hand);
    expect(hand).toBeGreaterThanOrEqual(5);
  });
});

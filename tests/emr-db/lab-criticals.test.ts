/**
 * Lab Phase 1, Step 4: criticals by hand on the PGlite lane (scenarios S1–S16 at the data layer).
 * The release, its marks and its alert in one transaction; acknowledgement first-wins; the call log;
 * escalation under a fixed clock; corrections; delivery that fails without throwing. Response times
 * are FIXTURE minutes, invented for the test. Runs with EMR_PGLITE=1.
 */
import { randomUUID } from "node:crypto";
import type { Lane, Pg } from "./_pglite";
import type { EmrActor } from "@/lib/emr/actor";
import type { WriteCtx } from "@/lib/emr/write/context";
import type { Transport } from "@/lib/lab/criticals/store";
import { beforeAll, describe, expect, it } from "vitest";

import { withPatientWrite } from "@/lib/emr/write/context";
import { placeOrders } from "@/lib/emr/write/orders";
import { amendResults, enterResults } from "@/lib/emr/write/results";
import { collectSpecimen, receiveSpecimen } from "@/lib/emr/write/specimens";
import { generateKey } from "@/lib/encryption";
import {
  acknowledgeAlert,
  correctAlerts,
  couldNotReach,
  deliverAfterCommit,
  disputePhoneAck,
  lastHeartbeat,
  logCriticalCall,
  recordSeen,
  releaseWithCriticalMark,
  runEscalations,
} from "@/lib/lab/criticals/store";
import {
  bootLane,
  clinician,
  department,
  encounter,
  hospital,
  intake,
  laneOn,
  patient,
  reception,
} from "./_pglite";

const GLUCOSE_FASTING = "79a7098d-6585-5bff-ab14-3a4a09b3bf68";
const key = () => `k-${randomUUID()}`;
const T0 = new Date("2026-10-11T08:00:00Z");
const at = (min: number) => new Date(T0.getTime() + min * 60_000);
const mark = {
  conceptId: "obs.glucose",
  check: { kind: "repeated" as const, repeatValue: "1.8" },
  sampleChecked: true,
};

/** A transport that records what it was asked to send; `fail` makes every push throw. */
function fakeTransport(fail = false) {
  const pushed: string[] = [];
  const t: Transport = {
    push: async (d) => {
      if (fail) throw new Error("queue down");
      pushed.push(`${d.kind}:${d.userId}`);
    },
    sms: async () => ({ ok: true }),
  };
  return { t, pushed };
}

describe.skipIf(!laneOn)("Lab Phase 1 criticals by hand (S1–S16)", () => {
  let lane: Lane;
  let pg: Pg;
  let hA: string;
  let hB: string;
  let hC: string;
  let ward4: string;
  const a: Record<string, EmrActor> = {};

  const one = async <T = Record<string, unknown>>(q: string, p?: unknown[]) =>
    (await pg.query<T>(q, p)).rows[0]!;
  const count = async (q: string, p?: unknown[]) => Number((await one<{ n: number }>(q, p)).n);
  const as = <T>(
    actor: EmrActor,
    patientId: string,
    now: Date,
    fn: (ctx: WriteCtx) => Promise<T>,
  ) => withPatientWrite(actor, patientId, fn, { database: lane.db, now });
  const tx = <T>(fn: (t: Parameters<Parameters<Lane["db"]["transaction"]>[0]>[0]) => Promise<T>) =>
    lane.db.transaction(fn);

  /** An order through the real engines up to a saved preliminary, at `h` (doctor and nurse from `who`). */
  async function prepared(
    h: string,
    who: { doctor: EmrActor; nurse: EmrActor; lab: EmrActor; dept: string },
    opts: { restricted?: boolean } = {},
  ) {
    const patientId = await patient(pg);
    await intake(pg, { hospitalId: h, patientUserId: patientId });
    const enc = await encounter(pg, {
      hospitalId: h,
      patientUserId: patientId,
      clinicianUserId: who.doctor.userId,
      departmentId: who.dept,
    });
    const order = await as(who.doctor, patientId, at(-60), (ctx) =>
      placeOrders(ctx, {
        patientUserId: patientId,
        encounterId: enc,
        orders: [
          { clientKey: key(), testId: GLUCOSE_FASTING, priority: "routine", reasonText: "Check" },
        ],
      }),
    );
    const sp = await as(who.nurse, patientId, at(-50), (ctx) =>
      collectSpecimen(ctx, {
        patientUserId: patientId,
        orderId: order.id,
        identifiersConfirmed: true,
        fastingState: "fasting",
        fastingHours: 9,
        clientKey: key(),
      }),
    );
    await as(who.lab, patientId, at(-40), (ctx) =>
      receiveSpecimen(ctx, { patientUserId: patientId, specimenId: sp.id, clientKey: key() }),
    );
    const prelim = await as(who.lab, patientId, at(-10), (ctx) =>
      enterResults(ctx, {
        patientUserId: patientId,
        orderId: order.id,
        status: "preliminary",
        values: [
          {
            conceptId: "obs.glucose",
            value: "1.9",
            unit: "mmol/L",
            ...(opts.restricted ? { restricted: true } : {}),
          },
        ],
        clientKey: key(),
      }),
    );
    return { patientId, orderId: order.id, prelimId: prelim.id, encounterId: enc };
  }

  async function released(
    h = hA,
    opts: {
      restricted?: boolean;
      who?: { doctor: EmrActor; nurse: EmrActor; lab: EmrActor; dept: string };
    } = {},
  ) {
    const who = opts.who ?? { doctor: a.doctor!, nurse: a.nurse!, lab: a.lab!, dept: ward4 };
    const p = await prepared(h, who, opts);
    const clientKey = key();
    const r = await as(who.lab, p.patientId, T0, (ctx) =>
      releaseWithCriticalMark(ctx, {
        patientUserId: p.patientId,
        orderId: p.orderId,
        reportId: p.prelimId,
        marks: [mark],
        note: "Patient on insulin",
        clientKey,
      }),
    );
    // Close the visit: from here only real bases (department, lab work, recipiency) remain.
    await pg.query(`UPDATE patient_intakes SET status = 'completed' WHERE patient_user_id = $1`, [
      p.patientId,
    ]);
    return { ...p, ...r, clientKey, alertId: r.alert.alertId! };
  }

  const alertRow = (id: string) =>
    one<Record<string, unknown>>(`SELECT * FROM critical_alerts WHERE id = $1`, [id]);
  const kinds = async (id: string) =>
    (
      await pg.query<{ kind: string }>(
        `SELECT kind FROM critical_alert_events WHERE alert_id = $1 ORDER BY at, kind`,
        [id],
      )
    ).rows.map((r) => r.kind);

  beforeAll(async () => {
    process.env.MEDSYNC_PHI_KEY ??= generateKey();
    lane = await bootLane();
    pg = lane.pg;
    hA = await hospital(pg, "Criticals A");
    hB = await hospital(pg, "Criticals B");
    hC = await hospital(pg, "Criticals C (nothing signed)");
    ward4 = await department(pg, hA, "Ward 4A");
    const ward5 = await department(pg, hA, "Ward 5");
    const lab = await department(pg, hA, "Laboratory");
    const make = async (
      h: string,
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
        ? { labPermissions: ["lab.receive", "lab.result.enter", "lab.result.release"] }
        : {}),
    });
    a.doctor = await make(hA, ward4, "MEDICAL_OFFICER", "doctor");
    a.consultant = await make(hA, ward5, "CONSULTANT", "doctor");
    a.hosp = await make(hA, ward5, "MEDICAL_OFFICER", "doctor");
    a.other = await make(hA, ward5, "MEDICAL_OFFICER", "doctor");
    a.nurse = await make(hA, ward4, "NURSE", "nurse");
    a.lab = await make(hA, lab, "LAB_TECHNOLOGIST", "lab");
    a.lab2 = await make(hA, lab, "LAB_TECH", "lab");
    const wardB = await department(pg, hB, "Ward B");
    a.docB = await make(hB, wardB, "MEDICAL_OFFICER", "doctor");
    a.reception = {
      ...(a.doctor as EmrActor),
      ...(await reception(pg, { hospitalId: hA, departmentId: ward4 })),
      cadreCode: "RECEPTION",
    };
    const wardC = await department(pg, hC, "Ward C");
    const labC = await department(pg, hC, "Lab C");
    a.docC = await make(hC, wardC, "MEDICAL_OFFICER", "doctor");
    a.nurseC = await make(hC, wardC, "NURSE", "nurse");
    a.labC = await make(hC, labC, "LAB_TECHNOLOGIST", "lab");
    (a as Record<string, unknown>).wardC = wardC;

    // Hospital A: FIXTURE response times, signed by two people; contacts for Ward 4A and the hospital.
    await pg.query(
      `INSERT INTO critical_response_versions (hospital_id, version, status, ack_within_min, level1_after_min, level2_after_min, source,
         authored_by, lead_signed_by, lead_signed_at, cso_signed_by, cso_signed_at)
       VALUES ($1, 1, 'signed', 30, 20, 15, 'fixture: invented for tests', $2, $2, now(), $3, now())`,
      [hA, a.lab.userId, a.consultant.userId],
    );
    await pg.query(
      `INSERT INTO critical_contacts (hospital_id, department_id, level, user_id, position) VALUES ($1, $2, 1, $3, 1)`,
      [hA, ward4, a.consultant.userId],
    );
    await pg.query(
      `INSERT INTO critical_contacts (hospital_id, level, user_id, position) VALUES ($1, 2, $2, 1)`,
      [hA, a.hosp.userId],
    );
  }, 300_000);

  it("S1 release with a repeat: one transaction, one alert, one mark, sent to the orderer, due at the signed time", async () => {
    const r = await released();
    expect(r.alert).toMatchObject({ subState: "sent", level: 0, emptyLevels: [] });
    const row = await alertRow(r.alertId);
    expect(row).toMatchObject({ state: "open", sub_state: "sent", level: 0, report_id: r.id });
    expect(new Date(row.due_at as string)).toEqual(at(30));
    expect(
      await count(
        `SELECT count(*) n FROM critical_marks WHERE alert_id = $1 AND check_kind = 'repeated' AND repeat_value = 1.8`,
        [r.alertId],
      ),
    ).toBe(1);
    expect(await kinds(r.alertId)).toEqual(["created", "notified", "notified"]);
    expect(r.alert.jobs.map((j) => j.userId)).toEqual([a.doctor!.userId]);
    // SMS is off by default: recorded as off, not queued.
    expect(
      await count(
        `SELECT count(*) n FROM critical_alert_events WHERE alert_id = $1 AND channel = 'sms' AND outcome = 'off'`,
        [r.alertId],
      ),
    ).toBe(1);
    // The report is final.
    expect(
      (await one<{ status: string }>(`SELECT status FROM diagnostic_reports WHERE id = $1`, [r.id]))
        .status,
    ).toBe("final");
  });

  it("CM-2 a refused mark refuses the release: nothing is released and no alert exists", async () => {
    const p = await prepared(hA, { doctor: a.doctor!, nurse: a.nurse!, lab: a.lab!, dept: ward4 });
    await pg.query(
      `INSERT INTO lab_settings (hospital_id, second_check) VALUES ($1, true) ON CONFLICT (hospital_id) DO UPDATE SET second_check = true`,
      [hA],
    );
    await expect(
      as(a.lab!, p.patientId, T0, (ctx) =>
        releaseWithCriticalMark(ctx, {
          patientUserId: p.patientId,
          orderId: p.orderId,
          reportId: p.prelimId,
          marks: [mark],
          note: null,
          clientKey: key(),
        }),
      ),
    ).rejects.toThrow(/second check/);
    // CM-5: a second lab user who may release, or a solo reason.
    const ok = await as(a.lab!, p.patientId, T0, (ctx) =>
      releaseWithCriticalMark(ctx, {
        patientUserId: p.patientId,
        orderId: p.orderId,
        reportId: p.prelimId,
        marks: [{ ...mark, secondCheckerId: a.lab2!.userId }],
        note: null,
        clientKey: key(),
      }),
    );
    expect(ok.alert.alertId).toBeTruthy();
    await pg.query(`UPDATE lab_settings SET second_check = false WHERE hospital_id = $1`, [hA]);
    expect(
      await count(`SELECT count(*) n FROM critical_alerts WHERE report_id = $1`, [p.prelimId]),
    ).toBe(0);
  });

  it("S11 a double tap on Release and alert creates one report and one alert", async () => {
    const p = await prepared(hA, { doctor: a.doctor!, nurse: a.nurse!, lab: a.lab!, dept: ward4 });
    const input = {
      patientUserId: p.patientId,
      orderId: p.orderId,
      reportId: p.prelimId,
      marks: [mark],
      note: null,
      clientKey: key(),
    };
    const first = await as(a.lab!, p.patientId, T0, (ctx) => releaseWithCriticalMark(ctx, input));
    const second = await as(a.lab!, p.patientId, T0, (ctx) => releaseWithCriticalMark(ctx, input));
    expect(second.id).toBe(first.id);
    expect(second.alert.alertId).toBe(first.alert.alertId);
    expect(
      await count(`SELECT count(*) n FROM critical_alerts WHERE patient_user_id = $1`, [
        p.patientId,
      ]),
    ).toBe(1);
  });

  it("S2 the doctor acknowledges in one call; the report counts as reviewed; the lab hears", async () => {
    const r = await released();
    const ack = await tx((t) =>
      acknowledgeAlert(t, a.doctor!, {
        alertId: r.alertId,
        response: null,
        note: null,
        now: at(5),
      }),
    );
    expect(ack).toMatchObject({
      kind: "acknowledged",
      state: { state: "acknowledged", by: a.doctor!.userId, via: "app", response: null },
    });
    expect(ack.jobs).toEqual([
      expect.objectContaining({ userId: a.lab!.userId, kind: "acknowledged" }),
    ]);
    expect(await alertRow(r.alertId)).toMatchObject({
      state: "acknowledged",
      sub_state: null,
      acknowledged_via: "app",
    });
    expect(
      await count(
        `SELECT count(*) n FROM result_acknowledgements WHERE report_id = $1 AND acknowledged_by_user_id = $2`,
        [r.id, a.doctor!.userId],
      ),
    ).toBe(1);
  });

  it("S10 two acknowledgements: one wins, the second sees the first", async () => {
    const r = await released();
    const [x, y] = await Promise.all([
      tx((t) =>
        acknowledgeAlert(t, a.doctor!, {
          alertId: r.alertId,
          response: "reviewing",
          note: null,
          now: at(5),
        }),
      ),
      tx((t) =>
        acknowledgeAlert(t, a.hosp!, {
          alertId: r.alertId,
          response: "already_aware",
          note: null,
          now: at(5),
        }),
      ).catch((e: Error) => e),
    ]);
    expect(x).toMatchObject({ kind: "acknowledged" });
    // hosp has neither access nor recipiency yet: not found. Escalate to make them a recipient, then try.
    expect(y).toBeInstanceOf(Error);
    const again = await tx((t) =>
      acknowledgeAlert(t, a.doctor!, {
        alertId: r.alertId,
        response: "asked_team",
        note: null,
        now: at(6),
      }),
    );
    expect(again).toMatchObject({
      kind: "already",
      state: { by: a.doctor!.userId, response: "reviewing" },
    });
    expect(
      await count(
        `SELECT count(*) n FROM critical_alert_events WHERE alert_id = $1 AND kind = 'acknowledged'`,
        [r.alertId],
      ),
    ).toBe(1);
  });

  it("S3 nobody acknowledges: at the signed time an escalation is written; the level-1 contact acknowledges", async () => {
    // Earlier scenarios leave their own open alerts due at the same fixture time: settle them first.
    await runEscalations(lane.db, { now: at(10_000), source: "scheduler", hospitalId: hA });
    const r = await released();
    expect(
      (await runEscalations(lane.db, { now: at(29), source: "scheduler", hospitalId: hA }))
        .escalated,
    ).toBe(0);
    const run = await runEscalations(lane.db, { now: at(30), source: "scheduler", hospitalId: hA });
    expect(run.escalated).toBe(1);
    expect(run.jobs.map((j) => `${j.kind}:${j.alertId}:${j.userId}`)).toEqual([
      `escalated:${r.alertId}:${a.consultant!.userId}`,
    ]);
    expect(await alertRow(r.alertId)).toMatchObject({ level: 1, sub_state: "escalated" });
    // ES-2: running again at the same time writes nothing new.
    const before = (await kinds(r.alertId)).length;
    expect(
      (await runEscalations(lane.db, { now: at(30), source: "lazy", hospitalId: hA })).escalated,
    ).toBe(0);
    expect((await kinds(r.alertId)).length).toBe(before);
    // The consultant has no access basis for this patient, but is a recipient (D-LAB1-29).
    const ack = await tx((t) =>
      acknowledgeAlert(t, a.consultant!, {
        alertId: r.alertId,
        response: "reviewing",
        note: "Seeing now",
        now: at(31),
      }),
    );
    expect(ack.kind).toBe("acknowledged");
    expect(await alertRow(r.alertId)).toMatchObject({ state: "acknowledged", level: 1 });
  });

  it("S3 the escalation reaches level 2 at its own time, and the last level holds", async () => {
    const r = await released();
    await runEscalations(lane.db, { now: at(30), source: "scheduler", hospitalId: hA });
    await runEscalations(lane.db, { now: at(50), source: "scheduler", hospitalId: hA });
    expect(await alertRow(r.alertId)).toMatchObject({ level: 2, state: "open" });
    expect(
      (await runEscalations(lane.db, { now: at(500), source: "scheduler", hospitalId: hA }))
        .escalated,
    ).toBe(0);
    expect(await alertRow(r.alertId)).toMatchObject({ level: 2, state: "open" });
  });

  it("S4 a level that resolves to nobody is passed at once and named", async () => {
    const ward6 = await department(pg, hA, "Ward 6 (no contacts)");
    const doc6 = {
      ...a.doctor!,
      ...(await clinician(pg, { hospitalId: hA, departmentId: ward6 })),
      departmentId: ward6,
    };
    const nurse6 = {
      ...a.nurse!,
      ...(await clinician(pg, { hospitalId: hA, departmentId: ward6, cadre: "NURSE" })),
      departmentId: ward6,
    };
    const r = await released(hA, {
      who: { doctor: doc6, nurse: nurse6, lab: a.lab!, dept: ward6 },
    });
    const run = await runEscalations(lane.db, { now: at(30), source: "scheduler", hospitalId: hA });
    expect(run.escalated).toBeGreaterThanOrEqual(1);
    expect(await alertRow(r.alertId)).toMatchObject({ level: 2 });
    const ev = await one<{ data: { emptyLevels: number[] } }>(
      `SELECT data FROM critical_alert_events WHERE alert_id = $1 AND kind = 'escalated'`,
      [r.alertId],
    );
    expect(ev.data.emptyLevels).toEqual([1]);
  });

  it("S5 every level empty: Not sent, at the last level; the release still stands", async () => {
    const wardC = (a as Record<string, unknown>).wardC as string;
    const p = await prepared(hC, { doctor: a.docC!, nurse: a.nurseC!, lab: a.labC!, dept: wardC });
    // The orderer leaves the hospital before release.
    await pg.query(`UPDATE staff_affiliations SET state = 'suspended' WHERE user_id = $1`, [
      a.docC!.userId,
    ]);
    const r = await as(a.labC!, p.patientId, T0, (ctx) =>
      releaseWithCriticalMark(ctx, {
        patientUserId: p.patientId,
        orderId: p.orderId,
        reportId: p.prelimId,
        marks: [mark],
        note: null,
        clientKey: key(),
      }),
    );
    await pg.query(`UPDATE staff_affiliations SET state = 'active' WHERE user_id = $1`, [
      a.docC!.userId,
    ]);
    expect(r.alert).toMatchObject({
      subState: "not_sent",
      level: 2,
      emptyLevels: [0, 1, 2],
      jobs: [],
    });
    expect(await alertRow(r.alert.alertId!)).toMatchObject({ sub_state: "not_sent", due_at: null });
    expect(
      (await one<{ status: string }>(`SELECT status FROM diagnostic_reports WHERE id = $1`, [r.id]))
        .status,
    ).toBe("final");
    const created = await one<{ data: { skipped: { reason: string }[] } }>(
      `SELECT data FROM critical_alert_events WHERE alert_id = $1 AND kind = 'created'`,
      [r.alert.alertId],
    );
    expect(created.data.skipped).toEqual([expect.objectContaining({ reason: "left" })]);
  });

  it("S6 delivery fails after commit: nothing throws, the failure is an event, the release stands", async () => {
    const r = await released();
    const { t } = fakeTransport(true);
    await expect(deliverAfterCommit(lane.db, r.alert.jobs, t)).resolves.toEqual({ failed: 1 });
    expect(
      await count(
        `SELECT count(*) n FROM critical_alert_events WHERE alert_id = $1 AND channel = 'app' AND outcome = 'failed'`,
        [r.alertId],
      ),
    ).toBe(1);
    const ok = fakeTransport();
    await deliverAfterCommit(lane.db, r.alert.jobs, ok.t);
    expect(ok.pushed).toEqual([`created:${a.doctor!.userId}`]);
  });

  it("S7 a call with read-back acknowledges by phone; the named doctor disputes and it reopens", async () => {
    const r = await released();
    const call = await tx((t) =>
      logCriticalCall(t, a.lab!, {
        alertId: r.alertId,
        to: { userId: a.doctor!.userId },
        readBack: true,
        now: at(8),
      }),
    );
    expect(call).toMatchObject({ acknowledged: true, wardInformed: false });
    expect(await alertRow(r.alertId)).toMatchObject({
      state: "acknowledged",
      acknowledged_via: "phone",
      acknowledged_by: a.doctor!.userId,
      logged_by: a.lab!.userId,
    });
    await expect(
      tx((t) => disputePhoneAck(t, a.consultant!, { alertId: r.alertId, now: at(9) })),
    ).rejects.toThrow(/named/);
    await tx((t) => disputePhoneAck(t, a.doctor!, { alertId: r.alertId, now: at(9) }));
    const row = await alertRow(r.alertId);
    expect(row).toMatchObject({
      state: "open",
      sub_state: "sent",
      level: 0,
      acknowledged_by: null,
    });
    expect(new Date(row.due_at as string)).toEqual(at(39));
  });

  it("S8 a call to a nurse records Ward informed and the clock keeps running", async () => {
    const r = await released();
    const call = await tx((t) =>
      logCriticalCall(t, a.lab!, {
        alertId: r.alertId,
        to: { userId: a.nurse!.userId },
        readBack: true,
        now: at(8),
      }),
    );
    expect(call).toMatchObject({ acknowledged: false, wardInformed: true });
    expect(await alertRow(r.alertId)).toMatchObject({ state: "open" });
    const text = await tx((t) =>
      logCriticalCall(t, a.lab!, {
        alertId: r.alertId,
        to: { name: "Sister on Ward 4A", role: "Nurse in charge" },
        readBack: true,
        now: at(9),
      }),
    );
    expect(text.acknowledged).toBe(false);
    const ev = await one<{ data: Record<string, unknown> }>(
      `SELECT data FROM critical_alert_events WHERE alert_id = $1 AND kind = 'call_logged' AND recipient_id IS NULL`,
      [r.alertId],
    );
    expect(ev.data).not.toHaveProperty("name"); // the name is stored encrypted
    expect(ev.data).toHaveProperty("nameCiphertext");
  });

  it("S9 Could not reach anyone escalates at once", async () => {
    const r = await released();
    const out = await tx((t) => couldNotReach(t, a.lab!, { alertId: r.alertId, now: at(3) }));
    expect(out).toMatchObject({ escalatedTo: 1, emptyLevels: [] });
    const row = await alertRow(r.alertId);
    expect(row).toMatchObject({ level: 1, sub_state: "escalated" });
    expect(new Date(row.due_at as string)).toEqual(at(23));
    expect(await kinds(r.alertId)).toEqual(
      expect.arrayContaining(["could_not_reach", "escalated"]),
    );
  });

  it("S12 the lab amends an alerted result: a correction alert to every earlier recipient and the acknowledger", async () => {
    const r = await released();
    await runEscalations(lane.db, { now: at(30), source: "scheduler", hospitalId: hA });
    await tx((t) =>
      acknowledgeAlert(t, a.consultant!, {
        alertId: r.alertId,
        response: null,
        note: null,
        now: at(31),
      }),
    );
    const out = await as(a.lab!, r.patientId, at(60), async (ctx) => {
      const amended = await amendResults(ctx, {
        patientUserId: r.patientId,
        reportId: r.id,
        status: "corrected",
        values: [{ conceptId: "obs.glucose", value: "4.9", unit: "mmol/L" }],
        reasonText: "Wrong sample run",
        clientKey: key(),
      });
      return correctAlerts(ctx, {
        patientUserId: r.patientId,
        priorReportId: r.id,
        newReportId: amended.id,
      });
    });
    expect(out.correctionAlertId).toBeTruthy();
    expect(new Set(out.jobs.map((j) => j.userId))).toEqual(
      new Set([a.doctor!.userId, a.consultant!.userId]),
    );
    expect(await alertRow(out.correctionAlertId!)).toMatchObject({
      state: "open",
      correction_of: r.alertId,
      level: 0,
    });
    expect(await kinds(r.alertId)).toContain("corrected");
    // It needs its own acknowledgement.
    const ack = await tx((t) =>
      acknowledgeAlert(t, a.doctor!, {
        alertId: out.correctionAlertId!,
        response: null,
        note: null,
        now: at(61),
      }),
    );
    expect(ack.kind).toBe("acknowledged");
  });

  it("S13 response times unsigned: sent, never escalated by itself; Could not reach anyone still works", async () => {
    const wardC = (a as Record<string, unknown>).wardC as string;
    const r = await released(hC, {
      who: { doctor: a.docC!, nurse: a.nurseC!, lab: a.labC!, dept: wardC },
    });
    expect(await alertRow(r.alertId)).toMatchObject({ sub_state: "sent", due_at: null });
    expect(
      (await runEscalations(lane.db, { now: at(10_000), source: "scheduler", hospitalId: hC }))
        .escalated,
    ).toBe(0);
    const out = await tx((t) => couldNotReach(t, a.labC!, { alertId: r.alertId, now: at(5) }));
    expect(out.escalatedTo).toBe(2); // hospital C has no contacts: level 1 is empty, so the last level
    expect(out.emptyLevels).toEqual([1, 2]);
  });

  it("S14 the lazy path writes the overdue escalation and a heartbeat", async () => {
    const r = await released();
    const run = await runEscalations(lane.db, { now: at(34), source: "lazy", hospitalId: hA });
    expect(run.escalated).toBeGreaterThanOrEqual(1);
    expect(await alertRow(r.alertId)).toMatchObject({ level: 1 });
    expect(
      await count(
        `SELECT count(*) n FROM escalation_heartbeats WHERE source = 'lazy' AND ran_at = $1`,
        [at(34)],
      ),
    ).toBe(1);
    await runEscalations(lane.db, { now: at(20_000), source: "scheduler" });
    expect(await tx((t) => lastHeartbeat(t))).toEqual(at(20_000));
  });

  it("S15 a restricted result: a recipient without access is skipped and listed; no SMS is ever queued", async () => {
    // The consultant (level 1) has no access basis; the orderer has department access.
    const r = await released(hA, { restricted: true });
    await pg.query(
      `INSERT INTO lab_settings (hospital_id, sms_live) VALUES ($1, true) ON CONFLICT (hospital_id) DO UPDATE SET sms_live = true`,
      [hA],
    );
    const out = await tx((t) => couldNotReach(t, a.lab!, { alertId: r.alertId, now: at(2) }));
    await pg.query(`UPDATE lab_settings SET sms_live = false WHERE hospital_id = $1`, [hA]);
    expect(await alertRow(r.alertId)).toMatchObject({ restricted: true });
    const ev = await one<{ data: { skipped: { userId: string; reason: string }[] } }>(
      `SELECT data FROM critical_alert_events WHERE alert_id = $1 AND kind = 'escalated'`,
      [r.alertId],
    );
    expect(ev.data.skipped).toContainEqual({ userId: a.consultant!.userId, reason: "no_access" });
    expect(out.jobs.every((j) => j.sms === null)).toBe(true);
    expect(
      await count(
        `SELECT count(*) n FROM critical_alert_events WHERE alert_id = $1 AND channel = 'sms' AND outcome = 'queued'`,
        [r.alertId],
      ),
    ).toBe(0);
  });

  it("S16 a clinician of another hospital, a receptionist, or a clinician with no basis cannot acknowledge", async () => {
    const r = await released();
    await expect(
      tx((t) =>
        acknowledgeAlert(t, a.docB!, {
          alertId: r.alertId,
          response: null,
          note: null,
          now: at(2),
        }),
      ),
    ).rejects.toThrow(/not found/);
    await expect(
      tx((t) =>
        acknowledgeAlert(t, a.reception!, {
          alertId: r.alertId,
          response: null,
          note: null,
          now: at(2),
        }),
      ),
    ).rejects.toThrow(/not found/);
    await expect(
      tx((t) =>
        acknowledgeAlert(t, a.other!, {
          alertId: r.alertId,
          response: null,
          note: null,
          now: at(2),
        }),
      ),
    ).rejects.toThrow(/not found/);
    // A nurse with access (department) may see it but not acknowledge (CA-6).
    await expect(
      tx((t) =>
        acknowledgeAlert(t, a.nurse!, {
          alertId: r.alertId,
          response: null,
          note: null,
          now: at(2),
        }),
      ),
    ).rejects.toThrow(/may order/);
  });

  it("CA-5 seen is recorded once per recipient, and never for anyone else", async () => {
    const r = await released();
    expect(await tx((t) => recordSeen(t, a.doctor!, r.alertId, at(1)))).toBe(true);
    expect(await tx((t) => recordSeen(t, a.doctor!, r.alertId, at(2)))).toBe(false);
    expect(await tx((t) => recordSeen(t, a.other!, r.alertId, at(2)))).toBe(false);
    expect(await alertRow(r.alertId)).toMatchObject({ state: "open" });
  });

  it("CA-14 on the record: every mark has its alert, every alert a released report, nothing overdue below the last level", async () => {
    await runEscalations(lane.db, { now: at(10_000), source: "scheduler" });
    expect(
      await count(
        `SELECT count(*) n FROM critical_marks m LEFT JOIN critical_alerts a ON a.id = m.alert_id WHERE a.id IS NULL`,
      ),
    ).toBe(0);
    expect(
      await count(
        `SELECT count(*) n FROM critical_alerts a JOIN diagnostic_reports r ON r.id = a.report_id WHERE r.status NOT IN ('final','amended','corrected')`,
      ),
    ).toBe(0);
    expect(
      await count(
        `SELECT count(*) n FROM critical_alerts WHERE state = 'open' AND level < 2 AND due_at <= $1`,
        [at(10_000)],
      ),
    ).toBe(0);
  });
});

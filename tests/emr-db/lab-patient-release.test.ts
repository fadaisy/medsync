/**
 * Lab Phase 5, Step 6 on the PGlite lane: release rules and the clinician's side (S21–S27). Reports are owner-inserted
 * (as the Phase 5 data lane does) so that "critical" and the restricted classes can be set exactly; every write after
 * that goes through the stores as the ordering doctor. The release table here is a FIXTURE. Runs with EMR_PGLITE=1.
 */
import { randomUUID } from "node:crypto";
import type { Lane, Pg } from "./_pglite";
import type { EmrActor } from "@/lib/emr/actor";
import type { WriteCtx } from "@/lib/emr/write/context";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { withPatientWrite } from "@/lib/emr/write/context";
import { generateKey } from "@/lib/encryption";
import { saveConfigDraft, signConfig } from "@/lib/lab/catalogue-v2";
import {
  agedResults,
  holdFromPatient,
  holdsForMonth,
  patientSees,
  recordPatientTold,
  releaseContext,
  releaseHold,
  resultFacts,
} from "@/lib/lab/patient-release-store";
import { lint } from "@/lib/lab/plain-words";
import {
  bootLane,
  clinician,
  department,
  encounter,
  hospital,
  intake,
  laneOn,
  patient,
} from "./_pglite";

const FLAGS = ["LAB_WORKSPACE", "LAB_UNITS_RANGES", "PATIENT_RESULTS"];
const key = () => `k-${randomUUID()}`;
const RULES = {
  groups: {
    routine: { inApp: "after_review", sms: true },
    critical: { inApp: "after_told", sms: false },
    referred: { inApp: "after_review", sms: true },
    bedside: { inApp: "after_review", sms: false },
    corrected: { inApp: "after_review", sms: false },
  },
  holdMaxDays: 30,
  agedWindowDays: 7,
  source: { doc: "Fixture release table", date: "2026-10-17" },
};

describe.skipIf(!laneOn)("Lab Phase 5 release rules and the clinician's side (S21–S27)", () => {
  let lane: Lane;
  let pg: Pg;
  let h: string;
  let dept: string;
  let p: string;
  const a: Record<string, EmrActor> = {};
  const env = { ...process.env };
  const tx = <T>(fn: (t: Parameters<Parameters<Lane["db"]["transaction"]>[0]>[0]) => Promise<T>) =>
    lane.db.transaction(fn);
  const as = <T>(fn: (ctx: WriteCtx) => Promise<T>) =>
    withPatientWrite(a.doctor!, p, fn, { database: lane.db });
  const one = async <T = Record<string, unknown>>(q: string, params: unknown[] = []) =>
    (await pg.query<T>(q, params)).rows[0] as T;
  const ins = async (q: string, params: unknown[]) =>
    (await one<{ id: string }>(`${q} RETURNING id`, params)).id;
  const testId = async (code: string) =>
    (
      await one<{ id: string }>(
        `SELECT id FROM test_catalogue WHERE code = $1 AND hospital_id IS NULL`,
        [code],
      )
    ).id;
  async function report(code: string, o: { critical?: boolean; daysAgo?: number } = {}) {
    const enc = await encounter(pg, {
      hospitalId: h,
      patientUserId: p,
      clinicianUserId: a.doctor!.userId,
      departmentId: dept,
    });
    const tid = await testId(code);
    const order = await ins(
      `INSERT INTO encounter_orders (encounter_id, patient_user_id, kind, text, authored_by_user_id, lifecycle, hospital_id,
         priority, frequency, performer, intent_source, requester_cadre, effective_at, test_id, reason_text_ciphertext)
       VALUES ($1, $2, 'lab', 'Test', $3, 'events', $4, 'routine', 'once', 'in_house', 'clinician', 'MEDICAL_OFFICER', now(), $5, 'iv:tag:ct')`,
      [enc, p, a.doctor!.userId, h, tid],
    );
    return ins(
      `WITH n AS (SELECT gen_random_uuid() AS id)
       INSERT INTO diagnostic_reports (id, logical_id, hospital_id, patient_user_id, encounter_id, recorded_by_user_id,
         effective_at, source, trust, order_id, kind, issued_at, performer, entry_mode, entered_by_user_id, test_id, status, critical)
       SELECT n.id, n.id, $1, $2, $3, $4, now(), 'lab', 4, $5, 'lab', now() - make_interval(days => $8), 'in_house', 'direct', $4, $6, 'final', $7 FROM n`,
      [h, p, enc, a.lab!.userId, order, tid, o.critical ?? false, o.daysAgo ?? 0],
    );
  }
  const review = (reportId: string) =>
    pg.query(
      `INSERT INTO result_acknowledgements (report_id, hospital_id, patient_user_id, acknowledged_by_user_id, acknowledger_cadre, action)
       VALUES ($1, $2, $3, $4, 'MEDICAL_OFFICER', 'seen')`,
      [reportId, h, p, a.doctor!.userId],
    );
  const sees = async (reportId: string) => {
    const ctx = await tx((t) => releaseContext(t, h, new Date()));
    const [f] = await tx((t) => resultFacts(t, h, [reportId]));
    return patientSees(f!, ctx);
  };

  beforeAll(async () => {
    process.env.MEDSYNC_PHI_KEY ??= generateKey();
    for (const k of FLAGS) process.env[k] = "1";
    lane = await bootLane();
    pg = lane.pg;
    h = await hospital(pg, "Release");
    dept = await department(pg, h, "Medicine");
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
    });
    a.doctor = await make(dept, "MEDICAL_OFFICER", "doctor");
    a.lab = await make(labDept, "LAB_TECHNOLOGIST", "lab");
    a.lead = await make(labDept, "LAB_TECHNOLOGIST", "lab");
    a.lead2 = await make(labDept, "LAB_TECHNOLOGIST", "lab");
    a.cso = await make(dept, "CONSULTANT", "doctor");
    await pg.query(
      `INSERT INTO department_heads (hospital_id, department_id, user_id, acting) VALUES ($1, $2, $3, false), ($1, $2, $4, true)`,
      [h, labDept, a.lead.userId, a.lead2.userId],
    );
    await pg.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'superadmin')`, [
      a.cso.userId,
    ]);
    p = await patient(pg);
    await pg.query(
      `INSERT INTO patient_profiles (id, first_name_encrypted, surname_encrypted, sex, date_of_birth, id_type, phone_encrypted, district_id)
       VALUES ($1, 'iv:t:c', 'iv:t:c', 'female', '2000-01-01', 'none', 'iv:t:c', (SELECT id FROM districts LIMIT 1))`,
      [p],
    );
    await pg.query(
      `INSERT INTO consent_records (user_id, consent_type, version, consent_text_sha256) VALUES ($1, 'results_in_app', 'fx', $2)`,
      [p, "a".repeat(64)],
    );
    await intake(pg, { hospitalId: h, patientUserId: p });
  }, 300_000);
  afterAll(() => {
    for (const k of FLAGS) process.env[k] = env[k];
  });

  it("S26 release rules cannot go live unsigned; the author cannot sign their own draft; the CSO countersigns", async () => {
    const r = await report("test.creatinine");
    await review(r);
    expect(await sees(r)).toEqual({ kind: "rules_unsigned" });
    const id = await tx((t) =>
      saveConfigDraft(
        t,
        { userId: a.lead!.userId, hospitalId: h },
        { kind: "patient_release", key: "hospital", payload: RULES },
        new Date(),
      ),
    );
    await expect(
      tx((t) =>
        signConfig(
          t,
          { userId: a.lead!.userId, hospitalId: h, as: "lead" },
          { configId: id, exceptionNote: null },
          new Date(),
        ),
      ),
    ).rejects.toThrow(/another lead/i);
    await tx((t) =>
      signConfig(
        t,
        { userId: a.lead2!.userId, hospitalId: h, as: "lead" },
        { configId: id, exceptionNote: null },
        new Date(),
      ),
    );
    expect(await sees(r)).toEqual({ kind: "rules_unsigned" }); // the lead alone is not enough
    await tx((t) =>
      signConfig(
        t,
        { userId: a.cso!.userId, hospitalId: h, as: "cso" },
        { configId: id, exceptionNote: null },
        new Date(),
      ),
    );
    expect(await sees(r)).toEqual({ kind: "visible" });
  });

  it("S21 a routine result waits for review; reviewing makes it visible", async () => {
    const r = await report("test.creatinine");
    expect(await sees(r)).toEqual({ kind: "when_reviewed" });
    await review(r);
    expect(await sees(r)).toEqual({ kind: "visible" });
  });

  it("S22 a critical needs 'I have spoken to them'; a repeat critical needs its own event", async () => {
    const c1 = await report("test.creatinine", { critical: true });
    await review(c1);
    expect(await sees(c1)).toEqual({ kind: "after_told" });
    await as((ctx) =>
      recordPatientTold(ctx, {
        patientUserId: p,
        reportId: c1,
        how: "phone",
        toldAt: new Date(),
        clientKey: key(),
      }),
    );
    expect(await sees(c1)).toEqual({ kind: "visible" });
    const c2 = await report("test.creatinine", { critical: true });
    await review(c2);
    expect(await sees(c2)).toEqual({ kind: "after_told" });
  });

  it("S23 HIV viral load, pregnancy and a tissue result are in person only, whatever is set", async () => {
    await pg.query(
      `UPDATE test_catalogue SET patient_group = 'tissue' WHERE code = 'test.esr' AND hospital_id IS NULL`,
    );
    for (const code of ["test.hiv_viral_load", "test.pregnancy_urine", "test.esr"]) {
      const r = await report(code);
      await review(r);
      await pg.query(
        `INSERT INTO patient_told_events (hospital_id, report_id, patient_user_id, how, told_by, told_at, client_key) VALUES ($1, $2, $3, 'in_person', $4, now(), $5)`,
        [h, r, p, a.doctor!.userId, key()],
      );
      expect(await sees(r)).toEqual({ kind: "in_person" });
    }
    await pg.query(
      `UPDATE test_catalogue SET patient_group = NULL WHERE code = 'test.esr' AND hospital_id IS NULL`,
    );
  });

  it("S24 a hold needs a reason and an until-date within the signed maximum; expiry returns it to the clinician; holds list for the CSO", async () => {
    const r = await report("test.creatinine");
    await review(r);
    const rules = (await tx((t) => releaseContext(t, h, new Date()))).rules;
    const far = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);
    await expect(
      as((ctx) =>
        holdFromPatient(
          ctx,
          {
            patientUserId: p,
            reportId: r,
            reason: "harm_to_patient",
            untilOn: far,
            clientKey: key(),
          },
          rules,
        ),
      ),
    ).rejects.toThrow(/at most 30 days/);
    const soon = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    await as((ctx) =>
      holdFromPatient(
        ctx,
        {
          patientUserId: p,
          reportId: r,
          reason: "explain_in_person",
          untilOn: soon,
          clientKey: key(),
        },
        rules,
      ),
    );
    expect(await sees(r)).toMatchObject({ kind: "held", until: soon });
    // Expiry: an until-date in the past still holds (PR-7: back to the clinician, not to the patient).
    await pg.query(
      `INSERT INTO patient_hold_events (hospital_id, report_logical_id, report_id, patient_user_id, kind, reason, until_on, by_user, client_key) VALUES ($1, $2, $2, $3, 'extend', 'explain_in_person', current_date - 1, $4, $5)`,
      [h, r, p, a.doctor!.userId, key()],
    );
    expect((await sees(r)).kind).toBe("held");
    const month = await tx((t) =>
      holdsForMonth(t, h, new Date(Date.now() - 86_400_000), new Date(Date.now() + 86_400_000)),
    );
    expect(month.some((x) => x.reportId === r)).toBe(true);
    await as((ctx) => releaseHold(ctx, { patientUserId: p, reportId: r, clientKey: key() }));
    expect(await sees(r)).toEqual({ kind: "visible" });
  });

  it("S25 a result unreviewed past the signed window lists for the clinician and the head of department", async () => {
    const old = await report("test.creatinine", { daysAgo: 10 });
    const aged = await tx((t) => agedResults(t, h, new Date(), RULES.agedWindowDays));
    expect(aged.find((x) => x.reportId === old)).toMatchObject({ orderer: a.doctor!.userId });
    await review(old);
    expect(
      (await tx((t) => agedResults(t, h, new Date(), RULES.agedWindowDays))).some(
        (x) => x.reportId === old,
      ),
    ).toBe(false);
  });

  it("S27 a plain-words text containing a banned phrase fails the lint", () => {
    const words = {
      whatThisTestIs: "This test shows how well your kidneys clear waste.",
      shortLine: "Nothing to worry about.",
      action: {
        within: "Keep your next visit.",
        higher: "Talk to your doctor.",
        lower: "Talk to your doctor.",
        noRange: "Ask your doctor.",
      },
      calculated: [],
    };
    expect(lint(words, ["nothing to worry about"])).toEqual(["nothing to worry about"]);
    expect(lint({ ...words, shortLine: "A blood test." }, ["nothing to worry about"])).toEqual([]);
  });
});

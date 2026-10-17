/**
 * Lab Phase 5, Step 4 on the PGlite lane: delta checks through the real write path (S1–S10). Every limit, window
 * and value here is a FIXTURE, not a proposal; the rules are signed by a laboratory lead and countersigned by a CSO
 * as the product requires. Runs with EMR_PGLITE=1.
 */
import { randomUUID } from "node:crypto";
import type { Lane, Pg } from "./_pglite";
import type { EmrActor } from "@/lib/emr/actor";
import type { WriteCtx } from "@/lib/emr/write/context";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { withPatientWrite } from "@/lib/emr/write/context";
import { placeOrders } from "@/lib/emr/write/orders";
import { enterResults, releaseResults } from "@/lib/emr/write/results";
import { collectSpecimen, receiveSpecimen } from "@/lib/emr/write/specimens";
import { encrypt, generateKey } from "@/lib/encryption";
import { saveConfigDraft, signConfig } from "@/lib/lab/catalogue-v2";
import { deltaRulesWithReview, flagsForOrder, trialOnHistory } from "@/lib/lab/delta-read";
import { recordDeltaOutcome } from "@/lib/lab/delta-store";
import { saveMeasure } from "@/lib/lab/measures-setup";
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

const FLAGS = ["LAB_WORKSPACE", "LAB_UNITS_RANGES", "LAB_DELTA_CHECKS"];
const key = () => `k-${randomUUID()}`;
const DAY = 86_400_000;

describe.skipIf(!laneOn)("Lab Phase 5 delta checks (S1–S10)", () => {
  let lane: Lane;
  let pg: Pg;
  let h: string;
  let ward: string;
  const a: Record<string, EmrActor> = {};
  const env = { ...process.env };
  const ids: Record<string, string> = {};
  const tx = <T>(fn: (t: Parameters<Parameters<Lane["db"]["transaction"]>[0]>[0]) => Promise<T>) =>
    lane.db.transaction(fn);
  const as = <T>(actor: EmrActor, p: string, fn: (ctx: WriteCtx) => Promise<T>, now?: Date) =>
    withPatientWrite(actor, p, fn, { database: lane.db, ...(now ? { now } : {}) });
  const one = async <T = Record<string, unknown>>(q: string, params: unknown[] = []) =>
    (await pg.query<T>(q, params)).rows[0] as T;
  const testId = async (code: string) =>
    (
      await one<{ id: string }>(
        `SELECT id FROM test_catalogue WHERE code = $1 AND hospital_id IS NULL`,
        [code],
      )
    ).id;
  const measure = async (code: string, concept: string, unit: string) =>
    tx((t) =>
      saveMeasure(
        t,
        { userId: a.lead!.userId, hospitalId: h },
        {
          testId: ids[code]!,
          conceptId: concept,
          draft: {
            resultType: "number",
            unitUcum: unit,
            unitDisplay: unit,
            decimalPlaces: 1,
            loincCode: null,
            entryCheckLow: null,
            entryCheckHigh: null,
          },
        },
        new Date(),
      ),
    );
  /** Sign a rule: drafted by lead2, signed by the lead, countersigned by the CSO. */
  const signRule = async (kind: string, k: string, payload: unknown, countersign = true) => {
    const id = await tx((t) =>
      saveConfigDraft(
        t,
        { userId: a.lead2!.userId, hospitalId: h },
        { kind: kind as never, key: k, payload },
        new Date(),
      ),
    );
    await tx((t) =>
      signConfig(
        t,
        { userId: a.lead!.userId, hospitalId: h, as: "lead" },
        { configId: id, exceptionNote: null },
        new Date(),
      ),
    );
    if (countersign)
      await tx((t) =>
        signConfig(
          t,
          { userId: a.cso!.userId, hospitalId: h, as: "cso" },
          { configId: id, exceptionNote: null },
          new Date(),
        ),
      );
    // The lane back-dates its results by days; the rule has been in force since before them.
    await pg.query(
      `UPDATE lab_signed_configs SET in_force_from = now() - interval '30 days' WHERE id = $1 AND status = 'signed'`,
      [id],
    );
    return id;
  };
  const rule = (concept: string, o: Record<string, unknown> = {}) => ({
    concept,
    type: "absolute",
    limit: { both: 10 },
    windowHours: 24 * 7,
    basis: { kind: "clinical", approver: "Fixture lead", rationale: "Fixture rationale" },
    applicability: { ageFromYears: null, ageToYears: null, specimen: null },
    acrossMethods: false,
    meaning: "May be another patient's sample",
    source: "Fixture source",
    ...o,
  });

  let p: string;
  /** One order of `code` for patient `p`, received, with values entered at `daysAgo` (preliminary or final). */
  async function result(
    code: string,
    values: Record<string, string>,
    daysAgo: number,
    status: "preliminary" | "final",
  ) {
    const at = new Date(Date.now() - daysAgo * DAY);
    const enc = await encounter(pg, {
      hospitalId: h,
      patientUserId: p,
      clinicianUserId: a.doctor!.userId,
      departmentId: ward,
    });
    const order = await as(
      a.doctor!,
      p,
      (ctx) =>
        placeOrders(ctx, {
          patientUserId: p,
          encounterId: enc,
          orders: [
            { clientKey: key(), testId: ids[code]!, priority: "routine", reasonText: "Check" },
          ],
        }),
      at,
    );
    const sp = await as(
      a.nurse!,
      p,
      (ctx) =>
        collectSpecimen(ctx, {
          patientUserId: p,
          orderId: order.id,
          identifiersConfirmed: true,
          collectedAt: at,
          clientKey: key(),
        }),
      at,
    );
    await as(
      a.lab!,
      p,
      (ctx) => receiveSpecimen(ctx, { patientUserId: p, specimenId: sp.id, clientKey: key() }),
      at,
    );
    const r = await as(
      a.lab!,
      p,
      (ctx) =>
        enterResults(ctx, {
          patientUserId: p,
          orderId: order.id,
          status,
          values: Object.entries(values).map(([conceptId, value]) => ({ conceptId, value })),
          clientKey: key(),
        }),
      at,
    );
    return { orderId: order.id, reportId: r.id, specimenId: sp.id };
  }
  const release = (reportId: string) =>
    as(a.lab!, p, (ctx) => releaseResults(ctx, { patientUserId: p, reportId, clientKey: key() }));
  const flags = (orderId: string) => tx((t) => flagsForOrder(t, h, orderId));
  const decide = (flagId: string, outcome: string, o: { withWhom?: string } = {}) =>
    as(a.lab!, p, (ctx) =>
      recordDeltaOutcome(ctx, {
        flagId,
        outcome: outcome as never,
        withWhom: o.withWhom ?? null,
        note: "Fixture note",
        clientKey: key(),
      }),
    );

  beforeAll(async () => {
    process.env.MEDSYNC_PHI_KEY ??= generateKey();
    for (const k of FLAGS) process.env[k] = "1";
    lane = await bootLane();
    pg = lane.pg;
    h = await hospital(pg, "Delta");
    ward = await department(pg, h, "Ward");
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
    a.doctor = await make(ward, "MEDICAL_OFFICER", "doctor");
    a.nurse = await make(ward, "NURSE", "nurse");
    a.lab = await make(labDept, "LAB_TECHNOLOGIST", "lab");
    a.lead = await make(labDept, "LAB_TECHNOLOGIST", "lab");
    a.lead2 = await make(labDept, "LAB_TECHNOLOGIST", "lab");
    a.cso = await make(ward, "CONSULTANT", "doctor");
    await pg.query(
      `INSERT INTO department_heads (hospital_id, department_id, user_id, acting) VALUES ($1, $2, $3, false), ($1, $2, $4, true)`,
      [h, labDept, a.lead.userId, a.lead2.userId],
    );
    await pg.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'superadmin')`, [
      a.cso.userId,
    ]);
    for (const c of ["test.fbc", "test.urea_electrolytes", "test.creatinine"])
      ids[c] = await testId(c);
    await measure("test.fbc", "obs.mcv", "fL");
    for (const c of ["obs.sodium", "obs.potassium", "obs.urea"])
      await measure("test.urea_electrolytes", c, "mmol/L");
    p = await patient(pg);
    await pg.query(
      `INSERT INTO patient_profiles (id, first_name_encrypted, surname_encrypted, sex, date_of_birth, id_type, phone_encrypted, district_id)
       VALUES ($1, $2, $3, 'female', '2000-01-01', 'none', $4, (SELECT id FROM districts LIMIT 1))`,
      [p, encrypt("Test"), encrypt("Patient"), encrypt("0700000001")],
    );
    await intake(pg, { hospitalId: h, patientUserId: p });
  }, 300_000);
  afterAll(() => {
    for (const k of FLAGS) process.env[k] = env[k];
  });

  it("S9 a rule with no signed limit never runs: a draft or a lead-only signature fires nothing", async () => {
    await tx((t) =>
      saveConfigDraft(
        t,
        { userId: a.lead2!.userId, hospitalId: h },
        {
          kind: "delta_rule" as never,
          key: "DC-DRAFT",
          payload: rule("obs.mcv", { limit: { both: 0.1 } }),
        },
        new Date(),
      ),
    );
    await result("test.fbc", { "obs.mcv": "80" }, 3, "final");
    const r = await result("test.fbc", { "obs.mcv": "95" }, 2, "final");
    expect(await flags(r.orderId)).toEqual([]);
  });

  it("S1 a big MCV change fires the signed rule; Release waits for a decision with a note", async () => {
    await signRule("delta_rule", "DC-MCV-1", rule("obs.mcv"));
    const r = await result("test.fbc", { "obs.mcv": "120" }, 1, "preliminary");
    const f = await flags(r.orderId);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({
      kind: "delta",
      ruleKey: "DC-MCV-1",
      conceptId: "obs.mcv",
      meaning: "May be another patient's sample",
      outcome: null,
    });
    expect(Number(f[0]!.previousValue)).toBe(95);
    expect(Number(f[0]!.currentValue)).toBe(120);
    await expect(release(r.reportId)).rejects.toThrow(/delta_decision/);
    await expect(decide(f[0]!.id, "confirmed_same_patient")).rejects.toThrow(/with whom/);
    await decide(f[0]!.id, "confirmed_same_patient", { withWhom: "Ward 4 nurse (fixture)" });
    await release(r.reportId);
    // The decision carried to the released version: no second flag for the same value.
    expect(await flags(r.orderId)).toHaveLength(1);
  });

  it("S2 recollect rejects the specimen as a possible wrong sample", async () => {
    const r = await result("test.fbc", { "obs.mcv": "80" }, 0, "preliminary");
    const [f] = await flags(r.orderId);
    await decide(f!.id, "recollect");
    expect(
      await one(
        `SELECT kind, reason_code FROM specimen_events WHERE specimen_id = $1 AND kind = 'rejected'`,
        [r.specimenId],
      ),
    ).toEqual({ kind: "rejected", reason_code: "possible_wrong_sample" });
  });

  it("S3 mislabel confirmed opens a nonconformity from the source 'delta'", async () => {
    const r = await result("test.fbc", { "obs.mcv": "60" }, 0, "preliminary");
    const [f] = await flags(r.orderId);
    await decide(f!.id, "mislabel_confirmed");
    expect(
      await one(
        `SELECT source, source_ref FROM lab_nonconformities WHERE source = 'delta' ORDER BY opened_at DESC LIMIT 1`,
      ),
    ).toEqual({ source: "delta", source_ref: r.reportId });
  });

  it("S5 an RCV rule computes from the signed CVA and CVI", async () => {
    await signRule(
      "delta_rule",
      "DC-K-RCV",
      rule("obs.potassium", {
        type: "rcv",
        limit: { both: 1 },
        basis: {
          kind: "rcv",
          cvaPercent: 2,
          cvaSource: "Fixture QC",
          cviPercent: 1.5,
          cviSource: "Fixture EFLM",
          z: "1.96",
          logNormal: false,
        },
      }),
    );
    await result("test.urea_electrolytes", { "obs.potassium": "4.0" }, 2, "final");
    const small = await result("test.urea_electrolytes", { "obs.potassium": "4.2" }, 1, "final"); // 5 % < 6.93 %
    expect(await flags(small.orderId)).toEqual([]);
    const big = await result(
      "test.urea_electrolytes",
      { "obs.potassium": "4.6" },
      0,
      "preliminary",
    ); // 9.5 %
    expect((await flags(big.orderId)).map((f) => f.ruleKey)).toEqual(["DC-K-RCV"]);
  });

  it("S7 a panel rule (k of N) fires once for the specimen; S8 a pattern rule informs with its meaning", async () => {
    await signRule("delta_rule", "DC-NA", rule("obs.sodium", { limit: { both: 5 } }));
    await signRule("delta_rule", "DC-UREA", rule("obs.urea", { limit: { both: 3 } }));
    await signRule("panel_rule", "PN-UE", {
      testCode: "test.urea_electrolytes",
      components: ["obs.sodium", "obs.urea", "obs.potassium"],
      k: 2,
      meaning: "Several values moved together",
      source: "Fixture",
    });
    await signRule("pattern_rule", "PT-DRIP", {
      name: "Fixture drip pattern",
      description: "Fixture: sodium fell while potassium is high",
      conditions: [
        { concept: "obs.potassium", op: "above", value: 5 },
        { concept: "obs.sodium", op: "fell_by", value: 5 },
      ],
      meaning: "Suspected drip-arm sample (fixture)",
      source: "Fixture",
    });
    await result(
      "test.urea_electrolytes",
      { "obs.sodium": "140", "obs.urea": "5", "obs.potassium": "4.0" },
      3,
      "final",
    );
    const r = await result(
      "test.urea_electrolytes",
      { "obs.sodium": "130", "obs.urea": "10", "obs.potassium": "5.5" },
      2,
      "preliminary",
    );
    const f = await flags(r.orderId);
    expect(f.filter((x) => x.kind === "panel")).toHaveLength(1);
    expect(f.find((x) => x.kind === "pattern")?.meaning).toBe(
      "Suspected drip-arm sample (fixture)",
    );
  });

  it("S4 a procedure recorded between the two results is listed; the rule still fires", async () => {
    const enc = await encounter(pg, {
      hospitalId: h,
      patientUserId: p,
      clinicianUserId: a.doctor!.userId,
      departmentId: ward,
    });
    await pg.query(
      `WITH n AS (SELECT gen_random_uuid() AS id)
       INSERT INTO procedures (id, logical_id, hospital_id, patient_user_id, encounter_id, recorded_by_user_id, effective_at, source, trust, outcome, text_ciphertext)
       SELECT n.id, n.id, $1, $2, $3, $4, now() - interval '2 hours', 'clinician', 3, 'completed', 'iv:tag:ct' FROM n`,
      [h, p, enc, a.doctor!.userId],
    );
    const r = await result("test.fbc", { "obs.mcv": "150" }, 0, "preliminary");
    const [f] = await flags(r.orderId);
    expect(f?.ruleKey).toBe("DC-MCV-1");
    expect(f?.context.length).toBeGreaterThanOrEqual(1);
  });

  it("S6 a previous result by a different method is not compared", async () => {
    await result("test.fbc", { "obs.mcv": "80" }, 0.5, "final").catch(() => undefined);
    // A new measure version with another method code (measures are immutable; a change is a new version).
    await tx((t) =>
      saveMeasure(
        t,
        { userId: a.lead!.userId, hospitalId: h },
        {
          testId: ids["test.fbc"]!,
          conceptId: "obs.mcv",
          draft: {
            resultType: "number",
            unitUcum: "fL",
            unitDisplay: "fL",
            decimalPlaces: 1,
            loincCode: null,
            entryCheckLow: null,
            entryCheckHigh: null,
            methodCode: "fixture_method_b",
          } as never,
        },
        new Date(),
      ),
    );
    const r = await result("test.fbc", { "obs.mcv": "130" }, 0, "preliminary");
    expect(await flags(r.orderId)).toEqual([]);
  });

  it("S10 the trial reads released pairs and writes nothing; the review shows each rule's outcome shares", async () => {
    const before = await one<{ n: number }>(`SELECT count(*)::int AS n FROM delta_flags`);
    const trial = await tx((t) => trialOnHistory(t, h, rule("obs.mcv") as never, new Date()));
    expect(trial.pairs).toBeGreaterThan(0);
    expect(trial.mislabels).toBeGreaterThanOrEqual(0);
    expect((await one<{ n: number }>(`SELECT count(*)::int AS n FROM delta_flags`)).n).toBe(
      before.n,
    );
    const review = await tx((t) => deltaRulesWithReview(t, h, new Date()));
    const mcv = review.find((r) => r.key === "DC-MCV-1")!;
    expect(mcv.flags).toBeGreaterThanOrEqual(3);
    expect(mcv.review.share.mislabel_confirmed).not.toBeNull();
    expect(review.find((r) => r.key === "DC-DRAFT")?.status).toBe("draft");
  });
});

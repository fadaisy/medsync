/**
 * Lab Phase 3, Step 6: quality control, the release hold, the override, the look-back and nonconformities on the
 * PGlite lane (S15–S28). Every target, SD, rule set, minimum, range, value and date here is a FIXTURE, never a
 * clinical or operational default. Runs with EMR_PGLITE=1.
 */
import { randomUUID } from "node:crypto";
import type { Lane, Pg } from "./_pglite";
import type { EmrActor } from "@/lib/emr/actor";
import type { WriteCtx } from "@/lib/emr/write/context";
import type { RunDecision } from "@/lib/lab/qc-rules";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadResultsToReview } from "@/lib/emr/read/results";
import { withPatientWrite } from "@/lib/emr/write/context";
import { placeOrders } from "@/lib/emr/write/orders";
import { amendResults, enterResults, releaseResults } from "@/lib/emr/write/results";
import { collectSpecimen, receiveSpecimen } from "@/lib/emr/write/specimens";
import { encrypt, generateKey } from "@/lib/encryption";
import { labAccess } from "@/lib/lab/access";
import { saveConfigDraft, signConfig } from "@/lib/lab/catalogue-v2";
import { saveMeasure } from "@/lib/lab/measures-setup";
import { qcReleasePlan, qcStatusFor } from "@/lib/lab/qc";
import { holdFor, loadKits, loadNc } from "@/lib/lab/qc-read";
import {
  authoriseResumption,
  closeNonconformity,
  decideLookbackItem,
  qcRowsFor,
  recordKitQc,
  recordQcRun,
  repeatDone,
  repeatTasks,
  setLabTarget,
} from "@/lib/lab/qc-store";
import { grandfatherLots, receiveDelivery, saveItem } from "@/lib/lab/stock-store";
import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";
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

const UE = "08f6ba15-f76d-5ce9-b1f1-a473a54931cb";
const K = "obs.potassium";
const NA = "obs.sodium";
const UREA = "obs.urea";
const CREAT = "obs.creatinine";
const key = () => `k-${randomUUID()}`;
const FLAGS = [
  "LAB_WORKSPACE",
  "LAB_STOCK",
  "LAB_UNITS_RANGES",
  "LAB_CATALOGUE_V2",
  "LAB_QC",
  "LAB_QC_HOLD",
];
/** FIXTURE targets in the component's unit (never a real control's range). */
const FX = { l1: { mean: 4, sd: 0.1 }, l2: { mean: 6, sd: 0.1 } };
/** FIXTURE rule set (the D-LAB3-03 shape; the lead signs the real one). */
const FX_RULES = { rejectRules: ["1-3s", "2-2s", "R-4s", "4-1s", "10-x"], warnRules: ["1-2s"] };
/** FIXTURE policy minimums (the real ones are signed with their sources). */
const FX_POLICY = { minRunsForTarget: 20, minDaysForTarget: 20, sources: ["Fixture source"] };
/** FIXTURE typed lab range for potassium (unsigned, as Phase 1 allows). */
const FX_RANGE = { low: 3.5, high: 5.0, unit: "mmol/L" };

describe.skipIf(!laneOn)("Lab Phase 3 quality control and the hold (Step 6)", () => {
  let lane: Lane;
  let pg: Pg;
  let h: string;
  let a1: string;
  let a2: string;
  let ctrlItem: string;
  let lotL1: string;
  let lotL2: string;
  const actor: Record<string, EmrActor> = {};
  const env = { ...process.env };
  const tx = <T>(fn: (t: Parameters<Parameters<Lane["db"]["transaction"]>[0]>[0]) => Promise<T>) =>
    lane.db.transaction(fn);
  const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
    (await pg.query<T>(sql, params)).rows[0] as T;
  const lead = () => ({ userId: actor.lead!.userId, hospitalId: h });
  const as = <T>(a: EmrActor, p: string, fn: (ctx: WriteCtx) => Promise<T>) =>
    withPatientWrite(a, p, fn, { database: lane.db });
  /** A config signed by the lead (written exception: the fixture lab has one lead) and, unless lead-only, the CSO. */
  const signed = async (
    kind: "qc_plan" | "qc_policy" | "kit_qc_rule" | "acceptance_plan",
    k: string,
    payload: unknown,
  ) => {
    const id = await tx((t) => saveConfigDraft(t, lead(), { kind, key: k, payload }, new Date()));
    await tx((t) =>
      signConfig(
        t,
        { ...lead(), as: "lead" },
        { configId: id, exceptionNote: "Fixture: one lead here" },
        new Date(),
      ),
    );
    if (kind === "qc_plan" || kind === "qc_policy")
      await tx((t) =>
        signConfig(
          t,
          { userId: actor.cso!.userId, hospitalId: h, as: "cso" },
          { configId: id, exceptionNote: null },
          new Date(),
        ),
      );
    return id;
  };
  const qcPlan = (deviceId: string, conceptId: string, o: Record<string, unknown> = {}) =>
    signed("qc_plan", `${deviceId}:${conceptId}`, {
      unit: "mmol/L",
      levels: [
        { level: 1, label: "Level 1 · fixture normal", controlItemId: ctrlItem },
        { level: 2, label: "Level 2 · fixture high", controlItemId: ctrlItem },
      ],
      frequency: { kind: "each_day_before_patients" },
      ...FX_RULES,
      tenXAcrossLevels: false,
      holdWhenNotRun: false,
      targets: [
        { level: 1, controlLotId: lotL1, ...FX.l1, source: "lab" },
        { level: 2, controlLotId: lotL2, ...FX.l2, source: "lab" },
      ],
      source: "Fixture plan",
      ...o,
    });
  /** A run from z values (the fixture target turns z into a value). */
  const run = (
    deviceId: string,
    conceptId: string,
    z: [number, number],
    expect: RunDecision,
    o: { firstStep?: string | null; runAt?: Date; by?: EmrActor } = {},
  ) =>
    tx((t) =>
      recordQcRun(
        t,
        { userId: (o.by ?? actor.tech!).userId, hospitalId: h },
        {
          deviceId,
          conceptId,
          values: [
            { level: 1, lotId: lotL1, value: FX.l1.mean + z[0] * FX.l1.sd },
            { level: 2, lotId: lotL2, value: FX.l2.mean + z[1] * FX.l2.sd },
          ],
          expect,
          firstStep: o.firstStep ?? null,
          note: null,
          runAt: o.runAt ?? new Date(),
          clientKey: key(),
        },
        new Date(),
      ),
    );

  /** A U&E ordered, collected and received (pinned to analyser 1's profile at receipt). */
  async function received(priority: "routine" | "immediate" = "routine") {
    const p = await patient(pg);
    await pg.query(
      `INSERT INTO public.patient_profiles (id, first_name_encrypted, surname_encrypted, sex, date_of_birth, id_type, phone_encrypted, district_id)
       VALUES ($1, $2, $3, 'female', '1980-01-01', 'none', $4, (SELECT id FROM public.districts LIMIT 1))`,
      [p, encrypt("Fixture"), encrypt("Patient"), encrypt("0700000000")],
    );
    await intake(pg, { hospitalId: h, patientUserId: p });
    const enc = await encounter(pg, {
      hospitalId: h,
      patientUserId: p,
      clinicianUserId: actor.doctor!.userId,
      departmentId: actor.doctor!.departmentId!,
    });
    const order = await as(actor.doctor!, p, (ctx) =>
      placeOrders(ctx, {
        patientUserId: p,
        encounterId: enc,
        orders: [{ clientKey: key(), testId: UE, priority, reasonText: "Fixture check" }],
      }),
    );
    const sp = await as(actor.nurse!, p, (ctx) =>
      collectSpecimen(ctx, {
        patientUserId: p,
        orderId: order.id,
        identifiersConfirmed: true,
        clientKey: key(),
      }),
    );
    await as(actor.tech!, p, (ctx) =>
      receiveSpecimen(ctx, { patientUserId: p, specimenId: sp.id, clientKey: key() }),
    );
    return { p, orderId: order.id };
  }
  const values = (k: string) => [
    { conceptId: NA, value: "140" },
    { conceptId: K, value: k, referenceRange: FX_RANGE },
    { conceptId: CREAT, value: "80" },
  ];
  const prelim = (r: { p: string; orderId: string }, k: string) =>
    as(actor.tech!, r.p, (ctx) =>
      enterResults(ctx, {
        patientUserId: r.p,
        orderId: r.orderId,
        status: "preliminary",
        values: values(k),
        clientKey: key(),
      }),
    );
  const release = (
    r: { p: string },
    reportId: string,
    by: EmrActor = actor.tech!,
    qcOverride?: { reason: string },
  ) =>
    as(by, r.p, (ctx) =>
      releaseResults(ctx, {
        patientUserId: r.p,
        reportId,
        clientKey: key(),
        ...(qcOverride ? { qcOverride } : {}),
      }),
    );
  /** S50: run `fn` with all eight Phase 3 flags off (Law 13), then put them back. */
  const phase3Off = async <T>(fn: () => Promise<T>): Promise<T> => {
    const keys = [
      "LAB_STOCK",
      "LAB_EQUIPMENT",
      "LAB_QC",
      "LAB_QC_HOLD",
      "LAB_EQA",
      "LAB_POCT_QUALITY",
      "LAB_HMIS",
      "LAB_REPORTS",
    ];
    const saved = keys.map((k) => [k, process.env[k]] as const);
    for (const k of keys) process.env[k] = "";
    try {
      return await fn();
    } finally {
      for (const [k, v] of saved) process.env[k] = v;
    }
  };
  const obs = async (reportId: string) =>
    (
      await pg.query<{
        concept_id: string;
        status: string;
        context: Record<string, unknown>;
        qc: Record<string, unknown> | null;
      }>(
        `SELECT o.concept_id, o.status, o.context, s.qc FROM clinical_observations o
           LEFT JOIN lab_result_snapshots s ON s.observation_id = o.id WHERE o.report_id = $1`,
        [reportId],
      )
    ).rows;

  beforeAll(async () => {
    process.env.MEDSYNC_PHI_KEY ??= generateKey();
    for (const k of FLAGS) process.env[k] = "1";
    lane = await bootLane();
    pg = lane.pg;
    h = await hospital(pg, "QC");
    const ward = await department(pg, h, "Ward");
    const lab = (
      await one<{ id: string }>(
        `INSERT INTO hospital_departments (hospital_id, name, slug, catalogue_code) VALUES ($1, 'Laboratory', $2, 'LABORATORY') RETURNING id`,
        [h, `lab-${randomUUID().slice(0, 8)}`],
      )
    ).id;
    const make = async (
      dept: string,
      cadre: string,
      surface: EmrActor["surface"],
      labPermissions?: string[],
    ): Promise<EmrActor> => ({
      ...(await clinician(pg, { hospitalId: h, departmentId: dept, cadre })),
      fullName: null,
      hospitalId: h,
      departmentId: dept,
      cadreCode: cadre,
      isClinical: true,
      surface,
      ...(labPermissions ? { labPermissions } : {}),
    });
    const staff = ["lab.view", "lab.receive", "lab.result.enter", "lab.result.release"];
    actor.doctor = await make(ward, "MEDICAL_OFFICER", "doctor");
    actor.nurse = await make(ward, "NURSE", "nurse");
    actor.cso = await make(ward, "MEDICAL_OFFICER", "doctor");
    actor.tech = await make(lab, "LAB_TECHNOLOGIST", "lab", staff);
    actor.tech2 = await make(lab, "LAB_TECHNOLOGIST", "lab", staff);
    actor.lead = await make(lab, "LAB_TECHNOLOGIST", "lab", [
      ...staff,
      ...labAccess({ cadreCode: null, headOf: { laboratory: true, sectionIds: [] } }).permissions,
    ]);
    await pg.query(
      `INSERT INTO department_heads (hospital_id, department_id, user_id) VALUES ($1, $2, $3)`,
      [h, lab, actor.lead.userId],
    );
    await pg.query(
      `INSERT INTO lab_signed_configs (hospital_id, kind, key, version, status, payload, authored_by, lead_signed_by, lead_signed_at,
         cso_signed_by, cso_signed_at, in_force_from)
       VALUES (NULL, 'addendum', 'cfc-1.6.0', 1, 'signed', '{"hash":"${"e".repeat(64)}"}', $1, $1, now(), $2, now(), now())`,
      [actor.lead.userId, actor.cso.userId],
    );
    const analyser = async (model: string) =>
      (
        await one<{ id: string }>(
          `INSERT INTO devices (hospital_id, kind, model, state, verified_by, verified_at, verification_note) VALUES ($1, 'analyser', $2, 'in_use', $3, now(), 'Fixture: verified') RETURNING id`,
          [h, model, actor.lead!.userId],
        )
      ).id;
    a1 = await analyser("Fixture chemistry analyser 1");
    a2 = await analyser("Fixture chemistry analyser 2");
    // Analyser 1's U&E profile, in use: receipt pins it (AP-5), so its results carry the device.
    await pg.query(
      `INSERT INTO analyser_profiles (hospital_id, test_id, model, kind, state, mappings, verified_concepts, created_by, device_id)
       VALUES ($1, $2, 'fixture_chem', 'chemistry', 'in_use', $3, $4, $5, $6)`,
      [
        h,
        UE,
        JSON.stringify(
          [NA, K, UREA, CREAT].map((c, i) => ({
            code: `C${i}`,
            concept: c,
            visibility: "clinician",
          })),
        ),
        [NA, K, UREA, CREAT],
        actor.lead.userId,
        a1,
      ],
    );
    for (const [c, u] of [
      [NA, "mmol/L"],
      [K, "mmol/L"],
      [UREA, "mmol/L"],
      [CREAT, "umol/L"],
    ] as const)
      await tx((t) =>
        saveMeasure(
          t,
          lead(),
          {
            testId: UE,
            conceptId: c,
            draft: {
              resultType: "number",
              unitUcum: u,
              unitDisplay: u,
              decimalPlaces: 1,
              loincCode: null,
              entryCheckLow: null,
              entryCheckHigh: null,
            },
          },
          new Date(),
        ),
      );
    ctrlItem = await tx((t) =>
      saveItem(
        t,
        lead(),
        {
          name: "Fixture chemistry control",
          kind: "control",
          unitOfIssue: "vial",
          packSize: null,
          testsPerUnit: null,
          testCodes: [],
          conceptIds: [K],
          hmisTracerCode: null,
          storageDeviceId: null,
          minMonths: null,
          maxMonths: null,
        },
        new Date(),
      ),
    );
    [lotL1, lotL2] = (await tx((t) =>
      grandfatherLots(
        t,
        lead(),
        {
          statement: "Fixture: both control lots were on the shelf and in use.",
          lots: [
            { itemId: ctrlItem, lot: "FX-CTL-1", useBy: "2099-12-31", quantity: 5 },
            { itemId: ctrlItem, lot: "FX-CTL-2", useBy: "2099-12-31", quantity: 5 },
          ],
          clientKey: key(),
        },
        new Date(),
      ),
    )) as [string, string];
    await qcPlan(a1, K);
  }, 300_000);
  afterAll(() => {
    for (const k of FLAGS) process.env[k] = env[k];
  });

  const early: { p: string; reportId: string; value: string }[] = [];
  it("S15: a two-level run is recorded within the budget; 1-2s alone is accepted as a warning (timed)", async () => {
    const t0 = performance.now();
    const r = await run(a1, K, [2.3, 0.4], "warning");
    const ms = performance.now() - t0;
    console.warn(`S15 recordQcRun with rule evaluation: ${ms.toFixed(0)} ms (PGlite, in process)`);
    expect(ms).toBeLessThan(300); // §11 budget, p95 < 300 ms
    expect(r.decision).toBe("warning");
    const st = await one(
      `SELECT status, held, run_id FROM lab_qc_status WHERE device_id = $1 AND concept_id = $2`,
      [a1, K],
    );
    expect(st).toEqual({ status: "warning", held: false, run_id: r.id });
    const row = await one<{ breaks: { rule: string; kind: string }[]; values: { z: number }[] }>(
      `SELECT breaks, "values" FROM lab_qc_runs WHERE id = $1`,
      [r.id],
    );
    expect(row.breaks.map((b) => [b.rule, b.kind])).toEqual([["1-2s", "warning"]]);
    expect(row.values[0]!.z).toBeCloseTo(2.3);
    // The cached row is read in one query for every component; the engine's status from it is sub-millisecond.
    const q0 = performance.now();
    const rows = await tx((t) => qcRowsFor(t, h, a1, [NA, K, CREAT], new Date()));
    const qms = performance.now() - q0;
    const e0 = performance.now();
    const status = rows.map((x) =>
      qcStatusFor({ ...x, at: new Date(), timeZone: DEFAULT_TIME_ZONE }),
    );
    const ems = performance.now() - e0;
    console.warn(
      `S15 qcStatusFor: one query for 3 components ${qms.toFixed(1)} ms; engine ${ems.toFixed(3)} ms`,
    );
    expect(ems).toBeLessThan(2); // §11: < 2 ms from the cached row
    expect(status.map((s) => s.status)).toEqual(["no_plan", "warning", "no_plan"]);
    // Two released potassium results after this run: the look-back's window (S21).
    for (const k of ["5.1", "4.2"]) {
      const r2 = await received();
      const pre = await prelim(r2, k);
      const rel = await release(r2, pre.id);
      early.push({ p: r2.p, reportId: rel.id, value: k });
    }
  });

  let ncId: string;
  it("S16: two consecutive level-1 runs above +2 SD break 2-2s across runs; the run is rejected and the status becomes failed", async () => {
    await expect(run(a1, K, [2.1, 0.3], "warning")).rejects.toThrow(/different answer/);
    await expect(run(a1, K, [2.1, 0.3], "rejected")).rejects.toThrow(/check first/);
    const r = await run(a1, K, [2.1, 0.3], "rejected", {
      firstStep: "Fixture: recalibrate, then rerun controls",
    });
    expect(r.decision).toBe("rejected");
    const row = await one<{ breaks: { rule: string; scope: string }[] }>(
      `SELECT breaks FROM lab_qc_runs WHERE id = $1`,
      [r.id],
    );
    expect(row.breaks).toContainEqual(
      expect.objectContaining({ rule: "2-2s", scope: "across_runs" }),
    );
    expect(
      await one(`SELECT status, held FROM lab_qc_status WHERE device_id = $1 AND concept_id = $2`, [
        a1,
        K,
      ]),
    ).toEqual({
      status: "failed",
      held: true,
    });
    const nc = await one<{
      id: string;
      source: string;
      testing_halted: boolean;
      subject_concept_id: string;
      owner: string;
    }>(
      `SELECT id, source, testing_halted, subject_concept_id, owner FROM lab_nonconformities WHERE source_ref = $1`,
      [r.id],
    );
    expect(nc).toMatchObject({
      source: "qc_reject",
      testing_halted: true,
      subject_concept_id: K,
      owner: actor.lead!.userId,
    });
    ncId = nc.id;
  });

  it("S17: R-4s across two runs is not reported; within one run it is", async () => {
    await qcPlan(a2, UREA);
    await run(a2, UREA, [2.1, 0], "warning");
    const across = await run(a2, UREA, [-2.2, 0], "warning");
    const b = await one<{ breaks: { rule: string }[] }>(
      `SELECT breaks FROM lab_qc_runs WHERE id = $1`,
      [across.id],
    );
    expect(b.breaks.map((x) => x.rule)).not.toContain("R-4s");
    const within = await run(a2, UREA, [2.1, -2.2], "rejected", {
      firstStep: "Fixture: check the reagent lot",
    });
    const w = await one<{ breaks: { rule: string; scope: string }[] }>(
      `SELECT breaks FROM lab_qc_runs WHERE id = $1`,
      [within.id],
    );
    expect(w.breaks).toContainEqual(expect.objectContaining({ rule: "R-4s", scope: "within_run" }));
  });

  let held: { p: string; orderId: string; reportId: string };
  it("S18: with labQcHold on, potassium is held on the server; the others release; the doctor sees 'to follow'", async () => {
    const r = await received();
    const pre = await prelim(r, "4.4");
    const rel = await release(r, pre.id);
    expect(rel.warnings).toContain("Potassium to follow: held for quality control.");
    held = { ...r, reportId: rel.id };
    const rep = await one<{ status: string; qc_held: string[] }>(
      `SELECT status, qc_held FROM diagnostic_reports WHERE id = $1`,
      [rel.id],
    );
    expect(rep).toEqual({ status: "final", qc_held: [K] });
    const o = await obs(rel.id);
    expect(o.find((x) => x.concept_id === K)).toMatchObject({
      status: "preliminary",
      qc: { status: "failed", held: true },
    });
    expect(o.find((x) => x.concept_id === NA)).toMatchObject({
      status: "final",
      qc: { status: "no_plan" },
    });
    expect(o.find((x) => x.concept_id === CREAT)?.status).toBe("final");
    const review = await loadResultsToReview(actor.doctor!, { database: lane.db });
    const item = review.find((i) => i.reportId === rel.id)!;
    const k = item.values.find((v) => v.display === "Potassium")!;
    expect(k).toMatchObject({
      valueText: "",
      labNote: "Potassium to follow: held for quality control.",
    });
    expect(item.values.find((v) => v.display === "Sodium")?.valueText).toBe("140");
    // A completion while still held is refused; an amendment cannot release the held value either.
    await expect(release(r, rel.id)).rejects.toThrow(/Still held for quality control/);
    await expect(
      as(actor.tech!, r.p, (ctx) =>
        amendResults(ctx, {
          patientUserId: r.p,
          reportId: rel.id,
          status: "amended",
          values: [{ conceptId: K, value: "4.4", referenceRange: FX_RANGE }],
          reasonText: "Fixture: try to release",
          clientKey: key(),
        }),
      ),
    ).rejects.toThrow(/held for quality control/);
    // enterResults(final) goes through the same gate.
    const r2 = await received();
    const direct = await as(actor.tech!, r2.p, (ctx) =>
      enterResults(ctx, {
        patientUserId: r2.p,
        orderId: r2.orderId,
        status: "final",
        values: values("4.0"),
        clientKey: key(),
      }),
    );
    expect(
      (
        await one<{ qc_held: string[] }>(`SELECT qc_held FROM diagnostic_reports WHERE id = $1`, [
          direct.id,
        ])
      ).qc_held,
    ).toEqual([K]);
  });

  it("S19: an Immediate sample offers Run on another analyser when one has passed today; a routine one does not", async () => {
    await qcPlan(a2, K);
    await run(a2, K, [0.2, -0.3], "accepted");
    const imm = await received("immediate");
    const view = await tx((t) =>
      holdFor(
        t,
        h,
        { orderId: imm.orderId, concepts: [NA, K, CREAT], priority: "immediate" },
        new Date(),
      ),
    );
    expect(view?.components.find((c) => c.conceptId === K)).toMatchObject({
      status: "failed",
      blocked: true,
      rules: ["2-2s"],
    });
    expect(view?.others.map((o) => o.id)).toEqual([a2]);
    const routine = await tx((t) =>
      holdFor(
        t,
        h,
        { orderId: imm.orderId, concepts: [NA, K, CREAT], priority: "routine" },
        new Date(),
      ),
    );
    expect(routine?.others).toEqual([]);
  });

  it("S20: the lead overrides with a reason; the doctor sees the signed line; the result joins the look-back; audited; a technologist is refused", async () => {
    // The button is for holders only: a lab cadre never carries lab.qc.override (LA-5).
    expect(
      labAccess({
        cadreCode: "LAB_TECHNOLOGIST",
        headOf: { laboratory: false, sectionIds: [] },
      }).permissions.has("lab.qc.override"),
    ).toBe(false);
    await expect(
      release(held, held.reportId, actor.tech!, { reason: "Fixture: patient cannot wait" }),
    ).rejects.toThrow(/Only a holder of the QC override/);
    await expect(release(held, held.reportId, actor.lead!, { reason: " " })).rejects.toThrow(
      /Say why/,
    );
    const done = await release(held, held.reportId, actor.lead!, {
      reason: "Fixture: patient cannot wait",
    });
    const rep = await one<{ status: string; qc_held: string[] | null; version: number }>(
      `SELECT status, qc_held, version FROM diagnostic_reports WHERE id = $1`,
      [done.id],
    );
    expect(rep).toMatchObject({ status: "final", qc_held: null });
    const k = (await obs(done.id)).find((x) => x.concept_id === K)!;
    expect(k.status).toBe("final");
    expect(k.context.qcOverride).toBe(true);
    expect(k.qc).toMatchObject({
      status: "failed",
      override: { by: actor.lead!.userId, reason: "Fixture: patient cannot wait" },
    });
    const review = await loadResultsToReview(actor.doctor!, { database: lane.db });
    const v = review
      .find((i) => i.reportId === done.id)!
      .values.find((x) => x.display === "Potassium")!;
    expect(v.valueText).toBe("4.4");
    expect(v.labNote).toContain("Released while QC had failed.");
    expect(
      await one(
        `SELECT count(*)::int AS n FROM lab_lookback_items WHERE nc_id = $1 AND report_id = $2`,
        [ncId, done.id],
      ),
    ).toEqual({ n: 1 });
    expect(
      await one(
        `SELECT count(*)::int AS n FROM lab_nc_events WHERE nc_id = $1 AND kind = 'note' AND payload->'override'->>'by' = $2`,
        [ncId, actor.lead!.userId],
      ),
    ).toEqual({ n: 1 });
    expect(
      (
        await one<{ n: number }>(
          `SELECT count(*)::int AS n FROM audit_log WHERE table_name = 'lab_nc_events'`,
        )
      ).n,
    ).toBeGreaterThan(0);
  });

  it("S21: the look-back lists results since the last accepted run, estimate labelled, flag-might-change first; Amend links the Phase 1 amendment", async () => {
    const view = (await tx((t) => loadNc(t, h, ncId)))!;
    expect(view.bias).toMatchObject({ label: "estimate", level: 1 });
    expect(view.bias!.value).toBeCloseTo(0.22); // mean z (2.3, 2.1) × fixture SD 0.1
    const window = view.lookBack.filter((i) => early.some((e) => e.reportId === i.reportId));
    expect(window.map((i) => [Number(i.value), i.sort])).toEqual([
      [5.1, "flag_might_change"],
      [4.2, "unchanged"],
    ]);
    expect(view.lookBack[0]!.sort).toBe("flag_might_change");
    expect(view.progress).toMatchObject({ decided: 0, total: 3 });
    const item = window[0]!;
    await expect(
      tx((t) => decideLookbackItem(t, lead(), { itemId: item.id, decision: "amend" }, new Date())),
    ).rejects.toThrow(/Amend the result first/);
    const e = early[0]!;
    const amended = await as(actor.tech!, e.p, (ctx) =>
      amendResults(ctx, {
        patientUserId: e.p,
        reportId: e.reportId,
        status: "corrected",
        values: [{ conceptId: K, value: "4.9", referenceRange: FX_RANGE }],
        reasonText: "Fixture: repeated after QC passed",
        clientKey: key(),
      }),
    );
    await tx((t) =>
      decideLookbackItem(t, lead(), { itemId: item.id, decision: "amend" }, new Date()),
    );
    expect(
      await one(`SELECT decision, amendment_report_id FROM lab_lookback_items WHERE id = $1`, [
        item.id,
      ]),
    ).toEqual({
      decision: "amend",
      amendment_report_id: amended.id,
    });
    await expect(
      tx((t) => decideLookbackItem(t, lead(), { itemId: item.id, decision: "stands" }, new Date())),
    ).rejects.toThrow(/already decided/);
  });

  it("S22, S23: resumption needs a passing run after the reject; closing needs every decision, the cause, effectiveness met and the lead", async () => {
    const close = (o: Partial<Parameters<typeof closeNonconformity>[2]> = {}) =>
      tx((t) =>
        closeNonconformity(
          t,
          lead(),
          {
            ncId,
            causeCategory: "calibration",
            effectivenessPlan: "Fixture: next runs within limits",
            effectivenessMet: true,
            ...o,
          },
          new Date(),
        ),
      );
    await expect(close()).rejects.toThrow(/Authorise resumption before closing/);
    const resume = () => tx((t) => authoriseResumption(t, lead(), { ncId }, new Date()));
    await expect(resume()).rejects.toThrow(/No QC run has passed/); // S23
    await run(a1, K, [0.1, -0.2], "accepted", { by: actor.tech2 });
    // Still held after the passing run: only the lead's resumption lifts it (NC-3).
    expect(
      (
        await one<{ held: boolean }>(
          `SELECT held FROM lab_qc_status WHERE device_id = $1 AND concept_id = $2`,
          [a1, K],
        )
      ).held,
    ).toBe(true);
    await expect(resume()).rejects.toThrow(/look-back is not finished/);
    for (const i of (await tx((t) => loadNc(t, h, ncId)))!.lookBack.filter((x) => !x.decision))
      await tx((t) =>
        decideLookbackItem(
          t,
          lead(),
          // Repeat each (LB-3's worklist tasks read these once QC passes).
          { itemId: i.id, decision: "repeat" },
          new Date(),
        ),
      );
    await resume();
    expect(
      (
        await one<{ held: boolean }>(
          `SELECT held FROM lab_qc_status WHERE device_id = $1 AND concept_id = $2`,
          [a1, K],
        )
      ).held,
    ).toBe(false);
    // S22: closure conditions.
    await expect(close({ causeCategory: "" })).rejects.toThrow(/cause category/);
    await expect(close({ effectivenessMet: false })).rejects.toThrow(/effectiveness check as met/);
    await close();
    expect(
      await one(`SELECT state, cause_category, closed_by FROM lab_nonconformities WHERE id = $1`, [
        ncId,
      ]),
    ).toEqual({
      state: "closed",
      cause_category: "calibration",
      closed_by: actor.lead!.userId,
    });
    await expect(
      pg.query(`UPDATE lab_nonconformities SET title = 'x' WHERE id = $1`, [ncId]),
    ).rejects.toThrow(/frozen/);
    // Released now without a hold.
    const r = await received();
    const rel = await release(r, (await prelim(r, "4.1")).id);
    expect(
      (
        await one<{ qc_held: string[] | null }>(
          `SELECT qc_held FROM diagnostic_reports WHERE id = $1`,
          [rel.id],
        )
      ).qc_held,
    ).toBeNull();
  });

  it("LB-3: a 'repeat' decision is a worklist task once QC is not failed; Repeat done closes it, once", async () => {
    const tasks = await tx((t) => repeatTasks(t, h));
    const decided = await pg.query<{ id: string }>(
      `SELECT id FROM lab_lookback_items WHERE nc_id = $1 AND decision = 'repeat'`,
      [ncId],
    );
    expect(decided.rows.length).toBeGreaterThan(0);
    expect(tasks.map((t) => t.id).sort()).toEqual(decided.rows.map((r) => r.id).sort());
    expect(tasks[0]).toMatchObject({ conceptId: K, ncId });
    expect(tasks[0]!.orderId).toBeTruthy();
    // While the analyte's QC is failed, no task shows (the cached status decides).
    const status = await one<{ status: string }>(
      `SELECT status FROM lab_qc_status WHERE device_id = $1 AND concept_id = $2`,
      [a1, K],
    );
    await pg.query(
      `UPDATE lab_qc_status SET status = 'failed' WHERE device_id = $1 AND concept_id = $2`,
      [a1, K],
    );
    expect(await tx((t) => repeatTasks(t, h))).toEqual([]);
    await expect(
      tx((t) => repeatDone(t, lead(), { itemId: tasks[0]!.id }, new Date())),
    ).rejects.toThrow(/QC has not passed yet/);
    await pg.query(
      `UPDATE lab_qc_status SET status = $3 WHERE device_id = $1 AND concept_id = $2`,
      [a1, K, status.status],
    );
    await tx((t) => repeatDone(t, actor.tech!, { itemId: tasks[0]!.id }, new Date()));
    expect((await tx((t) => repeatTasks(t, h))).map((t) => t.id)).not.toContain(tasks[0]!.id);
    expect(
      await one(`SELECT kind, actor FROM lab_nc_events WHERE payload ->> 'repeatDone' = $1`, [
        tasks[0]!.id,
      ]),
    ).toEqual({ kind: "note", actor: actor.tech!.userId });
    await expect(
      tx((t) => repeatDone(t, actor.tech!, { itemId: tasks[0]!.id }, new Date())),
    ).rejects.toThrow(/already recorded/);
  });

  it("S24: a new control lot runs on the maker's range, provisional; after the signed minimum, Set this lab's target makes a new plan version", async () => {
    await qcPlan(a2, CREAT, {
      targets: [
        { level: 1, controlLotId: lotL1, ...FX.l1, source: "maker_provisional" },
        { level: 2, controlLotId: lotL2, ...FX.l2, source: "maker_provisional" },
      ],
    });
    const target = () =>
      tx((t) =>
        setLabTarget(
          t,
          lead(),
          { deviceId: a2, conceptId: CREAT, level: 1, controlLotId: lotL1 },
          new Date(),
        ),
      );
    await expect(target()).rejects.toThrow(/No signed QC policy/);
    await signed("qc_policy", "hospital", FX_POLICY);
    const day = 86_400_000;
    const base = Date.now() - 25 * day;
    for (let i = 0; i < 19; i++)
      await run(a2, CREAT, [i % 2 ? 0.5 : -0.5, 0], "accepted", {
        runAt: new Date(base + i * day),
      });
    expect(
      (
        await one<{ status: string }>(
          `SELECT status FROM lab_qc_status WHERE device_id = $1 AND concept_id = $2`,
          [a2, CREAT],
        )
      ).status,
    ).toBe("provisional_target");
    await expect(target()).rejects.toThrow(/Not enough accepted runs yet: 19 over 19 days/);
    await run(a2, CREAT, [0.5, 0], "accepted", { runAt: new Date(base + 19 * day) });
    const draftId = await target();
    const v = await one<{
      version: number;
      status: string;
      payload: { targets: { level: number; source: string; runs: number; mean: number }[] };
    }>(`SELECT version, status, payload FROM lab_signed_configs WHERE id = $1`, [draftId]);
    expect(v).toMatchObject({ version: 2, status: "draft" });
    expect(v.payload.targets.find((t) => t.level === 1)).toMatchObject({ source: "lab", runs: 20 });
    expect(v.payload.targets.find((t) => t.level === 2)).toMatchObject({
      source: "maker_provisional",
    });
    // No target changes until it is signed: version 1 stays in force.
    const inForce = await one<{ version: number }>(
      `SELECT version FROM lab_signed_configs WHERE key = $1 AND status = 'signed'`,
      [`${a2}:${CREAT}`],
    );
    expect(inForce.version).toBe(1);
  });

  const kit = async (name: string, kind: "kit" | "stain") =>
    tx((t) =>
      saveItem(
        t,
        lead(),
        {
          name,
          kind,
          unitOfIssue: "box",
          packSize: null,
          testsPerUnit: null,
          testCodes: [],
          conceptIds: [],
          hmisTracerCode: null,
          storageDeviceId: null,
          minMonths: null,
          maxMonths: null,
        },
        new Date(),
      ),
    );
  const lotState = async (lotId: string) =>
    (await one<{ state: string }>(`SELECT state FROM lab_stock_lots WHERE id = $1`, [lotId])).state;
  const kitCheck = (lotId: string, trigger: string, observed: unknown[], by = actor.lead!) =>
    tx((t) =>
      recordKitQc(
        t,
        { userId: by.userId, hospitalId: h },
        { lotId, trigger: trigger as never, observed: observed as never, clientKey: key() },
        new Date(),
      ),
    );

  it("S25: a new Determine lot cannot be used until both controls give the expected result; a failed control quarantines and opens a nonconformity", async () => {
    const determine = await kit("Fixture HIV rapid test kit", "kit");
    await signed("acceptance_plan", determine, {
      method: "qc_pass",
      triggers: ["new_lot"],
      certificateAllowed: false,
      source: "Fixture plan",
    });
    await signed("kit_qc_rule", determine, {
      triggers: [{ kind: "new_lot" }],
      controls: [
        { name: "Positive control", expected: { code: "reactive" } },
        { name: "Negative control", expected: { code: "non_reactive" } },
      ],
      requiredBeforeUse: true,
      hmisIqc: true,
      source: "Fixture rule",
    });
    await tx((t) =>
      receiveDelivery(
        t,
        lead(),
        {
          supplier: "nms",
          supplierName: null,
          noteNumber: "FX-DN-QC",
          receivedAt: new Date(),
          clientKey: key(),
          lines: ["FX-DET-1", "FX-DET-2"].map((lot) => ({
            itemId: determine,
            lot,
            useBy: "2099-12-31",
            received: 5,
            rejected: 0,
            condition: { sealed: true, coldChain: null, note: null },
          })),
        },
        new Date(),
      ),
    );
    const [ok, bad] = await Promise.all(
      ["FX-DET-1", "FX-DET-2"].map(
        async (l) =>
          (
            await one<{ id: string }>(
              `SELECT id FROM lab_stock_lots WHERE item_id = $1 AND lot = $2`,
              [determine, l],
            )
          ).id,
      ),
    );
    expect(await lotState(ok!)).toBe("in_acceptance");
    const kits = await tx((t) => loadKits(t, h, actor.lead!.userId, new Date()));
    expect(kits.find((k) => k.id === determine)!.lots.find((l) => l.id === ok)).toMatchObject({
      due: ["new_lot"],
      blocks: true,
    });
    const pass = await kitCheck(ok!, "new_lot", [
      { name: "Positive control", code: "reactive" },
      { name: "Negative control", code: "non_reactive" },
    ]);
    expect(pass).toMatchObject({ outcome: "pass", lotTo: "accepted" });
    expect(await lotState(ok!)).toBe("accepted");
    expect(
      await one(`SELECT hmis_iqc, subject FROM lab_control_checks WHERE id = $1`, [pass.id]),
    ).toEqual({ hmis_iqc: true, subject: "kit" });
    const fail = await kitCheck(bad!, "new_lot", [
      { name: "Positive control", code: "non_reactive" },
      { name: "Negative control", code: "non_reactive" },
    ]);
    expect(fail.outcome).toBe("fail");
    expect(await lotState(bad!)).toBe("quarantined");
    expect(
      await one(`SELECT source, testing_halted FROM lab_nonconformities WHERE source_ref = $1`, [
        fail.id,
      ]),
    ).toEqual({
      source: "kit_qc_fail",
      testing_halted: false,
    });
  });

  const grandfathered = async (itemId: string, lot: string) =>
    (
      await tx((t) =>
        grandfatherLots(
          t,
          lead(),
          {
            statement: "Fixture: this lot was on the shelf and in use.",
            lots: [{ itemId, lot, useBy: "2099-12-31", quantity: 2 }],
            clientKey: key(),
          },
          new Date(),
        ),
      )
    )[0]!;

  it("S26: Giemsa is due each day of use; the signed pass criteria are the checklist that records the result", async () => {
    const giemsa = await kit("Fixture Giemsa stain", "stain");
    const criteria = ["Fixture: nuclei stain as signed", "Fixture: cytoplasm stains as signed"];
    await signed("kit_qc_rule", giemsa, {
      triggers: [{ kind: "each_day_of_use" }],
      controls: [{ name: "Fixture control film", expected: { passCriteria: criteria } }],
      requiredBeforeUse: false,
      hmisIqc: false,
      source: "Fixture rule",
    });
    const lot = await grandfathered(giemsa, "FX-GIE-1");
    const due = async () =>
      (await tx((t) => loadKits(t, h, actor.tech!.userId, new Date()))).find(
        (k) => k.id === giemsa,
      )!.lots[0]!;
    expect(await due()).toMatchObject({ due: ["each_day_of_use"], blocks: false });
    const partial = await kitCheck(
      lot,
      "each_day_of_use",
      [{ name: "Fixture control film", met: [criteria[0]] }],
      actor.tech!,
    );
    expect(partial.outcome).toBe("fail");
    // Fixture lot quarantined by the partial pass; the next lot passes on the full checklist.
    const lot2 = await grandfathered(giemsa, "FX-GIE-2");
    const full = await kitCheck(
      lot2,
      "each_day_of_use",
      [{ name: "Fixture control film", met: criteria }],
      actor.tech!,
    );
    expect(full.outcome).toBe("pass");
    const c = await one<{
      subject: string;
      controls: { observed: { met: string[] }; pass: boolean }[];
    }>(`SELECT subject, controls FROM lab_control_checks WHERE id = $1`, [full.id]);
    expect(c.subject).toBe("stain");
    expect(c.controls[0]).toMatchObject({ observed: { met: criteria }, pass: true });
    expect((await due()).due).toEqual([]);
  });

  it("S27: a new operator triggers the syphilis rapid-test QC before their first patient test", async () => {
    const syph = await kit("Fixture syphilis rapid test", "kit");
    await signed("kit_qc_rule", syph, {
      triggers: [{ kind: "new_operator" }],
      controls: [{ name: "Positive control", expected: { code: "reactive" } }],
      requiredBeforeUse: true,
      hmisIqc: false,
      source: "Fixture rule",
    });
    const lot = await grandfathered(syph, "FX-SY-1");
    await kitCheck(
      lot,
      "new_operator",
      [{ name: "Positive control", code: "reactive" }],
      actor.lead!,
    );
    const forOp = async (u: EmrActor) =>
      (await tx((t) => loadKits(t, h, u.userId, new Date()))).find((k) => k.id === syph)!.lots[0]!;
    expect(await forOp(actor.lead!)).toMatchObject({ due: [], blocks: false });
    expect(await forOp(actor.tech2!)).toMatchObject({ due: ["new_operator"], blocks: true });
    await kitCheck(
      lot,
      "new_operator",
      [{ name: "Positive control", code: "reactive" }],
      actor.tech2!,
    );
    expect((await forOp(actor.tech2!)).due).toEqual([]);
  });

  it("S28: labQc on, labQcHold off: a failure is logged and shown, and release is not held", async () => {
    await qcPlan(a1, CREAT);
    const rej = await run(a1, CREAT, [3.2, 0], "rejected", {
      firstStep: "Fixture: new control vial",
    });
    expect(
      await one(`SELECT source FROM lab_nonconformities WHERE source_ref = $1`, [rej.id]),
    ).toEqual({ source: "qc_reject" });
    process.env.LAB_QC_HOLD = "";
    try {
      expect(
        qcReleasePlan({
          holdOn: false,
          components: [
            {
              conceptId: CREAT,
              status: "failed",
              runId: rej.id,
              held: true,
              holdWhenNotRun: false,
            },
          ],
        }),
      ).toMatchObject({ ok: true, held: [] });
      const r = await received();
      const rel = await release(r, (await prelim(r, "4.1")).id);
      expect(rel.warnings ?? []).not.toContain("Creatinine to follow: held for quality control.");
      expect(
        (
          await one<{ qc_held: string[] | null }>(
            `SELECT qc_held FROM diagnostic_reports WHERE id = $1`,
            [rel.id],
          )
        ).qc_held,
      ).toBeNull();
      expect((await obs(rel.id)).find((x) => x.concept_id === CREAT)).toMatchObject({
        status: "final",
        qc: { status: "failed", runId: rej.id },
      });
      const view = await tx((t) =>
        holdFor(t, h, { orderId: r.orderId, concepts: [CREAT], priority: "routine" }, new Date()),
      );
      expect(view).toMatchObject({
        holdOn: false,
        components: [{ status: "failed", blocked: false }],
      });
    } finally {
      process.env.LAB_QC_HOLD = "1";
    }
  });

  it("S50 (release): with all eight Phase 3 flags off, release is Phase 2's: a failed QC holds nothing, no QC snapshot", async () => {
    // Creatinine's QC on this analyser is failed (S28); with the flags off the gate is never entered.
    expect(
      (
        await one<{ status: string }>(
          `SELECT status FROM lab_qc_status WHERE device_id = $1 AND concept_id = $2`,
          [a1, CREAT],
        )
      ).status,
    ).toBe("failed");
    await phase3Off(async () => {
      const r = await received();
      const rel = await release(r, (await prelim(r, "4.1")).id);
      expect(
        (
          await one<{ qc_held: string[] | null }>(
            `SELECT qc_held FROM diagnostic_reports WHERE id = $1`,
            [rel.id],
          )
        ).qc_held,
      ).toBeNull();
      for (const o of await obs(rel.id)) {
        expect(o.status, o.concept_id).toBe("final");
        expect(o.qc, o.concept_id).toBeNull();
      }
    });
  });
});

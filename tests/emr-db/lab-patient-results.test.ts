/**
 * Lab Phase 5, Step 7 on the PGlite lane: patients see their results (S28–S34, S36, S38). Results go through the
 * real order, specimen, entry, release and acknowledgement path. The release table, minors rule, plain words and the
 * reference range are FIXTURES, signed as the product requires. S35 and S37 are browser checks (STOP 7).
 * Runs with EMR_PGLITE=1.
 */
import { randomUUID } from "node:crypto";
import type { Lane, Pg } from "./_pglite";
import type { EmrActor } from "@/lib/emr/actor";
import type { WriteCtx } from "@/lib/emr/write/context";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { withPatientWrite } from "@/lib/emr/write/context";
import { placeOrders } from "@/lib/emr/write/orders";
import {
  acknowledgeResults,
  amendResults,
  enterResults,
  releaseResults,
} from "@/lib/emr/write/results";
import { collectSpecimen, receiveSpecimen } from "@/lib/emr/write/specimens";
import { encrypt, generateKey } from "@/lib/encryption";
import { saveConfigDraft, signConfig } from "@/lib/lab/catalogue-v2";
import { saveMeasure } from "@/lib/lab/measures-setup";
import {
  holdFromPatient,
  patientSees,
  releaseContext,
  resultFacts,
  writeNoteToPatient,
} from "@/lib/lab/patient-release-store";
import {
  askForCopy,
  oneResult,
  openRecordsRequests,
  recordView,
  resultsFor,
} from "@/lib/lab/patient-results";
import {
  actAs,
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

describe.skipIf(!laneOn)("Lab Phase 5 patients see their results (S28–S38)", () => {
  let lane: Lane;
  let pg: Pg;
  let h: string;
  let ward: string;
  const a: Record<string, EmrActor> = {};
  const env = { ...process.env };
  const ids: Record<string, string> = {};
  const people: Record<string, string> = {};
  const tx = <T>(fn: (t: Parameters<Parameters<Lane["db"]["transaction"]>[0]>[0]) => Promise<T>) =>
    lane.db.transaction(fn);
  const as = <T>(actor: EmrActor, p: string, fn: (ctx: WriteCtx) => Promise<T>) =>
    withPatientWrite(actor, p, fn, { database: lane.db });
  const one = async <T = Record<string, unknown>>(q: string, params: unknown[] = []) =>
    (await pg.query<T>(q, params)).rows[0] as T;
  const testId = async (code: string) =>
    (
      await one<{ id: string }>(
        `SELECT id FROM test_catalogue WHERE code = $1 AND hospital_id IS NULL`,
        [code],
      )
    ).id;
  const sign = async (kind: string, k: string, payload: unknown) => {
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
    await tx((t) =>
      signConfig(
        t,
        { userId: a.cso!.userId, hospitalId: h, as: "cso" },
        { configId: id, exceptionNote: null },
        new Date(),
      ),
    );
  };
  async function person(dob: string, first: string) {
    const p = await patient(pg);
    await pg.query(
      `INSERT INTO patient_profiles (id, first_name_encrypted, surname_encrypted, sex, date_of_birth, id_type, phone_encrypted, district_id)
       VALUES ($1, $2, $3, 'female', $4, 'none', $5, (SELECT id FROM districts LIMIT 1))`,
      [p, encrypt(first), encrypt("Fixture"), dob, encrypt("0700000001")],
    );
    await intake(pg, { hospitalId: h, patientUserId: p });
    return p;
  }
  const consent = (p: string) =>
    pg.query(
      `INSERT INTO consent_records (user_id, consent_type, version, consent_text_sha256) VALUES ($1, 'results_in_app', 'fx', $2)`,
      [p, "a".repeat(64)],
    );
  /** An order of `code` for `p`, received; with `values`, entered and released (final). */
  async function result(p: string, code: string, values?: Record<string, string>) {
    const enc = await encounter(pg, {
      hospitalId: h,
      patientUserId: p,
      clinicianUserId: a.doctor!.userId,
      departmentId: ward,
    });
    const order = await as(a.doctor!, p, (ctx) =>
      placeOrders(ctx, {
        patientUserId: p,
        encounterId: enc,
        orders: [
          { clientKey: key(), testId: ids[code]!, priority: "routine", reasonText: "Check" },
        ],
      }),
    );
    if (!values) return { orderId: order.id, reportId: "" };
    const sp = await as(a.nurse!, p, (ctx) =>
      collectSpecimen(ctx, {
        patientUserId: p,
        orderId: order.id,
        identifiersConfirmed: true,
        collectedAt: new Date(),
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
        status: "preliminary",
        values: Object.entries(values).map(([conceptId, value]) => ({ conceptId, value })),
        clientKey: key(),
      }),
    );
    const released = await as(a.lab!, p, (ctx) =>
      releaseResults(ctx, { patientUserId: p, reportId: r.id, clientKey: key() }),
    );
    return { orderId: order.id, reportId: released.id };
  }
  const review = (p: string, reportId: string) =>
    as(a.doctor!, p, (ctx) =>
      acknowledgeResults(ctx, {
        patientUserId: p,
        items: [{ reportId, action: "seen" }],
        clientKey: key(),
      }),
    );
  const mine = (p: string, viewer = p) =>
    resultsFor({ userId: viewer, subjectUserId: p }, new Date(), lane.db);

  beforeAll(async () => {
    process.env.MEDSYNC_PHI_KEY ??= generateKey();
    for (const k of FLAGS) process.env[k] = "1";
    lane = await bootLane();
    pg = lane.pg;
    h = await hospital(pg, "Results");
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
    for (const c of ["test.creatinine", "test.hiv_viral_load", "test.pregnancy_urine", "test.esr"])
      ids[c] = await testId(c);
    await tx((t) =>
      saveMeasure(
        t,
        { userId: a.lead!.userId, hospitalId: h },
        {
          testId: ids["test.creatinine"]!,
          conceptId: "obs.creatinine",
          draft: {
            resultType: "number",
            unitUcum: "umol/L",
            unitDisplay: "µmol/L",
            decimalPlaces: 0,
            loincCode: null,
            entryCheckLow: null,
            entryCheckHigh: null,
          },
        },
        new Date(),
      ),
    );
    await tx((t) =>
      saveMeasure(
        t,
        { userId: a.lead!.userId, hospitalId: h },
        {
          testId: ids["test.hiv_viral_load"]!,
          conceptId: "obs.hiv_viral_load",
          draft: {
            resultType: "number",
            unitUcum: "{copies}/mL",
            unitDisplay: "copies/mL",
            decimalPlaces: 0,
            loincCode: null,
            entryCheckLow: null,
            entryCheckHigh: null,
          },
        },
        new Date(),
      ),
    );
    // A FIXTURE range (50 to 100), signed by a lead and a CSO.
    const v = await one<{ id: string }>(
      `INSERT INTO reference_range_versions (hospital_id, test_id, concept_id, unit_ucum, version, authored_by)
       VALUES ($1, $2, 'obs.creatinine', 'umol/L', 1, $3) RETURNING id`,
      [h, ids["test.creatinine"], a.lab.userId],
    );
    await pg.query(
      `INSERT INTO reference_range_bands (version_id, sex, low, high, source) VALUES ($1, 'any', 50, 100, 'fixture')`,
      [v.id],
    );
    await pg.query(
      `UPDATE reference_range_versions SET status = 'signed', lead_signed_by = $2, lead_signed_at = now(),
         cso_signed_by = $3, cso_signed_at = now(), in_force_from = now() - interval '1 day' WHERE id = $1`,
      [v.id, a.lead.userId, a.cso.userId],
    );
    await sign("patient_release", "hospital", RULES);
    await sign("plain_words", "obs.creatinine:en", {
      concept: "obs.creatinine",
      language: "en",
      whatThisTestIs: "Fixture: what this test is.",
      shortLine: "Fixture short line.",
      action: {
        within: "Fixture within.",
        higher: "Fixture higher.",
        lower: "Fixture lower.",
        noRange: "Fixture none.",
      },
      harmAnchor: null,
      calculated: [],
      readability: { method: "Fixture", score: 1 },
      translation: null,
      bannedPhrases: [],
    });
    people.adult = await person("1990-01-01", "Adult");
    await consent(people.adult);
  }, 300_000);
  afterAll(() => {
    for (const k of FLAGS) process.env[k] = env[k];
  });

  it("S28 a reviewed creatinine shows with its range, status word, plain words and the doctor's note", async () => {
    const p = people.adult!;
    const { reportId } = await result(p, "test.creatinine", { "obs.creatinine": "168" });
    ids.cr = reportId;
    await review(p, reportId);
    await as(a.doctor!, p, (ctx) =>
      writeNoteToPatient(ctx, {
        patientUserId: p,
        reportId,
        text: "Fixture note to the patient.",
        clientKey: key(),
      }),
    );
    const t0 = Date.now();
    const res = await mine(p);
    const card = res!.ready.find((c) => c.reportId === reportId)!;
    expect(card.values[0]).toMatchObject({ value: "168", low: 50, high: 100, word: "higher" });
    expect(card.note).toBe("Fixture note to the patient.");
    const one = await oneResult(
      { userId: p, subjectUserId: p },
      reportId,
      new Date(),
      "en",
      lane.db,
    );
    expect(one!.words["obs.creatinine"]!.action.higher).toBe("Fixture higher.");
    expect(Date.now() - t0).toBeLessThan(5_000);
  });

  it("S29 an unreviewed result and an unreleased order say why they are not ready", async () => {
    const p = people.adult!;
    const { reportId } = await result(p, "test.creatinine", { "obs.creatinine": "80" });
    const pending = await result(p, "test.creatinine");
    const res = await mine(p);
    expect(res!.notReady.find((n) => n.key === reportId)!.line).toMatch(/looks at this first/);
    expect(res!.notReady.find((n) => n.key === pending.orderId)!.line).toBe("Waiting for the lab.");
    await review(p, reportId);
  });

  it("S30 no never-shown test appears anywhere, not even as a name", async () => {
    const p = people.adult!;
    const hiv = await result(p, "test.hiv_viral_load", { "obs.hiv_viral_load": "40" });
    await review(p, hiv.reportId);
    await result(p, "test.pregnancy_urine");
    const names = await pg.query<{ display: string }>(
      `SELECT display FROM test_catalogue WHERE code IN ('test.hiv_viral_load','test.pregnancy_urine') AND hospital_id IS NULL`,
    );
    const page = JSON.stringify(await mine(p));
    for (const n of names.rows) expect(page).not.toContain(n.display);
    expect(page).not.toContain(hiv.reportId);
  });

  it("S31 a correction shows 'being checked' until acknowledged, then the new value with 'Corrected on'", async () => {
    const p = people.adult!;
    const amended = await as(a.lab!, p, (ctx) =>
      amendResults(ctx, {
        patientUserId: p,
        reportId: ids.cr!,
        status: "corrected",
        values: [{ conceptId: "obs.creatinine", value: "158" }],
        reasonText: "Fixture correction",
        clientKey: key(),
      }),
    );
    // The patient's view of the old version is what makes this a correction they must be told about.
    await recordView({ userId: p, subjectUserId: p }, ids.cr!, "Android", lane.db);
    let card = (await mine(p))!.ready.find((c) => c.reportId === amended.id)!;
    expect(card.beingChecked).toBe(true);
    expect(card.values).toEqual([]);
    await review(p, amended.id);
    card = (await mine(p))!.ready.find((c) => c.reportId === amended.id)!;
    expect(card.values[0]!.value).toBe("158");
    expect(card.correctedOn).not.toBeNull();
    const detail = await oneResult(
      { userId: p, subjectUserId: p },
      amended.id,
      new Date(),
      "en",
      lane.db,
    );
    expect(detail!.earlierValue!.values[0]!.value).toBe("168");
    ids.cr = amended.id;
  });

  it("S34 the doctor sees 'Seen by the patient'", async () => {
    const p = people.adult!;
    await recordView({ userId: p, subjectUserId: p }, ids.cr!, "Android", lane.db);
    const ctx = await tx((t) => releaseContext(t, h, new Date()));
    const [f] = await tx((t) => resultFacts(t, h, [ids.cr!]));
    expect(patientSees(f!, ctx).kind).toBe("seen");
  });

  it("S36 'Ask for a copy' opens a records request; a held result is flagged, not withheld", async () => {
    const p = people.adult!;
    const rules = (await tx((t) => releaseContext(t, h, new Date()))).rules;
    const until = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    await as(a.doctor!, p, (ctx) =>
      holdFromPatient(
        ctx,
        {
          patientUserId: p,
          reportId: ids.cr!,
          reason: "explain_in_person",
          untilOn: until,
          clientKey: key(),
        },
        rules,
      ),
    );
    expect(await askForCopy(p, key(), new Date(), lane.db)).toBe(1);
    const open = await openRecordsRequests(h, lane.db);
    expect(open.find((q) => q.patientUserId === p)).toMatchObject({ held: true });
  });

  it("S32 turning consent off hides results at once", async () => {
    const p = people.adult!;
    await pg.query(
      `UPDATE consent_records SET revoked_at = now() WHERE user_id = $1 AND consent_type = 'results_in_app'`,
      [p],
    );
    const res = await mine(p);
    expect(res!.blocked).toBe("no_consent");
    expect(res!.ready).toEqual([]);
    await pg.query(
      `UPDATE consent_records SET revoked_at = NULL WHERE user_id = $1 AND consent_type = 'results_in_app'`,
      [p],
    );
  });

  it("S33 guardians see a child's results only as the signed minors rule allows", async () => {
    const guardian = people.adult!;
    const young = await person("2019-01-01", "Young");
    const teen = await person("2011-01-01", "Teen");
    for (const c of [young, teen]) {
      await consent(c);
      await pg.query(
        `INSERT INTO guardian_links (hospital_id, guardian_user_id, child_user_id, relationship, verified_by, evidence)
         VALUES ($1, $2, $3, 'parent', $4, 'Fixture birth certificate')`,
        [h, guardian, c, a.doctor!.userId],
      );
      const r = await result(c, "test.creatinine", { "obs.creatinine": "40" });
      await review(c, r.reportId);
    }
    expect((await mine(young, guardian))!.blocked).toBe("minor");
    expect((await mine(teen, guardian))!.blocked).toBe("minor");
    await sign("minors_rule", "hospital", {
      under12Guardian: ["routine"],
      adolescentGuardian: [],
      adolescentOwnAccess: false,
      legalOpinionRef: "Fixture opinion",
    });
    expect((await mine(young, guardian))!.ready).toHaveLength(1);
    const t = await mine(teen, guardian);
    expect(t!.ready).toEqual([]);
    expect(t!.blocked).toBe("minor");
  });

  it("S38 a patient opens only their own record (app gate and the database function)", async () => {
    const other = await person("1985-01-01", "Other");
    await consent(other);
    expect(await mine(people.adult!, other)).toBeNull();
    expect(
      await oneResult(
        { userId: other, subjectUserId: people.adult! },
        ids.cr!,
        new Date(),
        "en",
        lane.db,
      ),
    ).toBeNull();
    const rows = await actAs(
      pg,
      { userId: other, role: "authenticated" },
      async (q) =>
        (await q.query<{ id: string }>(`SELECT * FROM public.patient_results_for_me() AS id`)).rows,
    );
    expect(rows).toEqual([]);
    const own = await actAs(
      pg,
      { userId: people.adult!, role: "authenticated" },
      async (q) =>
        (await q.query<{ id: string }>(`SELECT * FROM public.patient_results_for_me() AS id`)).rows,
    );
    expect(own.length).toBeGreaterThan(0);
    // Row-level security: another patient's reports are simply not there.
    const direct = await actAs(
      pg,
      { userId: other, role: "authenticated" },
      async (q) =>
        (
          await q.query(`SELECT id FROM diagnostic_reports WHERE patient_user_id = $1`, [
            people.adult!,
          ])
        ).rows,
    );
    expect(direct).toEqual([]);
  });
});

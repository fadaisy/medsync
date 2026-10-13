/**
 * Lab Phase 3, Step 7: external quality assessment on the PGlite lane (S29–S32). Every scheme, provider, sample,
 * result, target, score, kit name, window and date here is a FIXTURE, never a real scheme or an operational
 * default. Runs with EMR_PGLITE=1.
 */
import { randomUUID } from "node:crypto";
import type { Lane, Pg } from "./_pglite";
import type { EmrActor } from "@/lib/emr/actor";
import type { WriteCtx } from "@/lib/emr/write/context";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { withPatientWrite } from "@/lib/emr/write/context";
import { placeOrders } from "@/lib/emr/write/orders";
import { enterResults } from "@/lib/emr/write/results";
import { collectSpecimen, receiveSpecimen } from "@/lib/emr/write/specimens";
import { encrypt, generateKey } from "@/lib/encryption";
import { labAccess } from "@/lib/lab/access";
import { loadEqa } from "@/lib/lab/eqa-read";
import {
  eqaRoundsFor,
  recordAltAssessment,
  recordEqaResults,
  recordEqaScores,
  recordRound,
  saveScheme,
} from "@/lib/lab/eqa-store";
import { count105 } from "@/lib/lab/hmis105";
import { loadNc } from "@/lib/lab/qc-read";
import { addDays, dayOf } from "@/lib/lab/stock";
import { setQualitySettings } from "@/lib/lab/stock-store";
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
const key = () => `k-${randomUUID()}`;
const TODAY = dayOf(new Date(), DEFAULT_TIME_ZONE);
const ago = (n: number) => addDays(TODAY, -n);
/** FIXTURE operational window and period (the lead sets the real ones). */
const FX_WINDOW = 30;
const FX_ALT_PERIOD = 180;
/** FIXTURE kit names as an algorithm would name them, and FIXTURE 10.3 rows. */
const KIT_A = "Fixture HIV kit A";
const KIT_B = "Fixture HIV kit B";

describe.skipIf(!laneOn)("Lab Phase 3 external quality assessment (Step 7)", () => {
  let lane: Lane;
  let pg: Pg;
  let h: string;
  let h2: string;
  const actor: Record<string, EmrActor> = {};
  const env = { ...process.env };
  const tx = <T>(fn: (t: Parameters<Parameters<Lane["db"]["transaction"]>[0]>[0]) => Promise<T>) =>
    lane.db.transaction(fn);
  const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
    (await pg.query<T>(sql, params)).rows[0] as T;
  const lead = () => ({ userId: actor.lead!.userId, hospitalId: h });
  const as = <T>(a: EmrActor, p: string, fn: (ctx: WriteCtx) => Promise<T>) =>
    withPatientWrite(a, p, fn, { database: lane.db });
  let ueCode = "";

  /**
   * A U&E released by `by` with this potassium, moved `daysAgo` into the past (the owner rewrites the times with
   * triggers off: the lane's way to place a release before a round's receipt). Returns the potassium observation.
   */
  async function releasedUE(by: EmrActor, k: string, daysAgo: number) {
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
        orders: [
          { clientKey: key(), testId: UE, priority: "routine", reasonText: "Fixture check" },
        ],
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
    await as(by, p, (ctx) =>
      receiveSpecimen(ctx, { patientUserId: p, specimenId: sp.id, clientKey: key() }),
    );
    const r = await as(by, p, (ctx) =>
      enterResults(ctx, {
        patientUserId: p,
        orderId: order.id,
        status: "final",
        values: [
          { conceptId: NA, value: "140" },
          { conceptId: K, value: k, referenceRange: { low: 3.5, high: 5.0, unit: "mmol/L" } },
        ],
        clientKey: key(),
      }),
    );
    await pg.query(`SET session_replication_role = replica`);
    await pg.query(
      `UPDATE diagnostic_reports SET recorded_at = recorded_at - make_interval(days => $2) WHERE id = $1`,
      [r.id, daysAgo],
    );
    await pg.query(
      `UPDATE clinical_observations SET recorded_at = recorded_at - make_interval(days => $2) WHERE report_id = $1`,
      [r.id, daysAgo],
    );
    await pg.query(`SET session_replication_role = origin`);
    return one<{ id: string }>(
      `SELECT id FROM clinical_observations WHERE report_id = $1 AND concept_id = $2`,
      [r.id, K],
    );
  }

  beforeAll(async () => {
    process.env.MEDSYNC_PHI_KEY ??= generateKey();
    for (const k of ["LAB_WORKSPACE", "LAB_EQA"]) process.env[k] = "1";
    lane = await bootLane();
    pg = lane.pg;
    h = await hospital(pg, "EQA");
    h2 = await hospital(pg, "EQA other");
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
    ueCode = (await one<{ code: string }>(`SELECT code FROM test_catalogue WHERE id = $1`, [UE]))
      .code;
    // The hub's in-house menu here: U&E, FBC, ESR and HIV rapid. Hospital B offers FBC only.
    for (const [hid, code] of [
      [h, ueCode],
      [h, "test.fbc"],
      [h, "test.esr"],
      [h, "test.hiv_rapid"],
      [h2, "test.fbc"],
    ] as const) {
      const offering = `fx-${code}`;
      await pg.query(
        `INSERT INTO diagnostic_offerings (hospital_id, kind, code, provision, hours, stated_tat, confirmed_at)
         VALUES ($1, 'lab', $2, 'in_house', '24h', 'fixture 2 h', now())`,
        [hid, offering],
      );
      await pg.query(
        `INSERT INTO lab_test_services (hospital_id, test_code, offering_code, set_by) VALUES ($1, $2, $3, $4)`,
        [hid, code, offering, actor.lead.userId],
      );
    }
  }, 300_000);
  afterAll(() => {
    for (const k of ["LAB_WORKSPACE", "LAB_EQA"]) process.env[k] = env[k];
  });

  let scheme: string;
  let kNear: string;
  let kBefore: string;

  it("S29, EA-1..EA-3: a round is received, tested by a user who runs patient samples, submitted and scored as the provider reports", async () => {
    // The tech released a U&E 20 days ago (inside the fixture window before receipt); tech2 has released nothing.
    kNear = (await releasedUE(actor.tech!, "4.1", 20)).id;
    kBefore = (await releasedUE(actor.tech!, "4.4", 40)).id;
    await tx((t) => setQualitySettings(t, lead(), { eqaTesterWindowDays: FX_WINDOW }, new Date()));
    scheme = await tx((t) =>
      saveScheme(t, lead(), {
        id: null,
        name: "Fixture chemistry scheme",
        provider: "Fixture provider",
        covers: [ueCode],
        roundsPerYear: 3,
        active: true,
      }),
    );
    const round = await tx((t) =>
      recordRound(t, lead(), {
        schemeId: scheme,
        label: "FX-2026-1",
        receivedOn: ago(10),
        dueOn: ago(3),
        samples: [
          { sampleId: "FX-S1", conceptId: K, kit: null },
          { sampleId: "FX-S2", conceptId: NA, kit: null },
        ],
      }),
    );
    // Scores before results are refused (the provider scores what was submitted).
    await expect(
      tx((t) =>
        recordEqaScores(
          t,
          lead(),
          { roundId: round, scoredOn: ago(1), reportPath: null, scores: [] },
          new Date(),
        ),
      ),
    ).rejects.toThrow(/results and the date submitted first/);
    // EA-2: tested by the tech (released U&E 20 days before receipt) and tech2 (none): a warning only.
    const warned = await tx((t) =>
      recordEqaResults(t, lead(), {
        roundId: round,
        results: [
          { sampleId: "FX-S1", ours: "4.3" },
          { sampleId: "FX-S2", ours: "139" },
        ],
        testedBy: [actor.tech!.userId, actor.tech2!.userId],
        submittedOn: ago(5),
      }),
    );
    expect(warned).toEqual([actor.tech2!.userId]);
    const scored = await tx((t) =>
      recordEqaScores(
        t,
        lead(),
        {
          roundId: round,
          scoredOn: ago(1),
          reportPath: "Fixture provider report FX-2026-1 (filed: EQA binder 2026)",
          scores: [
            {
              sampleId: "FX-S1",
              target: "4.25",
              score: "acceptable",
              scoreKind: "sdi",
              scoreValue: 0.4,
              limit: "±2 SDI (fixture)",
              bias: null,
            },
            {
              sampleId: "FX-S2",
              target: "140",
              score: "acceptable",
              scoreKind: "percent",
              scoreValue: 0.7,
              limit: "±3 % (fixture)",
              bias: null,
            },
          ],
        },
        new Date(),
      ),
    );
    expect(scored).toEqual({ outcome: "acceptable", ncId: null });
    const row = await one<Record<string, unknown>>(
      `SELECT outcome, scored_on::text, submitted_on::text, report_path, nc_id, samples FROM lab_eqa_rounds WHERE id = $1`,
      [round],
    );
    expect(row).toMatchObject({
      outcome: "acceptable",
      scored_on: ago(1),
      submitted_on: ago(5),
      nc_id: null,
    });
    // EA-3: stored as reported (score, kind, value and limit), never recomputed.
    expect((row.samples as { scoreValue: number; limit: string }[])[0]).toMatchObject({
      score: "acceptable",
      scoreKind: "sdi",
      scoreValue: 0.4,
      limit: "±2 SDI (fixture)",
      ours: "4.3",
    });
    // Once: a second scoring is refused.
    await expect(
      tx((t) =>
        recordEqaScores(
          t,
          lead(),
          { roundId: round, scoredOn: ago(1), reportPath: null, scores: [] },
          new Date(),
        ),
      ),
    ).rejects.toThrow(/already recorded/);
    // The page reads the same warning and the last outcome.
    const v = await tx((t) => loadEqa(t, h, new Date()));
    const s = v.schemes.find((x) => x.id === scheme)!;
    expect(s.last).toMatchObject({ label: "FX-2026-1", outcome: "acceptable", acceptable: 2 });
    expect(s.rounds[0]!.testerWarnings).toHaveLength(1);
  });

  it("S30, EA-4: an unacceptable result opens a nonconformity with a patient look-back over the round period", async () => {
    const round = await tx((t) =>
      recordRound(t, lead(), {
        schemeId: scheme,
        label: "FX-2026-2",
        receivedOn: ago(25),
        dueOn: ago(15),
        samples: [
          { sampleId: "FX-S3", conceptId: K, kit: null },
          { sampleId: "FX-S4", conceptId: NA, kit: null },
        ],
      }),
    );
    await tx((t) =>
      recordEqaResults(t, lead(), {
        roundId: round,
        results: [
          { sampleId: "FX-S3", ours: "5.2" },
          { sampleId: "FX-S4", ours: "141" },
        ],
        testedBy: [actor.tech!.userId],
        submittedOn: ago(18),
      }),
    );
    const out = await tx((t) =>
      recordEqaScores(
        t,
        lead(),
        {
          roundId: round,
          scoredOn: TODAY,
          reportPath: null,
          scores: [
            {
              sampleId: "FX-S3",
              target: "4.6",
              score: "unacceptable",
              scoreKind: "z",
              scoreValue: 3.4,
              limit: "|z| ≤ 2 (fixture)",
              bias: null,
            },
            {
              sampleId: "FX-S4",
              target: "140",
              score: "acceptable",
              scoreKind: null,
              scoreValue: null,
              limit: null,
              bias: null,
            },
          ],
        },
        new Date(),
      ),
    );
    expect(out.outcome).toBe("mixed");
    const nc = await tx((t) => loadNc(t, h, out.ncId!));
    expect(nc!.nc).toMatchObject({
      source: "eqa_unacceptable",
      sourceRef: round,
      owner: actor.lead!.userId,
      openedBy: null,
      testingHalted: false,
      subjectConceptId: K,
    });
    // Receipt (25 days ago) to scoring (today): the potassium released 20 days ago, not the one 40 days ago, and
    // never sodium; no bias was given, so nothing is sorted by an estimate.
    const items = (
      await pg.query<{ observation_id: string; sort: string }>(
        `SELECT observation_id, sort FROM lab_lookback_items WHERE nc_id = $1`,
        [out.ncId],
      )
    ).rows;
    expect(items).toEqual([{ observation_id: kNear, sort: "unchanged" }]);
    expect(items.map((i) => i.observation_id)).not.toContain(kBefore);
    expect(await one(`SELECT nc_id, outcome FROM lab_eqa_rounds WHERE id = $1`, [round])).toEqual({
      nc_id: out.ncId,
      outcome: "mixed",
    });
  });

  it("S31, EA-5: coverage lists tests with no scheme; an alternative assessment removes one for the lead's period", async () => {
    await tx((t) =>
      saveScheme(
        t,
        { userId: actor.lead!.userId, hospitalId: h2 },
        {
          id: null,
          name: "Fixture haematology scheme (hospital B)",
          provider: "Fixture provider",
          covers: ["test.fbc"],
          roundsPerYear: 2,
          active: true,
        },
      ),
    );
    const none = async () =>
      (await tx((t) => loadEqa(t, h, new Date()))).coverage
        .filter((c) => c.covered === "none")
        .map((c) => c.testCode)
        .sort();
    // U&E has a scheme here; hospital B's FBC scheme does not cover hospital A.
    expect(await none()).toEqual(["test.esr", "test.fbc", "test.hiv_rapid"]);
    await tx((t) =>
      recordAltAssessment(
        t,
        lead(),
        {
          testCode: "test.esr",
          method: "split_sample",
          partner: "Fixture partner laboratory",
          doneOn: ago(30),
          results: "Five fixture samples split; results within the fixture agreement.",
          conclusion: "Agreement acceptable (fixture).",
        },
        new Date(),
      ),
    );
    // Law 8: with no period set, the alternative does not count, and the page says so.
    expect(await none()).toEqual(["test.esr", "test.fbc", "test.hiv_rapid"]);
    await tx((t) => setQualitySettings(t, lead(), { altPeriodDays: FX_ALT_PERIOD }, new Date()));
    expect(await none()).toEqual(["test.fbc", "test.hiv_rapid"]);
    const v = await tx((t) => loadEqa(t, h, new Date()));
    expect(v.coverage.find((c) => c.testCode === "test.esr")!.covered).toBe("alternative");
    // An alternative done before the period does not cover the test.
    await tx((t) =>
      recordAltAssessment(
        t,
        lead(),
        {
          testCode: "test.fbc",
          method: "retained_samples",
          partner: null,
          doneOn: ago(FX_ALT_PERIOD + 10),
          results: "Retained fixture samples re-run.",
          conclusion: "Agreement acceptable (fixture).",
        },
        new Date(),
      ),
    );
    expect(await none()).toEqual(["test.fbc", "test.hiv_rapid"]);
  });

  it("S32, EA-6: HIV EQA panel tests count in HMIS 10.3 under EQA by kit, never as patient tests", async () => {
    const reports = async () =>
      Number(
        (
          await one<{ n: string }>(
            `SELECT count(*) AS n FROM diagnostic_reports WHERE hospital_id = $1`,
            [h],
          )
        ).n,
      );
    const before = await reports();
    const hivScheme = await tx((t) =>
      saveScheme(t, lead(), {
        id: null,
        name: "Fixture HIV proficiency panel",
        provider: "Fixture national programme",
        covers: ["test.hiv_rapid"],
        roundsPerYear: 2,
        active: true,
      }),
    );
    const round = await tx((t) =>
      recordRound(t, lead(), {
        schemeId: hivScheme,
        label: "FX-HIV-1",
        receivedOn: TODAY,
        dueOn: null,
        samples: [
          { sampleId: "FX-P1", conceptId: "obs.hiv_rdt_t1", kit: KIT_A },
          { sampleId: "FX-P2", conceptId: "obs.hiv_rdt_t1", kit: KIT_A },
          { sampleId: "FX-P3", conceptId: "obs.hiv_rdt_t2", kit: KIT_B },
        ],
      }),
    );
    await tx((t) =>
      recordEqaResults(t, lead(), {
        roundId: round,
        results: [
          { sampleId: "FX-P1", ours: "reactive" },
          { sampleId: "FX-P2", ours: "non_reactive" },
          { sampleId: "FX-P3", ours: "reactive" },
        ],
        testedBy: [actor.tech!.userId],
        submittedOn: TODAY,
      }),
    );
    // The panel never becomes a diagnostic report (hazard 23).
    expect(await reports()).toBe(before);
    const rounds = await tx((t) => eqaRoundsFor(t, h));
    expect(rounds.find((r) => r.id === round)!.samples.map((s) => s.kit)).toEqual([
      KIT_A,
      KIT_A,
      KIT_B,
    ]);
    const month = TODAY.slice(0, 7);
    const c = count105({
      hospitalId: h,
      month,
      timeZone: DEFAULT_TIME_ZONE,
      mapping: {
        formHash: "fixture",
        orgUnitCode: null,
        rows: [],
        visits: {},
        specimenColumns: {},
        rejection: {},
        reasons: {},
        hivTests: ["test.hiv_rapid"],
        kits: { [KIT_A]: "FX-ROW-A", [KIT_B]: "FX-ROW-B" },
        kitItems: {},
        purposes: { hct: "HCT (fixture column)" },
        tracers: {},
        excluded: [],
      } as never,
      menu: ["test.hiv_rapid"],
      reports: [],
      specimens: [],
      referrals: [],
      controlChecks: [],
      eqaRounds: rounds,
      stockItems: [],
      stockTxs: [],
      manual: {},
    });
    expect(c.cells["FX-ROW-A|EQA"]!.value).toBe(2);
    expect(c.cells["FX-ROW-B|EQA"]!.value).toBe(1);
    expect(c.cells["FX-ROW-A|Total"]!.value).toBe(0);
    expect(c.cells["FX-ROW-A|HCT (fixture column)"]!.value).toBe(0);
  });
});

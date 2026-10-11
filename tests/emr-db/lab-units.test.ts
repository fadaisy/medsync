/**
 * Lab Phase 1, Step 5: fixed units, codes and ranges on the PGlite lane (S20–S29 at the data layer).
 * Units are set per component version and never converted; ranges come only from a set signed by the
 * lead and the CSO; every released value keeps its snapshot. Every band and limit here is a FIXTURE,
 * invented for the test. Runs with EMR_PGLITE=1.
 */
import { randomUUID } from "node:crypto";
import type { Lane, Pg } from "./_pglite";
import type { EmrActor } from "@/lib/emr/actor";
import type { WriteCtx } from "@/lib/emr/write/context";
import type { ResultValueInput } from "@/lib/emr/write/results";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { withPatientWrite } from "@/lib/emr/write/context";
import { placeOrders } from "@/lib/emr/write/orders";
import { amendResults, enterResults, releaseResults } from "@/lib/emr/write/results";
import { collectSpecimen, receiveSpecimen } from "@/lib/emr/write/specimens";
import { encrypt, generateKey } from "@/lib/encryption";
import { testsWithoutUnit } from "@/lib/lab/criticals/readiness";
import { saveMeasure, saveRangeDraft, signRangeVersion } from "@/lib/lab/measures-setup";
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

const GLUCOSE_FASTING = "79a7098d-6585-5bff-ab14-3a4a09b3bf68";
const key = () => `k-${randomUUID()}`;
const measure = (over: Partial<Parameters<typeof saveMeasure>[2]["draft"]> = {}) => ({
  resultType: "number" as const,
  unitUcum: "mmol/L",
  unitDisplay: "mmol/L",
  decimalPlaces: 1,
  loincCode: null,
  entryCheckLow: null,
  entryCheckHigh: null,
  ...over,
});
/** FIXTURE bands: adults only, invented numbers. */
const BANDS = [
  {
    sex: "female" as const,
    ageFromDays: 6570,
    ageToDays: null,
    low: "3.0",
    high: "6.0",
    source: "fixture",
  },
  {
    sex: "male" as const,
    ageFromDays: 6570,
    ageToDays: null,
    low: "3.2",
    high: "6.2",
    source: "fixture",
  },
];

describe.skipIf(!laneOn)("Lab Phase 1 units, codes and ranges (S20–S29)", () => {
  let lane: Lane;
  let pg: Pg;
  let h: string;
  let ward: string;
  const a: Record<string, EmrActor> = {};
  const env = { ...process.env };

  const tx = <T>(fn: (t: Parameters<Parameters<Lane["db"]["transaction"]>[0]>[0]) => Promise<T>) =>
    lane.db.transaction(fn);
  const as = <T>(actor: EmrActor, patientId: string, fn: (ctx: WriteCtx) => Promise<T>) =>
    withPatientWrite(actor, patientId, fn, { database: lane.db });
  const snaps = async (reportId: string) =>
    (
      await pg.query<Record<string, unknown>>(
        `SELECT * FROM lab_result_snapshots WHERE report_id = $1`,
        [reportId],
      )
    ).rows;

  /** A received glucose specimen for a patient of the given sex and date of birth (null: no profile). */
  async function received(profile: { sex: string; dob: string } | null) {
    const p = await patient(pg);
    if (profile)
      await pg.query(
        `INSERT INTO public.patient_profiles (id, first_name_encrypted, surname_encrypted, sex, date_of_birth, id_type, phone_encrypted, district_id)
         VALUES ($1, $2, $3, $4, $5, 'none', $6, (SELECT id FROM public.districts LIMIT 1))`,
        [
          p,
          encrypt("Fixture"),
          encrypt("Patient"),
          profile.sex,
          profile.dob,
          encrypt("0700000000"),
        ],
      );
    await intake(pg, { hospitalId: h, patientUserId: p });
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
          { clientKey: key(), testId: GLUCOSE_FASTING, priority: "routine", reasonText: "Check" },
        ],
      }),
    );
    const sp = await as(a.nurse!, p, (ctx) =>
      collectSpecimen(ctx, {
        patientUserId: p,
        orderId: order.id,
        identifiersConfirmed: true,
        fastingState: "fasting",
        fastingHours: 9,
        clientKey: key(),
      }),
    );
    await as(a.lab!, p, (ctx) =>
      receiveSpecimen(ctx, { patientUserId: p, specimenId: sp.id, clientKey: key() }),
    );
    return { p, orderId: order.id };
  }
  const enter = (
    r: { p: string; orderId: string },
    v: Partial<ResultValueInput>,
    status: "preliminary" | "final" = "final",
  ) =>
    as(a.lab!, r.p, (ctx) =>
      enterResults(ctx, {
        patientUserId: r.p,
        orderId: r.orderId,
        status,
        values: [{ conceptId: "obs.glucose", ...v }],
        clientKey: key(),
      }),
    );
  const setMeasure = (over: Partial<ReturnType<typeof measure>> = {}) =>
    tx((t) =>
      saveMeasure(
        t,
        { userId: a.lead!.userId, hospitalId: h },
        { testId: GLUCOSE_FASTING, conceptId: "obs.glucose", draft: measure(over) },
        new Date(),
      ),
    );
  async function signBands(bands = BANDS) {
    const v = await tx((t) =>
      saveRangeDraft(
        t,
        { userId: a.lead!.userId, hospitalId: h },
        { testId: GLUCOSE_FASTING, conceptId: "obs.glucose", bands },
        new Date(),
      ),
    );
    await tx((t) =>
      signRangeVersion(
        t,
        { userId: a.lead2!.userId, hospitalId: h, as: "lead" },
        { versionId: v, exceptionNote: null },
        new Date(),
      ),
    );
    await tx((t) =>
      signRangeVersion(
        t,
        { userId: a.cso!.userId, hospitalId: h, as: "cso" },
        { versionId: v, exceptionNote: null },
        new Date(),
      ),
    );
    return v;
  }

  beforeAll(async () => {
    process.env.MEDSYNC_PHI_KEY ??= generateKey();
    process.env.LAB_WORKSPACE = "1";
    process.env.LAB_UNITS_RANGES = "1";
    lane = await bootLane();
    pg = lane.pg;
    h = await hospital(pg, "Units");
    ward = await department(pg, h, "Ward");
    const lab = await department(pg, h, "Laboratory");
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
            labPermissions: ["lab.receive", "lab.result.enter", "lab.result.release", "lab.manage"],
          }
        : {}),
    });
    a.doctor = await make(ward, "MEDICAL_OFFICER", "doctor");
    a.nurse = await make(ward, "NURSE", "nurse");
    a.lab = await make(lab, "LAB_TECHNOLOGIST", "lab");
    a.lead = await make(lab, "LAB_TECHNOLOGIST", "lab");
    a.lead2 = await make(lab, "LAB_TECHNOLOGIST", "lab");
    a.cso = await make(ward, "CONSULTANT", "doctor");
  }, 300_000);
  afterAll(() => {
    process.env.LAB_WORKSPACE = env.LAB_WORKSPACE;
    process.env.LAB_UNITS_RANGES = env.LAB_UNITS_RANGES;
  });

  it("S20/S29: a test without a unit cannot be resulted, and readiness names it", async () => {
    const r = await received({ sex: "female", dob: "1968-01-01" });
    await expect(enter(r, { value: "5.4" })).rejects.toThrow(/has no unit yet/);
    expect((await testsWithoutUnit(h, new Date(), lane.db)).map((t) => t.id)).toContain(
      GLUCOSE_FASTING,
    );
    await setMeasure();
    expect(await testsWithoutUnit(h, new Date(), lane.db)).toEqual([]);
  });

  it("UN-7: a LOINC code must be in the imported table", async () => {
    await expect(setMeasure({ loincCode: "99999-9" })).rejects.toThrow(/not in the imported table/);
  });

  it("S21: '7,2' is 7.2; more places than allowed is refused with the fix", async () => {
    const r = await received({ sex: "female", dob: "1968-01-01" });
    await expect(enter(r, { value: "7.25" })).rejects.toThrow(/takes 1 decimal place/);
    await expect(enter(r, { value: "<0.1" })).rejects.toThrow(/type a number/);
    const ok = await enter(r, { value: "7,2", unit: "mg/dL" }); // a typed unit is ignored: the catalogue's stands
    const [o] = (
      await pg.query<{ value_num: string; value_unit: string }>(
        `SELECT value_num, value_unit FROM clinical_observations WHERE report_id = $1`,
        [ok.id],
      )
    ).rows;
    expect([Number(o!.value_num), o!.value_unit]).toEqual([7.2, "mmol/L"]);
    expect((await snaps(ok.id))[0]).toMatchObject({
      value_text: "7.2",
      unit_ucum: "mmol/L",
      measure_version: 1,
      range_state: "no_signed_range",
    });
    // D-LAB1-09: with no signed range at all, a typed range is kept, marked unsigned, and flags.
    const typed = await enter(await received({ sex: "female", dob: "1968-01-01" }), {
      value: "7.2",
      referenceRange: { low: 3, high: 6, unit: "mmol/L" },
    });
    expect((await snaps(typed.id))[0]).toMatchObject({
      range_state: "unsigned",
      range_low: "3",
      range_high: "6",
      flag_computed: "high",
    });
  });

  it("S22: outside the entry check asks for a confirm, and the confirm is recorded", async () => {
    await setMeasure({ entryCheckLow: "0.5", entryCheckHigh: "50" });
    const r = await received({ sex: "female", dob: "1968-01-01" });
    await expect(enter(r, { value: "60.0" })).rejects.toThrow(/outside the usual entry range/);
    const ok = await enter(r, { value: "60.0", entryCheckConfirmed: true });
    expect((await snaps(ok.id))[0]).toMatchObject({ entry_check_confirmed_by: a.lab!.userId });
  });

  it("S24: a range signed by the lead alone is not used; after the CSO it is", async () => {
    const v = await tx((t) =>
      saveRangeDraft(
        t,
        { userId: a.lead!.userId, hospitalId: h },
        { testId: GLUCOSE_FASTING, conceptId: "obs.glucose", bands: BANDS },
        new Date(),
      ),
    );
    await tx((t) =>
      signRangeVersion(
        t,
        { userId: a.lead2!.userId, hospitalId: h, as: "lead" },
        { versionId: v, exceptionNote: null },
        new Date(),
      ),
    );
    const before = await enter(await received({ sex: "female", dob: "1968-01-01" }), {
      value: "7.0",
    });
    expect((await snaps(before.id))[0]).toMatchObject({
      range_state: "no_signed_range",
      flag_computed: null,
    });
    await tx((t) =>
      signRangeVersion(
        t,
        { userId: a.cso!.userId, hospitalId: h, as: "cso" },
        { versionId: v, exceptionNote: null },
        new Date(),
      ),
    );
    const after = await enter(await received({ sex: "female", dob: "1968-01-01" }), {
      value: "7.0",
    });
    expect((await snaps(after.id))[0]).toMatchObject({
      range_state: "signed",
      range_low: "3.0",
      range_high: "6.0",
      flag_computed: "high",
      flag_final: "high",
    });
  });

  it("S23: a woman of 58 gets the female band; a girl of 9 none for her age; no profile, only bands needing nothing", async () => {
    const woman = await enter(await received({ sex: "female", dob: "1968-01-01" }), {
      value: "5.0",
    });
    expect((await snaps(woman.id))[0]).toMatchObject({
      range_state: "signed",
      range_low: "3.0",
      flag_computed: "normal",
    });
    const girl = await enter(
      await received({ sex: "female", dob: `${new Date().getFullYear() - 9}-01-01` }),
      { value: "5.0" },
    );
    expect((await snaps(girl.id))[0]).toMatchObject({
      range_state: "no_band_for_age",
      range_low: null,
      flag_computed: null,
    });
    const unknown = await enter(await received(null), { value: "5.0" });
    expect((await snaps(unknown.id))[0]).toMatchObject({
      range_state: "sex_or_age_missing",
      flag_computed: null,
    });
  });

  it("S27: a changed flag keeps the computed flag, the chosen one, the reason and who", async () => {
    const r = await received({ sex: "female", dob: "1968-01-01" });
    await expect(
      enter(r, { value: "7.0", flagChange: { flag: "normal", reason: "  " } }),
    ).rejects.toThrow(/say why/);
    const ok = await enter(r, {
      value: "7.0",
      flagChange: { flag: "normal", reason: "Known chronic, stable" },
    });
    expect((await snaps(ok.id))[0]).toMatchObject({
      flag_computed: "high",
      flag_final: "normal",
      flag_change_reason: "Known chronic, stable",
      flag_changed_by: a.lab!.userId,
    });
    const [o] = (
      await pg.query<{ context: { labInterpretation: string } }>(
        `SELECT context FROM clinical_observations WHERE report_id = $1`,
        [ok.id],
      )
    ).rows;
    expect(o!.context.labInterpretation).toBe("N");
  });

  it("S25 / Law 8: release carries the snapshot; a later signed range does not rewrite it", async () => {
    const r = await received({ sex: "female", dob: "1968-01-01" });
    const prelim = await enter(r, { value: "7.0" }, "preliminary");
    const fin = await as(a.lab!, r.p, (ctx) =>
      releaseResults(ctx, { patientUserId: r.p, reportId: prelim.id, clientKey: key() }),
    );
    const released = (await snaps(fin.id))[0]!;
    expect(released).toMatchObject({ range_low: "3.0", flag_computed: "high" });
    // The range is edited and signed again: the signed version stays in force until then.
    await signBands([{ ...BANDS[0]!, low: "4.0", high: "8.0" }, BANDS[1]!]);
    expect((await snaps(fin.id))[0]).toEqual(released);
    const newer = await enter(await received({ sex: "female", dob: "1968-01-01" }), {
      value: "7.0",
    });
    expect((await snaps(newer.id))[0]).toMatchObject({ range_low: "4.0", flag_computed: "normal" });
  });

  it("S26: a unit change is a new version; old results keep theirs; nothing is converted", async () => {
    const r = await received({ sex: "female", dob: "1968-01-01" });
    const old = await enter(r, { value: "5.0" });
    const change = await setMeasure({ unitUcum: "mg/dL", unitDisplay: "mg/dL", decimalPlaces: 0 });
    expect(change).toMatchObject({ kind: "new_version" });
    const r2 = await received({ sex: "female", dob: "1968-01-01" });
    const now = await enter(r2, { value: "90" });
    expect((await snaps(old.id))[0]).toMatchObject({ unit_ucum: "mmol/L", value_text: "5.0" });
    expect((await snaps(now.id))[0]).toMatchObject({
      unit_ucum: "mg/dL",
      value_text: "90",
      measure_version: 3,
      range_state: "no_signed_range",
    });
    const [o] = (
      await pg.query<{ value_num: string; value_canonical: string | null }>(
        `SELECT value_num, value_canonical FROM clinical_observations WHERE report_id = $1`,
        [now.id],
      )
    ).rows;
    // Stored and shown as entered, in mg/dL; the signed mmol/L range is never applied to it (RR-6).
    // Only decision support's derived canonical column is computed (D-CFC-14).
    expect(Number(o!.value_num)).toBe(90);
    expect(Number(o!.value_canonical)).toBeCloseTo(5, 0);
    await setMeasure(); // back to mmol/L for anyone after
  });

  it("an amendment re-snapshots what it changes and carries the rest", async () => {
    const r = await received({ sex: "female", dob: "1968-01-01" });
    const fin = await enter(r, { value: "7.0" });
    const am = await as(a.lab!, r.p, (ctx) =>
      amendResults(ctx, {
        patientUserId: r.p,
        reportId: fin.id,
        status: "corrected",
        values: [{ conceptId: "obs.glucose", value: "5.5" }],
        reasonText: "Wrong sample",
        clientKey: key(),
      }),
    );
    expect((await snaps(am.id))[0]).toMatchObject({ value_text: "5.5" });
    expect((await snaps(fin.id))[0]).toMatchObject({ value_text: "7.0" });
  });

  it("S28: with the flag off, a result is written as before, with no snapshot (shown as typed)", async () => {
    process.env.LAB_UNITS_RANGES = "";
    try {
      const r = await received({ sex: "female", dob: "1968-01-01" });
      const ok = await enter(r, { value: "7.25", unit: "mmol/L" });
      expect(await snaps(ok.id)).toEqual([]);
    } finally {
      process.env.LAB_UNITS_RANGES = "1";
    }
  });
});

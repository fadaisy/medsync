/**
 * Lab Phase 3, Step 8: bedside quality on the PGlite lane (S33–S37). Every device, lot, level name, range,
 * reading, validity and grace period here is a FIXTURE, never a maker's range or an operational default.
 * Runs with EMR_PGLITE=1.
 */
import { randomUUID } from "node:crypto";
import type { Lane, Pg } from "./_pglite";
import type { EmrActor } from "@/lib/emr/actor";
import type { BedsideInput } from "@/lib/lab/bedside-store";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadResultsToReview } from "@/lib/emr/read/results";
import { withPatientWrite } from "@/lib/emr/write/context";
import { encrypt, generateKey } from "@/lib/encryption";
import {
  deviceStatus,
  grandfatherOperators,
  recordCompetency,
  recordDeviceCheck,
  recordDeviceError,
  setStripLotRanges,
} from "@/lib/lab/bedside-quality-store";
import {
  addLot,
  recordBedsideResult,
  registerDevice,
  setDeviceState,
  setOperator,
} from "@/lib/lab/bedside-store";
import { saveConfigDraft, signConfig } from "@/lib/lab/catalogue-v2";
import { saveMeasure } from "@/lib/lab/measures-setup";
import { addDays, dayOf } from "@/lib/lab/stock";
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

const key = () => `k-${randomUUID()}`;
const CAP = "test.capillary_glucose";
const TODAY = dayOf(new Date(), DEFAULT_TIME_ZONE);
/** FIXTURE level names and ranges (as a vial would print them; invented). */
const L1 = "FX-L1";
const L2 = "FX-L2";
const FX_RANGES = { [L1]: { low: 2.0, high: 3.0 }, [L2]: { low: 15, high: 20 } };
const FX_PASS = { [L1]: 2.5, [L2]: 17 };
const FX_FAIL = { [L1]: 3.6, [L2]: 17 };
/** FIXTURE validity and grace period (the lead signs the real ones). */
const FX_VALID_DAYS = 365;
const FX_GRACE_DAYS = 30;
const FLAGS = [
  "LAB_WORKSPACE",
  "LAB_BEDSIDE",
  "LAB_UNITS_RANGES",
  "LAB_CATALOGUE_V2",
  "LAB_STOCK",
  "LAB_POCT_QUALITY",
];

describe.skipIf(!laneOn)("Lab Phase 3 bedside quality (Step 8)", () => {
  let lane: Lane;
  let pg: Pg;
  let h: string;
  let ward: string;
  const nurse = {} as Record<"a" | "b", EmrActor>;
  let doctor: EmrActor;
  let lead: { userId: string; hospitalId: string };
  let meter: string;
  let meter2: string;
  let lot1: string;
  let lot2: string;
  let lot3: string;
  let p: string;
  let enc: string;
  const env = { ...process.env };
  const tx = <T>(fn: (t: Parameters<Parameters<Lane["db"]["transaction"]>[0]>[0]) => Promise<T>) =>
    lane.db.transaction(fn);
  const as = (n: EmrActor) => ({ userId: n.userId, hospitalId: h });
  const record = (by: EmrActor, o: Partial<BedsideInput> = {}) =>
    withPatientWrite(
      by,
      p,
      (ctx) =>
        recordBedsideResult(ctx, {
          patientUserId: p,
          encounterId: enc,
          testCode: CAP,
          deviceId: meter,
          lotId: lot1,
          wardId: null,
          measuredAt: ctx.now,
          fasting: false,
          values: [{ conceptId: "obs.glucose", value: "6.5" }],
          clientKey: key(),
          ...o,
        }),
      { database: lane.db },
    );
  const check = (
    by: EmrActor,
    observed: Record<string, number>,
    o: { device?: string; lot?: string } = {},
  ) =>
    tx((t) =>
      recordDeviceCheck(
        t,
        as(by),
        {
          deviceId: o.device ?? meter,
          stripLotId: o.lot ?? lot1,
          trigger: "each_day_of_use",
          observed,
          clientKey: key(),
        },
        new Date(),
      ),
    );
  const sign = async (kind: "device_qc_rule" | "competency_validity", payload: unknown) => {
    const id = await tx((t) => saveConfigDraft(t, lead, { kind, key: CAP, payload }, new Date()));
    await tx((t) =>
      signConfig(
        t,
        { ...lead, as: "lead" },
        { configId: id, exceptionNote: "Fixture: one lead here" },
        new Date(),
      ),
    );
  };
  const rule = (requiredBeforeUse: boolean) =>
    sign("device_qc_rule", {
      triggers: ["each_day_of_use", "new_strip_lot", "new_control_vial", "after_incident"],
      levels: [L1, L2],
      requiredBeforeUse,
      source: "Fixture device rule",
    });
  const context = async (reportId: string) =>
    (
      await pg.query<{ context: { bedsideQuality?: Record<string, unknown> } }>(
        `SELECT context FROM clinical_observations WHERE report_id = $1`,
        [reportId],
      )
    ).rows[0]!.context.bedsideQuality;
  const deviceState = async (id: string) =>
    (await pg.query<{ state: string }>(`SELECT state FROM devices WHERE id = $1`, [id])).rows[0]!
      .state;

  beforeAll(async () => {
    process.env.MEDSYNC_PHI_KEY ??= generateKey();
    for (const k of FLAGS) process.env[k] = "1";
    process.env.LAB_STOCK = ""; // Phase 2's "add a lot" runs with stock off (Step 4); switched on below.
    lane = await bootLane();
    pg = lane.pg;
    h = await hospital(pg, "Bedside quality");
    ward = await department(pg, h, "Ward");
    for (const n of ["a", "b"] as const)
      nurse[n] = {
        ...(await clinician(pg, { hospitalId: h, departmentId: ward, cadre: "NURSE" })),
        fullName: null,
        hospitalId: h,
        departmentId: ward,
        cadreCode: "NURSE",
        isClinical: true,
        surface: "nurse",
      };
    doctor = {
      ...(await clinician(pg, { hospitalId: h, departmentId: ward, cadre: "MEDICAL_OFFICER" })),
      fullName: null,
      hospitalId: h,
      departmentId: ward,
      cadreCode: "MEDICAL_OFFICER",
      isClinical: true,
      surface: "doctor",
    };
    lead = {
      userId: (
        await clinician(pg, { hospitalId: h, departmentId: ward, cadre: "LAB_TECHNOLOGIST" })
      ).userId,
      hospitalId: h,
    };
    p = await patient(pg);
    await pg.query(
      `INSERT INTO public.patient_profiles (id, first_name_encrypted, surname_encrypted, sex, date_of_birth, id_type, phone_encrypted, district_id)
       VALUES ($1, $2, $3, 'female', '1980-01-01', 'none', $4, (SELECT id FROM public.districts LIMIT 1))`,
      [p, encrypt("Fixture"), encrypt("Patient"), encrypt("0700000000")],
    );
    await intake(pg, { hospitalId: h, patientUserId: p });
    enc = await encounter(pg, {
      hospitalId: h,
      patientUserId: p,
      clinicianUserId: doctor.userId,
      departmentId: ward,
    });
    await pg.query(
      `INSERT INTO lab_signed_configs (hospital_id, kind, key, version, status, payload, authored_by, lead_signed_by, lead_signed_at,
         cso_signed_by, cso_signed_at, in_force_from)
       VALUES (NULL, 'addendum', 'cfc-1.6.0', 1, 'signed', '{"hash":"${"e".repeat(64)}"}', $1, $1, now(), $2, now(), now())`,
      [lead.userId, doctor.userId],
    );
    const capId = (
      await pg.query<{ id: string }>(
        `SELECT id FROM test_catalogue WHERE code = $1 AND hospital_id IS NULL`,
        [CAP],
      )
    ).rows[0]!.id;
    for (const c of ["obs.glucose", "obs.glucose_fasting"])
      await tx((t) =>
        saveMeasure(
          t,
          lead,
          {
            testId: capId,
            conceptId: c,
            draft: {
              resultType: "number",
              unitUcum: "mmol/L",
              unitDisplay: "mmol/L",
              decimalPlaces: 1,
              loincCode: null,
              entryCheckLow: null,
              entryCheckHigh: null,
            },
          },
          new Date(),
        ),
      );
    const meterWith = async (serial: string, lots: string[]) => {
      const id = await tx((t) =>
        registerDevice(t, lead, {
          kind: "glucometer",
          model: `Fixture meter ${serial}`,
          serial,
          testCode: CAP,
          wardId: null,
        }),
      );
      await tx((t) =>
        setDeviceState(
          t,
          lead,
          { deviceId: id, state: "in_use", note: "Fixture: verified" },
          new Date(),
        ),
      );
      const ids: string[] = [];
      for (const l of lots)
        ids.push(await tx((t) => addLot(t, lead, { deviceId: id, lot: l, useBy: "2099-12-31" })));
      return { id, lots: ids };
    };
    const m1 = await meterWith("FX-1", ["FX-STRIP-1", "FX-STRIP-2"]);
    const m2 = await meterWith("FX-2", ["FX-STRIP-3"]);
    [meter, lot1, lot2, meter2, lot3] = [m1.id, m1.lots[0]!, m1.lots[1]!, m2.id, m2.lots[0]!];
    process.env.LAB_STOCK = "1";
    await tx((t) => setOperator(t, lead, { userId: nurse.a.userId, granted: true }, new Date()));
    await rule(false);
    await sign("competency_validity", {
      methods: ["training", "observed_test", "known_value_sample"],
      validDays: FX_VALID_DAYS,
      graceDays: FX_GRACE_DAYS,
      source: "Fixture validity",
    });
    for (const l of [lot1, lot3])
      await tx((t) => setStripLotRanges(t, lead, { lotId: l, ranges: FX_RANGES }));
  }, 300_000);
  afterAll(() => {
    for (const k of FLAGS) process.env[k] = env[k];
  });

  let graceCheck: string;

  it("S36 (switch-on), BQ-4: with no assessment the operator is refused; the grace period lets existing operators record", async () => {
    await expect(record(nurse.a)).rejects.toThrow(
      /You have no assessment for .*Ask the laboratory for an assessment/,
    );
    await expect(check(nurse.a, FX_PASS)).rejects.toThrow(/no assessment/);
    expect(await tx((t) => grandfatherOperators(t, lead, { testCode: CAP }, new Date()))).toBe(1);
    // Once: switch-on again adds nobody.
    expect(await tx((t) => grandfatherOperators(t, lead, { testCode: CAP }, new Date()))).toBe(0);
    const row = (
      await pg.query<Record<string, unknown>>(
        `SELECT grandfathered, assessor, valid_to::text FROM lab_competencies WHERE user_id = $1`,
        [nurse.a.userId],
      )
    ).rows[0];
    expect(row).toEqual({
      grandfathered: true,
      assessor: null,
      valid_to: addDays(TODAY, FX_GRACE_DAYS),
    });
  });

  it("S35, BQ-1: a new strip lot requires a check before the next patient result", async () => {
    // FX-STRIP-1 has never been checked on this meter: refused even in inform mode.
    await expect(record(nurse.a)).rejects.toThrow(
      /A control check is needed before the next patient result/,
    );
  });

  it("S33, BQ-1, BQ-2: a check within the strip lot's ranges passes; a failed check blocks the meter until a check passes", async () => {
    // Ranges come from the lot, never from the operator: the stored check names the lot's ranges.
    const ok = await check(nurse.a, FX_PASS);
    expect(ok.outcome).toBe("pass");
    graceCheck = ok.id;
    const stored = (
      await pg.query<{ controls: unknown; subject: string; lot_id: string }>(
        `SELECT controls, subject, lot_id FROM lab_control_checks WHERE id = $1`,
        [ok.id],
      )
    ).rows[0]!;
    expect(stored).toMatchObject({ subject: "device", lot_id: lot1 });
    expect(stored.controls).toEqual([
      { name: L1, expected: FX_RANGES[L1], observed: 2.5, pass: true, controlLotId: null },
      { name: L2, expected: FX_RANGES[L2], observed: 17, pass: true, controlLotId: null },
    ]);
    expect(await deviceState(meter)).toBe("in_use");
    const r1 = await record(nurse.a);
    expect(r1.id).toBeTruthy();

    const bad = await check(nurse.a, FX_FAIL);
    expect(bad.outcome).toBe("fail");
    expect(await deviceState(meter)).toBe("blocked");
    // Server refusal at selection and at recordBedsideResult (the form never offers a blocked meter).
    await expect(record(nurse.a)).rejects.toThrow(
      /Fixture meter FX-1 failed its control check at \d\d:\d\d\. It cannot be used until a check passes\./,
    );
    const s = await tx((t) =>
      deviceStatus(
        t,
        h,
        { userId: nurse.a.userId, devices: [{ id: meter, testCode: CAP }] },
        new Date(),
      ),
    );
    expect(s.get(meter)!.lastFailAt).toBeInstanceOf(Date);

    const again = await check(nurse.a, FX_PASS);
    expect(again.outcome).toBe("pass");
    graceCheck = again.id;
    expect(await deviceState(meter)).toBe("in_use");
    await expect(record(nurse.a)).resolves.toBeTruthy();
  });

  it("S35 (continued): the next strip lot needs its ranges from the lab and a check of its own", async () => {
    await expect(record(nurse.a, { lotId: lot2 })).rejects.toThrow(/control check is needed/);
    await expect(check(nurse.a, FX_PASS, { lot: lot2 })).rejects.toThrow(
      /has not entered the accepted ranges for strip lot FX-STRIP-2/,
    );
    await tx((t) => setStripLotRanges(t, lead, { lotId: lot2, ranges: FX_RANGES }));
    await expect(
      tx((t) => setStripLotRanges(t, lead, { lotId: lot2, ranges: FX_RANGES })),
    ).rejects.toThrow(/already entered/);
    expect((await check(nurse.a, FX_PASS, { lot: lot2 })).outcome).toBe("pass");
    await expect(record(nurse.a, { lotId: lot2 })).resolves.toBeTruthy();
    // A drop recorded by the operator: a check is due before the next result.
    await tx((t) =>
      recordDeviceError(
        t,
        as(nurse.a),
        { deviceId: meter, kind: "drop", note: null, clientKey: key() },
        new Date(),
      ),
    );
    await expect(record(nurse.a, { lotId: lot2 })).rejects.toThrow(/control check is needed/);
    expect((await check(nurse.a, FX_PASS, { lot: lot2 })).outcome).toBe("pass");
    await expect(record(nurse.a, { lotId: lot2 })).resolves.toBeTruthy();
  });

  it("S37, BQ-5: a bedside result snapshots the device-check status and the operator's competency", async () => {
    const r = await record(nurse.a);
    expect(await context(r.id)).toEqual({
      deviceCheck: "passed",
      competency: "grace",
      checkId: expect.any(String),
    });
  });

  it('S34, BQ-3: no check today — the form and the result say "Control check not done today" (inform); the rule can require it', async () => {
    // Meter 2's strip lot passed yesterday (owner insert, the lane's way to place a check in the past).
    await pg.query(
      `INSERT INTO lab_control_checks (hospital_id, subject, item_id, lot_id, device_id, trigger, controls, outcome, operator, at)
       SELECT $1, 'device', item_id, id, $2, 'each_day_of_use', '[]', 'pass', $3, now() - interval '1 day'
         FROM lab_stock_lots WHERE id = $4`,
      [h, meter2, nurse.a.userId, lot3],
    );
    const s = await tx((t) =>
      deviceStatus(
        t,
        h,
        { userId: nurse.a.userId, devices: [{ id: meter2, testCode: CAP }] },
        new Date(),
      ),
    );
    expect(s.get(meter2)!.due).toEqual(["each_day_of_use"]);
    const r = await record(nurse.a, { deviceId: meter2, lotId: lot3 });
    // The last passing check (yesterday's) is named; the status says today's is not done.
    expect(await context(r.id)).toEqual({
      deviceCheck: "not_done",
      competency: "grace",
      checkId: expect.any(String),
    });
    const review = await loadResultsToReview(doctor, { database: lane.db });
    const v = review.find((i) => i.reportId === r.id)!.values[0]!;
    expect(v.labNote).toContain("Control check not done today.");
    // The lead's rule says "required before use": now refused until today's check.
    await rule(true);
    await expect(record(nurse.a, { deviceId: meter2, lotId: lot3 })).rejects.toThrow(
      /control check is needed/,
    );
    expect((await check(nurse.a, FX_PASS, { device: meter2, lot: lot3 })).outcome).toBe("pass");
    await expect(record(nurse.a, { deviceId: meter2, lotId: lot3 })).resolves.toBeTruthy();
  });

  it("S36, BQ-4: a nurse whose glucose competency has lapsed cannot record bedside glucose; reassessment restores it", async () => {
    await tx((t) => setOperator(t, lead, { userId: nurse.b.userId, granted: true }, new Date()));
    // Assessed long ago (fixture): valid to = assessed on + the signed validity, now past.
    const long = addDays(TODAY, -(FX_VALID_DAYS + 35));
    await tx((t) =>
      recordCompetency(
        t,
        lead,
        { userId: nurse.b.userId, testCode: CAP, assessedOn: long, method: ["observed_test"] },
        new Date(),
      ),
    );
    await expect(record(nurse.b)).rejects.toThrow(
      new RegExp(
        `Your assessment for .* lapsed on \\d\\d [A-Z]{3} \\d{4}\\. Ask the laboratory for reassessment\\.`,
      ),
    );
    await expect(check(nurse.b, FX_PASS)).rejects.toThrow(/lapsed on/);
    await tx((t) =>
      recordCompetency(
        t,
        lead,
        {
          userId: nurse.b.userId,
          testCode: CAP,
          assessedOn: TODAY,
          method: ["training", "observed_test", "known_value_sample"],
        },
        new Date(),
      ),
    );
    const r = await record(nurse.b);
    expect(await context(r.id)).toMatchObject({ deviceCheck: "passed", competency: "valid" });
    expect(graceCheck).toBeTruthy();
  });
});

/**
 * Lab Phase 2, Step 8: bedside tests on the PGlite lane (S46–S53). Every device, lot, scheme and value is a
 * FIXTURE. Runs with EMR_PGLITE=1.
 */
import { randomUUID } from "node:crypto";
import type { Lane, Pg } from "./_pglite";
import type { EmrActor } from "@/lib/emr/actor";
import type { BedsideInput } from "@/lib/lab/bedside-store";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { withPatientWrite } from "@/lib/emr/write/context";
import { encrypt, generateKey } from "@/lib/encryption";
import { addLot, recordBedsideResult, registerDevice, setDeviceState, setOperator } from "@/lib/lab/bedside-store";
import { saveMeasure } from "@/lib/lab/measures-setup";
import { bootLane, clinician, department, encounter, hospital, intake, laneOn, patient } from "./_pglite";

const key = () => `k-${randomUUID()}`;
const CAP_GLUCOSE_CODE = "test.capillary_glucose";

describe.skipIf(!laneOn)("Lab Phase 2 bedside (Step 8)", () => {
  let lane: Lane;
  let pg: Pg;
  let h: string;
  let ward: string;
  let nurse: EmrActor;
  let lead: { userId: string; hospitalId: string };
  let meter: string;
  let lot: string;
  let p: string;
  let enc: string;
  const env = { ...process.env };
  const tx = <T>(fn: (t: Parameters<Parameters<Lane["db"]["transaction"]>[0]>[0]) => Promise<T>) => lane.db.transaction(fn);
  const record = (o: Partial<BedsideInput> = {}) =>
    withPatientWrite(
      nurse,
      p,
      (ctx) =>
        recordBedsideResult(ctx, {
          patientUserId: p,
          encounterId: enc,
          testCode: CAP_GLUCOSE_CODE,
          deviceId: meter,
          lotId: lot,
          wardId: null,
          measuredAt: new Date(Date.now() - 60_000),
          fasting: true,
          values: [{ conceptId: "obs.glucose", value: "6.5" }],
          clientKey: key(),
          ...o,
        }),
      { database: lane.db },
    );

  beforeAll(async () => {
    process.env.MEDSYNC_PHI_KEY ??= generateKey();
    for (const k of ["LAB_WORKSPACE", "LAB_BEDSIDE", "LAB_UNITS_RANGES", "LAB_CATALOGUE_V2"]) process.env[k] = "1";
    lane = await bootLane();
    pg = lane.pg;
    h = await hospital(pg, "Bedside");
    ward = await department(pg, h, "Ward");
    nurse = {
      ...(await clinician(pg, { hospitalId: h, departmentId: ward, cadre: "NURSE" })),
      fullName: null,
      hospitalId: h,
      departmentId: ward,
      cadreCode: "NURSE",
      isClinical: true,
      surface: "nurse",
    };
    const doc = await clinician(pg, { hospitalId: h, departmentId: ward, cadre: "MEDICAL_OFFICER" });
    lead = { userId: (await clinician(pg, { hospitalId: h, departmentId: ward, cadre: "LAB_TECHNOLOGIST" })).userId, hospitalId: h };
    p = await patient(pg);
    await pg.query(
      `INSERT INTO public.patient_profiles (id, first_name_encrypted, surname_encrypted, sex, date_of_birth, id_type, phone_encrypted, district_id)
       VALUES ($1, $2, $3, 'female', '1980-01-01', 'none', $4, (SELECT id FROM public.districts LIMIT 1))`,
      [p, encrypt("Fixture"), encrypt("Patient"), encrypt("0700000000")],
    );
    await intake(pg, { hospitalId: h, patientUserId: p });
    enc = await encounter(pg, { hospitalId: h, patientUserId: p, clinicianUserId: doc.userId, departmentId: ward });
    // The addendum signed (fixture people) so the v2 lists apply: capillary glucose takes fasting glucose.
    await pg.query(
      `INSERT INTO lab_signed_configs (hospital_id, kind, key, version, status, payload, authored_by, lead_signed_by, lead_signed_at,
         cso_signed_by, cso_signed_at, in_force_from)
       VALUES (NULL, 'addendum', 'cfc-1.6.0', 1, 'signed', '{"hash":"${"e".repeat(64)}"}', $1, $1, now(), $2, now(), now())`,
      [lead.userId, doc.userId],
    );
    const capId = (await pg.query<{ id: string }>(`SELECT id FROM test_catalogue WHERE code = $1 AND hospital_id IS NULL`, [CAP_GLUCOSE_CODE])).rows[0]!.id;
    for (const c of ["obs.glucose", "obs.glucose_fasting"])
      await tx((t) =>
        saveMeasure(t, lead, {
          testId: capId,
          conceptId: c,
          draft: { resultType: "number", unitUcum: "mmol/L", unitDisplay: "mmol/L", decimalPlaces: 1, loincCode: null, entryCheckLow: null, entryCheckHigh: null },
        }, new Date()),
      );
    meter = await tx((t) => registerDevice(t, lead, { kind: "glucometer", model: "Fixture meter", serial: "FX-9", testCode: CAP_GLUCOSE_CODE, wardId: null }));
    lot = await tx((t) => addLot(t, lead, { deviceId: meter, lot: "FX-LOT-1", useBy: "2099-12-31" }));
  }, 300_000);
  afterAll(() => {
    for (const k of ["LAB_WORKSPACE", "LAB_BEDSIDE", "LAB_UNITS_RANGES", "LAB_CATALOGUE_V2"]) process.env[k] = env[k];
  });

  it("S48, PC-10: a device not verified yet cannot be used; an operator must be granted", async () => {
    await expect(record()).rejects.toThrow(/not verified yet/);
    await tx((t) => setDeviceState(t, lead, { deviceId: meter, state: "in_use", note: "Fixture: checked against the lab analyser" }, new Date()));
    await expect(record()).rejects.toThrow(/granted bedside testing/);
    await tx((t) => setOperator(t, lead, { userId: nurse.userId, granted: true }, new Date()));
  });

  it("S46, PC-1, PC-7, PC-8: a fasting bedside glucose is released with device, lot and operator, as fasting glucose, with no diagnostic category", async () => {
    const r = await record();
    const rep = await pg.query<Record<string, unknown>>(
      `SELECT d.device_id, d.lot_id, d.status, d.entered_by_user_id, o.intent_source FROM diagnostic_reports d JOIN encounter_orders o ON o.id = d.order_id WHERE d.id = $1`,
      [r.id],
    );
    expect(rep.rows[0]).toMatchObject({ device_id: meter, lot_id: lot, status: "final", entered_by_user_id: nurse.userId, intent_source: "bedside" });
    const obs = await pg.query<{ concept_id: string; value_num: string }>(`SELECT concept_id, value_num FROM clinical_observations WHERE report_id = $1`, [r.id]);
    expect(obs.rows[0]).toMatchObject({ concept_id: "obs.glucose_fasting" });
    const snap = await pg.query<{ interpretation: { category: unknown; basis: string } }>(`SELECT interpretation FROM lab_result_snapshots WHERE report_id = $1`, [r.id]);
    expect(snap.rows[0]!.interpretation).toMatchObject({ basis: "reference", category: null });
  });

  it("S49, PC-6: the meter's HI is an answer, never a number", async () => {
    const r = await record({ values: [{ conceptId: "obs.glucose", code: "above_range" }] });
    const obs = await pg.query(`SELECT value_type, value_code, value_num FROM clinical_observations WHERE report_id = $1`, [r.id]);
    expect(obs.rows[0]).toEqual({ value_type: "coded", value_code: "above_range", value_num: null });
  });

  it("S47, PC-3: an expired lot is refused on the server", async () => {
    const old = await tx((t) => addLot(t, lead, { deviceId: meter, lot: "FX-OLD", useBy: "2020-01-01" }));
    await expect(record({ lotId: old })).rejects.toThrow(/use-by date/);
  });

  it("S53, PC-4: never in the future; more than a day back needs a reason", async () => {
    await expect(record({ measuredAt: new Date(Date.now() + 3_600_000) })).rejects.toThrow(/future/);
    await expect(record({ measuredAt: new Date(Date.now() - 30 * 3_600_000) })).rejects.toThrow(/more than a day/);
    await expect(record({ measuredAt: new Date(Date.now() - 30 * 3_600_000), lateReason: "Fixture: power cut" })).resolves.toMatchObject({ id: expect.any(String) });
  });

  it("PC-2: a device registered for another test is refused", async () => {
    const strip = await tx((t) => registerDevice(t, lead, { kind: "rdt_kit", model: "Fixture RDT", serial: null, testCode: "test.malaria_rdt", wardId: null }));
    await tx((t) => setDeviceState(t, lead, { deviceId: strip, state: "in_use", note: "Fixture: lot QC done" }, new Date()));
    const rdtLot = await tx((t) => addLot(t, lead, { deviceId: strip, lot: "RDT-1", useBy: "2099-01-01" }));
    await expect(record({ deviceId: strip, lotId: rdtLot })).rejects.toThrow(/another test/);
    // S50: the RDT itself records its coded answer; a positive is the abnormal answer of the signed set.
    const r = await record({
      testCode: "test.malaria_rdt",
      deviceId: strip,
      lotId: rdtLot,
      fasting: undefined,
      values: [{ conceptId: "obs.malaria_test", code: "positive" }],
    });
    const obs = await pg.query(`SELECT concept_id, value_code FROM clinical_observations WHERE report_id = $1`, [r.id]);
    expect(obs.rows[0]).toEqual({ concept_id: "obs.malaria_test", value_code: "positive" });
  });
});

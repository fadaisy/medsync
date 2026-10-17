/**
 * The lab demo loader on the PGlite lane (Lab Phase 5, owner request; A19, 0157). A demo hospital only; patients
 * labelled "Demo patient NN"; every stage of the worklist; results through the normal entry and release path at the
 * middle of the hospital's own signed range (a FIXTURE range here, 50 to 100). Runs with EMR_PGLITE=1.
 */
import type { Lane, Pg } from "./_pglite";
import type { EmrActor } from "@/lib/emr/actor";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateKey } from "@/lib/encryption";
import { loadLabDemoDay, midValue, stageOf } from "@/lib/lab/demo";
import { saveMeasure } from "@/lib/lab/measures-setup";
import { bootLane, clinician, department, hospital, laneOn, patient } from "./_pglite";

const FLAGS = ["LAB_WORKSPACE", "LAB_UNITS_RANGES"];

describe("the demo loader's pure parts", () => {
  it("stages cover the worklist, and a value is the middle of the signed range", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(stageOf)).toEqual([
      "ordered",
      "ordered",
      "collected",
      "collected",
      "received",
      "received",
      "preliminary",
      "final",
    ]);
    expect(midValue(50, 100, 0)).toBe("75");
    expect(midValue(3.5, 5.1, 1)).toBe("4.3");
    expect(midValue(null, 5, 1)).toBeNull();
  });
});

describe.skipIf(!laneOn)("Lab demo loader (A19)", () => {
  let lane: Lane;
  let pg: Pg;
  let h: string;
  let real: string;
  let lab: EmrActor;
  const env = { ...process.env };
  const one = async <T = Record<string, unknown>>(q: string, params: unknown[] = []) =>
    (await pg.query<T>(q, params)).rows[0] as T;
  const deps = { makePatientUser: () => patient(pg) };

  beforeAll(async () => {
    process.env.MEDSYNC_PHI_KEY ??= generateKey();
    for (const k of FLAGS) process.env[k] = "1";
    lane = await bootLane();
    pg = lane.pg;
    h = await hospital(pg, "Demo");
    real = await hospital(pg, "Real");
    const ward = await department(pg, h, "Ward");
    const labDept = await department(pg, h, "Laboratory");
    await pg.query(`UPDATE hospital_departments SET catalogue_code = 'LABORATORY' WHERE id = $1`, [
      labDept,
    ]);
    await clinician(pg, { hospitalId: h, departmentId: ward, cadre: "MEDICAL_OFFICER" });
    const tech = await clinician(pg, {
      hospitalId: h,
      departmentId: labDept,
      cadre: "LAB_TECHNOLOGIST",
    });
    lab = {
      ...tech,
      fullName: null,
      hospitalId: h,
      departmentId: labDept,
      cadreCode: "LAB_TECHNOLOGIST",
      isClinical: true,
      surface: "lab",
      labPermissions: [
        "lab.view",
        "lab.receive",
        "lab.result.enter",
        "lab.result.release",
        "lab.manage",
      ],
    };
    const test = (
      await one<{ id: string }>(
        `SELECT id FROM test_catalogue WHERE code = 'test.creatinine' AND hospital_id IS NULL`,
      )
    ).id;
    await lane.db.transaction((t) =>
      saveMeasure(
        t,
        { userId: lab.userId, hospitalId: h },
        {
          testId: test,
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
    const v = await one<{ id: string }>(
      `INSERT INTO reference_range_versions (hospital_id, test_id, concept_id, unit_ucum, version, authored_by)
       VALUES ($1, $2, 'obs.creatinine', 'umol/L', 1, $3) RETURNING id`,
      [h, test, lab.userId],
    );
    await pg.query(
      `INSERT INTO reference_range_bands (version_id, sex, low, high, source) VALUES ($1, 'any', 50, 100, 'fixture')`,
      [v.id],
    );
    const cso = await patient(pg);
    await pg.query(
      `UPDATE reference_range_versions SET status = 'signed', lead_signed_by = $2, lead_signed_at = now(),
         cso_signed_by = $3, cso_signed_at = now(), in_force_from = now() - interval '1 day' WHERE id = $1`,
      [v.id, lab.userId, cso],
    );
  }, 300_000);
  afterAll(() => {
    for (const k of FLAGS) process.env[k] = env[k];
  });

  it("refuses a hospital that is not marked as a demo hospital", async () => {
    await expect(loadLabDemoDay(lane.db, lab, deps)).rejects.toThrow(/not a demo hospital/);
  });

  it("loads a labelled day across every stage, with results at the middle of the signed range", async () => {
    await pg.query(
      `INSERT INTO lab_demo_hospitals (hospital_id, marked_by, note) VALUES ($1, $2, 'Lane demo')`,
      [h, lab.userId],
    );
    const { loadId, counts } = await loadLabDemoDay(lane.db, lab, deps);
    expect(counts).toMatchObject({ patients: 8, orders: 8, specimens: 6, results: 2, released: 1 });
    const labels = await pg.query<{ label: string }>(
      `SELECT label FROM lab_demo_patients WHERE load_id = $1 ORDER BY label`,
      [loadId],
    );
    expect(labels.rows.map((r) => r.label)).toEqual(
      Array.from({ length: 8 }, (_, i) => `Demo patient ${String(i + 1).padStart(2, "0")}`),
    );
    const released = await pg.query<{ v: string }>(
      `SELECT o.value_num::text AS v FROM diagnostic_reports r JOIN clinical_observations o ON o.report_id = r.id
        JOIN lab_demo_patients d ON d.patient_user_id = r.patient_user_id AND d.load_id = $1
       WHERE r.status = 'final'`,
      [loadId],
    );
    expect(released.rows.map((r) => Number(r.v))).toEqual([75]);
    expect(
      (
        await one<{ finished: boolean }>(
          `SELECT finished_at IS NOT NULL AS finished FROM lab_demo_loads WHERE id = $1`,
          [loadId],
        )
      ).finished,
    ).toBe(true);
  });

  it("a real hospital can never hold demo rows", async () => {
    await expect(
      pg.query(
        `INSERT INTO lab_demo_loads (hospital_id, started_by, scenario) VALUES ($1, $2, 'lab_day')`,
        [real, lab.userId],
      ),
    ).rejects.toThrow(/foreign key/);
  });
});

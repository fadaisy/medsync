/**
 * The lab demo loader on the PGlite lane (owner requests 17 and 18 Oct 2026; A19, 0157, 0158). A demo hospital only;
 * one load fills every lab page through the real stores, with demo staff signing in the demo hospital and ranges from
 * the catalogue research. Runs with EMR_PGLITE=1.
 */
import type { Lane, Pg } from "./_pglite";
import type { EmrActor } from "@/lib/emr/actor";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateKey } from "@/lib/encryption";
import { bandValue, loadLabDemo, midValue, stageOf } from "@/lib/lab/demo";
import { bootLane, clinician, department, hospital, laneOn, patient } from "./_pglite";

const FLAGS = [
  "LAB_WORKSPACE",
  "LAB_UNITS_RANGES",
  "LAB_CRITICALS",
  "LAB_DOWNTIME",
  "LAB_CATALOGUE_V2",
  "LAB_ONE_MENU",
  "LAB_HIGH_RISK",
  "LAB_BENCH",
  "LAB_BEDSIDE",
  "LAB_STOCK",
  "LAB_EQUIPMENT",
  "LAB_QC",
  "LAB_QC_HOLD",
  "LAB_EQA",
  "LAB_POCT_QUALITY",
  "LAB_REPORTS",
  "LAB_HMIS",
  "LAB_REFERRAL",
  "LAB_DELTA_CHECKS",
  "IPC_LAB_FEED",
  "PATIENT_RESULTS",
];

describe("the demo loader's pure parts", () => {
  it("stages cover the worklist; values sit inside or beyond the signed band as asked", () => {
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
    expect(midValue(null, 5, 1)).toBeNull();
    expect(bandValue(50, 100, 0.5, 0)).toBe("75");
    expect(bandValue(50, 100, 3, 0)).toBe("200");
  });
});

describe.skipIf(!laneOn)("Lab demo loader: every page (A19)", () => {
  let lane: Lane;
  let pg: Pg;
  let h: string;
  let real: string;
  let lab: EmrActor;
  const env = { ...process.env };
  const one = async <T = Record<string, unknown>>(q: string, params: unknown[] = []) =>
    (await pg.query<T>(q, params)).rows[0] as T;
  const deps = { makePatientUser: () => patient(pg) };
  const count = async (table: string) =>
    (
      await one<{ n: number }>(`SELECT count(*)::int AS n FROM ${table} WHERE hospital_id = $1`, [
        h,
      ])
    ).n;

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
    await pg.query(
      `INSERT INTO department_heads (hospital_id, department_id, user_id, acting) VALUES ($1, $2, $3, false)`,
      [h, labDept, tech.userId],
    );
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
        "lab.refer",
        "lab.refer.result",
      ],
    };
  }, 300_000);
  afterAll(() => {
    for (const k of FLAGS) process.env[k] = env[k];
  });

  it("refuses a hospital that is not marked as a demo hospital", async () => {
    await expect(loadLabDemo(lane.db, lab, deps)).rejects.toThrow(/not a demo hospital/);
  });

  it("fills every lab page in one load", async () => {
    await pg.query(
      `INSERT INTO lab_demo_hospitals (hospital_id, marked_by, note) VALUES ($1, $2, 'Lane demo')`,
      [h, lab.userId],
    );
    const { loadId, counts, notes } = await loadLabDemo(lane.db, lab, deps);
    process.stderr.write(
      `demo counts ${JSON.stringify(counts)}\ndemo notes ${JSON.stringify(notes)}\n`,
    );
    expect(notes).toEqual({});
    expect(counts["units filled"]).toBeGreaterThan(20);
    expect(counts["ranges signed"]).toBeGreaterThan(10);
    expect(await count("reference_range_versions")).toBeGreaterThan(10);
    expect(await count("critical_alerts")).toBe(2);
    expect(await count("delta_flags")).toBeGreaterThan(0);
    expect(await count("ipc_alerts")).toBeGreaterThan(0);
    expect(await count("lab_referrals")).toBeGreaterThan(0);
    expect(await count("lab_qc_runs")).toBeGreaterThan(15);
    expect(await count("lab_nonconformities")).toBeGreaterThan(0);
    expect(await count("lab_stock_lots")).toBeGreaterThan(2);
    expect(await count("lab_eqa_rounds")).toBe(1);
    expect(await count("downtime_periods")).toBe(1);
    const labels = await pg.query<{ label: string }>(
      `SELECT label FROM lab_demo_patients WHERE load_id = $1`,
      [loadId],
    );
    expect(labels.rows.every((r) => r.label.startsWith("Demo patient "))).toBe(true);
    // Demo signatures are distinct people, and none of them is a superadmin.
    const supers = await one<{ n: number }>(
      `SELECT count(*)::int AS n FROM user_roles r JOIN users u ON u.id = r.user_id WHERE r.role = 'superadmin' AND u.full_name LIKE 'Demo %'`,
    );
    expect(supers.n).toBe(0);
  }, 600_000);

  it("a real hospital can never hold demo rows", async () => {
    await expect(
      pg.query(
        `INSERT INTO lab_demo_loads (hospital_id, started_by, scenario) VALUES ($1, $2, 'lab_day')`,
        [real, lab.userId],
      ),
    ).rejects.toThrow(/foreign key/);
  });
});

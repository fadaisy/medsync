/**
 * The pharmacy demo loader on the PGlite lane (owner request 26 Oct 2026; ADR 0450, 0250). A demo hospital only; one
 * load fills every pharmacy page through the real stores, then each page's own loader reads it back as a demo
 * pharmacist. Runs with EMR_PGLITE=1.
 */
import type { Lane, Pg } from "./_pglite";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { generateKey } from "@/lib/encryption";
import { bootLane, hospital, laneOn, superadmin } from "./_pglite";

vi.mock("server-only", () => ({}));
const held = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/db", () => ({
  get db() {
    return held.db;
  },
}));

const FLAGS = [
  "PHARMACY_WORKSPACE",
  "PHARMACY_DISPENSING",
  "PHARMACY_STOCK_ANSWER",
  "PHARMACY_PATIENT_LIST",
  "PHARMACY_DOWNTIME",
  "PHARMACY_STORE",
  "PHARMACY_WARD_STOCK",
  "PHARMACY_CARTS",
  "PHARMACY_RECALL",
  "PHARMACY_MONTH_END",
  "PHARMACY_ORDERING",
  "PHARMACY_INTERACTIONS",
  "PHARMACY_INTERVENTION_REVIEW",
  "PHARMACY_STEWARDSHIP",
  "PHARMACY_REACTIONS",
  "PHARMACY_RECONCILIATION",
  "PHARMACY_REPEATS",
  "PHARMACY_REFILLS",
];

describe.skipIf(!laneOn)("Pharmacy demo loader: every page (ADR 0450)", () => {
  let lane: Lane;
  let pg: Pg;
  let h: string;
  let real: string;
  let admin: string;
  let realHead: string;
  let result: Awaited<ReturnType<typeof import("@/lib/pharmacy/demo").loadPharmacyDemo>>;
  const one = async <T = Record<string, unknown>>(q: string, params: unknown[] = []) =>
    (await pg.query<T>(q, params)).rows[0] as T;
  // As in the app: an account with an `.invalid` address (the auth mirror copies it to public.users).
  const deps = {
    makeUser: async () =>
      (
        await one<{ id: string }>(
          `INSERT INTO auth.users (email) VALUES ('pharmacy-demo-' || gen_random_uuid() || '@demo.medsync.invalid')
           RETURNING id`,
        )
      ).id,
  };
  const pointOf = async (name: string) =>
    (await one<{ id: string }>(`SELECT id FROM hospital_departments WHERE hospital_id = $1 AND name = $2`, [h, name])).id;
  const pharmacistAt = async (point: string) =>
    (
      await one<{ id: string }>(
        `SELECT a.user_id AS id FROM staff_affiliations a JOIN cadres c ON c.id = a.cadre_id
          WHERE a.hospital_id = $1 AND a.department_id = $2 AND c.code = 'PHARMACIST' LIMIT 1`,
        [h, point],
      )
    ).id;

  beforeAll(async () => {
    process.env.MEDSYNC_PHI_KEY ??= generateKey();
    for (const k of FLAGS) process.env[k] = "1";
    lane = await bootLane();
    pg = lane.pg;
    held.db = lane.db;
    h = await hospital(pg, "Demo national referral");
    real = await hospital(pg, "Real");
    const sa = await superadmin(pg);
    admin = sa;
    await pg.query(`INSERT INTO lab_demo_hospitals (hospital_id, marked_by, note) VALUES ($1, $2, 'Demo sandbox')`, [h, sa]);
    // As at Test Hospital-1 (27 Oct): the pharmacy already exists with a real head, which the demo must not displace.
    const pharm = await one<{ id: string }>(
      `INSERT INTO hospital_departments (hospital_id, name, slug, kind, catalogue_code)
       VALUES ($1, 'Pharmacy', 'pharmacy', 'support', 'PHARMACY') RETURNING id`,
      [h],
    );
    realHead = (await one<{ id: string }>(`INSERT INTO auth.users (email) VALUES ('real-head@example.org') RETURNING id`)).id;
    await pg.query(`INSERT INTO department_heads (hospital_id, department_id, user_id, acting) VALUES ($1, $2, $3, false)`, [
      h,
      pharm.id,
      realHead,
    ]);
    const { loadPharmacyDemo } = await import("@/lib/pharmacy/demo");
    result = await loadPharmacyDemo(lane.db, { userId: admin, hospitalId: h }, deps);
  }, 900_000);

  it("refuses a hospital that is not a demo hospital", async () => {
    const { loadPharmacyDemo } = await import("@/lib/pharmacy/demo");
    await expect(loadPharmacyDemo(lane.db, { userId: admin, hospitalId: real }, deps)).rejects.toThrow(/not a demo hospital/);
  });

  it("loads with no section failing", () => {
    expect(result.notes).toEqual({});
    expect(result.counts.patients).toBe(60);
    expect(result.counts.products).toBeGreaterThan(50);
  });

  it("keeps the real pharmacy head (the demo chief takes the acting slot) and refuses a second load", async () => {
    const heads = await pg.query<{ user_id: string; acting: boolean }>(
      `SELECT h.user_id, h.acting FROM department_heads h JOIN hospital_departments d ON d.id = h.department_id
        WHERE d.hospital_id = $1 AND d.catalogue_code = 'PHARMACY' AND h.ends_at IS NULL ORDER BY h.acting`,
      [h],
    );
    expect(heads.rows).toHaveLength(2);
    expect(heads.rows[0]).toMatchObject({ user_id: realHead, acting: false });
    const { loadPharmacyDemo } = await import("@/lib/pharmacy/demo");
    await expect(loadPharmacyDemo(lane.db, { userId: admin, hospitalId: h }, deps)).rejects.toThrow(/already loaded/);
  });

  it("every demo patient is recorded against the load and named Demo", async () => {
    const r = await one<{ n: number }>(`SELECT count(*)::int AS n FROM pharmacy_demo_patients WHERE load_id = $1 AND label LIKE 'Demo patient %'`, [result.loadId]);
    expect(r.n).toBe(60);
  });

  it("stock: the main outpatient pharmacy's shelf, counted, with one medicine out", async () => {
    const { getStockPage } = await import("@/lib/pharmacy/stock/read");
    const point = await pointOf("Main outpatient pharmacy");
    const page = await getStockPage({ userId: await pharmacistAt(point), hospitalId: h }, { id: point }, new Date(), lane.db);
    expect(page.rows.length).toBeGreaterThan(30);
    expect(page.rows.some((r) => JSON.stringify(r).includes("artemether_lumefantrine"))).toBe(true);
  });
});

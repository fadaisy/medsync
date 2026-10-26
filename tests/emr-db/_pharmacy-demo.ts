/**
 * Shared boot for the pharmacy demo's section tests (ADR 0450): the PGlite lane with every pharmacy flag on, a demo
 * hospital (marked in lab_demo_hospitals) and a real one, then the demo's setup and stock. A section test then runs its
 * own section on the returned state and reads its pages back. The calling file must mock "server-only" and "@/db"
 * (see pharmacy-demo.test.ts) and set `held.db = lane.db` from what this returns.
 */
import type { Lane, Pg } from "./_pglite";
import type { DemoState } from "@/lib/pharmacy/demo/state";

import { generateKey } from "@/lib/encryption";
import { bootLane, hospital, superadmin } from "./_pglite";

export const PHARMACY_FLAGS = [
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

export type DemoLane = { lane: Lane; pg: Pg; h: string; real: string; admin: string; s: DemoState };

/** Boots the lane and runs setup and stock. `onDb` runs before any app code, to point the "@/db" mock at the lane. */
export async function demoLane(onDb: (db: unknown) => void): Promise<DemoLane> {
  process.env.MEDSYNC_PHI_KEY ??= generateKey();
  for (const k of PHARMACY_FLAGS) process.env[k] = "1";
  const lane = await bootLane();
  const pg = lane.pg;
  onDb(lane.db);
  const h = await hospital(pg, "Demo national referral");
  const real = await hospital(pg, "Real");
  const admin = await superadmin(pg);
  await pg.query(`INSERT INTO lab_demo_hospitals (hospital_id, marked_by, note) VALUES ($1, $2, 'Demo sandbox')`, [h, admin]);
  const deps = {
    makeUser: async () =>
      (
        await pg.query<{ id: string }>(
          `INSERT INTO auth.users (email) VALUES ('pharmacy-demo-' || gen_random_uuid() || '@demo.medsync.invalid') RETURNING id`,
        )
      ).rows[0]!.id,
  };
  const { startDemo } = await import("@/lib/pharmacy/demo");
  const { setup } = await import("@/lib/pharmacy/demo/setup");
  const { stockSection } = await import("@/lib/pharmacy/demo/stock");
  const s = await startDemo(lane.db, { userId: admin, hospitalId: h }, deps);
  await setup(s);
  await stockSection(s);
  return { lane, pg, h, real, admin, s };
}

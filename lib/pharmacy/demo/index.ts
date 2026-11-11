import "server-only";

import type { DemoDeps, DemoState } from "./state";
import type { EmrDb } from "@/lib/emr/db";
import { sql } from "drizzle-orm";

import { EmrWriteError } from "@/lib/emr/write/context";
import { isDemoHospital } from "@/lib/lab/demo";
import { demoMedicines } from "./medicines";
import { SECTIONS } from "./sections";
import { setup } from "./setup";
import { one, q } from "./state";
import { stockSection } from "./stock";

/**
 * The pharmacy demo loader (owner request, 26 Oct 2026; ADR 0450, migration 0250). Only in a hospital a superadmin
 * marked as a demo hospital (`lab_demo_hospitals`). One press fills every pharmacy page with a national referral
 * hospital's day: setup and stock first, then the sections in `SECTIONS`, each on its own. A section that fails is
 * recorded on the load and the rest carry on; nothing is rolled back (pharmacy records are append-only). The admin
 * removes the whole demo in one go (`removePharmacyDemo`, migration 0260).
 */

export { isDemoHospital };

/** A new load at a demo hospital: its row and the empty state the sections fill. */
export async function startDemo(
  db: EmrDb,
  admin: { userId: string; hospitalId: string },
  deps: DemoDeps,
  now = new Date(),
): Promise<DemoState> {
  const h = admin.hospitalId;
  demoFrozenInProduction();
  if (!(await isDemoHospital(db, h)))
    throw new EmrWriteError(
      "forbidden",
      "This hospital is not a demo hospital. Demo data goes only into a demo hospital.",
    );
  // One load per hospital: a second one meets the first one's stock and registers. A load that stopped at setup wrote
  // nothing past its departments and people, and a removed one left nothing (0260), so neither counts. `to_jsonb`
  // reads removed_at without failing before 0260 is applied.
  if (
    (
      await q(
        { db },
        sql`SELECT 1 FROM pharmacy_demo_loads l WHERE hospital_id = ${h} AND finished_at IS NOT NULL
      AND NOT (notes ? 'setup') AND to_jsonb(l) ->> 'removed_at' IS NULL LIMIT 1`,
      )
    ).length
  )
    throw new EmrWriteError(
      "conflict",
      "The pharmacy demo is already loaded in this hospital. It loads once.",
    );
  const [district] = await q<{ id: string }>({ db }, sql`SELECT id FROM districts LIMIT 1`);
  const load = await one<{ id: string }>(
    { db },
    sql`INSERT INTO pharmacy_demo_loads (hospital_id, started_by, scenario)
      VALUES (${h}, ${admin.userId}, 'national_referral_day') RETURNING id`,
  );
  const s: DemoState = {
    db,
    h,
    now,
    loadId: load.id,
    deps,
    district: district?.id ?? null,
    people: {
      admin: admin.userId,
      chief: "",
      cso: "",
      author: "",
      pharmacists: [],
      techs: [],
      doctors: [],
      nurses: [],
      storekeeper: "",
    },
    pharmacyDept: "",
    points: {} as DemoState["points"],
    clinics: {} as DemoState["clinics"],
    wards: {} as DemoState["wards"],
    patients: [],
    medicines: demoMedicines(),
    stock: new Map(),
    cadreNames: {},
    counts: {},
    notes: {},
  };
  return s;
}

export async function loadPharmacyDemo(
  db: EmrDb,
  admin: { userId: string; hospitalId: string },
  deps: DemoDeps,
  now = new Date(),
): Promise<{ loadId: string; counts: Record<string, number>; notes: Record<string, string> }> {
  const s = await startDemo(db, admin, deps, now);
  const step = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      s.notes[name] = (e instanceof Error ? e.message : String(e)).slice(0, 300);
    }
  };
  // Setup is the ground every section stands on: if it fails, stop there.
  await step("setup", () => setup(s));
  if (!s.notes.setup) {
    await step("stock", () => stockSection(s));
    for (const [name, fn] of SECTIONS) await step(name, () => fn(s));
  }
  const error = Object.keys(s.notes).length
    ? Object.entries(s.notes)
        .map(([k, v]) => `${k}: ${v}`)
        .join(" · ")
        .slice(0, 1000)
    : null;
  await db.execute(sql`UPDATE pharmacy_demo_loads SET finished_at = now(), counts = ${JSON.stringify(s.counts)}::jsonb,
      notes = ${JSON.stringify(s.notes)}::jsonb, error = ${error} WHERE id = ${s.loadId}`);
  return { loadId: s.loadId, counts: s.counts, notes: s.notes };
}

/** The "demo hospital" band: a demo hospital with a lab or pharmacy demo still loaded (not removed). */
export async function demoDataLoaded(db: EmrDb, hospitalId: string) {
  try {
    const rows = await q<{ ok: number }>(
      { db },
      sql`SELECT 1 AS ok FROM lab_demo_hospitals h WHERE h.hospital_id = ${hospitalId}
        AND (EXISTS (SELECT 1 FROM pharmacy_demo_loads l WHERE l.hospital_id = h.hospital_id AND l.removed_at IS NULL)
          OR EXISTS (SELECT 1 FROM lab_demo_loads l WHERE l.hospital_id = h.hospital_id AND l.removed_at IS NULL))`,
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}

/** The loads at this hospital, newest first, for the demo page. */
export async function pharmacyDemoLoads(db: EmrDb, hospitalId: string) {
  return q<{
    id: string;
    startedAt: string;
    finishedAt: string | null;
    removedAt: string | null;
    counts: Record<string, number>;
    notes: Record<string, string>;
  }>(
    { db },
    sql`SELECT id, started_at AS "startedAt", finished_at AS "finishedAt", to_jsonb(l) ->> 'removed_at' AS "removedAt",
        counts, notes FROM pharmacy_demo_loads l
      WHERE hospital_id = ${hospitalId} ORDER BY started_at DESC LIMIT 20`,
  );
}

/** What a removal would delete here, by kind; null until migration 0260 is applied. */
export async function pharmacyDemoFootprint(db: EmrDb, hospitalId: string, actorId: string) {
  try {
    return await runRemove(db, hospitalId, actorId, true);
  } catch {
    return null;
  }
}

/**
 * Removes every demo row in this demo hospital in one transaction (owner request 28 Oct 2026; migration 0260): the
 * demo patients and staff, every record naming them or hanging off their records, and the places the demo made that
 * nothing real uses. A real record pointing at demo data stops it all. Returns what went, by kind.
 */
export async function removePharmacyDemo(db: EmrDb, hospitalId: string, actorId: string) {
  demoFrozenInProduction();
  return runRemove(db, hospitalId, actorId, false);
}

/** Rework S14 (C3): the demo code is frozen; demos run in a separate project, never in the production database. */
function demoFrozenInProduction(env = process.env.VERCEL_ENV) {
  if (env === "production")
    throw new EmrWriteError(
      "forbidden",
      "Demos run in the separate demo project, not in the live database.",
    );
}

/** The app's 30s statement cap (db/index.ts) is too short for the whole demo; this transaction gets five minutes. */
function runRemove(db: EmrDb, hospitalId: string, actorId: string, dryRun: boolean) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL statement_timeout = '290s'`);
    return (
      await one<{ r: Record<string, number> }>(
        { db: tx as unknown as EmrDb },
        sql`SELECT public.pharmacy_demo_remove(${hospitalId}, ${actorId}, ${dryRun}) AS r`,
      )
    ).r;
  });
}

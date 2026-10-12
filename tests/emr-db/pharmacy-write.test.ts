/**
 * Pharmacy Phase 1: the shared write path (lib/pharmacy/write.ts, PA2-4) and the acting points
 * (lib/pharmacy/points.ts, D-PH1-45) on the PGlite lane.
 */
import type { Lane, Pg } from "./_pglite";
import type { PharmacyActor } from "@/lib/pharmacy/write";
import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { PHARMACY_MAP_V2, pharmacyDispensingAccess } from "@/lib/pharmacy/access";
import { actingPoint, pharmacyPointsFor } from "@/lib/pharmacy/points";
import { databaseRefusal, withPharmacyWrite } from "@/lib/pharmacy/write";
import { bootLane, hospital, laneOn, staff } from "./_pglite";

const id = async (pg: Pg, q: string, p?: unknown[]) =>
  (await pg.query<{ id: string }>(q, p)).rows[0]!.id;

describe.skipIf(!laneOn)("the pharmacy write path (PA2-4, D-PH1-45)", () => {
  let lane: Lane;
  let pg: Pg;
  const f = {} as Record<string, string>;
  const actor = (
    userId: string,
    cadre: string,
    pointId: string | null,
    hospitalId = f.h!,
  ): PharmacyActor => ({
    userId,
    hospitalId,
    cadreCode: cadre,
    cadreName: cadre,
    pointId,
    access: pharmacyDispensingAccess(cadre, PHARMACY_MAP_V2),
  });

  beforeAll(async () => {
    lane = await bootLane();
    pg = lane.pg;
    f.h = await hospital(pg, "Write path");
    f.h2 = await hospital(pg, "Other");
    f.pharmacy = await id(
      pg,
      `INSERT INTO public.hospital_departments (hospital_id, name, slug, kind, catalogue_code)
       VALUES ($1, 'Pharmacy', $2, 'support', 'PHARMACY') RETURNING id`,
      [f.h, `ph-${Date.now()}`],
    );
    for (const [k, name, live] of [
      ["live", "Outpatient pharmacy", true],
      ["dark", "Inpatient pharmacy", false],
    ] as const) {
      f[k] = await id(
        pg,
        `INSERT INTO public.hospital_departments (hospital_id, parent_id, name, slug, kind)
         VALUES ($1, $2, $3, $4, 'support') RETURNING id`,
        [f.h, f.pharmacy, name, `${k}-${Date.now()}`],
      );
      await pg.query(
        `INSERT INTO public.pharmacy_dispensing_points (department_id, hospital_id, serves, live_at)
         VALUES ($1, $2, 'window', $3)`,
        [f[k], f.h, live ? new Date() : null],
      );
    }
    f.pharmacist = (
      await staff(pg, { hospitalId: f.h!, departmentId: f.pharmacy!, cadre: "PHARMACIST" })
    ).userId;
    f.tech = (
      await staff(pg, { hospitalId: f.h!, departmentId: f.live!, cadre: "PHARMACY_TECH" })
    ).userId;
  }, 120_000);

  const run = (a: PharmacyActor, need: Parameters<typeof withPharmacyWrite>[1]) =>
    withPharmacyWrite(
      a,
      need,
      async (ctx) => ({ point: ctx.point?.name ?? null, manages: ctx.manages }),
      {
        database: lane.db,
      },
    ).catch((e: Error) => e.message);

  it("D-PH1-45: an affiliation on the Pharmacy department acts at every point; one on a point, at that point", async () => {
    const all = await pharmacyPointsFor(lane.db, f.pharmacist!, f.h!);
    expect(all.map((p) => p.name)).toEqual(["Inpatient pharmacy", "Outpatient pharmacy"]);
    const own = await pharmacyPointsFor(lane.db, f.tech!, f.h!);
    expect(own.map((p) => p.id)).toEqual([f.live]);
    expect(actingPoint(all, f.live)?.id).toBe(f.live);
    expect(actingPoint(own, f.dark)?.id).toBe(f.live); // a point they cannot act at falls back
  });

  it("PA2-4: a live point passes a live action; a point never live refuses it", async () => {
    expect(
      await run(actor(f.pharmacist!, "PHARMACIST", f.live!), {
        permission: "pharmacy.review",
        point: "live",
      }),
    ).toEqual({
      point: "Outpatient pharmacy",
      manages: false,
    });
    expect(
      await run(actor(f.pharmacist!, "PHARMACIST", f.dark!), {
        permission: "pharmacy.review",
        point: "live",
      }),
    ).toMatch(/not live for dispensing/);
    expect(
      await run(actor(f.pharmacist!, "PHARMACIST", f.dark!), {
        permission: "pharmacy.stock",
        point: "setup",
      }),
    ).toEqual({ point: "Inpatient pharmacy", manages: false });
  });

  it("PA2-4: a point of another hospital, or no point chosen, is refused", async () => {
    expect(
      await run(actor(f.pharmacist!, "PHARMACIST", f.live!, f.h2!), {
        permission: "pharmacy.view",
        point: "setup",
      }),
    ).toMatch(/not at your hospital/);
    expect(
      await run(actor(f.pharmacist!, "PHARMACIST", null), {
        permission: "pharmacy.view",
        point: "setup",
      }),
    ).toMatch(/Choose the dispensing point/);
  });

  it("PA2-2: a technician holds no review; manage comes only from a hub head assignment (PA2-3)", async () => {
    expect(
      await run(actor(f.tech!, "PHARMACY_TECH", f.live!), {
        permission: "pharmacy.review",
        point: "live",
      }),
    ).toMatch(/do not have permission/);
    expect(
      await run(actor(f.tech!, "PHARMACY_TECH", f.live!), {
        permission: "pharmacy.manage",
        point: "none",
      }),
    ).toMatch(/do not have permission/);
    let asHead: unknown = "not run";
    await lane.db
      .transaction(async (tx) => {
        await tx.execute(
          sql`INSERT INTO public.department_heads (hospital_id, department_id, user_id, starts_at)
              VALUES (${f.h}, ${f.live}, ${f.tech}, now() - interval '1 day')`,
        );
        asHead = await withPharmacyWrite(
          actor(f.tech!, "PHARMACY_TECH", f.live!),
          { permission: "pharmacy.manage", point: "none" },
          async (ctx) => ctx.manages,
          { database: tx as unknown as typeof lane.db },
        ).catch((e: Error) => e.message);
        tx.rollback();
      })
      .catch(() => undefined); // the rollback throws by design
    expect(asHead).toBe(true);
  });

  it("turns the database's own refusals into words (0124, 0126)", () => {
    expect(databaseRefusal(new Error("pharmacy_stock: batch FX-001 holds 3"))).toBe(
      "Batch FX-001 now holds 3. Choose again.",
    );
    expect(databaseRefusal(new Error("pharmacy_stock: batch FX-002 expired on 2020-01-01"))).toBe(
      "Batch FX-002 expired on 2020-01-01. Remove it from the shelf.",
    );
    expect(
      databaseRefusal({
        cause: new Error("supply x has 0 supplied movements; exactly one is required (Law 3)"),
      }),
    ).toMatch(/did not match/);
    expect(databaseRefusal(new Error("something else"))).toBeNull();
  });
});

/**
 * Pharmacy Phase 0, Step 5 (§5.8, DP-1..DP-4): migration 0121 and the dispensing-point reads on the
 * PGlite lane, every migration replayed. The table is client-closed (RLS, no policy); the loaders
 * read it server-side; the hub's capability values are worked out from the points (DP-2); a viewer's
 * point picks their lane (DP-4).
 */
import type { Lane, Pg } from "./_pglite";
import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  loadDispensingServes,
  loadPointsForCapability,
  servesOf,
} from "@/lib/pharmacy/dispensing-points";
import { authUser, bootLane, department, hospital, laneOn, probe, staff } from "./_pglite";

vi.mock("server-only", () => ({}));
const held = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/db", () => ({
  get db() {
    return held.db;
  },
}));

describe.skipIf(!laneOn)("0121 — dispensing points", () => {
  let lane: Lane;
  let pg: Pg;
  let h: string;
  let outpatient: string;
  let inpatient: string;
  let closed: string;

  const unit = async (parent: string, name: string, hours: string | null) =>
    (
      await pg.query<{ id: string }>(
        `INSERT INTO public.hospital_departments (hospital_id, parent_id, name, slug, kind, service_hours)
         VALUES ($1, $2, $3, $4, 'support', $5) RETURNING id`,
        [h, parent, name, name.toLowerCase().replace(/\W+/g, "-"), hours],
      )
    ).rows[0]!.id;

  beforeAll(async () => {
    lane = await bootLane();
    pg = lane.pg;
    held.db = lane.db;
    h = await hospital(pg, "Points");
    const pharmacy = (
      await pg.query<{ id: string }>(
        `INSERT INTO public.hospital_departments (hospital_id, name, slug, kind, catalogue_code)
         VALUES ($1, 'Pharmacy', 'pharmacy', 'support', 'PHARMACY') RETURNING id`,
        [h],
      )
    ).rows[0]!.id;
    outpatient = await unit(pharmacy, "Outpatient pharmacy", "Mon to Fri, 08:00–17:00");
    inpatient = await unit(pharmacy, "Inpatient pharmacy", "24 hours");
    closed = await unit(pharmacy, "Old store", "24 hours");
    await pg.query(`UPDATE public.hospital_departments SET archived_at = now() WHERE id = $1`, [
      closed,
    ]);
    for (const [id, serves] of [
      [outpatient, "window"],
      [inpatient, "wards"],
      [closed, "all"],
    ])
      await pg.query(
        `INSERT INTO public.pharmacy_dispensing_points (department_id, hospital_id, serves) VALUES ($1, $2, $3)`,
        [id, h, serves],
      );
  }, 120_000);

  it("DP-1: what each point serves, read server-side", async () => {
    expect(await loadDispensingServes(h, lane.db)).toEqual({
      [outpatient]: "window",
      [inpatient]: "wards",
      [closed]: "all",
    });
  });

  it("DP-2: the inputs for the derived values, archived points marked", async () => {
    const points = await loadPointsForCapability(h, lane.db);
    expect(points).toHaveLength(3);
    expect(points.filter((p) => p.archived)).toHaveLength(1);
  });

  it("DP-4: a viewer's live point picks their lane; an archived one does not", async () => {
    expect(await servesOf(h, outpatient, lane.db)).toBe("window");
    expect(await servesOf(h, inpatient, lane.db)).toBe("wards");
    expect(await servesOf(h, closed, lane.db)).toBeNull();
  });

  it("serves takes only the four values", async () => {
    const other = await department(pg, h, "Elsewhere");
    await expect(
      pg.query(
        `INSERT INTO public.pharmacy_dispensing_points (department_id, hospital_id, serves) VALUES ($1, $2, 'stock')`,
        [other, h],
      ),
    ).rejects.toThrow();
  });

  it("no client reads or writes the table (RLS on, no policy)", async () => {
    const pharmacist = await staff(pg, {
      hospitalId: h,
      departmentId: outpatient,
      cadre: "PHARMACIST",
    });
    const admin = await authUser(pg, "hospital-admin");
    await pg.query(
      `INSERT INTO public.user_roles (user_id, role, hospital_id) VALUES ($1, 'hospital_admin', $2)`,
      [admin, h],
    );
    for (const userId of [pharmacist.userId, admin]) {
      const me = { userId, role: "authenticated" as const };
      const read = await probe(
        pg,
        me,
        `SELECT count(*)::int AS n FROM public.pharmacy_dispensing_points`,
      );
      expect(read.ok && read.rows[0]!.n).toBe(0);
      const upd = await probe(
        pg,
        me,
        `UPDATE public.pharmacy_dispensing_points SET serves = 'all'`,
      );
      expect(upd.ok ? upd.affected : 0).toBe(0);
    }
  });
});

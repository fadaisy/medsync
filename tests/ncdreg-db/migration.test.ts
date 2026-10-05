/**
 * P2 gate: 0093 applies cleanly from an empty database (after every earlier migration), re-runs to a
 * no-op, and its generated blocks equal what lib/ncdreg renders. PGlite lane only (EMR_PGLITE=1).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Lane } from "../emr-db/_pglite";
import { beforeAll, describe, expect, it } from "vitest";

import { generatedMigrationBlocks, MIGRATION_0093, readBlock } from "@/lib/ncdreg/migration-blocks";
import { TABLE_ACCESS } from "@/lib/ncdreg/table-access";
import { bootLane, laneOn, readMigration } from "../emr-db/_pglite";

describe("0093 generated blocks match lib/ncdreg", () => {
  const sql = readFileSync(resolve(__dirname, "../..", MIGRATION_0093), "utf8");
  for (const [name, body] of Object.entries(generatedMigrationBlocks()))
    it(`${name} block is current (npm run ncdreg:policies)`, () =>
      expect(readBlock(sql, name)).toBe(body));
});

describe.skipIf(!laneOn)("0093 on the PGlite lane", () => {
  let lane: Lane;
  beforeAll(async () => {
    lane = await bootLane();
  }, 120_000);

  it("applied after every earlier migration", () => {
    expect(lane.applied.at(-1)).toBe("0093_ncd_registry.sql");
  });

  it("re-runs to a no-op", async () => {
    await lane.pg.exec(readMigration("0093_ncd_registry.sql"));
    const { rows } = await lane.pg.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM public.ncd_capability_grant",
    );
    expect(rows[0]?.n).toBeGreaterThan(50);
  });

  it("every NCD table has RLS enabled and forced, and every table in the access map exists", async () => {
    const { rows } = await lane.pg.query<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
       WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' AND relname LIKE 'ncd\\_%'`,
    );
    const byName = new Map(rows.map((r) => [r.relname, r]));
    for (const t of Object.keys(TABLE_ACCESS)) {
      expect(byName.get(t)?.relrowsecurity, t).toBe(true);
      expect(byName.get(t)?.relforcerowsecurity, t).toBe(true);
    }
    for (const r of rows) expect(r.relrowsecurity, r.relname).toBe(true);
  });

  it("every NCD table except the capability map and the counter carries facility_id", async () => {
    const { rows } = await lane.pg.query<{ table_name: string }>(
      `SELECT t.table_name FROM information_schema.tables t
       WHERE t.table_schema = 'public' AND t.table_name LIKE 'ncd\\_%'
         AND NOT EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema = 'public'
                         AND c.table_name = t.table_name AND c.column_name = 'facility_id')`,
    );
    expect(rows.map((r) => r.table_name)).toEqual(["ncd_capability_grant"]);
  });

  it("the app roles cannot bypass row-level security", async () => {
    const { rows } = await lane.pg.query<{ rolname: string; rolbypassrls: boolean }>(
      "SELECT rolname, rolbypassrls FROM pg_roles WHERE rolname IN ('medsync_ncd_app','medsync_ncd_analytics') ORDER BY 1",
    );
    expect(rows).toEqual([
      { rolname: "medsync_ncd_analytics", rolbypassrls: false },
      { rolname: "medsync_ncd_app", rolbypassrls: false },
    ]);
  });
});

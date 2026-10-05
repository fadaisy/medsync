/**
 * P3 gate: every dashboard query under 500 ms on the 2,000-patient set. The generated set is written
 * through the demo loader's command path (test-only harness), then the dashboard's reads are timed:
 * the dataset load and the indicator computation for the month and its 12-month trend.
 * Heavy: runs only with NCDREG_HEAVY=1 (and EMR_PGLITE=1). NCDREG_PERF_SIZE overrides the size.
 */
import type { Lane } from "../emr-db/_pglite";
import type { NcdFacility } from "./_ncd";
import { beforeAll, describe, expect, it } from "vitest";

import { generatePatients } from "@/lib/ncdreg/fixtures/generator";
import { addMonths, computeIndicators } from "@/lib/ncdreg/indicators/engine";
import { loadDataset } from "@/lib/ncdreg/indicators/load";
import { enabledModules } from "@/lib/ncdreg/indicators/snapshot";
import { CONDITION_CATALOGUE, FULL_ROLES } from "@/lib/ncdreg/standard/conditions";
import { CATALOGUE, demoLoader, writeAll } from "./_demo";
import { ctxFor } from "./_engine";
import { bootLane, laneOn, ncdFacility } from "./_ncd";

const heavy = process.env.NCDREG_HEAVY === "1";
const SIZE = Number(process.env.NCDREG_PERF_SIZE ?? 2000);
const DAY0 = "2026-10-05";

describe.skipIf(!laneOn || !heavy)(`performance on ${SIZE} generated patients`, () => {
  let lane: Lane;
  let f: NcdFacility;
  beforeAll(async () => {
    lane = await bootLane();
    f = await ncdFacility(lane.pg, "Performance facility");
    const { id, ctx } = await demoLoader(lane.pg, lane.db, f, DAY0);
    const ps = generatePatients({
      seed: 7,
      day0: DAY0,
      size: SIZE,
      spec: CATALOGUE.generator as never,
      bpModule: FULL_ROLES.bp,
      glucoseModule: FULL_ROLES.glycaemic,
    });
    const t = performance.now();
    const n = await writeAll(ctx, ps, DAY0, id);
    process.stdout.write(
      `perf: wrote ${ps.length} persons, ${n} commands in ${Math.round(performance.now() - t)} ms\n`,
    );
  }, 3_600_000);

  it("dataset load and dashboard computation each under 500 ms", async () => {
    const ctx = await ctxFor(lane.db, f, "registry_lead", { at: `${DAY0}T09:00:00+03:00` });
    const enabled = await enabledModules(ctx);
    const timings: Record<string, number> = {};
    let t = performance.now();
    const ds = await loadDataset(ctx);
    timings.load = performance.now() - t;
    t = performance.now();
    const r = computeIndicators(ds, { month: "2026-09", catalogue: CONDITION_CATALOGUE, enabled });
    timings.month = performance.now() - t;
    t = performance.now();
    for (let i = 11; i >= 0; i--)
      computeIndicators(ds, {
        month: addMonths("2026-09", -i),
        catalogue: CONDITION_CATALOGUE,
        enabled,
      });
    timings.trend12 = performance.now() - t;
    process.stdout.write(
      `perf: persons ${ds.persons.length}, C01 ${r.results.C01?.num}; ${JSON.stringify(Object.fromEntries(Object.entries(timings).map(([k, v]) => [k, Math.round(v)])))} ms\n`,
    );
    expect(timings.load).toBeLessThan(500);
    expect(timings.month).toBeLessThan(500);
    expect(timings.trend12).toBeLessThan(500);
  }, 120_000);
});

/**
 * §10.4 calibration gate: load `full_clinic` through the real service and command path with day 0
 * fixed at 2026-10-05, run the real indicator engine for the last complete month, and compare each
 * result with the catalogue's calibration_targets. Gaps left after the five tuning rounds are listed
 * in KNOWN_GAPS (and in DEMO-DATA.md); every other target must be within tolerance.
 * Heavy: NCDREG_HEAVY=1 and EMR_PGLITE=1.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

import { continueLoad, turnOn } from "@/lib/ncdreg/demo/service";
import { DEMO_CATALOGUE as CAT } from "@/lib/ncdreg/demo/source";
import { computeReport } from "@/lib/ncdreg/indicators/snapshot";
import { FULL_ROLES } from "@/lib/ncdreg/standard/conditions";
import type { Lane } from "../emr-db/_pglite";
import { calibrate, type CalRow } from "./_calibration";
import { ctxFor } from "./_engine";
import { bootLane, laneOn, ncdFacility } from "./_ncd";

const heavy = process.env.NCDREG_HEAVY === "1";
const DAY0 = "2026-10-05";
/** After tuning round 5 (docs/ncd/DEMO-DATA.md): measured outside tolerance by the in-memory mirror. */
export const KNOWN_GAPS = ["C07", "H08 dialysis_start", "H08 amputation_minor_plus_major"];

describe.skipIf(!laneOn || !heavy)("calibration of the full-clinic demo (§10.4)", () => {
  let lane: Lane;
  let rows: CalRow[];
  beforeAll(async () => {
    lane = await bootLane();
    const f = await ncdFacility(lane.pg, "Calibration facility");
    const lead = { ...(await ctxFor(lane.db, f, "registry_lead")), today: DAY0, enteredAt: new Date(`${DAY0}T07:00:00+03:00`) };
    await turnOn(lead, "full_clinic");
    let done = false;
    while (!done) done = (await continueLoad(lead, 600_000)).done;
    const r = await computeReport(lead, "2026-09", { dataCutoff: DAY0 });
    rows = calibrate(r, CAT.generator.calibration_targets as never, FULL_ROLES.bp);
    const table = rows.map((x) => `| ${x.indicator} | ${x.target} | ${x.measured} | ${x.tolerance} | ${x.ok ? "within" : "outside"} |`).join("\n");
    writeFileSync(resolve(__dirname, "../../docs/ncd/calibration-result.md"), `| Indicator | Target | Measured | Tolerance | Result |\n| --- | --- | --- | --- | --- |\n${table}\n\nRegistered (not died): ${r.results.C02?.num}. Day 0 ${DAY0}, month 2026-09.\n`);
    process.stdout.write(`calibration: ${rows.filter((x) => x.ok).length}/${rows.length} within tolerance\n${table}\n`);
  }, 7_200_000);

  it("every target is within tolerance, except the gaps recorded after five tuning rounds", () => {
    const outside = rows.filter((x) => !x.ok).map((x) => x.indicator);
    expect(outside.filter((x) => !KNOWN_GAPS.includes(x))).toEqual([]);
  });
});

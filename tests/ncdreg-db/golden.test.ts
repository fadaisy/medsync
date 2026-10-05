/**
 * P3 gate: the golden dataset. ~60 hand-designed patients are written through the commands, the real
 * loader and engine compute 2026-09, and every indicator must equal its hand-written expectation —
 * numbers and the patients behind them. Never edit an expected value to make this pass: walk the
 * patient list and decide which side is wrong (§6). Plus the sum checks and G04 = C04–C06, C07–C11.
 */
import type { Lane } from "../emr-db/_pglite";
import type { NcdFacility } from "./_ncd";
import type { IndicatorReport } from "@/lib/ncdreg/indicators/engine";
import { beforeAll, describe, expect, it } from "vitest";

import { computeIndicators } from "@/lib/ncdreg/indicators/engine";
import { loadDataset } from "@/lib/ncdreg/indicators/load";
import { CONDITION_CATALOGUE, moduleByCode } from "@/lib/ncdreg/standard/conditions";
import { ctxFor, enableModule } from "./_engine";
import { bootLane, laneOn, ncdFacility } from "./_ncd";
import { EXPECTED } from "./golden/expected";
import { writeGolden } from "./golden/harness";
import { PATIENTS } from "./golden/patients";

const ENABLED = new Set(["diabetes", "hypertension", "asthma", "chronic_kidney_disease"]);

describe.skipIf(!laneOn)("golden dataset (2026-09)", () => {
  let lane: Lane;
  let f: NcdFacility;
  let report: IndicatorReport;
  let label: Map<string, string>;

  beforeAll(async () => {
    lane = await bootLane();
    f = await ncdFacility(lane.pg, "Golden facility");
    for (const c of ["asthma", "chronic_kidney_disease"])
      await enableModule((s, p) => lane.pg.query(s, p), f.facilityId, moduleByCode.get(c)!);
    const clinician = await ctxFor(lane.db, f, "registry_lead");
    const officer = await ctxFor(lane.db, f, "registry_officer");
    const idOf = await writeGolden(PATIENTS, { clinician, officer });
    label = new Map([...idOf].map(([k, v]) => [v, k]));
    const ds = await loadDataset(
      await ctxFor(lane.db, f, "registry_lead", { at: "2026-10-05T09:00:00+03:00" }),
    );
    report = computeIndicators(ds, {
      month: "2026-09",
      catalogue: CONDITION_CATALOGUE,
      enabled: ENABLED,
    });
  }, 600_000);

  const names = (ids: readonly string[] = []) => ids.map((i) => label.get(i) ?? i).sort();

  for (const [key, want] of Object.entries(EXPECTED)) {
    it(`${key}`, () => {
      const got = report.results[key];
      expect(got, `${key} missing from the report`).toBeDefined();
      if (want.num !== undefined) expect(got!.num, `${key} num`).toBe(want.num);
      if (want.den !== undefined) expect(got!.den, `${key} den`).toBe(want.den);
      if (want.parts) expect(got!.parts, `${key} parts`).toEqual(want.parts);
      for (const [k, who] of Object.entries(want.who))
        expect(names(got!.ids[k]), `${key} who.${k}`).toEqual([...who].sort());
    });
  }

  it("C04–C06 and not recorded sum to their denominator; C07–C11 likewise", () => {
    const r = report.results;
    const ht =
      ["C04", "C05", "C06"].reduce((a, k) => a + r[k]!.num!, 0) +
      r["not_recorded.hypertension"]!.num!;
    expect(ht).toBe(r.C04!.den);
    const dm =
      ["C07", "C08", "C09", "C10", "C11"].reduce((a, k) => a + r[k]!.num!, 0) +
      r["not_recorded.diabetes"]!.num!;
    expect(dm).toBe(r.C07!.den);
  });

  it("every G04 sums to its denominator; G04 equals C04–C06 and C07–C11 exactly", () => {
    const r = report.results;
    for (const c of ENABLED) {
      const g = r[`G04.${c}`]!;
      expect(Object.values(g.parts!).reduce((a, b) => a + b, 0)).toBe(g.den);
    }
    const ht = r["G04.hypertension"]!.parts!;
    expect([ht.in_range, ht.not_in_range, ht.no_visit, ht.not_recorded]).toEqual([
      r.C04!.num,
      r.C05!.num,
      r.C06!.num,
      r["not_recorded.hypertension"]!.num,
    ]);
    const dm = r["G04.diabetes"]!.parts!;
    expect([
      dm.in_range,
      dm.moderately_raised,
      dm.very_raised,
      dm.not_classifiable,
      dm.no_visit,
      dm.not_recorded,
    ]).toEqual([
      r.C07!.num,
      r.C08!.num,
      r.C09!.num,
      r.C10!.num,
      r.C11!.num,
      r["not_recorded.diabetes"]!.num,
    ]);
    expect(r["G04.hypertension"]!.den).toBe(r.C04!.den);
    expect(r["G04.diabetes"]!.den).toBe(r.C07!.den);
  });

  it("every expectation names its patients", () => {
    for (const [k, e] of Object.entries(EXPECTED))
      expect(Object.keys(e.who).length, k).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from "vitest";

import { planMissing, testOptions } from "@/lib/lab/qc-plan-form";
import { sparkCounts, sparkSeries } from "@/lib/lab/qc-spark";

const run = (i: number, z: number, target = { lotId: "L1", mean: 4, sd: 0.1 }, level = 1) => ({
  id: `r${i}`,
  at: new Date(Date.UTC(2026, 9, 1 + i, 8)),
  values: [{ level, z, ...target }],
});

describe("QC mini chart (6.4)", () => {
  it("QS-1: keeps the last 10 runs, oldest first, flags beyond 2 SD", () => {
    const runs = Array.from({ length: 13 }, (_, i) => run(i, i === 12 ? 2.4 : 0.5)).reverse();
    const s = sparkSeries(runs);
    expect(s.runs).toBe(10);
    const pts = s.series[0]!.segments.flat();
    expect(pts.map((p) => p.runId)).toEqual(Array.from({ length: 10 }, (_, i) => `r${i + 3}`));
    expect(pts.filter((p) => p.beyond).map((p) => p.runId)).toEqual(["r12"]);
    expect(sparkCounts(s)[0]!.beyond).toHaveLength(1);
  });

  it("S25 / QS-2: a target change starts a new series (a gap, not a joined line)", () => {
    const newTarget = { lotId: "L2", mean: 4.2, sd: 0.12 };
    const runs = [run(0, 0.1), run(1, -0.3), run(2, 0.2, newTarget), run(3, 1.1, newTarget)];
    const s = sparkSeries(runs);
    expect(s.series[0]!.segments.map((seg) => seg.map((p) => p.runId))).toEqual([
      ["r0", "r1"],
      ["r2", "r3"],
    ]);
    expect(sparkCounts(s)[0]!.targetChanges).toBe(1);
    // Only the SD changing is a target change too.
    const sdOnly = sparkSeries([run(0, 0), run(1, 0, { lotId: "L1", mean: 4, sd: 0.2 })]);
    expect(sdOnly.series[0]!.segments).toHaveLength(2);
  });

  it("one series per level", () => {
    const s = sparkSeries([run(0, 0, undefined, 1), run(1, 0, undefined, 2)]);
    expect(s.series.map((x) => x.level)).toEqual([1, 2]);
  });
});

describe("New QC plan (5.11, S26)", () => {
  const components = [
    { conceptId: "obs.potassium", name: "Potassium", unit: "mmol/L", section: "Chemistry" },
    { conceptId: "obs.potassium_urine", name: "Potassium, urine", unit: "mmol/L", section: null },
  ];
  const bs240 = {
    id: "d1",
    model: "BS-240",
    section: "Chemistry",
    linkedConcepts: ["obs.potassium"],
  };

  it("names tests by name, marks a test the analyser does not run, never shows a concept id", () => {
    const o = testOptions(components, bs240);
    expect(o[0]).toMatchObject({
      label: "Potassium",
      detail: "mmol/L · Chemistry · run on BS-240",
    });
    expect(o[1]).toMatchObject({
      label: "Potassium, urine",
      detail: "mmol/L · not run on BS-240",
      unavailable: true,
    });
    for (const x of o) expect(`${x.label} ${x.detail}`).not.toMatch(/obs\./);
  });

  it("an analyser with no tests listed offers every test, saying so", () => {
    const o = testOptions(components, { ...bs240, linkedConcepts: [] });
    expect(o.every((x) => !x.unavailable && /not listed for BS-240/.test(x.detail))).toBe(true);
  });

  it("Save draft states what is missing", () => {
    const base = {
      analyserId: "d1",
      conceptId: "obs.potassium",
      unit: "mmol/L",
      lotId: "l1",
      levels: [{ label: "Level 1", mean: "4.1", sd: "0.1" }],
      frequency: "each_day_before_patients",
      n: null,
      rejectRules: ["1-3s"],
      source: "Insert",
    };
    expect(planMissing(base, true)).toEqual([]);
    expect(
      planMissing({ ...base, levels: [{ label: "Level 1", mean: "", sd: "0" }] }, true),
    ).toEqual(["type each level's mean", "type each level's SD (above 0)"]);
    expect(planMissing(base, false)).toEqual(["choose the test"]);
    expect(planMissing({ ...base, unit: " " }, true)).toEqual(["type the unit"]);
    expect(planMissing({ ...base, levels: [], frequency: "" }, true)).toEqual([
      "choose the control levels",
      "choose when to run",
    ]);
    expect(planMissing({ ...base, rejectRules: [], source: "" }, true)).toEqual([
      "tick at least one reject rule",
      "say the source",
    ]);
  });
});

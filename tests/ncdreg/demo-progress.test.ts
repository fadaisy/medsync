import { describe, expect, it } from "vitest";

import { loadPercent, patientsLine } from "@/app/ncd/admin/_lib/progress";

// Scenario: 26 patients, then the data-quality step: 27 steps.
const scenario = (next: number) => ({ next, total: 27, scenario: 26, cohort: 0 });

describe("demo load progress", () => {
  it("reads 0% before anything is written and 100% when every step is done", () => {
    expect(loadPercent(undefined)).toBe(0);
    expect(loadPercent({})).toBe(0);
    expect(loadPercent(scenario(0))).toBe(0);
    expect(loadPercent(scenario(27))).toBe(100);
  });
  it("rounds down, so 100% only appears when the load is complete", () => {
    expect(loadPercent(scenario(26))).toBe(96);
    expect(loadPercent({ next: 1319, total: 1320, scenario: 26, cohort: 1293 })).toBe(99);
  });
  it("counts patients, not the data-quality step", () => {
    expect(patientsLine(undefined)).toBe("starting");
    expect(patientsLine(scenario(11))).toBe("11 of 26 demo patients written");
    expect(patientsLine(scenario(27))).toBe("26 of 26 demo patients written");
    expect(patientsLine({ next: 527, total: 1320, scenario: 26, cohort: 1293 })).toBe(
      "526 of 1,319 demo patients written",
    );
  });
});

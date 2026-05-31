import type { AdultVitals } from "@/lib/triage/types";
import { describe, expect, it } from "vitest";

import { scoreNews2 } from "@/lib/triage/scoring/news2";

/**
 * NEWS2 boundary tests. Every band edge from research doc §3 is tested
 * on BOTH sides of the boundary — this is the medico-legal-reproducibility
 * proof (kickoff GATE B: "unit-tested at every boundary value").
 *
 * Clinical source: docs/clinical/triage-medical-research.md §3.
 */

function vitals(overrides: Partial<AdultVitals> = {}): AdultVitals {
  // A fully-normal adult vital set scoring 0; tests override one axis.
  return {
    respiratoryRate: 16,
    spo2: 98,
    spo2Scale: "scale1",
    oxygen: "air",
    systolicBp: 120,
    pulse: 70,
    consciousness: "A",
    temperature: 37.0,
    ...overrides,
  };
}

describe("NEWS2 — fully normal", () => {
  it("scores 0 for an all-normal vital set", () => {
    const r = scoreNews2(vitals());
    expect(r.total).toBe(0);
    expect(r.hasSingleParameterThree).toBe(false);
    expect(r.provisional).toBe(false);
    expect(r.missing).toEqual([]);
  });
});

describe("NEWS2 — respiratory rate bands (§3 row 1)", () => {
  it.each([
    [8, 3],
    [9, 1],
    [11, 1],
    [12, 0],
    [20, 0],
    [21, 2],
    [24, 2],
    [25, 3],
  ])("RR %i scores %i", (rr, points) => {
    const r = scoreNews2(vitals({ respiratoryRate: rr }));
    expect(r.parameters.find((p) => p.parameter === "respiratory_rate")?.points).toBe(points);
  });
});

describe("NEWS2 — SpO₂ Scale 1 bands (§3 row 2)", () => {
  it.each([
    [91, 3],
    [92, 2],
    [93, 2],
    [94, 1],
    [95, 1],
    [96, 0],
    [100, 0],
  ])("SpO₂ %i scores %i", (spo2, points) => {
    const r = scoreNews2(vitals({ spo2 }));
    expect(r.parameters.find((p) => p.parameter === "spo2")?.points).toBe(points);
  });
});

describe("NEWS2 — supplemental oxygen (§3)", () => {
  it("adds +2 to the aggregate when on oxygen", () => {
    const onAir = scoreNews2(vitals({ oxygen: "air" }));
    const onO2 = scoreNews2(vitals({ oxygen: "oxygen" }));
    expect(onO2.total - onAir.total).toBe(2);
  });
});

describe("NEWS2 — systolic BP bands (§3 row 5)", () => {
  it.each([
    [90, 3],
    [91, 2],
    [100, 2],
    [101, 1],
    [110, 1],
    [111, 0],
    [219, 0],
    [220, 3],
  ])("SBP %i scores %i", (sbp, points) => {
    const r = scoreNews2(vitals({ systolicBp: sbp }));
    expect(r.parameters.find((p) => p.parameter === "systolic_bp")?.points).toBe(points);
  });
});

describe("NEWS2 — pulse bands (§3 row 6)", () => {
  it.each([
    [40, 3],
    [41, 1],
    [50, 1],
    [51, 0],
    [90, 0],
    [91, 1],
    [110, 1],
    [111, 2],
    [130, 2],
    [131, 3],
  ])("pulse %i scores %i", (pulse, points) => {
    const r = scoreNews2(vitals({ pulse }));
    expect(r.parameters.find((p) => p.parameter === "pulse")?.points).toBe(points);
  });
});

describe("NEWS2 — temperature bands (§3 row 8)", () => {
  it.each([
    [35.0, 3],
    [35.1, 1],
    [36.0, 1],
    [36.1, 0],
    [38.0, 0],
    [38.1, 1],
    [39.0, 1],
    [39.1, 2],
  ])("temp %s scores %i", (temp, points) => {
    const r = scoreNews2(vitals({ temperature: temp }));
    expect(r.parameters.find((p) => p.parameter === "temperature")?.points).toBe(points);
  });
});

describe("NEWS2 — consciousness ACVPU (§3)", () => {
  it.each([
    ["A", 0],
    ["C", 3],
    ["V", 3],
    ["P", 3],
    ["U", 3],
  ] as const)("ACVPU %s scores %i", (acvpu, points) => {
    const r = scoreNews2(vitals({ consciousness: acvpu }));
    expect(r.parameters.find((p) => p.parameter === "consciousness")?.points).toBe(points);
  });
});

describe("NEWS2 — single-parameter-3 red-score rule (§3)", () => {
  it("flags hasSingleParameterThree when one axis hits 3 even at low total", () => {
    // RR 25 = 3, everything else normal → total 3, single-three true.
    const r = scoreNews2(vitals({ respiratoryRate: 25 }));
    expect(r.total).toBe(3);
    expect(r.hasSingleParameterThree).toBe(true);
  });

  it("does not flag when no single axis reaches 3", () => {
    // SpO₂ 92 = 2, temp 38.5 = 1 → total 3 but no single-3.
    const r = scoreNews2(vitals({ spo2: 92, temperature: 38.5 }));
    expect(r.total).toBe(3);
    expect(r.hasSingleParameterThree).toBe(false);
  });
});

describe("NEWS2 — missing vitals are provisional, never falsely reassuring (§10)", () => {
  it("marks provisional and lists the missing parameter", () => {
    const r = scoreNews2(vitals({ respiratoryRate: null }));
    expect(r.provisional).toBe(true);
    expect(r.missing).toContain("respiratory_rate");
  });

  it("a missing vital contributes 0 points but does NOT count as normal", () => {
    // The missing RR must be in `missing`, and its ParameterScore must
    // report present:false — so the UI shows a gap, not a reassuring 0.
    const r = scoreNews2(vitals({ respiratoryRate: null }));
    const rr = r.parameters.find((p) => p.parameter === "respiratory_rate");
    expect(rr?.present).toBe(false);
    expect(rr?.points).toBe(0);
  });
});

describe("NEWS2 — determinism", () => {
  it("identical inputs produce identical output", () => {
    const v = vitals({ respiratoryRate: 22, spo2: 93, pulse: 115, temperature: 38.5 });
    expect(scoreNews2(v)).toEqual(scoreNews2(v));
  });
});

describe("NEWS2 — a worked clinical example (§3 integration note)", () => {
  it("RR 26 (+3), SpO₂ 90 on O₂ (+3, +2 oxygen), → aggregate 8, single-3 true", () => {
    const r = scoreNews2(vitals({ respiratoryRate: 26, spo2: 90, oxygen: "oxygen" }));
    // RR 26 → 3; SpO₂ 90 scale1 → 3; oxygen → +2. Total 8.
    expect(r.total).toBe(8);
    expect(r.hasSingleParameterThree).toBe(true);
  });
});

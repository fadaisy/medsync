import { describe, expect, it } from "vitest";

import { computeDerivedMetrics } from "@/lib/triage/scoring/derived";

/**
 * Derived "smart" metric boundary tests — research doc §6, §5, §11.
 * These catch the "well-appearing ill" the raw numbers hide.
 */

describe("Shock Index = HR / SBP (§6)", () => {
  it("computes the ratio", () => {
    const m = computeDerivedMetrics({ pulse: 110, systolicBp: 105 });
    expect(m.shockIndex).toBeCloseTo(1.0476, 3);
  });

  it.each([
    [70, 120, "normal"], // 0.58
    [99, 110, "normal"], // 0.9 exactly is NOT >0.9 → normal (strict threshold)
    [100, 110, "occult_shock"], // 0.909 > 0.9
    [110, 105, "shock"], // 1.047 ≥ 1.0
  ])("HR %i / SBP %i flags %s", (pulse, systolicBp, flag) => {
    const m = computeDerivedMetrics({ pulse, systolicBp });
    expect(m.shockIndexFlag).toBe(flag);
  });

  it("SI exactly 0.9 is NOT occult shock (strict >)", () => {
    // 90/100 = 0.9 exactly → normal (threshold is >0.9)
    const m = computeDerivedMetrics({ pulse: 90, systolicBp: 100 });
    expect(m.shockIndex).toBeCloseTo(0.9, 5);
    expect(m.shockIndexFlag).toBe("normal");
  });

  it("SI exactly 1.0 IS shock (inclusive ≥)", () => {
    const m = computeDerivedMetrics({ pulse: 100, systolicBp: 100 });
    expect(m.shockIndexFlag).toBe("shock");
  });

  it("is null when inputs missing", () => {
    expect(computeDerivedMetrics({ pulse: null, systolicBp: 100 }).shockIndex).toBeNull();
    expect(computeDerivedMetrics({ pulse: 80, systolicBp: null }).shockIndex).toBeNull();
  });
});

describe("Pulse pressure = SBP − DBP (§6)", () => {
  it("computes the difference", () => {
    const m = computeDerivedMetrics({ systolicBp: 120, diastolicBp: 80 });
    expect(m.pulsePressure).toBe(40);
  });

  it("flags narrow when < 25% of SBP", () => {
    // SBP 120, 25% = 30. PP 28 < 30 → narrow.
    const m = computeDerivedMetrics({ systolicBp: 120, diastolicBp: 92 });
    expect(m.pulsePressure).toBe(28);
    expect(m.pulsePressureFlag).toBe("narrow");
  });

  it("flags normal at exactly 25% of SBP", () => {
    // SBP 120, PP 30 = exactly 25% → not narrow.
    const m = computeDerivedMetrics({ systolicBp: 120, diastolicBp: 90 });
    expect(m.pulsePressureFlag).toBe("normal");
  });
});

describe("Mean arterial pressure (§6/§8)", () => {
  it("MAP = DBP + (SBP − DBP)/3", () => {
    // 120/80 → 80 + 40/3 = 93.33
    const m = computeDerivedMetrics({ systolicBp: 120, diastolicBp: 80 });
    expect(m.meanArterialPressure).toBeCloseTo(93.33, 1);
  });
});

describe("qSOFA (§5) — 1 point each", () => {
  it("RR ≥ 22 scores the resp point (boundary)", () => {
    expect(computeDerivedMetrics({ respiratoryRate: 22 }).qsofa?.respiratoryRatePoint).toBe(true);
    expect(computeDerivedMetrics({ respiratoryRate: 21 }).qsofa?.respiratoryRatePoint).toBe(false);
  });

  it("SBP ≤ 100 scores the hypotension point (boundary)", () => {
    expect(computeDerivedMetrics({ systolicBp: 100 }).qsofa?.hypotensionPoint).toBe(true);
    expect(computeDerivedMetrics({ systolicBp: 101 }).qsofa?.hypotensionPoint).toBe(false);
  });

  it("altered mentation (ACVPU not A) scores the mentation point", () => {
    expect(computeDerivedMetrics({ consciousness: "C" }).qsofa?.alteredMentationPoint).toBe(true);
    expect(computeDerivedMetrics({ consciousness: "A" }).qsofa?.alteredMentationPoint).toBe(false);
  });

  it("sums to the qSOFA score", () => {
    // RR 24 (+1), SBP 95 (+1), ACVPU V (+1) → 3
    const m = computeDerivedMetrics({ respiratoryRate: 24, systolicBp: 95, consciousness: "V" });
    expect(m.qsofa?.score).toBe(3);
  });
});

describe("Glucose flags (§6/§11)", () => {
  it.each([
    [2.9, "hypoglycaemia"],
    [3.0, "normal"], // <3.0 is hypo; 3.0 exactly is not
    [15.0, "normal"], // >15 is hyper; 15.0 exactly is not
    [15.1, "hyperglycaemia_dka_screen"],
    [6.0, "normal"],
  ])("glucose %s flags %s", (glucose, flag) => {
    expect(computeDerivedMetrics({ bloodGlucose: glucose }).glucoseFlag).toBe(flag);
  });
});

describe("Derived metrics — determinism", () => {
  it("identical inputs produce identical output", () => {
    const input = { pulse: 110, systolicBp: 105, diastolicBp: 70, respiratoryRate: 24 };
    expect(computeDerivedMetrics(input)).toEqual(computeDerivedMetrics(input));
  });
});

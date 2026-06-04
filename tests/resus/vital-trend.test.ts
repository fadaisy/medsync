import { describe, expect, it } from "vitest";

import { vitalBand, vitalTrend, vitalTrendLabel } from "@/lib/resus/vital-trend";

/**
 * Resus vitals trend — presentation read-model (PURE). Reuses the EXISTING
 * per-vital classification; the clinical direction (good/bad for THAT vital)
 * is the previous→current BAND comparison, not the raw numeric direction.
 */

const pts = (...vals: number[]) => vals.map((value) => ({ value }));

describe("vitalBand — the existing classification, one source", () => {
  it("classifies the basic vitals at the resus cutoffs", () => {
    expect(vitalBand("spo2", 90)).toBe("critical");
    expect(vitalBand("spo2", 93)).toBe("borderline");
    expect(vitalBand("spo2", 97)).toBe("normal");
    expect(vitalBand("hr", 38)).toBe("critical");
    expect(vitalBand("systolicBp", 88)).toBe("critical");
    expect(vitalBand("glucose", 3)).toBe("critical");
  });
  it("derived metrics reuse the triage thresholds (shock index, MAP)", () => {
    expect(vitalBand("shockIndex", 1.1)).toBe("critical");
    expect(vitalBand("shockIndex", 0.95)).toBe("abnormal");
    expect(vitalBand("shockIndex", 0.7)).toBe("normal");
    expect(vitalBand("meanArterialPressure", 60)).toBe("abnormal");
  });
  it("a missing value is 'missing'; a vital with no danger band is 'normal'", () => {
    expect(vitalBand("hr", null)).toBe("missing");
    expect(vitalBand("diastolicBp", 55)).toBe("normal");
  });
});

describe("vitalTrend — raw direction (arrow) vs clinical direction (colour)", () => {
  it("returns null when there are no readings; no trend on a single reading", () => {
    expect(vitalTrend("hr", [])).toBeNull();
    const one = vitalTrend("hr", pts(80))!;
    expect(one.hasTrend).toBe(false);
    expect(one.rawDirection).toBeNull();
    expect(one.previous).toBeNull();
    expect(one.current).toBe(80);
  });

  it("a RISING SpO₂ (90→95) is raw-up AND clinically improving (crossing out of danger)", () => {
    const t = vitalTrend("spo2", pts(90, 95))!;
    expect(t.rawDirection).toBe("up");
    expect(t.clinicalDirection).toBe("improving");
    expect(t.previous).toBe(90);
    expect(t.delta).toBe(5);
  });
  it("a FALLING SpO₂ (95→90) is raw-down AND clinically deteriorating", () => {
    const t = vitalTrend("spo2", pts(95, 90))!;
    expect(t.rawDirection).toBe("down");
    expect(t.clinicalDirection).toBe("deteriorating");
    expect(t.currentBand).toBe("critical");
  });
  it("a RISING shock index into danger (0.7→1.1) is raw-up AND deteriorating", () => {
    const t = vitalTrend("shockIndex", pts(0.7, 1.1))!;
    expect(t.rawDirection).toBe("up");
    expect(t.clinicalDirection).toBe("deteriorating");
  });
  it("movement WITHIN the normal band is neutral (calm), not coloured good/bad", () => {
    const t = vitalTrend("hr", pts(70, 78))!;
    expect(t.rawDirection).toBe("up");
    expect(t.clinicalDirection).toBe("neutral");
  });
  it("an unchanged value is raw-same + neutral", () => {
    const t = vitalTrend("hr", pts(80, 80))!;
    expect(t.rawDirection).toBe("same");
    expect(t.clinicalDirection).toBe("neutral");
    expect(t.delta).toBe(0);
  });

  it("worsening WITHIN a critical band still deteriorates (SBP 85→80, both critical, crashing)", () => {
    expect(vitalTrend("systolicBp", pts(85, 80))!.clinicalDirection).toBe("deteriorating");
  });
  it("climbing WITHIN an abnormal band toward danger deteriorates (HR 120→130)", () => {
    expect(vitalTrend("hr", pts(120, 130))!.clinicalDirection).toBe("deteriorating");
  });
  it("falling back toward normal within an abnormal band improves (HR 130→120)", () => {
    expect(vitalTrend("hr", pts(130, 120))!.clinicalDirection).toBe("improving");
  });
  it("a rising shock index within the abnormal band deteriorates (0.95→0.99)", () => {
    expect(vitalTrend("shockIndex", pts(0.95, 0.99))!.clinicalDirection).toBe("deteriorating");
  });
  it("keeps a 2-dp delta for fine-grained metrics (shock index 0.70→0.99 → 0.29)", () => {
    expect(vitalTrend("shockIndex", pts(0.7, 0.99))!.delta).toBe(0.29);
  });
  it("uses the LAST two points (previous = second-to-last)", () => {
    const t = vitalTrend("hr", pts(60, 70, 130))!;
    expect(t.previous).toBe(70);
    expect(t.current).toBe(130);
    expect(t.clinicalDirection).toBe("deteriorating"); // normal → critical
  });
});

describe("vitalTrendLabel — screen-reader sentence", () => {
  it("describes direction + clinical meaning", () => {
    const t = vitalTrend("spo2", pts(95, 90))!;
    expect(vitalTrendLabel("SpO₂", "%", t)).toBe("SpO₂ 90 %, down from 95, deteriorating");
  });
  it("a single reading reads as the first reading", () => {
    const t = vitalTrend("hr", pts(80))!;
    expect(vitalTrendLabel("HR", "/min", t)).toBe("HR 80 /min, first reading");
  });
});

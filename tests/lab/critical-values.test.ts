import type { CriticalValue } from "@/lib/lab/critical-values";
import { describe, expect, it } from "vitest";

import {
  compareToThresholds,
  CRITICAL_VALUES,
  CRITICAL_VALUES_CSO_SIGNED,
  criticalValueFor,
  evaluateCriticalFlag,
} from "@/lib/lab/critical-values";

const find = (loinc: string) => criticalValueFor(loinc)!;

describe("critical-value catalog (cited, gated)", () => {
  it("has cited, version-stamped entries with a real URL", () => {
    expect(CRITICAL_VALUES.length).toBeGreaterThan(20);
    for (const c of CRITICAL_VALUES) {
      expect(c.source.guideline.length, c.analyte).toBeGreaterThan(0);
      expect(c.source.version.length, c.analyte).toBeGreaterThan(0);
      expect(c.source.url.startsWith("http"), c.analyte).toBe(true);
      // a numeric entry has at least one threshold; a qualitative one has neither
      if (!c.qualitative) expect(c.low != null || c.high != null, c.analyte).toBe(true);
    }
  });

  it("looks an entry up by LOINC", () => {
    expect(criticalValueFor("2823-3")?.analyte).toMatch(/Potassium/);
    expect(criticalValueFor("zzz-nope")).toBeUndefined();
  });
});

describe("compareToThresholds (pure numeric comparison)", () => {
  it("flags potassium below low + above high", () => {
    const k = find("2823-3"); // low 2.8 / high 6.0
    expect(compareToThresholds(k, 2.5)).toBe("panic_low");
    expect(compareToThresholds(k, 6.4)).toBe("panic_high");
    expect(compareToThresholds(k, 4.2)).toBeNull();
    // boundary is inclusive (<= low, >= high)
    expect(compareToThresholds(k, 2.8)).toBe("panic_low");
    expect(compareToThresholds(k, 6.0)).toBe("panic_high");
  });

  it("a high-only analyte never flags low (glucose high = hyperglycaemia)", () => {
    const high: CriticalValue = CRITICAL_VALUES.find((c) => c.code === "glucose_high")!;
    expect(high).toBeDefined();
    expect(high.low).toBeNull();
    expect(compareToThresholds(high, 30)).toBe("panic_high"); // high 25
    expect(compareToThresholds(high, 5)).toBeNull(); // high-only → no low flag
  });

  it("never flags a qualitative entry or a non-numeric value", () => {
    const qual = CRITICAL_VALUES.find((c) => c.qualitative)!;
    expect(compareToThresholds(qual, 999)).toBeNull();
    const k = find("2823-3");
    expect(compareToThresholds(k, Number.NaN)).toBeNull();
  });
});

describe("evaluateCriticalFlag (gated decision-support)", () => {
  it("returns null while the catalog is unsigned (no auto-fire on unratified thresholds)", () => {
    // The catalog ships dark until the CSO signs — this is the safety default.
    expect(CRITICAL_VALUES_CSO_SIGNED).toBe(false);
    const k = find("2823-3");
    expect(evaluateCriticalFlag(k, 2.0)).toBeNull();
  });

  it("never fires on a needs_cso_input entry even if it were signed (guarded in logic)", () => {
    const needsInput = CRITICAL_VALUES.find((c) => c.confidence === "needs_cso_input")!;
    expect(needsInput).toBeDefined();
    expect(evaluateCriticalFlag(needsInput, 99999)).toBeNull();
  });

  it("returns null for an unknown analyte", () => {
    expect(evaluateCriticalFlag(undefined, 5)).toBeNull();
  });
});

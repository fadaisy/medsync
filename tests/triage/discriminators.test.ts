import type { DerivedMetrics, TriageVitals } from "@/lib/triage/types";
import { describe, expect, it } from "vitest";

import { evaluateDiscriminators } from "@/lib/triage/scoring/evaluate-discriminators";

/**
 * Discriminator evaluation (Step 3, research doc §4/§5/§8, ratified
 * §A.2). Returns every fired red-flag + the worst (minimum-number)
 * acuity it implies. Two sources: manual ticks + engine-derived.
 */

function vitals(o: Partial<TriageVitals> = {}): TriageVitals {
  return {
    respiratoryRate: 16,
    spo2: 98,
    oxygen: "air",
    systolicBp: 120,
    diastolicBp: 80,
    pulse: 70,
    consciousness: "A",
    temperature: 37,
    bloodGlucose: 6,
    ...o,
  };
}

const NO_DERIVED: DerivedMetrics = {
  shockIndex: null,
  shockIndexFlag: null,
  pulsePressure: null,
  pulsePressureFlag: null,
  meanArterialPressure: null,
  qsofa: null,
  glucoseFlag: null,
};

describe("evaluateDiscriminators — manual ticks scoped by population", () => {
  it("a manual adult discriminator fires for an adult", () => {
    const r = evaluateDiscriminators({
      ruleset: "adult_news2",
      vitals: vitals(),
      derived: NO_DERIVED,
      news2Total: 0,
      presentCodes: ["cardiac_chest_pain"],
    });
    expect(r.fired.some((f) => f.code === "cardiac_chest_pain")).toBe(true);
    expect(r.minAcuity).toBe(2);
  });

  it("an adult-only discriminator does NOT fire for a paediatric patient", () => {
    const r = evaluateDiscriminators({
      ruleset: "paediatric_pews",
      vitals: vitals(),
      derived: NO_DERIVED,
      news2Total: 0,
      presentCodes: ["cardiac_chest_pain"],
    });
    expect(r.fired.some((f) => f.code === "cardiac_chest_pain")).toBe(false);
  });

  it("an 'all' discriminator fires regardless of population", () => {
    const r = evaluateDiscriminators({
      ruleset: "paediatric_pews",
      vitals: vitals(),
      derived: NO_DERIVED,
      news2Total: 0,
      presentCodes: ["severe_pain"],
    });
    expect(r.fired.some((f) => f.code === "severe_pain")).toBe(true);
    expect(r.minAcuity).toBe(3);
  });
});

describe("evaluateDiscriminators — derived (cannot be forgotten)", () => {
  it("shock index ≥ 1.0 fires the occult-shock discriminator for an adult", () => {
    const r = evaluateDiscriminators({
      ruleset: "adult_news2",
      vitals: vitals({ pulse: 120, systolicBp: 100 }),
      derived: { ...NO_DERIVED, shockIndex: 1.2, shockIndexFlag: "shock" },
      news2Total: 0,
      presentCodes: [],
    });
    expect(r.fired.some((f) => f.code === "shock_index_high")).toBe(true);
    expect(r.minAcuity).toBe(2);
  });

  it("obstetric severe HTN fires from vitals for an obstetric patient", () => {
    const r = evaluateDiscriminators({
      ruleset: "obstetric_meows",
      vitals: vitals({ systolicBp: 165, diastolicBp: 95 }),
      derived: NO_DERIVED,
      news2Total: 0,
      presentCodes: [],
    });
    expect(r.fired.some((f) => f.code === "obstetric_severe_htn")).toBe(true);
    expect(r.minAcuity).toBe(1);
  });

  it("obstetric severe HTN also fires on diastolic ≥110 alone", () => {
    const r = evaluateDiscriminators({
      ruleset: "obstetric_meows",
      vitals: vitals({ systolicBp: 130, diastolicBp: 112 }),
      derived: NO_DERIVED,
      news2Total: 0,
      presentCodes: [],
    });
    expect(r.fired.some((f) => f.code === "obstetric_severe_htn")).toBe(true);
  });
});

describe("evaluateDiscriminators — conditional sepsis (§5)", () => {
  it("sepsis suspicion + qSOFA≥2 fires", () => {
    const r = evaluateDiscriminators({
      ruleset: "adult_news2",
      vitals: vitals(),
      derived: {
        ...NO_DERIVED,
        qsofa: {
          score: 2,
          respiratoryRatePoint: true,
          hypotensionPoint: true,
          alteredMentationPoint: false,
        },
      },
      news2Total: 0,
      presentCodes: ["sepsis_suspicion"],
    });
    expect(r.fired.some((f) => f.code === "sepsis_suspicion")).toBe(true);
    expect(r.minAcuity).toBe(2);
  });

  it("sepsis suspicion + NEWS2≥5 fires even if qSOFA<2", () => {
    const r = evaluateDiscriminators({
      ruleset: "adult_news2",
      vitals: vitals(),
      derived: {
        ...NO_DERIVED,
        qsofa: {
          score: 1,
          respiratoryRatePoint: true,
          hypotensionPoint: false,
          alteredMentationPoint: false,
        },
      },
      news2Total: 5,
      presentCodes: ["sepsis_suspicion"],
    });
    expect(r.fired.some((f) => f.code === "sepsis_suspicion")).toBe(true);
  });

  it("sepsis suspicion WITHOUT qSOFA≥2 or NEWS2≥5 does NOT fire (conditional)", () => {
    const r = evaluateDiscriminators({
      ruleset: "adult_news2",
      vitals: vitals(),
      derived: {
        ...NO_DERIVED,
        qsofa: {
          score: 1,
          respiratoryRatePoint: true,
          hypotensionPoint: false,
          alteredMentationPoint: false,
        },
      },
      news2Total: 2,
      presentCodes: ["sepsis_suspicion"],
    });
    expect(r.fired.some((f) => f.code === "sepsis_suspicion")).toBe(false);
  });
});

describe("evaluateDiscriminators — worse-of + empty", () => {
  it("returns the WORST (lowest number) when several fire", () => {
    const r = evaluateDiscriminators({
      ruleset: "adult_news2",
      vitals: vitals(),
      derived: NO_DERIVED,
      news2Total: 0,
      presentCodes: ["severe_pain", "cardiac_chest_pain", "focal_neuro_deficit"],
    });
    // severe_pain=3, chest_pain=2, focal_neuro=2 → worst is 2.
    expect(r.minAcuity).toBe(2);
    expect(r.fired.length).toBe(3);
  });

  it("no discriminators → null minAcuity, empty list", () => {
    const r = evaluateDiscriminators({
      ruleset: "adult_news2",
      vitals: vitals(),
      derived: NO_DERIVED,
      news2Total: 0,
      presentCodes: [],
    });
    expect(r.minAcuity).toBeNull();
    expect(r.fired).toEqual([]);
  });

  it("is deterministic", () => {
    const args = {
      ruleset: "adult_news2" as const,
      vitals: vitals({ pulse: 120, systolicBp: 100 }),
      derived: { ...NO_DERIVED, shockIndex: 1.2, shockIndexFlag: "shock" as const },
      news2Total: 6,
      presentCodes: ["sepsis_suspicion", "severe_pain"],
    };
    expect(evaluateDiscriminators(args)).toEqual(evaluateDiscriminators(args));
  });
});

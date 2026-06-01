import type { TriageInput, TriageVitals } from "@/lib/triage/types";
import { describe, expect, it } from "vitest";

import { runTriage } from "@/lib/triage/engine";
import { specialPopulationCautions } from "@/lib/triage/scoring/special-populations";

/**
 * Special-population caution strings (GATE E, catalog Part E).
 * These are CONFOUNDER warnings only — they surface caution text and
 * never change a computed acuity. Tests pin: each fires in the right
 * context, none escalates, and they thread through the engine as flags.
 */

function vit(o: Partial<TriageVitals> = {}): TriageVitals {
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

describe("specialPopulationCautions — contextual, no acuity change", () => {
  it("no modifiers → no cautions", () => {
    expect(specialPopulationCautions(undefined, vit())).toEqual([]);
    expect(specialPopulationCautions({}, vit())).toEqual([]);
  });

  it("elderly/frail always cautions against false reassurance", () => {
    const c = specialPopulationCautions({ elderlyFrail: true }, vit());
    expect(c.join(" ").toLowerCase()).toContain("does not exclude");
  });

  it("beta-blocker cautions ONLY when the pulse looks normal (could mask compensation)", () => {
    expect(specialPopulationCautions({ betaBlocker: true }, vit({ pulse: 70 })).length).toBe(1);
    // An already-tachycardic pulse isn't being masked → no caution.
    expect(specialPopulationCautions({ betaBlocker: true }, vit({ pulse: 130 }))).toEqual([]);
  });

  it("athlete caution surfaces only for a well bradycardia, framed as 'interpret in context'", () => {
    const c = specialPopulationCautions({ athlete: true }, vit({ pulse: 48 }));
    expect(c.join(" ").toLowerCase()).toContain("interpret");
    // A normal pulse → nothing to caution.
    expect(specialPopulationCautions({ athlete: true }, vit({ pulse: 70 }))).toEqual([]);
  });

  it("chronic-baseline caution points to the audited baseline adjustment", () => {
    const c = specialPopulationCautions({ chronicAbnormalBaseline: true }, vit({ pulse: 105 }));
    expect(c.join(" ").toLowerCase()).toContain("baseline adjustment");
  });
});

describe("special-population cautions — engine integration", () => {
  function input(o: Partial<TriageInput> = {}): TriageInput {
    return {
      context: {
        ageYears: 80,
        pregnancy: "not_pregnant",
        reproductiveAgeFemale: false,
        spo2Scale2Enabled: false,
        modifiers: { elderlyFrail: true },
      },
      vitals: vit(),
      ...o,
    };
  }

  it("surfaces the caution as a flag without changing the level", () => {
    const withMod = runTriage(input());
    const without = runTriage({
      ...input(),
      context: { ...input().context, modifiers: undefined },
    });
    // Same acuity — cautions never escalate.
    expect(withMod.level).toBe(without.level);
    expect(withMod.flags.some((f) => f.toLowerCase().includes("elderly"))).toBe(true);
  });
});

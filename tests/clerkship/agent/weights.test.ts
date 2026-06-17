import type { FeatureIndex, MapDifferential } from "@/lib/clerkship/agent/types";
import { describe, expect, it } from "vitest";

import { deriveWeights, scoreDifferential, tierOf, TIERS } from "@/lib/clerkship/agent/weights";

function idxWith(present: string[]): FeatureIndex {
  return {
    presentDisplays: new Set(present.map((p) => p.toLowerCase())),
    deniedDisplays: new Set(),
    complaintCodes: new Set(),
    provenance: new Map(),
  };
}

const baseDx = (over: Partial<MapDifferential> = {}): MapDifferential => ({
  dx: "Acute coronary syndrome",
  likelihood: "must_not_miss",
  ruleIn: ["Exertional", "Crushing"],
  ruleOut: ["Reproducible on palpation"],
  supportingSymptoms: [{ system: "cvs", symptom: "sweating" }],
  refutingSymptoms: [],
  riskFactors: ["hypertension"],
  ...over,
});

describe("deriveWeights (bootstrap from approved fields)", () => {
  it("derives feature/risk/base weights when no sourced weights present", () => {
    const w = deriveWeights(baseDx());
    expect(w.featureWeights["Exertional"]).toBe(3); // ruleIn → +3
    expect(w.featureWeights["Reproducible on palpation"]).toBe(-3); // ruleOut → -3
    expect(w.featureWeights["sweating"]).toBe(1); // supporting → +1
    expect(w.riskWeights["hypertension"]).toBe(1);
    expect(w.basePrior).toBe(1); // must_not_miss base
    expect(w.agePrior).toEqual([]); // no fabricated age prior
  });

  it("explicit sourced fields fully replace the derived counterpart", () => {
    const w = deriveWeights(
      baseDx({
        featureWeights: { Exertional: 5 },
        basePrior: 4,
        agePrior: [{ minAge: 50, delta: 2 }],
      }),
    );
    expect(w.featureWeights).toEqual({ Exertional: 5 });
    expect(w.basePrior).toBe(4);
    expect(w.agePrior).toEqual([{ minAge: 50, delta: 2 }]);
  });
});

describe("scoreDifferential", () => {
  it("sums base + present feature + present risk, ignoring absent", () => {
    const r = scoreDifferential(baseDx(), idxWith(["exertional", "hypertension"]), undefined);
    // base 1 + exertional 3 + hypertension 1 = 5
    expect(r.score).toBe(5);
    expect(r.contributions.some((c) => c.source === "feature" && c.delta === 3)).toBe(true);
  });

  it("subtracts a present negative feature (rule-out)", () => {
    const r = scoreDifferential(baseDx(), idxWith(["reproducible on palpation"]), undefined);
    expect(r.score).toBe(1 - 3); // base 1, ruleOut -3
  });

  it("applies age + sex priors only when sourced and demographics known", () => {
    const dx = baseDx({
      agePrior: [
        { minAge: 50, delta: 2 },
        { maxAge: 39, delta: -2 },
      ],
      sexPrior: { male: 1 },
    });
    expect(scoreDifferential(dx, idxWith([]), { ageYears: 68, sex: "male" }).score).toBe(1 + 2 + 1);
    expect(scoreDifferential(dx, idxWith([]), { ageYears: 30, sex: "female" }).score).toBe(1 - 2);
    expect(scoreDifferential(dx, idxWith([]), { ageYears: null, sex: null }).score).toBe(1); // unknown → neutral
  });
});

describe("tierOf", () => {
  it("maps score to tier by the calibration thresholds", () => {
    expect(tierOf(TIERS.LEADING)).toBe("leading");
    expect(tierOf(TIERS.CONSIDER)).toBe("consider");
    expect(tierOf(TIERS.FLOOR)).toBe("less_likely");
    expect(tierOf(TIERS.FLOOR - 1)).toBe("ruled_down");
  });
});

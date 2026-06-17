import type { FeatureIndex, MapDifferential, ReasoningMap } from "@/lib/clerkship/agent/types";
import { describe, expect, it } from "vitest";

import {
  deriveWeights,
  mergeDdxWeights,
  scoreDifferential,
  tierOf,
  TIERS,
} from "@/lib/clerkship/agent/weights";

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

describe("mergeDdxWeights", () => {
  const maps: ReasoningMap[] = [
    {
      code: "chest_pain",
      display: "Chest pain",
      triggerCodes: ["chest_pain"],
      associated: [],
      redFlags: [],
      examTargets: [],
      combinations: [],
      differential: [
        {
          dx: "Acute coronary syndrome",
          likelihood: "must_not_miss",
          ruleIn: ["Exertional"],
          ruleOut: [],
          supportingSymptoms: [],
          refutingSymptoms: [],
          riskFactors: [],
        },
      ],
    },
  ];

  it("applies a sourced weight entry onto the matching differential by dx name", () => {
    const merged = mergeDdxWeights(maps, [
      {
        complaint: "chest_pain",
        weights: [
          { dx: "Acute coronary syndrome", basePrior: 4, agePrior: [{ minAge: 50, delta: 2 }] },
        ],
      },
    ]);
    const d = merged[0]!.differential[0]!;
    expect(d.basePrior).toBe(4);
    expect(d.agePrior).toEqual([{ minAge: 50, delta: 2 }]);
    expect(d.ruleIn).toEqual(["Exertional"]); // untouched approved fields preserved
  });

  it("leaves maps unchanged when there are no weight files", () => {
    const merged = mergeDdxWeights(maps, []);
    expect(merged[0]!.differential[0]!.basePrior).toBeUndefined();
  });

  it("appends a new dx that matches no existing differential", () => {
    const merged = mergeDdxWeights(maps, [
      {
        complaint: "chest_pain",
        weights: [
          {
            dx: "Aortic dissection",
            likelihood: "must_not_miss",
            featureWeights: { "tearing pain": 4, "back radiation": 3 },
            riskFactors: ["hypertension", "Marfan syndrome"],
            supportingSymptoms: ["pulse deficit", "unequal BP"],
          },
        ],
      },
    ]);
    const diff = merged[0]!.differential;
    // Still has the original dx
    expect(diff.some((d) => d.dx === "Acute coronary syndrome")).toBe(true);
    // New dx appended
    const appended = diff.find((d) => d.dx === "Aortic dissection");
    expect(appended).toBeDefined();
    expect(appended!.likelihood).toBe("must_not_miss");
    expect(appended!.featureWeights).toEqual({ "tearing pain": 4, "back radiation": 3 });
    expect(appended!.riskFactors).toEqual(["hypertension", "Marfan syndrome"]);
    // supportingSymptoms wrapped to {system, symptom} objects
    expect(appended!.supportingSymptoms).toEqual([
      { system: "", symptom: "pulse deficit" },
      { system: "", symptom: "unequal BP" },
    ]);
    // Total differential length increased by 1
    expect(diff).toHaveLength(2);
  });

  it("overlay by dx name does NOT duplicate an existing dx", () => {
    const merged = mergeDdxWeights(maps, [
      {
        complaint: "chest_pain",
        weights: [{ dx: "Acute coronary syndrome", basePrior: 5 }],
      },
    ]);
    const diff = merged[0]!.differential;
    // Exactly one ACS entry (overlaid, not duplicated)
    expect(diff.filter((d) => d.dx === "Acute coronary syndrome")).toHaveLength(1);
    expect(diff[0]!.basePrior).toBe(5);
    expect(diff).toHaveLength(1);
  });

  it("appends a new dx matched by dxCode when both sides have one", () => {
    const mapsWithCode: ReasoningMap[] = [
      {
        code: "chest_pain",
        display: "Chest pain",
        triggerCodes: ["chest_pain"],
        associated: [],
        redFlags: [],
        examTargets: [],
        combinations: [],
        differential: [
          {
            dx: "Acute coronary syndrome",
            dxCode: "I21",
            likelihood: "must_not_miss",
            ruleIn: ["Exertional"],
            ruleOut: [],
            supportingSymptoms: [],
            refutingSymptoms: [],
            riskFactors: [],
          },
        ],
      },
    ];
    const merged = mergeDdxWeights(mapsWithCode, [
      {
        complaint: "chest_pain",
        weights: [
          {
            dxCode: "I33",
            dx: "Infective endocarditis",
            likelihood: "less_likely",
            ruleIn: ["fever", "new murmur"],
            ruleOut: [],
            supportingSymptoms: ["splinter haemorrhages"],
            refutingSymptoms: [],
            riskFactors: ["IVDU"],
          },
        ],
      },
    ]);
    const diff = merged[0]!.differential;
    const ie = diff.find((d) => d.dxCode === "I33");
    expect(ie).toBeDefined();
    expect(ie!.dx).toBe("Infective endocarditis");
    expect(ie!.likelihood).toBe("less_likely");
    expect(diff).toHaveLength(2);
  });
});

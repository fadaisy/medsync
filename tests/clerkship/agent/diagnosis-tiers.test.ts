import type { AgentInput, FeatureIndex, ReasoningMap } from "@/lib/clerkship/agent/types";
import { describe, expect, it } from "vitest";

import { suggestDiagnoses } from "@/lib/clerkship/agent/reducers/diagnosis";

const EMPTY_INPUT: AgentInput = {
  hpcItems: [],
  ros: [],
  pmhItems: [],
  pmhScreen: {},
  examVitals: {},
  bpStandard: {} as AgentInput["bpStandard"],
  examGeneralFindings: [],
  examRespiratory: {},
  examCardiovascular: {},
  examAbdominal: {},
  examNeurological: {},
  examMusculoskeletal: {},
  examEndoVascularFoot: {},
};

function idxWith(complaint: string, present: string[]): FeatureIndex {
  return {
    presentDisplays: new Set(present.map((p) => p.toLowerCase())),
    deniedDisplays: new Set(),
    complaintCodes: new Set([complaint]),
    provenance: new Map(),
  };
}

const cpMap: ReasoningMap = {
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
      dxCode: "acs",
      likelihood: "must_not_miss",
      ruleIn: ["Exertional", "Crushing"],
      ruleOut: ["Reproducible on palpation"],
      supportingSymptoms: [],
      refutingSymptoms: [],
      riskFactors: ["hypertension"],
      featureWeights: { Exertional: 3, Crushing: 2, "Reproducible on palpation": -4 },
      basePrior: 1,
    },
    {
      dx: "Musculoskeletal",
      dxCode: "msk",
      likelihood: "likely",
      ruleIn: ["Reproducible on palpation"],
      ruleOut: ["Exertional"],
      supportingSymptoms: [],
      refutingSymptoms: [],
      riskFactors: [],
      featureWeights: { "Reproducible on palpation": 4, Exertional: -2 },
      basePrior: 2,
    },
  ],
};

describe("suggestDiagnoses — ranked", () => {
  it("floats the supported dx to Leading with contributions", () => {
    const idx = idxWith("chest_pain", ["exertional", "crushing", "hypertension"]);
    const out = suggestDiagnoses(EMPTY_INPUT, idx, [cpMap], { ranked: true });
    const acs = out.find((i) => i.suggests?.dx === "Acute coronary syndrome")!;
    expect(acs.tier).toBe("leading"); // 1 + 3 + 2 + 1(risk) = 7
    expect(acs.contributions?.some((c) => c.source === "feature")).toBe(true);
  });

  it("demotes a contradicted non-must-not-miss but keeps a must-not-miss pinned", () => {
    const idx = idxWith("chest_pain", ["reproducible on palpation"]);
    const out = suggestDiagnoses(EMPTY_INPUT, idx, [cpMap], { ranked: true });
    const acs = out.find((i) => i.suggests?.dx === "Acute coronary syndrome")!;
    const msk = out.find((i) => i.suggests?.dx === "Musculoskeletal")!;
    expect(acs.tier).toBe("ruled_down"); // 1 - 4 = -3, but still PRESENT (pinned by mustNotMiss)
    expect(acs.suggests?.mustNotMiss).toBe(true);
    expect(msk.tier).toBe("leading"); // 2 + 4 = 6
  });

  it("reinforces a dx shared across ≥2 active complaints", () => {
    const peCp: ReasoningMap = {
      ...cpMap,
      code: "chest_pain",
      differential: [
        {
          dx: "Pulmonary embolism",
          dxCode: "pe",
          likelihood: "must_not_miss",
          ruleIn: [],
          ruleOut: [],
          supportingSymptoms: [],
          refutingSymptoms: [],
          riskFactors: [],
          basePrior: 1,
        },
      ],
    };
    const peCough: ReasoningMap = { ...peCp, code: "cough", triggerCodes: ["cough"] };
    const idx = idxWith("chest_pain", []);
    idx.complaintCodes.add("cough");
    const out = suggestDiagnoses(EMPTY_INPUT, idx, [peCp, peCough], { ranked: true });
    const pe = out.filter((i) => i.suggests?.dx === "Pulmonary embolism");
    expect(pe[0]!.contributions?.some((c) => c.source === "interaction" && c.delta === 2)).toBe(
      true,
    );
  });

  it("flat fallback (ranked off) matches today's behaviour — no tier, score-filtered", () => {
    const idx = idxWith("chest_pain", []);
    const out = suggestDiagnoses(EMPTY_INPUT, idx, [cpMap], { ranked: false });
    expect(out.every((i) => i.tier === undefined)).toBe(true);
    // MSK (not must-not-miss, score 0 with no features) is filtered out in flat mode
    expect(out.some((i) => i.suggests?.dx === "Musculoskeletal")).toBe(false);
  });
});

import type { AgentInput, FeatureIndex, ReasoningMap } from "@/lib/clerkship/agent/types";
import { describe, expect, it } from "vitest";

import { suggestDiagnoses } from "@/lib/clerkship/agent/reducers/diagnosis";

const EMPTY: AgentInput = {
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
const idx = (complaints: string[], present: string[]): FeatureIndex => ({
  presentDisplays: new Set(present.map((p) => p.toLowerCase())),
  deniedDisplays: new Set(),
  complaintCodes: new Set(complaints),
  provenance: new Map(),
});

const CHEST: ReasoningMap = {
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
      ruleIn: [],
      ruleOut: [],
      supportingSymptoms: [],
      refutingSymptoms: [],
      riskFactors: [],
      basePrior: 1,
      agePrior: [
        { minAge: 50, delta: 3 },
        { maxAge: 39, delta: -2 },
      ],
      sexPrior: { male: 1 },
      featureWeights: { Exertional: 3, Crushing: 2, "Reproducible on palpation": -4 },
      riskWeights: { smoking: 1 },
    },
    {
      dx: "Musculoskeletal",
      dxCode: "msk",
      likelihood: "likely",
      ruleIn: [],
      ruleOut: [],
      supportingSymptoms: [],
      refutingSymptoms: [],
      riskFactors: [],
      basePrior: 2,
      featureWeights: { "Reproducible on palpation": 4, Exertional: -2 },
    },
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
      featureWeights: { Pleuritic: 3 },
    },
  ],
};
const COUGH: ReasoningMap = {
  code: "cough",
  display: "Cough",
  triggerCodes: ["cough"],
  associated: [],
  redFlags: [],
  examTargets: [],
  combinations: [],
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
    {
      dx: "Pneumonia",
      dxCode: "pneumonia",
      likelihood: "likely",
      ruleIn: [],
      ruleOut: [],
      supportingSymptoms: [],
      refutingSymptoms: [],
      riskFactors: [],
      basePrior: 2,
      featureWeights: { Fever: 2 },
    },
  ],
};

const tierOfDx = (out: ReturnType<typeof suggestDiagnoses>, dx: string) =>
  out.find((i) => i.suggests?.dx === dx)?.tier;

describe("ddx scenarios", () => {
  it("68M + exertional + crushing → ACS leading", () => {
    const out = suggestDiagnoses(EMPTY, idx(["chest_pain"], ["exertional", "crushing"]), [CHEST], {
      ranked: true,
      demographics: { ageYears: 68, sex: "male" },
    });
    expect(tierOfDx(out, "Acute coronary syndrome")).toBe("leading"); // 1+3(age)+1(sex)+3+2 = 10
  });

  it("add reproducible-on-palpation → MSK leading, ACS demoted but still present (pinned)", () => {
    const out = suggestDiagnoses(
      EMPTY,
      idx(["chest_pain"], ["reproducible on palpation"]),
      [CHEST],
      { ranked: true, demographics: { ageYears: 68, sex: "male" } },
    );
    expect(tierOfDx(out, "Musculoskeletal")).toBe("leading"); // 2+4 = 6
    expect(tierOfDx(out, "Acute coronary syndrome")).toBe("less_likely"); // 1+3+1-4 = 1 → less_likely (≥FLOOR 0)
    expect(out.some((i) => i.suggests?.dx === "Acute coronary syndrome")).toBe(true); // never dropped
  });

  it("young patient → ACS falls, but must-not-miss still present", () => {
    const out = suggestDiagnoses(EMPTY, idx(["chest_pain"], []), [CHEST], {
      ranked: true,
      demographics: { ageYears: 28, sex: "male" },
    });
    const acs = out.find((i) => i.suggests?.dx === "Acute coronary syndrome")!;
    expect(acs.score).toBe(1 - 2 + 1); // base + young age + male
    expect(acs.suggests?.mustNotMiss).toBe(true);
  });

  it("chest pain + cough → PE reinforced (fits both)", () => {
    const out = suggestDiagnoses(EMPTY, idx(["chest_pain", "cough"], []), [CHEST, COUGH], {
      ranked: true,
      demographics: { ageYears: 50, sex: "male" },
    });
    const pe = out.find((i) => i.suggests?.dx === "Pulmonary embolism")!;
    expect(pe.contributions?.some((c) => c.source === "interaction")).toBe(true);
  });
});

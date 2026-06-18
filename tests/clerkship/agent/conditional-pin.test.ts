import type { AgentInput, FeatureIndex, ReasoningMap } from "@/lib/clerkship/agent/types";
import { describe, expect, it } from "vitest";

import { suggestDiagnoses } from "@/lib/clerkship/agent/reducers/diagnosis";
import { pinSatisfied } from "@/lib/clerkship/agent/weights";

const idxWith = (present: string[], complaint = "chest_pain"): FeatureIndex => ({
  presentDisplays: new Set(present.map((p) => p.toLowerCase())),
  deniedDisplays: new Set(),
  complaintCodes: new Set([complaint]),
  provenance: new Map(),
});

describe("pinSatisfied", () => {
  it("no gate (undefined) → always pins", () => {
    expect(pinSatisfied(undefined, idxWith([]))).toBe(true);
  });
  it("empty gate → always pins", () => {
    expect(pinSatisfied({ riskAny: [], featureAny: [] }, idxWith([]))).toBe(true);
  });
  it("riskAny present → pins; absent → does not", () => {
    expect(
      pinSatisfied({ riskAny: ["sickle-cell disease"] }, idxWith(["sickle-cell disease"])),
    ).toBe(true);
    expect(pinSatisfied({ riskAny: ["sickle-cell disease"] }, idxWith([]))).toBe(false);
  });
  it("featureAny present → pins", () => {
    expect(pinSatisfied({ featureAny: ["haemoptysis"] }, idxWith(["haemoptysis"]))).toBe(true);
  });
});

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

const MAP: ReasoningMap = {
  code: "chest_pain",
  display: "Chest pain",
  triggerCodes: ["chest_pain"],
  associated: [],
  redFlags: [],
  examTargets: [],
  combinations: [],
  differential: [
    {
      dx: "Sickle-cell acute chest syndrome",
      likelihood: "must_not_miss",
      ruleIn: [],
      ruleOut: [],
      supportingSymptoms: [],
      refutingSymptoms: [],
      riskFactors: [],
      basePrior: 1,
      riskWeights: { "sickle-cell disease": 2 },
      pinWhen: { riskAny: ["sickle-cell disease"] },
    },
    {
      dx: "Acute coronary syndrome",
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

const find = (out: ReturnType<typeof suggestDiagnoses>, dx: string) =>
  out.find((i) => i.suggests?.dx === dx);

describe("conditional must-not-miss in the ranked reducer", () => {
  it("a conditional dx does NOT count as must-not-miss when its gate is unmet", () => {
    const out = suggestDiagnoses(EMPTY, idxWith([]), [MAP], { ranked: true });
    expect(find(out, "Sickle-cell acute chest syndrome")?.suggests?.mustNotMiss).toBe(false);
    // an UNconditional must-not-miss is unaffected
    expect(find(out, "Acute coronary syndrome")?.suggests?.mustNotMiss).toBe(true);
  });

  it("the same conditional dx DOES count as must-not-miss when its gate is met", () => {
    const out = suggestDiagnoses(EMPTY, idxWith(["sickle-cell disease"]), [MAP], { ranked: true });
    expect(find(out, "Sickle-cell acute chest syndrome")?.suggests?.mustNotMiss).toBe(true);
  });
});

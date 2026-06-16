import type { AgentInput, ReasoningMap } from "@/lib/clerkship/agent/types";
import { describe, expect, it } from "vitest";

import { buildFeatureIndex } from "@/lib/clerkship/agent/feature-index";
import { suggestDiagnoses } from "@/lib/clerkship/agent/reducers/diagnosis";

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
      dx: "Acute coronary syndrome / MI",
      likelihood: "must_not_miss",
      ruleIn: ["Crushing", "Radiation to left arm"],
      ruleOut: ["Reproducible on palpation"],
      supportingSymptoms: [],
      refutingSymptoms: [],
      riskFactors: ["hypertension"],
    },
    {
      dx: "Musculoskeletal / costochondritis",
      likelihood: "likely",
      ruleIn: ["Reproducible on palpation"],
      ruleOut: ["Crushing"],
      supportingSymptoms: [],
      refutingSymptoms: [],
      riskFactors: [],
    },
  ],
};

const input = (over: Partial<AgentInput> = {}): AgentInput => ({
  hpcItems: [{ symptomCode: "chest_pain", symptomDisplay: "Chest pain", properties: [] }],
  ros: [],
  pmhItems: [],
  pmhScreen: {},
  examVitals: {},
  bpStandard: "who_esc",
  examGeneralFindings: [],
  examRespiratory: {},
  examCardiovascular: {},
  examAbdominal: {},
  examNeurological: {},
  examMusculoskeletal: {},
  examEndoVascularFoot: {},
  ...over,
});

describe("suggestDiagnoses", () => {
  it("must-not-miss is emitted even with no supporting features, floated to top", () => {
    const i = input();
    const out = suggestDiagnoses(i, buildFeatureIndex(i), [MAP]);
    expect(out[0]!.suggests!.dx).toBe("Acute coronary syndrome / MI");
    expect(out[0]!.suggests!.mustNotMiss).toBe(true);
  });

  it("matched ruleIn + risk → evidence; unmatched ruleIn → discriminators", () => {
    const i = input({
      hpcItems: [
        {
          symptomCode: "chest_pain",
          symptomDisplay: "Chest pain",
          properties: [
            {
              propertyCode: "cp_character",
              propertyDisplay: "Character",
              valueType: "single_select",
              labels: ["Crushing"],
            },
          ],
        },
      ],
      pmhScreen: { hypertension: "yes" },
    });
    const out = suggestDiagnoses(i, buildFeatureIndex(i), [MAP]);
    const acs = out.find((o) => o.suggests!.dx.startsWith("Acute coronary"))!;
    const ev = acs.evidence.map((e) => e.label.toLowerCase());
    expect(ev).toEqual(expect.arrayContaining(["crushing", "hypertension"]));
    const disc = acs.discriminators!.map((d) => d.label.toLowerCase());
    expect(disc).toContain("radiation to left arm");
  });

  it("non-must-not-miss with no support is dropped", () => {
    const i = input();
    const out = suggestDiagnoses(i, buildFeatureIndex(i), [MAP]);
    expect(out.find((o) => o.suggests!.dx.startsWith("Musculoskeletal"))).toBeUndefined();
  });

  it("ruleOut present reduces score; must-not-miss still floats first", () => {
    const i = input({
      hpcItems: [
        {
          symptomCode: "chest_pain",
          symptomDisplay: "Chest pain",
          properties: [
            {
              propertyCode: "cp_character",
              propertyDisplay: "Character",
              valueType: "single_select",
              labels: ["Reproducible on palpation"],
            },
          ],
        },
      ],
    });
    const out = suggestDiagnoses(i, buildFeatureIndex(i), [MAP]);
    const acs = out.find((o) => o.suggests!.dx.startsWith("Acute coronary"))!;
    expect(out[0]!.suggests!.mustNotMiss).toBe(true);
    expect(acs.score!).toBeLessThan(0);
  });
});

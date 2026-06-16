import type { AgentInput, ReasoningMap } from "@/lib/clerkship/agent/types";
import { describe, expect, it } from "vitest";

import { buildFeatureIndex } from "@/lib/clerkship/agent/feature-index";
import { combinationFlags } from "@/lib/clerkship/agent/reducers/combination";

const MAP: ReasoningMap = {
  code: "chest_pain",
  display: "Chest pain",
  triggerCodes: ["chest_pain"],
  associated: [],
  redFlags: [],
  examTargets: [],
  differential: [],
  combinations: [
    {
      features: ["Tearing or ripping", "«Unequal pulses»"],
      suggests: "Aortic dissection",
      action: "urgent imaging",
      mustNotMiss: true,
    },
  ],
};

const base = (over: Partial<AgentInput>): AgentInput => ({
  hpcItems: [],
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

const tearingHpc: AgentInput["hpcItems"] = [
  {
    symptomCode: "chest_pain",
    symptomDisplay: "Chest pain",
    properties: [
      {
        propertyCode: "cp_character",
        propertyDisplay: "Character",
        valueType: "single_select",
        labels: ["Tearing or ripping"],
      },
    ],
  },
];

describe("combinationFlags", () => {
  it("partial cluster → no flag", () => {
    const input = base({ hpcItems: tearingHpc });
    expect(combinationFlags(input, buildFeatureIndex(input), [MAP])).toEqual([]);
  });

  it("full cluster present → red must-not-miss combination flag", () => {
    const input = base({
      hpcItems: tearingHpc,
      examCardiovascular: {
        findings: [
          { code: "unequal_pulses", group: "pulses", display: "Unequal pulses", state: "present" },
        ],
      } as AgentInput["examCardiovascular"],
    });
    const out = combinationFlags(input, buildFeatureIndex(input), [MAP]);
    expect(out).toHaveLength(1);
    expect(out[0]!.severity).toBe("red");
    expect(out[0]!.suggests!.dx).toBe("Aortic dissection");
  });
});

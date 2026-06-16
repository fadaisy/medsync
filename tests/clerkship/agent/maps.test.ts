import type { AgentInput, ReasoningMap } from "@/lib/clerkship/agent/types";
import { describe, expect, it } from "vitest";

import { buildFeatureIndex } from "@/lib/clerkship/agent/feature-index";
import { mapAssociations, mapExpectedSigns } from "@/lib/clerkship/agent/reducers/maps";

const CP_MAP: ReasoningMap = {
  code: "chest_pain",
  display: "Chest pain",
  triggerCodes: ["chest_pain"],
  associated: ["sweating", "dyspnoea", "syncope"],
  redFlags: [],
  examTargets: [{ area: "Vascular", sign: "BP in both arms", discriminates: "Aortic dissection" }],
  differential: [],
  combinations: [],
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

const cpInput = (over: Partial<AgentInput> = {}) =>
  base({
    hpcItems: [{ symptomCode: "chest_pain", symptomDisplay: "Chest pain", properties: [] }],
    ...over,
  });

describe("mapAssociations", () => {
  it("no matching complaint → nothing", () => {
    const input = base({});
    expect(mapAssociations(input, buildFeatureIndex(input), [CP_MAP])).toEqual([]);
  });

  it("chest pain → suggests asking about associated features not yet present", () => {
    const input = cpInput();
    const out = mapAssociations(input, buildFeatureIndex(input), [CP_MAP]);
    expect(out).toHaveLength(1);
    const labels = out[0]!.expects!.map((e) => e.label.toLowerCase());
    expect(labels).toEqual(expect.arrayContaining(["sweating", "dyspnoea", "syncope"]));
  });

  it("already-present associated features are dropped from the prompt", () => {
    const input = cpInput({
      ros: [
        {
          symptomCode: "dyspnoea",
          symptomDisplay: "dyspnoea",
          system: "respiratory",
          status: "present",
        },
      ],
    });
    const out = mapAssociations(input, buildFeatureIndex(input), [CP_MAP]);
    const labels = out[0]!.expects!.map((e) => e.label.toLowerCase());
    expect(labels).not.toContain("dyspnoea");
  });
});

describe("mapExpectedSigns", () => {
  it("chest pain → expected exam sign with discriminator", () => {
    const input = cpInput();
    const out = mapExpectedSigns(input, buildFeatureIndex(input), [CP_MAP]);
    expect(out).toHaveLength(1);
    expect(out[0]!.kind).toBe("expected-sign");
    expect(out[0]!.expects![0]!.label).toContain("BP in both arms");
    expect(out[0]!.expects![0]!.why).toContain("Aortic dissection");
  });
});

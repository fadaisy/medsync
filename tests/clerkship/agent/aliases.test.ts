import type { AgentInput } from "@/lib/clerkship/agent/types";
import { describe, expect, it } from "vitest";

import { featurePresent } from "@/lib/clerkship/agent/aliases";
import { buildFeatureIndex } from "@/lib/clerkship/agent/feature-index";

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

const withCharacter = (label: string) =>
  base({
    hpcItems: [
      {
        symptomCode: "chest_pain",
        symptomDisplay: "Chest pain",
        properties: [
          {
            propertyCode: "cp_character",
            propertyDisplay: "Character",
            valueType: "single_select",
            labels: [label],
          },
        ],
      },
    ],
  });

describe("featurePresent (maps↔catalog vocabulary aliases)", () => {
  it("direct match (no alias needed)", () => {
    const idx = buildFeatureIndex(base({ pmhScreen: { hypertension: "yes" } }));
    expect(featurePresent(idx, "hypertension")).toBe(true);
  });

  it("character near-miss: map 'Crushing' ↔ catalog 'Crushing / pressing'", () => {
    const idx = buildFeatureIndex(withCharacter("Crushing / pressing"));
    expect(featurePresent(idx, "Crushing")).toBe(true);
  });

  it("character near-miss: map 'Pleuritic' ↔ catalog 'Sharp / pleuritic'", () => {
    const idx = buildFeatureIndex(withCharacter("Sharp / pleuritic"));
    expect(featurePresent(idx, "Pleuritic")).toBe(true);
  });

  it("risk near-miss: map 'diabetes mellitus' ↔ 'diabetes' screen key", () => {
    const idx = buildFeatureIndex(base({ pmhScreen: { diabetes: "yes" } }));
    expect(featurePresent(idx, "diabetes mellitus")).toBe(true);
  });

  it("symptom near-miss: map 'dyspnoea' ↔ HPC 'Breathlessness'", () => {
    const idx = buildFeatureIndex(
      base({
        hpcItems: [
          { symptomCode: "breathlessness", symptomDisplay: "Breathlessness", properties: [] },
        ],
      }),
    );
    expect(featurePresent(idx, "dyspnoea")).toBe(true);
  });

  it("no false positives: unrelated features stay absent", () => {
    const idx = buildFeatureIndex(base({ pmhScreen: { hypertension: "yes" } }));
    expect(featurePresent(idx, "cancer")).toBe(false);
    expect(featurePresent(idx, "Crushing")).toBe(false);
    expect(featurePresent(idx, "diabetes mellitus")).toBe(false);
  });

  it("guillemet free-text features are not force-matched", () => {
    const idx = buildFeatureIndex(withCharacter("Crushing / pressing"));
    expect(featurePresent(idx, "«Thunderclap»")).toBe(false);
    expect(featurePresent(idx, "«Unequal pulses»")).toBe(false);
  });
});

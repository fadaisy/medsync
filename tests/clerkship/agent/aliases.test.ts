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

  const withDizz = (propertyCode: string, label: string) =>
    base({
      hpcItems: [
        {
          symptomCode: "dizziness",
          symptomDisplay: "Dizziness",
          properties: [
            {
              propertyCode,
              propertyDisplay: "Dizziness detail",
              valueType: "single_select",
              labels: [label],
            },
          ],
        },
      ],
    });

  it("dizziness near-miss: map 'True spinning' ↔ catalog 'Vertigo (spinning)'", () => {
    const idx = buildFeatureIndex(withDizz("dizz_type", "Vertigo (spinning)"));
    expect(featurePresent(idx, "True spinning")).toBe(true);
  });

  it("dizziness near-miss: 'Light-headed / faint type' ↔ both presyncope displays", () => {
    for (const label of ["Pre-syncope (about to faint)", "Vague light-headedness"]) {
      const idx = buildFeatureIndex(withDizz("dizz_type", label));
      expect(featurePresent(idx, "Light-headed / faint type")).toBe(true);
    }
  });

  // One token, three capture points — featurePresent is boolean-OR, so tapping
  // several focal-neuro displays still scores the weight once (no double count).
  it("dizziness focal-neuro alias spans timing / red-flag / associated displays", () => {
    for (const c of [
      { prop: "dizz_timing", label: "With focal neurology" },
      { prop: "dizz_redflags", label: "Focal neurology" },
      { prop: "dizz_assoc", label: "Diplopia / dysarthria / ataxia" },
    ]) {
      const idx = buildFeatureIndex(withDizz(c.prop, c.label));
      expect(featurePresent(idx, "With focal neuro symptoms")).toBe(true);
    }
  });

  // Guards the scoping decision: keys SHARED with other complaints are not
  // aliased to a dizziness-only display, or a dizziness capture would silently
  // score another complaint's differential.
  it("shared keys are not aliased to dizziness-only displays", () => {
    const idx = buildFeatureIndex(withDizz("dizz_timing", "Days, continuous"));
    expect(featurePresent(idx, "Continuous")).toBe(false);
    expect(featurePresent(idx, "nausea/vomiting")).toBe(false);
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

import type { AgentInput } from "@/lib/clerkship/agent/types";
import { describe, expect, it } from "vitest";

import { buildFeatureIndex } from "@/lib/clerkship/agent/feature-index";

const EMPTY: AgentInput = {
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
};

describe("buildFeatureIndex", () => {
  it("empty input → empty index", () => {
    const idx = buildFeatureIndex(EMPTY);
    expect(idx.presentDisplays.size).toBe(0);
    expect(idx.complaintCodes.size).toBe(0);
  });

  it("captured symptom display + property labels become present tokens + complaint code", () => {
    const idx = buildFeatureIndex({
      ...EMPTY,
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
    });
    expect(idx.complaintCodes.has("chest_pain")).toBe(true);
    expect(idx.presentDisplays.has("chest pain")).toBe(true);
    expect(idx.presentDisplays.has("crushing")).toBe(true);
  });

  it("ROS present → presentDisplays; ROS denies → deniedDisplays (never present)", () => {
    const idx = buildFeatureIndex({
      ...EMPTY,
      ros: [
        {
          symptomCode: "dyspnoea",
          symptomDisplay: "Dyspnoea",
          system: "respiratory",
          status: "present",
        },
        { symptomCode: "cough", symptomDisplay: "Cough", system: "respiratory", status: "denies" },
      ],
    });
    expect(idx.presentDisplays.has("dyspnoea")).toBe(true);
    expect(idx.deniedDisplays.has("cough")).toBe(true);
    expect(idx.presentDisplays.has("cough")).toBe(false);
  });

  it("only PRESENT exam findings index; not_examined / absent are ignored", () => {
    const idx = buildFeatureIndex({
      ...EMPTY,
      examGeneralFindings: [
        { code: "pallor", group: "general", display: "Pallor", state: "present" },
        { code: "jaundice", group: "general", display: "Jaundice", state: "not_examined" },
        { code: "cyanosis", group: "general", display: "Cyanosis", state: "absent" },
      ],
    });
    expect(idx.presentDisplays.has("pallor")).toBe(true);
    expect(idx.presentDisplays.has("jaundice")).toBe(false);
    expect(idx.presentDisplays.has("cyanosis")).toBe(false);
  });

  it("pmhScreen 'yes' keys map to condition labels in presentDisplays", () => {
    const idx = buildFeatureIndex({
      ...EMPTY,
      pmhScreen: { hypertension: "yes", diabetes: "no" },
    });
    expect(idx.presentDisplays.has("hypertension")).toBe(true);
    expect(idx.presentDisplays.has("diabetes")).toBe(false);
  });

  it("structured exam fields index as semantic tokens", () => {
    const idx = buildFeatureIndex({
      ...EMPTY,
      examRespiratory: {
        percussion: { lower_right: "stony_dull" },
        breathSounds: { lower_right: "absent" },
      } as AgentInput["examRespiratory"],
      examCardiovascular: {
        pulseRhythm: "irregularly_irregular",
        jvp: "raised",
        murmurs: [{ id: "m1", timing: "ejection_systolic" }],
      } as AgentInput["examCardiovascular"],
      examAbdominal: {
        liver: { palpable: true },
        shiftingDullness: true,
      } as AgentInput["examAbdominal"],
      examNeurological: {
        power: { r_arm: 3 },
        plantar: { right: "up" },
      } as AgentInput["examNeurological"],
    });
    for (const t of [
      "stony dull percussion",
      "absent breath sounds",
      "irregularly irregular pulse",
      "raised jvp",
      "cardiac murmur",
      "systolic murmur",
      "hepatomegaly",
      "ascites",
      "focal limb weakness",
      "upgoing plantar",
    ]) {
      expect(idx.presentDisplays.has(t)).toBe(true);
    }
  });

  it("normal structured exam values do NOT index abnormal tokens", () => {
    const idx = buildFeatureIndex({
      ...EMPTY,
      examCardiovascular: {
        pulseRhythm: "regular",
        jvp: "not_raised",
      } as AgentInput["examCardiovascular"],
      examAbdominal: { liver: { palpable: false } } as AgentInput["examAbdominal"],
    });
    expect(idx.presentDisplays.has("irregularly irregular pulse")).toBe(false);
    expect(idx.presentDisplays.has("raised jvp")).toBe(false);
    expect(idx.presentDisplays.has("hepatomegaly")).toBe(false);
  });
});

import type { AgentInput, Demographics, FeatureIndex } from "@/lib/clerkship/agent/types";
import { describe, expect, it } from "vitest";

import { loadAgentPacks } from "@/lib/clerkship/agent/packs";
import { suggestDiagnoses } from "@/lib/clerkship/agent/reducers/diagnosis";

// End-to-end over the REAL wired chest_pain.json (sourced chunk 2) on rankedMaps.
// Validates that the expanded differential loads + the weights produce sensible tiers.
// Loose assertions (tier membership / presence), not exact ordering — robust to tuning.

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

const chestPainMaps = () => {
  const { rankedMaps } = loadAgentPacks();
  return rankedMaps.filter((m) => m.code === "chest_pain");
};

const idx = (present: string[]): FeatureIndex => ({
  presentDisplays: new Set(present.map((p) => p.toLowerCase())),
  deniedDisplays: new Set(),
  complaintCodes: new Set(["chest_pain"]),
  provenance: new Map(),
});

const run = (present: string[], demo: Demographics) =>
  suggestDiagnoses(EMPTY, idx(present), chestPainMaps(), { ranked: true, demographics: demo });

const byDx = (out: ReturnType<typeof run>, dx: string) => out.find((i) => i.suggests?.dx === dx);

describe("chest_pain — wired sourced weights", () => {
  it("loads the expanded differential (existing + new dx) — ~15 in play", () => {
    const out = run([], { ageYears: 50, sex: "male" });
    expect(out.length).toBeGreaterThanOrEqual(15);
    // a couple of the NEW diagnoses are present
    expect(byDx(out, "Community-acquired pneumonia")).toBeTruthy();
    expect(byDx(out, "Stable angina")).toBeTruthy();
    expect(byDx(out, "TB pleuritis / pleural effusion")).toBeTruthy();
  });

  it("68M with exertional + crushing → ACS leading", () => {
    const out = run(["exertional", "crushing"], { ageYears: 68, sex: "male" });
    expect(byDx(out, "Acute coronary syndrome / MI")?.tier).toBe("leading");
  });

  it("reproducible-on-palpation → musculoskeletal leading; ACS demoted but still present", () => {
    const out = run(["reproducible on palpation"], { ageYears: 30, sex: "male" });
    expect(byDx(out, "Musculoskeletal / costochondritis")?.tier).toBe("leading");
    expect(byDx(out, "Acute coronary syndrome / MI")).toBeTruthy(); // never dropped (must-not-miss)
  });

  it("pleuritic + cough + fever + sputum → pneumonia leading", () => {
    const out = run(["pleuritic", "cough", "fever", "sputum"], { ageYears: 40, sex: "female" });
    expect(byDx(out, "Community-acquired pneumonia")?.tier).toBe("leading");
  });

  it("sickle-cell acute chest syndrome is must-not-miss (pinned regardless of score)", () => {
    const out = run([], { ageYears: 25, sex: "male" });
    expect(byDx(out, "Sickle-cell acute chest syndrome")?.suggests?.mustNotMiss).toBe(true);
  });
});

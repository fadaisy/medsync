import type { AgentInput, Demographics, FeatureIndex } from "@/lib/clerkship/agent/types";
import { describe, expect, it } from "vitest";

import { loadAgentPacks } from "@/lib/clerkship/agent/packs";
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

const rankedMaps = () => loadAgentPacks().rankedMaps;

const idx = (complaints: string[], present: string[]): FeatureIndex => ({
  presentDisplays: new Set(present.map((p) => p.toLowerCase())),
  deniedDisplays: new Set(),
  complaintCodes: new Set(complaints),
  provenance: new Map(),
});

const run = (complaints: string[], present: string[], demo?: Demographics) =>
  suggestDiagnoses(EMPTY, idx(complaints, present), rankedMaps(), {
    ranked: true,
    demographics: demo,
  });
const byDx = (out: ReturnType<typeof run>, dx: string) => out.find((i) => i.suggests?.dx === dx);

describe("cough — wired sourced weights", () => {
  it("loads the expanded cough differential incl. new dx (PCP, bronchiectasis, aspergilloma)", () => {
    const out = run(["cough"], []);
    expect(out.length).toBeGreaterThanOrEqual(13);
    expect(byDx(out, "Pneumocystis pneumonia (PCP)")).toBeTruthy();
    expect(byDx(out, "Bronchiectasis")).toBeTruthy();
    expect(byDx(out, "Aspergilloma / chronic pulmonary aspergillosis")).toBeTruthy();
  });

  it("chronic cough + night sweats + weight loss + HIV → TB leading", () => {
    const out = run(["cough"], ["chronic over 3 weeks", "night sweats", "weight loss", "hiv"]);
    expect(byDx(out, "Tuberculosis")?.tier).toBe("leading");
  });

  it("PCP is conditionally pinned — must-not-miss only with HIV/immunosuppression", () => {
    const noHiv = run(["cough"], ["dry", "exertional dyspnoea"]);
    expect(byDx(noHiv, "Pneumocystis pneumonia (PCP)")?.suggests?.mustNotMiss).toBe(false);
    const hiv = run(["cough"], ["dry", "exertional dyspnoea", "hiv"]);
    expect(byDx(hiv, "Pneumocystis pneumonia (PCP)")?.suggests?.mustNotMiss).toBe(true);
  });

  it("does not double-count haemoptysis (listed as both 'Haemoptysis' and 'haemoptysis')", () => {
    const out = run(["cough"], ["haemoptysis"]);
    const tb = byDx(out, "Tuberculosis")!;
    const haemoptysisContribs = (tb.contributions ?? []).filter(
      (c) => c.source === "feature" && c.label.toLowerCase() === "haemoptysis",
    );
    expect(haemoptysisContribs.length).toBe(1); // counted once, not twice
  });

  it("cross-complaint: chest pain + cough → Pulmonary embolism reinforced (fits both)", () => {
    const out = run(["chest_pain", "cough"], []);
    const pe = byDx(out, "Pulmonary embolism")!;
    expect(pe.contributions?.some((c) => c.source === "interaction")).toBe(true);
  });
});

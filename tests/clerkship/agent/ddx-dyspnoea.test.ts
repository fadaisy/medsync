import type { AgentInput, FeatureIndex } from "@/lib/clerkship/agent/types";
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

const maps = () => loadAgentPacks().rankedMaps;
const idx = (present: string[]): FeatureIndex => ({
  presentDisplays: new Set(present.map((p) => p.toLowerCase())),
  deniedDisplays: new Set(),
  complaintCodes: new Set(["dyspnoea"]),
  provenance: new Map(),
});
const run = (present: string[]) =>
  suggestDiagnoses(EMPTY, idx(present), maps(), { ranked: true, demographics: undefined });
const byDx = (out: ReturnType<typeof run>, dx: string) => out.find((i) => i.suggests?.dx === dx);

describe("dyspnoea — wired sourced weights", () => {
  it("loads the expanded differential incl. new dx (pleural effusion, DKA, pericardial effusion)", () => {
    const out = run([]);
    expect(out.length).toBeGreaterThanOrEqual(14);
    expect(byDx(out, "Pleural effusion (TB / parapneumonic / malignant)")).toBeTruthy();
    expect(byDx(out, "Metabolic acidosis / DKA (Kussmaul breathing)")).toBeTruthy();
  });

  it("orthopnoea + PND + leg swelling → acute pulmonary oedema leading", () => {
    const out = run(["orthopnoea", "paroxysmal nocturnal dyspnoea", "leg swelling"]);
    expect(byDx(out, "Acute pulmonary oedema (heart failure)")?.tier).toBe("leading");
  });

  it("DKA conditionally pinned — fires on diabetes OR on polyuria (new-onset) ", () => {
    const none = run(["nausea/vomiting"]);
    expect(byDx(none, "Metabolic acidosis / DKA (Kussmaul breathing)")?.suggests?.mustNotMiss).toBe(
      false,
    );
    const dm = run(["diabetes mellitus"]);
    expect(byDx(dm, "Metabolic acidosis / DKA (Kussmaul breathing)")?.suggests?.mustNotMiss).toBe(
      true,
    );
    const polyuria = run(["polyuria/polydipsia"]); // new-onset, no diabetes label yet
    expect(
      byDx(polyuria, "Metabolic acidosis / DKA (Kussmaul breathing)")?.suggests?.mustNotMiss,
    ).toBe(true);
  });

  it("PCP conditionally pinned — only with HIV/immunosuppression", () => {
    expect(
      byDx(run(["exertional dyspnoea"]), "Pneumocystis pneumonia (PCP)")?.suggests?.mustNotMiss,
    ).toBe(false);
    expect(
      byDx(run(["exertional dyspnoea", "hiv"]), "Pneumocystis pneumonia (PCP)")?.suggests
        ?.mustNotMiss,
    ).toBe(true);
  });
});

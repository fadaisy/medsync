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
  complaintCodes: new Set(["abdominal_pain"]),
  provenance: new Map(),
});
const run = (present: string[]) =>
  suggestDiagnoses(EMPTY, idx(present), maps(), { ranked: true, demographics: undefined });
const byDx = (out: ReturnType<typeof run>, dx: string) => out.find((i) => i.suggests?.dx === dx);

describe("abdominal_pain — wired sourced weights", () => {
  it("loads the expanded differential incl. new dx (PUD, biliary, renal colic, PID)", () => {
    const out = run([]);
    expect(out.length).toBeGreaterThanOrEqual(14);
    expect(byDx(out, "Peptic ulcer disease / gastritis")).toBeTruthy();
    expect(byDx(out, "Biliary colic / cholecystitis / cholangitis")).toBeTruthy();
  });

  it("RIF + migrated-from-umbilicus → appendicitis leading", () => {
    const out = run(["right iliac fossa", "migrated from umbilicus", "appetite loss"]);
    expect(byDx(out, "Appendicitis")?.tier).toBe("leading");
  });

  it("ectopic pregnancy conditionally pinned — only in a reproductive-age woman / missed period", () => {
    expect(byDx(run([]), "Ectopic pregnancy")?.suggests?.mustNotMiss).toBe(false);
    expect(byDx(run(["reproductive-age woman"]), "Ectopic pregnancy")?.suggests?.mustNotMiss).toBe(
      true,
    );
    expect(byDx(run(["missed period"]), "Ectopic pregnancy")?.suggests?.mustNotMiss).toBe(true);
  });

  it("sickle-cell crisis + DKA conditionally pinned", () => {
    expect(byDx(run([]), "Sickle-cell vaso-occlusive crisis")?.suggests?.mustNotMiss).toBe(false);
    expect(
      byDx(run(["sickle-cell disease"]), "Sickle-cell vaso-occlusive crisis")?.suggests
        ?.mustNotMiss,
    ).toBe(true);
    expect(
      byDx(run(["polyuria/polydipsia"]), "DKA presenting as abdominal pain")?.suggests?.mustNotMiss,
    ).toBe(true);
  });
});

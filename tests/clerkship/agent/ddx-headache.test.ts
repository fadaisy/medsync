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
  complaintCodes: new Set(["headache"]),
  provenance: new Map(),
});
const run = (present: string[]) =>
  suggestDiagnoses(EMPTY, idx(present), maps(), { ranked: true, demographics: undefined });
const byDx = (out: ReturnType<typeof run>, dx: string) => out.find((i) => i.suggests?.dx === dx);

describe("headache — wired sourced weights", () => {
  it("loads the expanded differential incl. new dx (cryptococcal, toxoplasmosis, eclampsia)", () => {
    const out = run([]);
    expect(out.length).toBeGreaterThanOrEqual(14);
    expect(byDx(out, "Cryptococcal meningitis")).toBeTruthy();
    expect(byDx(out, "Pre-eclampsia / eclampsia")).toBeTruthy();
  });

  it("thunderclap + maximal-at-onset → SAH leading", () => {
    const out = run(["thunderclap", "maximal at onset"]);
    expect(byDx(out, "Subarachnoid haemorrhage")?.tier).toBe("leading");
  });

  it("cryptococcal meningitis + CNS toxoplasmosis conditionally pinned — only with HIV", () => {
    const noHiv = run(["fever"]);
    expect(byDx(noHiv, "Cryptococcal meningitis")?.suggests?.mustNotMiss).toBe(false);
    expect(byDx(noHiv, "CNS toxoplasmosis")?.suggests?.mustNotMiss).toBe(false);
    const hiv = run(["fever", "hiv"]);
    expect(byDx(hiv, "Cryptococcal meningitis")?.suggests?.mustNotMiss).toBe(true);
    expect(byDx(hiv, "CNS toxoplasmosis")?.suggests?.mustNotMiss).toBe(true);
  });

  it("GCA conditionally pinned (age over 50); eclampsia conditionally pinned (pregnancy); cerebral malaria unconditional", () => {
    expect(byDx(run([]), "Giant cell arteritis")?.suggests?.mustNotMiss).toBe(false);
    expect(
      byDx(run(["new headache age over 50"]), "Giant cell arteritis")?.suggests?.mustNotMiss,
    ).toBe(true);
    expect(byDx(run([]), "Pre-eclampsia / eclampsia")?.suggests?.mustNotMiss).toBe(false);
    expect(
      byDx(run(["reproductive-age woman"]), "Pre-eclampsia / eclampsia")?.suggests?.mustNotMiss,
    ).toBe(true);
    expect(byDx(run([]), "Cerebral malaria")?.suggests?.mustNotMiss).toBe(true); // unconditional
  });
});

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
  complaintCodes: new Set(["confusion"]),
  provenance: new Map(),
});
const run = (present: string[]) =>
  suggestDiagnoses(EMPTY, idx(present), maps(), { ranked: true, demographics: undefined });
const byDx = (out: ReturnType<typeof run>, dx: string) => out.find((i) => i.suggests?.dx === dx);

describe("confusion — wired sourced weights", () => {
  it("loads the expanded differential incl. new dx (hepatic enceph, uraemic, HIV CNS)", () => {
    const out = run([]);
    expect(out.length).toBeGreaterThanOrEqual(14);
    expect(byDx(out, "Hepatic encephalopathy")).toBeTruthy();
    expect(
      byDx(out, "HIV CNS disease (cryptococcal / toxoplasmosis / HIV encephalopathy)"),
    ).toBeTruthy();
  });

  it("acute + fluctuating + fever → sepsis/meningitis leading", () => {
    const out = run(["acute", "fluctuating", "fever", "headache"]);
    expect(byDx(out, "Sepsis / meningitis / encephalitis")?.tier).toBe("leading");
  });

  it("hypoglycaemia kept UNCONDITIONAL (pins for every confusion — DEFG)", () => {
    expect(byDx(run([]), "Hypoglycaemia")?.suggests?.mustNotMiss).toBe(true);
  });

  it("conditional pins: cerebral malaria (fever), hepatic enceph (liver), HIV CNS (HIV)", () => {
    expect(byDx(run([]), "Cerebral malaria")?.suggests?.mustNotMiss).toBe(false);
    expect(byDx(run(["fever"]), "Cerebral malaria")?.suggests?.mustNotMiss).toBe(true);
    expect(byDx(run([]), "Hepatic encephalopathy")?.suggests?.mustNotMiss).toBe(false);
    expect(byDx(run(["liver disease"]), "Hepatic encephalopathy")?.suggests?.mustNotMiss).toBe(
      true,
    );
    expect(
      byDx(run(["hiv"]), "HIV CNS disease (cryptococcal / toxoplasmosis / HIV encephalopathy)")
        ?.suggests?.mustNotMiss,
    ).toBe(true);
  });
});

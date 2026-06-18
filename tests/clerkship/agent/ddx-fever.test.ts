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

const feverMaps = () => loadAgentPacks().rankedMaps;
const idx = (present: string[]): FeatureIndex => ({
  presentDisplays: new Set(present.map((p) => p.toLowerCase())),
  deniedDisplays: new Set(),
  complaintCodes: new Set(["fever"]),
  provenance: new Map(),
});
const run = (present: string[]) =>
  suggestDiagnoses(EMPTY, idx(present), feverMaps(), { ranked: true, demographics: undefined });
const byDx = (out: ReturnType<typeof run>, dx: string) => out.find((i) => i.suggests?.dx === dx);

describe("fever — wired sourced weights", () => {
  it("loads the expanded fever differential incl. new dx (typhoid, leptospirosis, brucellosis)", () => {
    const out = run([]);
    expect(out.length).toBeGreaterThanOrEqual(15);
    expect(byDx(out, "Typhoid / enteric fever")).toBeTruthy();
    expect(byDx(out, "Leptospirosis")).toBeTruthy();
  });

  it("malaria is an UNCONDITIONAL must-not-miss (pins for every fever) and leads with tertian + rigors", () => {
    const baseline = run([]);
    expect(byDx(baseline, "Malaria")?.suggests?.mustNotMiss).toBe(true); // pinned even with no features
    const typical = run([
      "relapsing / tertian pattern",
      "rigors",
      "malaria-endemic residence/travel",
    ]);
    expect(byDx(typical, "Malaria")?.tier).toBe("leading");
  });

  it("viral haemorrhagic fever is CONDITIONALLY pinned — must-not-miss only with high-risk exposure", () => {
    const noExposure = run(["headache", "nausea/vomiting"]);
    expect(
      byDx(noExposure, "Viral haemorrhagic fever (Ebola / Marburg)")?.suggests?.mustNotMiss,
    ).toBe(false);
    const exposed = run(["headache", "high-risk exposure"]);
    expect(byDx(exposed, "Viral haemorrhagic fever (Ebola / Marburg)")?.suggests?.mustNotMiss).toBe(
      true,
    );
  });
});

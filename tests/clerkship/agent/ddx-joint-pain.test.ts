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
  complaintCodes: new Set(["joint_pain"]),
  provenance: new Map(),
});
const run = (present: string[]) =>
  suggestDiagnoses(EMPTY, idx(present), maps(), { ranked: true, demographics: undefined });
const byDx = (out: ReturnType<typeof run>, dx: string) => out.find((i) => i.suggests?.dx === dx);

describe("joint_pain — wired sourced weights", () => {
  it("loads the expanded differential incl. new dx (gonococcal, TB arthritis, chikungunya, reactive, osteomyelitis)", () => {
    const out = run([]);
    expect(out.length).toBeGreaterThanOrEqual(14);
    expect(byDx(out, "Disseminated gonococcal arthritis")).toBeTruthy();
    expect(byDx(out, "TB arthritis / Poncet's / spinal TB")).toBeTruthy();
    expect(byDx(out, "Chikungunya / arboviral polyarthralgia")).toBeTruthy();
    expect(byDx(out, "Reactive arthritis")).toBeTruthy();
    expect(byDx(out, "Osteomyelitis")).toBeTruthy();
  });

  // disc_joint_pain option displays match the map tokens directly (ADR 0065)
  it("single hot swollen joint + fever → septic arthritis leading; worse-with-use → OA leading", () => {
    const sa = run(["single hot swollen joint", "with fever", "acute"]);
    expect(byDx(sa, "Septic arthritis")?.tier).toBe("leading");
    const oa = run(["worse with use", "brief stiffness"]);
    expect(byDx(oa, "Osteoarthritis / mechanical")?.tier).toBe("leading");
  });

  it("septic arthritis stays UNCONDITIONAL must-not-miss (every hot joint is septic until proven)", () => {
    expect(byDx(run([]), "Septic arthritis")?.suggests?.mustNotMiss).toBe(true);
  });

  it("conditional pins: haemarthrosis (anticoagulant), TB arthritis (TB), osteomyelitis (diabetes)", () => {
    const haem = "Haemarthrosis";
    expect(byDx(run([]), haem)?.suggests?.mustNotMiss).toBe(false);
    expect(byDx(run(["anticoagulant"]), haem)?.suggests?.mustNotMiss).toBe(true);
    const tb = "TB arthritis / Poncet's / spinal TB";
    expect(byDx(run([]), tb)?.suggests?.mustNotMiss).toBe(false);
    expect(byDx(run(["tuberculosis"]), tb)?.suggests?.mustNotMiss).toBe(true);
    const osteo = "Osteomyelitis";
    expect(byDx(run([]), osteo)?.suggests?.mustNotMiss).toBe(false);
    expect(byDx(run(["diabetes"]), osteo)?.suggests?.mustNotMiss).toBe(true);
  });

  it("reachable-pin fixes: DGI pins on migratory; haemarthrosis pins on the capturable bleeding sign", () => {
    const dgi = "Disseminated gonococcal arthritis";
    expect(byDx(run([]), dgi)?.suggests?.mustNotMiss).toBe(false);
    expect(byDx(run(["migratory"]), dgi)?.suggests?.mustNotMiss).toBe(true);
    // haemarthrosis reachable via the ROS 'easy bruising/bleeding' sign (anticoagulant is a capture gap)
    expect(byDx(run(["easy bruising/bleeding"]), "Haemarthrosis")?.suggests?.mustNotMiss).toBe(
      true,
    );
  });
});

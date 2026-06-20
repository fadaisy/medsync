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
  complaintCodes: new Set(["focal_weakness"]),
  provenance: new Map(),
});
const run = (present: string[]) =>
  suggestDiagnoses(EMPTY, idx(present), maps(), { ranked: true, demographics: undefined });
const byDx = (out: ReturnType<typeof run>, dx: string) => out.find((i) => i.suggests?.dx === dx);

describe("focal_weakness — wired sourced weights", () => {
  it("loads the expanded differential incl. new dx (TIA, toxoplasmosis, cord compression)", () => {
    const out = run([]);
    expect(out.length).toBeGreaterThanOrEqual(14);
    expect(byDx(out, "Transient ischaemic attack (TIA)")).toBeTruthy();
    expect(byDx(out, "Spinal cord compression (TB/Pott's)")).toBeTruthy();
  });

  it("sudden + unilateral face/arm/leg + speech disturbance → acute ischaemic stroke leading", () => {
    const out = run(["sudden", "unilateral face/arm/leg", "speech disturbance"]);
    expect(byDx(out, "Acute ischaemic stroke")?.tier).toBe("leading");
  });

  it("hypoglycaemia + CNS toxoplasmosis conditionally pinned", () => {
    expect(byDx(run([]), "Hypoglycaemia (stroke mimic)")?.suggests?.mustNotMiss).toBe(false);
    expect(
      byDx(run(["insulin / sulfonylurea"]), "Hypoglycaemia (stroke mimic)")?.suggests?.mustNotMiss,
    ).toBe(true);
    expect(byDx(run([]), "CNS toxoplasmosis")?.suggests?.mustNotMiss).toBe(false);
    expect(byDx(run(["hiv"]), "CNS toxoplasmosis")?.suggests?.mustNotMiss).toBe(true);
  });

  it("cerebral malaria pins on the FEVER feature gate; cord compression is unconditional", () => {
    expect(byDx(run([]), "Cerebral malaria with focal signs")?.suggests?.mustNotMiss).toBe(false);
    expect(byDx(run(["fever"]), "Cerebral malaria with focal signs")?.suggests?.mustNotMiss).toBe(
      true,
    );
    expect(byDx(run([]), "Spinal cord compression (TB/Pott's)")?.suggests?.mustNotMiss).toBe(true);
  });
});

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
  complaintCodes: new Set(["syncope"]),
  provenance: new Map(),
});
const run = (present: string[]) =>
  suggestDiagnoses(EMPTY, idx(present), maps(), { ranked: true, demographics: undefined });
const byDx = (out: ReturnType<typeof run>, dx: string) => out.find((i) => i.suggests?.dx === dx);

describe("syncope — wired sourced weights", () => {
  it("loads the expanded differential incl. new dx (anaemia, sepsis/malaria, structural)", () => {
    const out = run([]);
    expect(out.length).toBeGreaterThanOrEqual(11);
    expect(byDx(out, "Severe anaemia / acute blood loss as collapse")).toBeTruthy();
    expect(byDx(out, "Structural / valvular heart disease (rheumatic / HCM)")).toBeTruthy();
  });

  it("prolonged-standing + prodrome + rapid recovery → vasovagal leading; cardiac stays unconditional must-not-miss", () => {
    const out = run(["prolonged standing trigger", "prodrome nausea/warmth", "rapid recovery"]);
    expect(byDx(out, "Vasovagal syncope")?.tier).toBe("leading");
    expect(
      byDx(out, "Cardiac syncope (arrhythmia / outflow obstruction)")?.suggests?.mustNotMiss,
    ).toBe(true);
  });

  it("ectopic-as-collapse conditionally pinned (reproductive-age woman / abdominal pain)", () => {
    expect(byDx(run([]), "Ruptured AAA / ectopic as collapse")?.suggests?.mustNotMiss).toBe(false);
    expect(
      byDx(run(["reproductive-age woman"]), "Ruptured AAA / ectopic as collapse")?.suggests
        ?.mustNotMiss,
    ).toBe(true);
    expect(
      byDx(run(["abdominal pain"]), "Ruptured AAA / ectopic as collapse")?.suggests?.mustNotMiss,
    ).toBe(true);
  });

  it("anaemia + sepsis/malaria conditionally pinned", () => {
    expect(
      byDx(run([]), "Severe anaemia / acute blood loss as collapse")?.suggests?.mustNotMiss,
    ).toBe(false);
    expect(
      byDx(run(["pallor"]), "Severe anaemia / acute blood loss as collapse")?.suggests?.mustNotMiss,
    ).toBe(true);
    expect(byDx(run(["fever"]), "Severe sepsis / malaria as collapse")?.suggests?.mustNotMiss).toBe(
      true,
    );
  });
});

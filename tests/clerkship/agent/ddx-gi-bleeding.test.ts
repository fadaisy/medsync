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
  complaintCodes: new Set(["gi_bleeding"]),
  provenance: new Map(),
});
const run = (present: string[]) =>
  suggestDiagnoses(EMPTY, idx(present), maps(), { ranked: true, demographics: undefined });
const byDx = (out: ReturnType<typeof run>, dx: string) => out.find((i) => i.suggests?.dx === dx);

describe("gi_bleeding — wired sourced weights", () => {
  it("loads the expanded differential incl. new dx (schistosomal varices, typhoid, KS, hookworm, VHF)", () => {
    const out = run([]);
    expect(out.length).toBeGreaterThanOrEqual(13);
    expect(byDx(out, "Schistosomal portal hypertension (S. mansoni varices)")).toBeTruthy();
    expect(byDx(out, "Typhoid (enteric-fever) intestinal bleeding / perforation")).toBeTruthy();
    expect(byDx(out, "GI Kaposi sarcoma")).toBeTruthy();
    expect(byDx(out, "Hookworm / helminth chronic occult blood loss")).toBeTruthy();
    expect(byDx(out, "Viral haemorrhagic fever (Ebola/Marburg)")).toBeTruthy();
  });

  it("haematemesis + jaundice + liver disease → variceal haemorrhage leading", () => {
    const out = run(["haematemesis", "jaundice", "abdominal distension", "liver disease"]);
    expect(byDx(out, "Variceal haemorrhage")?.tier).toBe("leading");
  });

  it("variceal / major-UGIB / colorectal malignancy stay UNCONDITIONAL must-not-miss", () => {
    const out = run([]);
    expect(byDx(out, "Variceal haemorrhage")?.suggests?.mustNotMiss).toBe(true);
    expect(byDx(out, "Major upper-GI bleed with shock")?.suggests?.mustNotMiss).toBe(true);
    expect(byDx(out, "Colorectal malignancy")?.suggests?.mustNotMiss).toBe(true);
  });

  it("GI Kaposi pins only with HIV/immunosuppression; typhoid pins with fever", () => {
    expect(byDx(run([]), "GI Kaposi sarcoma")?.suggests?.mustNotMiss).toBe(false);
    expect(byDx(run(["hiv"]), "GI Kaposi sarcoma")?.suggests?.mustNotMiss).toBe(true);
    expect(
      byDx(run([]), "Typhoid (enteric-fever) intestinal bleeding / perforation")?.suggests
        ?.mustNotMiss,
    ).toBe(false);
    expect(
      byDx(run(["fever"]), "Typhoid (enteric-fever) intestinal bleeding / perforation")?.suggests
        ?.mustNotMiss,
    ).toBe(true);
  });

  it("AAA pins on tearing/back pain — NOT on universal abdominal pain; gastric Ca on weight-loss/cancer not smoking", () => {
    const aaa = "Ruptured AAA / aorto-enteric fistula";
    expect(byDx(run(["abdominal pain"]), aaa)?.suggests?.mustNotMiss).toBe(false);
    expect(byDx(run(["tearing or ripping"]), aaa)?.suggests?.mustNotMiss).toBe(true);
    expect(byDx(run(["radiation to back"]), aaa)?.suggests?.mustNotMiss).toBe(true);
    const gastric = "Gastric / oesophageal malignancy";
    expect(byDx(run(["smoking"]), gastric)?.suggests?.mustNotMiss).toBe(false);
    expect(byDx(run(["weight loss"]), gastric)?.suggests?.mustNotMiss).toBe(true);
  });

  it("VHF pins on high-risk exposure only — NOT on fever alone", () => {
    expect(byDx(run([]), "Viral haemorrhagic fever (Ebola/Marburg)")?.suggests?.mustNotMiss).toBe(
      false,
    );
    expect(
      byDx(run(["fever"]), "Viral haemorrhagic fever (Ebola/Marburg)")?.suggests?.mustNotMiss,
    ).toBe(false);
    expect(
      byDx(run(["high-risk exposure"]), "Viral haemorrhagic fever (Ebola/Marburg)")?.suggests
        ?.mustNotMiss,
    ).toBe(true);
  });
});

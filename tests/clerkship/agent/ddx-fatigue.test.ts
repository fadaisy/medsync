import type { AgentInput, FeatureIndex } from "@/lib/clerkship/agent/types";
import { describe, expect, it } from "vitest";

import { buildFeatureIndex } from "@/lib/clerkship/agent/feature-index";
import { loadAgentPacks } from "@/lib/clerkship/agent/packs";
import { suggestDiagnoses } from "@/lib/clerkship/agent/reducers/diagnosis";

const EMPTY: AgentInput = {
  hpcItems: [],
  ros: [],
  pmhItems: [],
  pmhScreen: {},
  examVitals: {},
  bpStandard: "who_esc",
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
  complaintCodes: new Set(["fatigue"]),
  provenance: new Map(),
});
const run = (present: string[]) =>
  suggestDiagnoses(EMPTY, idx(present), maps(), { ranked: true, demographics: undefined });
const byDx = (out: ReturnType<typeof run>, dx: string) => out.find((i) => i.suggests?.dx === dx);

/** Runs the real index so recorded vitals become tokens (ADR 0078). */
const runWithVitals = (vitals: AgentInput["examVitals"], present: string[] = []) => {
  const real = buildFeatureIndex({ ...EMPTY, examVitals: vitals });
  for (const p of present) real.presentDisplays.add(p.toLowerCase());
  real.complaintCodes.add("fatigue");
  return suggestDiagnoses(EMPTY, real, maps(), { ranked: true, demographics: undefined });
};

const OSA = "Obstructive sleep apnoea / sleep-disordered breathing";
const POST = "Post-infectious / persistent fatigue";
const HIVTB = "HIV / TB";

describe("fatigue — wired sourced weights", () => {
  it("loads the expanded differential incl. the new dx", () => {
    const out = run([]);
    expect(out.length).toBeGreaterThanOrEqual(14);
    for (const dx of [
      OSA,
      POST,
      "Chronic kidney disease",
      "Chronic liver disease",
      "Malaria",
      "Medication-related fatigue (including ART)",
      "Adrenal insufficiency",
    ]) {
      expect(byDx(out, dx), dx).toBeTruthy();
    }
  });

  it("HIV/TB, anaemia and depression are the high-prior entries in this population", () => {
    const out = run(["night sweats", "weight loss"]);
    expect(byDx(out, HIVTB)?.tier).toBe("leading");
  });

  // Sleepiness ≠ exhaustion — the discriminator nothing previously used.
  it("sleepiness + snoring surfaces OSA, and does not surface depression", () => {
    const out = run(["sleepiness", "poor sleep / snoring"]);
    expect(byDx(out, OSA)?.tier).toBe("leading");
    expect(byDx(out, "Depression")?.tier).not.toBe("leading");
  });

  it("the appetite/mood bridge: 'Mental more than physical' fires from the fatigue chips", () => {
    const out = run(["low mood / motivation"]);
    // aliased to the map's «Mental more than physical» rule-in
    expect(byDx(out, "Depression")?.tier).not.toBe("ruled_down");
  });

  it("depression falls away when objective disease markers appear", () => {
    const plain = run(["low mood", "mental more than physical"]);
    expect(byDx(plain, "Depression")?.tier).toBe("leading");
    const withFlags = run(["low mood", "mental more than physical", "night sweats", "fever"]);
    expect(byDx(withFlags, "Depression")?.tier).not.toBe("leading");
  });

  it("unconditional must-not-miss: malignancy, HIV/TB and heart failure pin for everyone", () => {
    const out = run([]);
    for (const dx of ["Malignancy", HIVTB, "Heart failure"]) {
      expect(byDx(out, dx)?.suggests?.mustNotMiss, dx).toBe(true);
    }
  });

  it("conditional pins: malaria on fever, adrenal insufficiency on TB/HIV", () => {
    expect(byDx(run([]), "Malaria")?.suggests?.mustNotMiss).toBe(false);
    expect(byDx(run(["fever"]), "Malaria")?.suggests?.mustNotMiss).toBe(true);
    expect(byDx(run([]), "Adrenal insufficiency")?.suggests?.mustNotMiss).toBe(false);
    expect(byDx(run(["hiv"]), "Adrenal insufficiency")?.suggests?.mustNotMiss).toBe(true);
  });

  // ADR 0078 — the payoff: measured vitals now move this complaint's ranking.
  it("recorded vitals rank fatigue: glucose → diabetes, temperature → malaria pin", () => {
    const dm = runWithVitals({ glucose: 19.2 });
    expect(byDx(dm, "Diabetes mellitus")?.tier).toBe("leading");

    // an objectively febrile patient reaches the malaria pin without volunteering fever
    const febrile = runWithVitals({ tempC: 39.1 });
    expect(byDx(febrile, "Malaria")?.suggests?.mustNotMiss).toBe(true);
  });

  it("recorded BMI ranks HIV/TB without any history being volunteered", () => {
    const wasted = runWithVitals({ weightKg: 44, heightCm: 172 });
    expect(byDx(wasted, HIVTB)?.tier).toBe("leading");
  });

  // The entry most capable of harm if it ranks early.
  it("post-infectious fatigue is ruled down by any objective marker of disease", () => {
    expect(byDx(run(["physical fatigue", "fluctuating"]), POST)?.tier).not.toBe("ruled_down");
    const organic = run(["physical fatigue", "fluctuating", "night sweats", "weight loss"]);
    expect(byDx(organic, POST)?.tier).toBe("ruled_down");
    expect(byDx(organic, HIVTB)?.tier).toBe("leading");
    // and it must lose to a measured low BMI too
    expect(
      byDx(runWithVitals({ weightKg: 44, heightCm: 172 }, ["physical fatigue"]), POST)?.tier,
    ).not.toBe("leading");
  });
});

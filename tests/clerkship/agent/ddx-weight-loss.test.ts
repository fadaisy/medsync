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
  complaintCodes: new Set(["weight_loss"]),
  provenance: new Map(),
});
const run = (present: string[]) =>
  suggestDiagnoses(EMPTY, idx(present), maps(), { ranked: true, demographics: undefined });
const byDx = (out: ReturnType<typeof run>, dx: string) => out.find((i) => i.suggests?.dx === dx);

const TB = "Tuberculosis";
const HIV = "HIV / AIDS";
const IE = "Infective endocarditis";
const HIV_CA = "HIV-associated malignancy (Kaposi sarcoma / lymphoma)";
const INTAKE = "Inadequate intake (food insecurity, dysphagia, dementia, dentition)";
const POSTTB = "Post-TB lung disease (including chronic pulmonary aspergillosis)";
const ADRENAL = "Adrenal insufficiency";

describe("weight_loss — wired sourced weights", () => {
  it("loads the expanded differential incl. the new dx", () => {
    const out = run([]);
    expect(out.length).toBeGreaterThanOrEqual(15);
    for (const dx of [
      IE,
      HIV_CA,
      POSTTB,
      ADRENAL,
      INTAKE,
      "Chronic diarrhoea / malabsorption",
      "Chronic liver disease",
      "Chronic kidney disease",
      "Chronic heart failure",
    ]) {
      expect(byDx(out, dx), dx).toBeTruthy();
    }
  });

  // TB and HIV are joint-commonest in this population, not "don't forget" entries.
  it("TB and HIV/AIDS outrank everything on a bare constitutional presentation", () => {
    const out = run(["night sweats", "poor appetite", "over 5% in 6 months"]);
    expect(byDx(out, TB)?.tier).toBe("leading");
    expect(byDx(out, HIV)?.tier).toBe("leading");
  });

  // Smear-negative / extrapulmonary TB is routine here: absence of cough must not demote TB.
  it("TB stays leading with NO cough recorded (no negative weight for its absence)", () => {
    const out = run(["night sweats", "fever", "poor appetite"]);
    expect(byDx(out, TB)?.tier).toBe("leading");
  });

  // The appetite bridge: catalog captures "Good/Poor appetite", the map says
  // "Increased/Reduced appetite". Weight loss DESPITE eating well is the split.
  it("appetite direction splits the differential", () => {
    const good = run(["good appetite", "heat intolerance", "tremor"]);
    expect(byDx(good, "Hyperthyroidism")?.tier).toBe("leading");

    const poor = run(["poor appetite", "low mood"]);
    expect(byDx(poor, "Depression")?.tier).toBe("leading");
    // depression must not be leading once an infective/malignant feature appears
    const poorPlusRedFlag = run(["poor appetite", "low mood", "fever", "night sweats"]);
    expect(byDx(poorPlusRedFlag, "Depression")?.tier).not.toBe("leading");
  });

  it("unconditional must-not-miss: TB, HIV/AIDS and Malignancy pin for everyone", () => {
    const out = run([]);
    expect(byDx(out, TB)?.suggests?.mustNotMiss).toBe(true);
    expect(byDx(out, HIV)?.suggests?.mustNotMiss).toBe(true);
    expect(byDx(out, "Malignancy")?.suggests?.mustNotMiss).toBe(true);
  });

  it("conditional pins stay silent until their gate is met", () => {
    const bare = run([]);
    for (const dx of [IE, HIV_CA, POSTTB, ADRENAL]) {
      expect(byDx(bare, dx)?.suggests?.mustNotMiss, dx).toBe(false);
    }
    expect(byDx(run(["cardiac murmur"]), IE)?.suggests?.mustNotMiss).toBe(true);
    expect(byDx(run(["hiv"]), HIV_CA)?.suggests?.mustNotMiss).toBe(true);
    expect(byDx(run(["tuberculosis", "haemoptysis"]), POSTTB)?.suggests?.mustNotMiss).toBe(true);
    expect(byDx(run(["tuberculosis"]), ADRENAL)?.suggests?.mustNotMiss).toBe(true);
  });

  // The omission this chunk exists to fix — and it is reachable with existing chips.
  it("infective endocarditis surfaces on murmur + fever + RHD", () => {
    const out = run(["cardiac murmur", "fever", "night sweats", "rheumatic heart disease"]);
    expect(byDx(out, IE)?.tier).toBe("leading");
    expect(byDx(out, IE)?.suggests?.mustNotMiss).toBe(true);
  });

  // Kaposi/NHL peak in the early-to-mid thirties, where the solid-organ age prior pushes down.
  it("HIV-associated malignancy ranks on HIV + lymphadenopathy", () => {
    const out = run(["hiv", "lymphadenopathy", "night sweats"]);
    expect(byDx(out, HIV_CA)?.tier).toBe("leading");
  });

  // Attributing wasting to poverty in an undiagnosed TB patient is the harm to prevent.
  it("inadequate intake collapses when an infective red flag appears", () => {
    const social = run(["poor appetite", "memory/cognitive change"]);
    expect(byDx(social, INTAKE)?.tier).not.toBe("ruled_down");

    const withRedFlags = run(["poor appetite", "fever", "night sweats", "haemoptysis"]);
    expect(byDx(withRedFlags, INTAKE)?.tier).toBe("ruled_down");
    expect(byDx(withRedFlags, TB)?.tier).toBe("leading");
  });
});

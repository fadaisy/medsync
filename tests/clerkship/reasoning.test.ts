import type { ReasoningMap } from "@/lib/clerkship/reasoning/types";
import { describe, expect, it } from "vitest";

import {
  diagnosticPausePrompts,
  mapsForCodes,
  mergeReasoning,
  reasoningForCodes,
} from "@/lib/clerkship/reasoning/engine";
import { REASONING_MAPS } from "@/lib/clerkship/reasoning/maps";

/**
 * The engine is differential-BROADENING + anti-anchoring: always plural, always
 * surfaces the must-not-miss, never returns one answer, flags the known-disease
 * trap. Pure.
 */
const chestPain: ReasoningMap = {
  code: "chest_pain",
  display: "Chest pain",
  triggerCodes: ["chest_pain", "pleuritic_chest_pain"],
  problemReprHint: "frame by tempo + character",
  differential: [
    { dx: "ACS / MI", likelihood: "must_not_miss", ruleIn: ["exertional", "radiation to arm"] },
    { dx: "Aortic dissection", likelihood: "must_not_miss", ruleIn: ["tearing", "unequal pulses"] },
    { dx: "GORD", likelihood: "likely", ruleOut: ["burning postprandial"] },
    { dx: "Musculoskeletal", likelihood: "likely" },
  ],
  discriminatingHpc: ["exertional vs rest", "radiation"],
  associated: ["sweating", "dyspnoea"],
  redFlags: ["unequal BP/pulses", "syncope"],
  examTargets: [{ area: "Vascular", sign: "BP both arms", discriminates: "dissection" }],
  historyEmphasis: ["cardiac risk factors"],
  combinations: [
    { features: ["tearing", "unequal pulses"], suggests: "dissection", action: "urgent imaging" },
  ],
};
const dyspnoea: ReasoningMap = {
  code: "dyspnoea",
  display: "Breathlessness",
  triggerCodes: ["dyspnoea", "exertional_dyspnoea"],
  differential: [
    { dx: "PE", likelihood: "must_not_miss", ruleIn: ["pleuritic", "calf pain"] },
    { dx: "Heart failure", likelihood: "likely" },
    { dx: "ACS / MI", likelihood: "must_not_miss" }, // overlaps chest pain → dedupe to must_not_miss
  ],
  discriminatingHpc: ["onset", "orthopnoea"],
  associated: ["ankle swelling"],
  redFlags: ["SpO2 low"],
  examTargets: [{ area: "Resp", sign: "SpO2 + work of breathing" }],
  historyEmphasis: ["VTE risk"],
  combinations: [],
};

describe("mapsForCodes", () => {
  it("fires maps whose trigger codes intersect the captured PC codes", () => {
    expect(
      mapsForCodes([chestPain, dyspnoea], ["pleuritic_chest_pain"]).map((m) => m.code),
    ).toEqual(["chest_pain"]);
    expect(mapsForCodes([chestPain, dyspnoea], ["zzz"])).toEqual([]);
  });
});

describe("mergeReasoning — always plural, must-not-miss surfaced", () => {
  it("returns a plural differential, never one answer", () => {
    const r = mergeReasoning([chestPain]);
    expect(r.differential.length).toBeGreaterThan(1);
    expect(r.differential.some((d) => d.likelihood === "must_not_miss")).toBe(true);
  });
  it("dedupes a shared dx to the MOST cautious likelihood (must-not-miss wins)", () => {
    const r = mergeReasoning([chestPain, dyspnoea]);
    const acs = r.differential.filter((d) => d.dx.toLowerCase().includes("acs"));
    expect(acs).toHaveLength(1);
    expect(acs[0]?.likelihood).toBe("must_not_miss");
  });
  it("merges red flags + exam targets across maps (deduped)", () => {
    const r = mergeReasoning([chestPain, dyspnoea]);
    expect(r.redFlags).toContain("unequal BP/pulses");
    expect(r.examTargets.length).toBe(2);
    expect(r.basis).toEqual(["Chest pain", "Breathlessness"]);
  });
  it("fires the known-disease (anchoring) trap when PMH matches a candidate", () => {
    const r = mergeReasoning([chestPain], { pmhConditions: ["GORD"] });
    expect(r.knownDiseaseTraps.join(" ")).toMatch(/different from usual/i);
  });
  it("no PMH match → no trap", () => {
    expect(mergeReasoning([chestPain], { pmhConditions: ["asthma"] }).knownDiseaseTraps).toEqual(
      [],
    );
  });
});

describe("the seeded CSO maps (17 worked PCs) — the safety invariant", () => {
  it("seeds 17 maps, each with ≥1 must-not-miss (never a non-dangerous differential)", () => {
    expect(REASONING_MAPS.length).toBe(17);
    for (const m of REASONING_MAPS) {
      expect(m.differential.length, m.code).toBeGreaterThan(1);
      expect(
        m.differential.some((d) => d.likelihood === "must_not_miss"),
        m.code,
      ).toBe(true);
      expect(m.triggerCodes.length, m.code).toBeGreaterThan(0);
    }
  });
  it("chest pain surfaces the dangerous mimics", () => {
    const r = reasoningForCodes(REASONING_MAPS, ["chest_pain"]);
    const mnm = r.differential
      .filter((d) => d.likelihood === "must_not_miss")
      .map((d) => d.dx.toLowerCase());
    expect(mnm.some((d) => d.includes("dissection"))).toBe(true);
    expect(mnm.some((d) => d.includes("pulmonary embolism") || d.includes("pe"))).toBe(true);
  });
});

describe("reasoningForCodes + diagnostic pause", () => {
  it("end-to-end from codes", () => {
    const r = reasoningForCodes([chestPain, dyspnoea], ["chest_pain"]);
    expect(r.basis).toEqual(["Chest pain"]);
  });
  it("diagnostic pause prompts are present (the time-out)", () => {
    expect(diagnosticPausePrompts().length).toBeGreaterThanOrEqual(4);
    expect(diagnosticPausePrompts().join(" ")).toMatch(/must not be missed/i);
  });
});

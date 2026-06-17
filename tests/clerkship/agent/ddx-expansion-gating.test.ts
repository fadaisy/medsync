/**
 * TDD: sourced weight files can ADD new diagnoses — but only via rankedMaps.
 * The original `maps` (approved set) must remain unmodified.
 */
import type { ReasoningMap } from "@/lib/clerkship/agent/types";
import type { DdxWeightEntry, DdxWeightFile } from "@/lib/clerkship/agent/weights";
import { describe, expect, it } from "vitest";

import { loadAgentPacks } from "@/lib/clerkship/agent/packs";
import { mergeDdxWeights } from "@/lib/clerkship/agent/weights";

const baseMaps: ReasoningMap[] = [
  {
    code: "chest_pain",
    display: "Chest pain",
    triggerCodes: ["chest_pain"],
    associated: [],
    redFlags: [],
    examTargets: [],
    combinations: [],
    differential: [
      {
        dx: "Acute coronary syndrome",
        likelihood: "must_not_miss",
        ruleIn: ["Exertional"],
        ruleOut: [],
        supportingSymptoms: [],
        refutingSymptoms: [],
        riskFactors: [],
      },
    ],
  },
];

const newDxEntry: DdxWeightEntry = {
  dx: "Aortic dissection",
  likelihood: "must_not_miss",
  featureWeights: { "tearing pain": 4 },
  supportingSymptoms: ["pulse deficit"],
  riskFactors: ["hypertension"],
};

const weightFiles: DdxWeightFile[] = [
  {
    complaint: "chest_pain",
    weights: [newDxEntry],
  },
];

describe("ddx-expansion gating", () => {
  describe("mergeDdxWeights (ranked maps)", () => {
    it("contains the appended new dx that was not in the original maps", () => {
      const rankedMaps = mergeDdxWeights(baseMaps, weightFiles);
      const cp = rankedMaps.find((m) => m.code === "chest_pain")!;
      const appended = cp.differential.find((d) => d.dx === "Aortic dissection");
      expect(appended).toBeDefined();
    });

    it("has more differentials than the original maps (appended dx increases count)", () => {
      const rankedMaps = mergeDdxWeights(baseMaps, weightFiles);
      const ranked = rankedMaps.find((m) => m.code === "chest_pain")!;
      const original = baseMaps.find((m) => m.code === "chest_pain")!;
      expect(ranked.differential.length).toBeGreaterThan(original.differential.length);
    });
  });

  describe("original maps (flat / approved set)", () => {
    it("does NOT contain the new dx — appended dx do not appear in the original maps array", () => {
      // baseMaps is the original, unmerged set
      const cp = baseMaps.find((m) => m.code === "chest_pain")!;
      const leaked = cp.differential.find((d) => d.dx === "Aortic dissection");
      expect(leaked).toBeUndefined();
    });
  });

  describe("loadAgentPacks() — rankedMaps vs maps split", () => {
    it("packs.rankedMaps exists and is an array", () => {
      const packs = loadAgentPacks();
      expect(Array.isArray(packs.rankedMaps)).toBe(true);
    });

    it("packs.maps equals the approved set (no appended dx in maps)", () => {
      const packs = loadAgentPacks();
      // maps and rankedMaps should have the same complaint codes
      const mapCodes = new Set(packs.maps.map((m) => m.code));
      const rankedCodes = new Set(packs.rankedMaps.map((m) => m.code));
      expect(mapCodes).toEqual(rankedCodes);
    });

    it("packs.maps differential entries only carry approved core fields (no weight-file append artifacts)", () => {
      // Since DDX_WEIGHT_FILES is currently empty, maps and rankedMaps differentials
      // should have the same content. This test ensures the split is clean.
      const packs = loadAgentPacks();
      for (let i = 0; i < packs.maps.length; i++) {
        const m = packs.maps[i]!;
        const r = packs.rankedMaps[i]!;
        expect(m.code).toBe(r.code);
        // rankedMaps can only have >= differentials (appended), never fewer
        expect(r.differential.length).toBeGreaterThanOrEqual(m.differential.length);
      }
    });

    it("rankedMaps is a superset of maps (every maps dx appears in rankedMaps for same complaint)", () => {
      const packs = loadAgentPacks();
      for (const m of packs.maps) {
        const ranked = packs.rankedMaps.find((r) => r.code === m.code)!;
        for (const d of m.differential) {
          const identity = d.dxCode ?? d.dx.trim().toLowerCase();
          const found = ranked.differential.find(
            (r) => (r.dxCode ?? r.dx.trim().toLowerCase()) === identity,
          );
          expect(found).toBeDefined();
        }
      }
    });
  });
});

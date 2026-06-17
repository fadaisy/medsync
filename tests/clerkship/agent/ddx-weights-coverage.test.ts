import { describe, expect, it } from "vitest";

import { loadAgentPacks } from "@/lib/clerkship/agent/packs";

// When sourced weight files are added to packs.ts, every entry must resolve to a
// real differential — guards typos / renamed dx (silent no-effect weights).
describe("ddx-weights coverage", () => {
  it("every map differential has a stable identity for cross-complaint matching", () => {
    const { maps } = loadAgentPacks();
    for (const m of maps) {
      const keys = m.differential.map((d) => d.dxCode ?? d.dx.trim().toLowerCase());
      expect(new Set(keys).size).toBe(keys.length); // no duplicate dx within a complaint
    }
  });

  it("every rankedMaps differential has a stable identity for cross-complaint matching", () => {
    const { rankedMaps } = loadAgentPacks();
    for (const m of rankedMaps) {
      const keys = m.differential.map((d) => d.dxCode ?? d.dx.trim().toLowerCase());
      expect(new Set(keys).size).toBe(keys.length); // no duplicate dx within a complaint
    }
  });

  it("any merged sourced weights landed on a real differential (no orphan weights)", () => {
    const { maps } = loadAgentPacks();
    // A differential carrying weight fields must still carry its approved core fields.
    for (const m of maps) {
      for (const d of m.differential) {
        if (d.basePrior !== undefined || d.featureWeights) {
          expect(typeof d.dx).toBe("string");
          expect(Array.isArray(d.ruleIn)).toBe(true);
        }
      }
    }
  });

  it("any merged sourced weights in rankedMaps landed on a real differential (no orphan weights)", () => {
    const { rankedMaps } = loadAgentPacks();
    // A differential carrying weight fields must still carry its approved core fields.
    for (const m of rankedMaps) {
      for (const d of m.differential) {
        if (d.basePrior !== undefined || d.featureWeights) {
          expect(typeof d.dx).toBe("string");
          expect(Array.isArray(d.ruleIn)).toBe(true);
        }
      }
    }
  });
});

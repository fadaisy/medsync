import type { FeatureIndex, MapDifferential } from "@/lib/clerkship/agent/types";
import { describe, expect, it } from "vitest";

import { dedupeWeights, scoreDifferential } from "@/lib/clerkship/agent/weights";

const idxWith = (present: string[]): FeatureIndex => ({
  presentDisplays: new Set(present.map((p) => p.toLowerCase())),
  deniedDisplays: new Set(),
  complaintCodes: new Set(),
  provenance: new Map(),
});

describe("dedupeWeights", () => {
  it("collapses keys that normalize to the same token, keeping the strongest", () => {
    const out = dedupeWeights({ Haemoptysis: 2, haemoptysis: 2, Wheeze: 1, wheeze: 4 });
    const byNorm = Object.fromEntries(out.map((e) => [e.token.toLowerCase(), e.weight]));
    expect(out.length).toBe(2); // haemoptysis + wheeze, once each
    expect(byNorm["haemoptysis"]).toBe(2);
    expect(byNorm["wheeze"]).toBe(4); // max |weight| wins
  });
});

describe("scoreDifferential — no double-count for same-token spellings", () => {
  const dx = (featureWeights: Record<string, number>): MapDifferential => ({
    dx: "X",
    likelihood: "likely",
    ruleIn: [],
    ruleOut: [],
    supportingSymptoms: [],
    refutingSymptoms: [],
    riskFactors: [],
    basePrior: 0,
    featureWeights,
  });

  it("counts a finding once even when listed as both 'Haemoptysis' and 'haemoptysis'", () => {
    const r = scoreDifferential(
      dx({ Haemoptysis: 2, haemoptysis: 2 }),
      idxWith(["haemoptysis"]),
      undefined,
    );
    expect(r.score).toBe(2); // base 0 + 2 (NOT 4)
    expect(r.contributions.filter((c) => c.source === "feature").length).toBe(1);
  });
});

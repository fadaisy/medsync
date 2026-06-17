import type { DxTier, Insight } from "@/lib/clerkship/agent";
import { describe, expect, it } from "vitest";

import { groupSuggestions } from "@/app/doctor/encounters/[encounterId]/_lib/ddx-grouping";

const mk = (id: string, tier: DxTier | undefined, mustNotMiss: boolean): Insight => ({
  id,
  kind: "diagnosis",
  severity: mustNotMiss ? "red" : "info",
  target: { area: "assessment" },
  message: id,
  evidence: [],
  suggests: { dx: id, mustNotMiss },
  tier,
  sourceRef: { pack: "enriched-reasoning-maps", entryId: "x", citation: "y" },
});

/** Every place id appears across the grouped buckets (to assert "exactly once"). */
function placements(g: ReturnType<typeof groupSuggestions>, id: string): number {
  return [g.leading, g.consider, g.lessLikely, g.pinned, g.ruledDown].filter((bucket) =>
    bucket.some((i) => i.id === id),
  ).length;
}

describe("groupSuggestions", () => {
  it("shows an unsupported must-not-miss (less_likely) exactly once — pinned, not in a score tier", () => {
    const g = groupSuggestions([mk("acs", "less_likely", true)]);
    expect(placements(g, "acs")).toBe(1);
    expect(g.pinned.map((i) => i.id)).toEqual(["acs"]);
    expect(g.lessLikely).toEqual([]);
  });

  it("shows a must-not-miss scoring into 'consider' exactly once — pinned only", () => {
    const g = groupSuggestions([mk("pe", "consider", true)]);
    expect(placements(g, "pe")).toBe(1);
    expect(g.pinned.map((i) => i.id)).toEqual(["pe"]);
    expect(g.consider).toEqual([]);
  });

  it("keeps a leading must-not-miss in Leading (not pinned), exactly once", () => {
    const g = groupSuggestions([mk("acs", "leading", true)]);
    expect(placements(g, "acs")).toBe(1);
    expect(g.leading.map((i) => i.id)).toEqual(["acs"]);
    expect(g.pinned).toEqual([]);
  });

  it("never puts a must-not-miss in ruled-down; a non-dangerous low scorer goes there", () => {
    const g = groupSuggestions([
      mk("msk", "ruled_down", false),
      mk("dissection", "ruled_down", true),
    ]);
    expect(g.ruledDown.map((i) => i.id)).toEqual(["msk"]);
    expect(g.pinned.map((i) => i.id)).toEqual(["dissection"]); // pinned, never hidden
    expect(placements(g, "dissection")).toBe(1);
  });

  it("non-must-not-miss dx fall through their score tiers", () => {
    const g = groupSuggestions([mk("gord", "consider", false), mk("costo", "less_likely", false)]);
    expect(g.consider.map((i) => i.id)).toEqual(["gord"]);
    expect(g.lessLikely.map((i) => i.id)).toEqual(["costo"]);
  });

  it("ranked=false when no insight carries a tier (flat mode)", () => {
    expect(groupSuggestions([mk("x", undefined, false)]).ranked).toBe(false);
    expect(groupSuggestions([mk("x", "leading", false)]).ranked).toBe(true);
  });
});

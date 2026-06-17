import type { Insight } from "@/lib/clerkship/agent";

/**
 * Pure grouping of ranked diagnosis suggestions into the Assessment-tab tiers.
 * Decision-support + honesty rules baked in: a must-not-miss is shown EXACTLY
 * once — in Leading if its score qualifies, otherwise pinned in "keep excluding"
 * — and is never dropped into "ruled down" and never hidden. Non-must-not-miss
 * dx fall through the score tiers; only non-dangerous dx can be ruled down.
 */
export interface GroupedSuggestions {
  /** True when insights carry a tier (ranking mode); false → flat list. */
  ranked: boolean;
  leading: Insight[];
  consider: Insight[];
  lessLikely: Insight[];
  /** Must-not-miss not already in Leading — pinned, even at low/negative score. */
  pinned: Insight[];
  /** Non-must-not-miss below the floor — collapsed, but retrievable. */
  ruledDown: Insight[];
}

export function groupSuggestions(suggestions: Insight[]): GroupedSuggestions {
  const ranked = suggestions.some((i) => i.tier);
  const leadIds = new Set(suggestions.filter((i) => i.tier === "leading").map((i) => i.id));
  const pinned = suggestions.filter((i) => i.suggests?.mustNotMiss && !leadIds.has(i.id));
  const pinnedIds = new Set(pinned.map((i) => i.id));
  // Score tiers exclude anything pinned, so a must-not-miss never double-renders.
  const tier = (t: string) => suggestions.filter((i) => i.tier === t && !pinnedIds.has(i.id));
  return {
    ranked,
    leading: tier("leading"),
    consider: tier("consider"),
    lessLikely: tier("less_likely"),
    pinned,
    ruledDown: suggestions.filter((i) => i.tier === "ruled_down" && !i.suggests?.mustNotMiss),
  };
}

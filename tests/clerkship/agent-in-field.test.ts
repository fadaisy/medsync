import type { IncompatibilityRule } from "@/lib/clerkship/agent/types";
import { describe, expect, it } from "vitest";

import { addedSoundDimsByZone } from "@/lib/clerkship/agent/in-field";

const ADDED_VALUES = [
  "wheeze_poly",
  "wheeze_mono",
  "crackles_fine",
  "crackles_coarse",
  "pleural_rub",
  "stridor",
] as const;

// Rule #2 from docs/clinical/agent/sign-incompatibilities.json — absent breath
// sounds over a zone make added sounds (crackles, wheeze) at that zone implausible.
const ABSENT_BS_RULE: IncompatibilityRule = {
  id: "absent-bs-added",
  when: { area: "respiratory", sign: "absent breath sounds", match: ["absent breath sounds"] },
  implausible: [
    { area: "respiratory", sign: "increased vocal resonance at that zone" },
    { area: "respiratory", sign: "crackles at that zone" },
    { area: "respiratory", sign: "wheeze at that zone" },
  ],
  reason: "If breath sounds are truly absent over a zone, added sounds cannot be heard there.",
  citation: "Hutchison's Clinical Methods",
};

// Rule #1 — stony dull percussion; excludes breath-sound/VR cycle values, NOT added sounds.
const STONY_DULL_RULE: IncompatibilityRule = {
  id: "stony-dull",
  when: { area: "respiratory", sign: "stony dull percussion", match: ["stony dull percussion"] },
  implausible: [
    { area: "respiratory", sign: "bronchial breath sounds at that zone" },
    { area: "respiratory", sign: "vesicular (normal) breath sounds at that zone" },
  ],
  reason: "Stony dullness = pleural fluid; breath sounds over fluid are absent/reduced.",
  citation: "Hutchison's Clinical Methods",
};

const valuesAt = (dims: Record<string, { value: string }[]>, zone: string) =>
  (dims[zone] ?? []).map((d) => d.value).sort();

describe("addedSoundDimsByZone", () => {
  it("dims crackles + wheeze (only) at a zone with absent breath sounds, each with the cited reason", () => {
    const dims = addedSoundDimsByZone({ ul_left: "absent", ll_right: "vesicular" }, ADDED_VALUES, [
      ABSENT_BS_RULE,
    ]);
    expect(Object.keys(dims)).toEqual(["ul_left"]);
    expect(valuesAt(dims, "ul_left")).toEqual(
      ["crackles_coarse", "crackles_fine", "wheeze_mono", "wheeze_poly"].sort(),
    );
    // pleural rub + stridor are NOT excluded by the pack → never dimmed (honest).
    expect(valuesAt(dims, "ul_left")).not.toContain("pleural_rub");
    expect(valuesAt(dims, "ul_left")).not.toContain("stridor");
    // every dim carries the cited reason of the rule that excluded it.
    expect(dims.ul_left!.every((d) => d.reason === ABSENT_BS_RULE.reason)).toBe(true);
  });

  it("does not dim a zone whose breath sounds are not the trigger value", () => {
    const dims = addedSoundDimsByZone({ ll_right: "vesicular" }, ADDED_VALUES, [ABSENT_BS_RULE]);
    expect(dims).toEqual({});
  });

  it("returns nothing when no rules are active (gated off)", () => {
    const dims = addedSoundDimsByZone({ ul_left: "absent" }, ADDED_VALUES, []);
    expect(dims).toEqual({});
  });

  it("ignores rules that do not exclude any added sound (e.g. the percussion rule)", () => {
    const dims = addedSoundDimsByZone({ ul_left: "absent" }, ADDED_VALUES, [STONY_DULL_RULE]);
    expect(dims).toEqual({});
  });

  it("tolerates an undefined breath-sounds record", () => {
    expect(addedSoundDimsByZone(undefined, ADDED_VALUES, [ABSENT_BS_RULE])).toEqual({});
  });

  // ── pack-fidelity: anchored whole-word binding (no substring false positives) ──
  it("never dims an unmapped/pathological option value even if its stem is a substring of a pack phrase", () => {
    // 'at_apex' and 'zone_marker' stems ('at' / 'zone') ARE substrings of the pack
    // prose ("crackles AT that ZONE") — anchored binding must NOT dim them.
    const dims = addedSoundDimsByZone(
      { ul_left: "absent" },
      ["crackles_fine", "at_apex", "zone_marker", "pleural_rub", "stridor"],
      [ABSENT_BS_RULE],
    );
    expect(valuesAt(dims, "ul_left")).toEqual(["crackles_fine"]);
  });

  // ── pack-fidelity: per-value reason attribution across multiple rules at a zone ──
  it("attributes each dimmed value to the reason of the rule that excluded it", () => {
    const wheezeOnlyRule: IncompatibilityRule = {
      id: "synthetic-wheeze",
      when: { area: "respiratory", sign: "absent breath sounds", match: ["absent breath sounds"] },
      implausible: [{ area: "respiratory", sign: "wheeze at that zone" }],
      reason: "SYNTHETIC wheeze-specific reason.",
      citation: "test",
    };
    // crackles excluded only by ABSENT_BS_RULE; wheeze excluded by BOTH — first rule
    // (ABSENT_BS_RULE) owns wheeze's reason; crackles keeps its own. No misattribution.
    const dims = addedSoundDimsByZone({ ul_left: "absent" }, ADDED_VALUES, [
      ABSENT_BS_RULE,
      wheezeOnlyRule,
    ]);
    const byValue = Object.fromEntries(dims.ul_left!.map((d) => [d.value, d.reason]));
    expect(byValue["crackles_fine"]).toBe(ABSENT_BS_RULE.reason);
    expect(byValue["wheeze_poly"]).toBe(ABSENT_BS_RULE.reason);
    // and the synthetic rule's reason is the one that would own a value only it excludes
    const dims2 = addedSoundDimsByZone(
      { ul_left: "absent" },
      ["wheeze_poly"],
      [wheezeOnlyRule, ABSENT_BS_RULE],
    );
    expect(dims2.ul_left![0]!.reason).toBe(wheezeOnlyRule.reason);
  });
});

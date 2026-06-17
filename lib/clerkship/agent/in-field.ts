import type { IncompatibilityRule } from "@/lib/clerkship/agent/types";

/**
 * In-field decision-support — applies the cited incompatibility pack DIRECTLY to
 * exam controls (a chip soft-dims when a recorded sign makes it implausible), not
 * just in the rail. Pure + client-safe. The clinical ASSERTION (which trigger
 * excludes which sign, and why) stays in the cited pack; this module only binds
 * the pack's tokens to the exam's option values and applies them per zone.
 *
 * Soft-dim, never a hard block: the clinician can always tap a dimmed chip to
 * record it anyway (the conflict then surfaces in the rail) — decision-support,
 * never autonomous, never fabricated. A dim only appears when an active, gated,
 * CSO-signed incompatibility rule fires at that specific zone.
 */

/** Breath-sound trigger token (pack) → the structured `breathSounds` zone value. */
const BREATH_SOUND_TRIGGER: Record<string, string> = {
  "absent breath sounds": "absent",
  "reduced breath sounds": "reduced",
  "bronchial breath sounds": "bronchial",
};

/**
 * Binding table (token plumbing, NOT clinical content): the whole-word clinical
 * noun an added-sound option value maps to, for ANCHORED matching against the
 * pack's implausible-sign phrases. An option is eligible to dim ONLY if its stem
 * is mapped here AND the pack explicitly names that noun — so dimming can never
 * arise from a loose substring collision, and a sign the pack does not exclude is
 * never dimmed. Extend ONLY when the pack adds a rule naming a new added sound.
 * (Mirrors BREATH_SOUND_TRIGGER; the clinical assertion stays in the pack.)
 */
const ADDED_SOUND_NOUN: Record<string, string> = {
  crackles: "crackles",
  wheeze: "wheeze",
};

/** The stem of an added-sound option value, e.g. "crackles_fine" → "crackles". */
function stem(optionValue: string): string {
  return optionValue.split("_")[0] ?? optionValue;
}

/** Lowercased whole words of a pack sign phrase — for anchored, whole-word matching. */
function wordsOf(phrase: string): Set<string> {
  return new Set(
    phrase
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter(Boolean),
  );
}

/** A dimmed added-sound option at a zone + the cited reason it is implausible. */
export interface AddedSoundDim {
  value: string;
  reason: string;
}

/**
 * Per-zone, the added-sound option values the active incompatibility rules deem
 * implausible there, each paired with the CITED reason of the rule that excluded
 * it (so a chip's reason is always the pack reason for that specific sign). A rule
 * applies to a zone when its breath-sound trigger holds there and it excludes at
 * least one added sound (matched by anchored whole-word binding). Zones with no
 * applicable rule are absent from the result.
 */
export function addedSoundDimsByZone(
  breathSoundsByZone: Partial<Record<string, string>> | undefined,
  addedOptionValues: readonly string[],
  rules: readonly IncompatibilityRule[],
): Record<string, AddedSoundDim[]> {
  const out: Record<string, AddedSoundDim[]> = {};
  if (!breathSoundsByZone) return out;

  for (const rule of rules) {
    const triggerValue = (rule.when.match ?? [])
      .map((t) => BREATH_SOUND_TRIGGER[t.toLowerCase()])
      .find((v): v is string => v != null);
    if (!triggerValue) continue;

    // Anchored, allow-listed binding: an option dims only when the pack names its
    // mapped clinical noun (whole word) in an implausible-sign phrase.
    const excluded = addedOptionValues.filter((v) => {
      const noun = ADDED_SOUND_NOUN[stem(v)];
      return noun != null && rule.implausible.some((im) => wordsOf(im.sign).has(noun));
    });
    if (!excluded.length) continue;

    for (const [zone, bs] of Object.entries(breathSoundsByZone)) {
      if (bs !== triggerValue) continue;
      if (!out[zone]) out[zone] = [];
      const list = out[zone]!;
      for (const value of excluded) {
        // First rule to exclude a value at a zone owns its cited reason — each
        // dim keeps the reason of the rule that actually excluded it.
        if (!list.some((d) => d.value === value)) list.push({ value, reason: rule.reason });
      }
    }
  }
  return out;
}

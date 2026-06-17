/**
 * Vocabulary alignment between the reused diagnosis maps (enriched-reasoning-maps)
 * and the live catalog/structured-exam tokens in the feature index.
 *
 * The maps phrase rule-in / supporting / risk features in their own prose
 * ("Crushing", "Radiation to left arm", "diabetes mellitus"), which near-misses
 * the captured catalog DISPLAY strings ("Crushing / pressing", "Left arm",
 * "diabetes" screen key). This table maps a normalized map-feature → the
 * normalized catalog token(s) that represent it, so diagnosis SUPPORT matching
 * actually fires.
 *
 * CURATED + grounded in real catalog displays (supabase/migrations 0043 cp_*
 * options, 0046 condition picklist, lib/clerkship/history.ts PMH_SCREEN keys) —
 * NOT fuzzy matching, so it introduces no false-positive matches. Guillemet
 * «free-text» map features are intentionally NOT aliased (they are clinician-
 * noted discriminators, never catalog-captured). Keys are pre-normalized
 * (lowercase, guillemets stripped, whitespace collapsed).
 */
import type { FeatureIndex } from "@/lib/clerkship/agent/types";

import { normalizeFeature } from "@/lib/clerkship/agent/normalize";

export const FEATURE_ALIASES: Record<string, string[]> = {
  // ── HPC character (cp_character option displays) ──
  crushing: ["crushing / pressing"],
  pleuritic: ["sharp / pleuritic"],
  sharp: ["sharp / pleuritic"],
  "tearing or ripping": ["tearing", "tearing pain to back"],
  // ── HPC radiation (cp_radiation option displays) ──
  "radiation to left arm": ["left arm"],
  "radiation to jaw": ["jaw / neck / teeth"],
  "radiation to back": ["interscapular / back"],
  // ── HPC timing / exacerbating ──
  exertional: ["exertion", "exertional, eased by rest <10 min"],
  "reproducible on palpation": ["palpation / movement"],
  // ── supporting symptoms (ROS/HPC display near-misses) ──
  dyspnoea: ["breathlessness", "dyspnoea (respiratory)"],
  syncope: ["syncope / presyncope", "blackout / fainting"],
  pallor: ["conjunctival pallor"],
  // ── risk factors (PMH_SCREEN keys + 0046 condition displays) ──
  "diabetes mellitus": ["diabetes", "diabetes mellitus — type 1", "diabetes mellitus — type 2"],
  "ischaemic heart disease": ["ischaemic heart disease / prior mi"],
  cancer: ["cancer (specify site)"],
  "hepatitis b/c": ["hepatitis b", "hepatitis c"],
  "sickle-cell disease": ["sickle_cell"],
  "rheumatic fever": ["rheumatic_fever", "rheumatic heart disease"],
};

/** Is a (map-prose) feature present in the index — directly, or via an alias? */
export function featurePresent(idx: FeatureIndex, raw: string): boolean {
  const n = normalizeFeature(raw);
  if (!n) return false;
  if (idx.presentDisplays.has(n)) return true;
  const aliases = FEATURE_ALIASES[n];
  if (aliases) {
    for (const a of aliases) if (idx.presentDisplays.has(normalizeFeature(a))) return true;
  }
  return false;
}

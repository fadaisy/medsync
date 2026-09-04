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
  // ── oedema laterality / distribution (oed_* options are COMPOUND displays, so
  //    the atomic map tokens never matched; these compound strings are oedema-
  //    specific so they cannot false-match other complaints) ──
  bilateral: [
    "bilateral, pitting, dependent",
    "bilateral, pitting, periorbital too",
    "bilateral + venous skin changes",
    "generalised (anasarca)",
  ],
  unilateral: ["unilateral, painful, warm calf", "unilateral painful (dvt)"],
  "facial / periorbital": ["bilateral, pitting, periorbital too", "morning facial / periorbital"],
  "worse in evening": ["worse end of day"],
  "red and warm": ["unilateral, painful, warm calf"],
  "acute and painful": ["unilateral, painful, warm calf", "unilateral painful (dvt)"],
  orthopnoea: ["orthopnoea / pnd"],
  "paroxysmal nocturnal dyspnoea": ["orthopnoea / pnd"],
  // ── palpitations rhythm / onset / associated (palp_* options use variant +
  //    bundled displays; these strings are palpitations-specific) ──
  "single skipped beats": ["single skips / thumps"],
  "sudden onset and offset": ["sudden on / off"],
  "sudden onset": ["sudden on / off"],
  "with exertion": ["during exertion"],
  "with syncope": ["syncope", "syncope / presyncope"],
  "with chest pain": ["chest pain"],
  "with dizziness/syncope": ["dizziness", "syncope", "syncope / presyncope"],
  tremor: ["sweating / tremor"],
  "heat intolerance": ["heat intolerance / weight loss"],
  gradual: ["gradual build & settle"],
  // ── dizziness type / trigger / timing / focal-neuro (dizz_* HPC options in
  //    migration 0043 + ros_dizziness_vertigo_* in 0045). The dizziness map
  //    phrases every discriminator in its own prose ("True spinning",
  //    "Triggered by head movement, brief") and the catalog captures none of
  //    those strings, so before this block NOTHING in the dizziness
  //    differential fired. Alias matching is boolean-OR, so a clinician who
  //    taps several focal-neuro displays still scores the token ONCE.
  //    Scoped deliberately: these keys are used only by the dizziness
  //    complaint, except "light-headed / faint type" and "on standing", which
  //    syncope shares and where the same capture carries the same meaning.
  //    "Continuous" and "nausea/vomiting" are NOT aliased — those keys are
  //    shared with other complaints, so aliasing them to a dizziness-only
  //    display would let a dizziness capture score another complaint's dx;
  //    dizziness.json uses the catalog displays ("Days, continuous",
  //    "Nausea / vomiting") directly instead.
  "true spinning": ["vertigo (spinning)", "spinning-vertigo"],
  "light-headed / faint type": [
    "pre-syncope (about to faint)",
    "vague light-headedness",
    "light-headed",
  ],
  "triggered by head movement, brief": ["seconds, positional", "head movement"],
  "with focal neuro symptoms": [
    "with focal neurology",
    "focal neurology",
    "diplopia / dysarthria / ataxia",
    "neuro signs",
  ],
  unsteady: ["disequilibrium (unsteady)"],
  "on standing": ["standing", "on standing from lying"],
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

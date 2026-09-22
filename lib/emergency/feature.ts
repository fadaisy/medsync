import "server-only";

/**
 * The symptom catalog and Emergency Pathway flags (ADR 0098 ruling 12) —
 * the `lib/encounter/feature.ts` pattern: server env booleans, read here
 * and passed to clients as props. All off in production until Gate CG
 * (mobile clinical writes) and Gate CS (signed clinical content) are met.
 * Calling (`tel:`) is never flagged: the Emergency sheet renders regardless.
 */

/** The tiered catalog as a pre-step to booking (PRD §7). */
export function symptomCatalogLive(): boolean {
  return process.env.FEATURE_SYMPTOM_CATALOG === "1";
}

/** "Tell a hospital I'm coming" (PRD §8.3). Off: the sheet is call-only. */
export function preAlertLive(): boolean {
  return process.env.FEATURE_PRE_ALERT === "1";
}

/** The two draft first-aid cards (PRD §5.6; Gate A item 5). */
export function firstAidCardsLive(): boolean {
  return process.env.FEATURE_FIRST_AID_CARDS === "1";
}

export type CatalogRenderMode = "signed" | "draft_watermarked" | "off";

/**
 * Gate CS (ruling 2): what the catalog surface may show. Production renders
 * a signed version only — with none signed it keeps the ADR 0095/0096
 * descriptive picker exactly as shipped (`off`). Non-production renders the
 * draft under the "Unsigned clinical content" watermark. `signedVersionExists`
 * is the caller's read of `patient_symptom_catalog_versions`, so this stays
 * pure and testable.
 */
export function catalogRenderMode(signedVersionExists: boolean): CatalogRenderMode {
  if (!symptomCatalogLive()) return "off";
  if (signedVersionExists) return "signed";
  const production = (process.env.MEDSYNC_ENV ?? process.env.VERCEL_ENV) === "production";
  return production ? "off" : "draft_watermarked";
}

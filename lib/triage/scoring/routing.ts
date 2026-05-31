import type { TriageContext, TriageRuleset } from "../types";

/**
 * Population routing (Step 1) — pure, deterministic (research doc
 * §7/§8, ratified R3). Wrong ruleset = dangerous mis-triage, so the
 * rules are explicit and ordered:
 *
 *   1. Confirmed pregnant / ≤6wk postpartum → obstetric MEOWS.
 *   2. Age < 16 → paediatric PEWS (R3: the 12–15 seam routes paeds, the
 *      more sensitive ruleset).
 *   3. Otherwise → adult NEWS2.
 *
 * Unknown pregnancy in a reproductive-age female (R3): NEVER assume,
 * NEVER block. Route by age as above, but raise a non-blocking
 * "confirm pregnancy status" flag so the clinician resolves it.
 *
 * Missing age (research doc §10): flag to obtain; default conservatively
 * to adult NEWS2 (scored, not bypassed) rather than guessing a band.
 */
export interface RoutingResult {
  ruleset: TriageRuleset;
  flags: string[];
}

const PAEDIATRIC_MAX_AGE_EXCLUSIVE = 16; // <16 → paeds (R3)

export function routePopulation(context: TriageContext): RoutingResult {
  const flags: string[] = [];

  // Confirmed obstetric wins outright.
  if (context.pregnancy === "pregnant" || context.pregnancy === "postpartum_6wk") {
    return { ruleset: "obstetric_meows", flags };
  }

  // Unknown pregnancy in a reproductive-age female → flag, then route by age.
  if (context.pregnancy === "unknown" && context.reproductiveAgeFemale) {
    flags.push("Confirm pregnancy status — routed by age pending confirmation.");
  }

  // Missing age → flag, default adult (conservative; still fully scored).
  if (context.ageYears === null) {
    flags.push("Patient age not recorded — obtain to confirm the correct ruleset.");
    return { ruleset: "adult_news2", flags };
  }

  if (context.ageYears < PAEDIATRIC_MAX_AGE_EXCLUSIVE) {
    return { ruleset: "paediatric_pews", flags };
  }

  return { ruleset: "adult_news2", flags };
}

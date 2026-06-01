import type {
  AcuityLevel,
  DerivedMetrics,
  FiredDiscriminator,
  TriageRuleset,
  TriageVitals,
} from "../types";

import { NEWS2_RISK, QSOFA } from "../constants";
import { TRIAGE_DISCRIMINATORS } from "../discriminators";
import { ADULT_BP_CLINICAL, MAP_PERFUSION_MIN } from "../reference";

/**
 * Discriminator evaluation (Step 3) — pure, deterministic (research
 * doc §4/§5/§8, ratified §A.2). Decides which red-flags fire for this
 * patient and the WORST (minimum-number) acuity they imply (the input
 * to the Step-4 "worse-of").
 *
 * Two firing sources:
 *   - manual: the clinician ticked the code on the checklist.
 *   - derived: the engine computes it from vitals / derived metrics, so
 *     a critical flag can never be forgotten (e.g. occult shock from a
 *     "normal-looking" HR+BP pair).
 *
 * Scoping: a discriminator only fires if its `appliesTo` is "all" or
 * matches the routed population — never apply an adult flag to a child.
 *
 * Conditional: sepsis fires only when the source is suspected AND
 * (qSOFA ≥ 2 OR NEWS2 ≥ 5) — research doc §5.
 */
export interface EvaluateInput {
  ruleset: TriageRuleset;
  vitals: TriageVitals;
  derived: DerivedMetrics;
  news2Total: number;
  /** Manual discriminator codes the clinician ticked. */
  presentCodes: string[];
  /**
   * Cross-vital temp+HR sepsis overlay (catalog Part F). When true it
   * WIDENS the sepsis_suspicion gate — but only when the clinician has
   * already ticked sepsis_suspicion; it never auto-creates suspicion.
   */
  tempHrSepsisOverlay?: boolean;
}

export interface EvaluateResult {
  fired: FiredDiscriminator[];
  /** Worst (lowest) acuity among fired flags; null if none fired. */
  minAcuity: AcuityLevel | null;
}

export function evaluateDiscriminators(input: EvaluateInput): EvaluateResult {
  const population = rulesetPopulation(input.ruleset);
  const present = new Set(input.presentCodes);
  const fired: FiredDiscriminator[] = [];

  for (const d of TRIAGE_DISCRIMINATORS) {
    // Scope: "all" or matching population.
    if (d.appliesTo !== "all" && d.appliesTo !== population) continue;

    const isFiring =
      d.source === "manual" ? evalManual(d.code, present, input) : evalDerived(d.code, input);

    if (isFiring) {
      fired.push({ code: d.code, label: d.label, minAcuity: d.minAcuity, source: d.source });
    }
  }

  const minAcuity =
    fired.length === 0 ? null : (Math.min(...fired.map((f) => f.minAcuity)) as AcuityLevel);

  return { fired, minAcuity };
}

function rulesetPopulation(ruleset: TriageRuleset): "adult" | "paediatric" | "obstetric" {
  if (ruleset === "paediatric_pews") return "paediatric";
  if (ruleset === "obstetric_meows") return "obstetric";
  return "adult";
}

function evalManual(code: string, present: Set<string>, input: EvaluateInput): boolean {
  if (!present.has(code)) return false;
  // Conditional manual flags need their extra condition met.
  if (code === "sepsis_suspicion") {
    const qsofaHigh = (input.derived.qsofa?.score ?? 0) >= QSOFA.POSITIVE_THRESHOLD;
    const news2High = input.news2Total >= NEWS2_RISK.MEDIUM_MIN;
    // Cross-vital temp+HR pattern widens the gate (catalog Part F) — but
    // only here, where the clinician has already ticked an infection
    // source; it never creates suspicion on its own.
    return qsofaHigh || news2High || input.tempHrSepsisOverlay === true;
  }
  return true;
}

function evalDerived(code: string, input: EvaluateInput): boolean {
  const { vitals, derived } = input;
  switch (code) {
    case "spo2_critical_under_90_on_o2":
      return vitals.spo2 !== null && vitals.oxygen === "oxygen" && vitals.spo2 < 90;
    case "glucose_critical_under_3":
      return derived.glucoseFlag === "hypoglycaemia";
    case "shock_index_high":
      return derived.shockIndexFlag === "shock"; // SI ≥ 1.0
    case "obstetric_severe_htn":
      return (
        (vitals.systolicBp !== null && vitals.systolicBp >= 160) ||
        (vitals.diastolicBp !== null && vitals.diastolicBp >= 110)
      );
    case "severe_hypertension":
      // Adult severe HTN (BP & Temperature Reference §1b/§1c) — NEWS2 is
      // blind to it (no BP points until ≥220), so the red-flag layer
      // catches it.
      return (
        (vitals.systolicBp !== null && vitals.systolicBp >= ADULT_BP_CLINICAL.severeSysGte) ||
        (vitals.diastolicBp !== null && vitals.diastolicBp >= ADULT_BP_CLINICAL.severeDiaGte)
      );
    case "low_diastolic_perfusion":
      // DBP Reference §1 — very low diastolic threatens coronary perfusion.
      return vitals.diastolicBp !== null && vitals.diastolicBp < ADULT_BP_CLINICAL.veryLowDiaLt;
    case "map_below_65":
      // DBP Reference §2 — MAP < 65 is inadequate organ perfusion.
      return (
        derived.meanArterialPressure !== null && derived.meanArterialPressure < MAP_PERFUSION_MIN
      );
    default:
      return false;
  }
}

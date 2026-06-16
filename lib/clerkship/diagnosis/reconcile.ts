import { diagnosisByDisplay } from "@/lib/clerkship/diagnosis/catalog";
import { ncdByDisplay } from "@/lib/clerkship/diagnosis/ncd-catalog";

/**
 * Diagnosis-driven feature reconciliation — when the clinician selects a
 * diagnosis, look across the whole clerkship for the features that support it
 * and split them into PRESENT (already captured — auto-confirmed) vs MISSING
 * (not captured — left blank for the clinician to tap-capture). Decision-support:
 * it confirms what is THERE and prompts for what is NOT; it fabricates nothing
 * (a missing feature stays missing until the clinician captures it).
 *
 * The expected features are the diagnosis's OWN supports from the catalog — the
 * existing symptom codes (HPC/ROS) + the condition/risk codes — so this is a pure
 * reconciliation, not a second source of clinical content.
 */

export interface FeatureStatus {
  code: string;
  present: boolean;
}

export interface DiagnosisReconciliation {
  /** Expected supporting symptoms (HPC/ROS codes), each present-in-clerkship or not. */
  symptoms: FeatureStatus[];
  /** Expected risk factors (condition codes), each present-in-clerkship or not. */
  risks: FeatureStatus[];
}

export interface CapturedCodeSets {
  symptomCodes: Set<string>;
  conditionCodes: Set<string>;
}

/**
 * The diagnosis's expected feature codes, resolved from either catalog (NCD or the
 * maps-derived acute). Symptoms come from the NCD `supportingSymptoms` or the acute
 * `supportingSymptoms[].symptom` (ROS codes); risks from `riskFactors`. Returns
 * empty arrays for a dx with no catalog entry (e.g. a free-typed diagnosis).
 */
export function expectedFeaturesFor(display: string): {
  symptomCodes: string[];
  riskCodes: string[];
} {
  const ncd = ncdByDisplay(display);
  if (ncd) {
    return { symptomCodes: [...ncd.supportingSymptoms], riskCodes: [...ncd.riskFactors] };
  }
  const acute = diagnosisByDisplay(display);
  if (acute) {
    return {
      symptomCodes: (acute.supportingSymptoms ?? []).map((s) => s.symptom),
      riskCodes: [...acute.riskFactors],
    };
  }
  return { symptomCodes: [], riskCodes: [] };
}

/** Pure: mark each expected feature present (in the captured clerkship) or missing. */
export function reconcileFeatures(
  expected: { symptomCodes: string[]; riskCodes: string[] },
  captured: CapturedCodeSets,
): DiagnosisReconciliation {
  const uniq = (xs: string[]) => Array.from(new Set(xs));
  return {
    symptoms: uniq(expected.symptomCodes).map((code) => ({
      code,
      present: captured.symptomCodes.has(code),
    })),
    risks: uniq(expected.riskCodes).map((code) => ({
      code,
      present: captured.conditionCodes.has(code),
    })),
  };
}

/** Convenience: reconcile a diagnosis by display against the captured clerkship. */
export function reconcileDiagnosis(
  display: string,
  captured: CapturedCodeSets,
): DiagnosisReconciliation {
  return reconcileFeatures(expectedFeaturesFor(display), captured);
}

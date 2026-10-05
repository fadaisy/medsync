import type { RefEntry } from "@/lib/resus/reference/ref";

/**
 * Pregnancy references (clinical reference [09]). REF-PREG-AGE is signed (12 to 50, 2026-10-05);
 * REF-PREG-POSTPARTUM is pending the CSO. While a reference is pending, what reads it stays off.
 */

export interface PregnancyAgeRange {
  /** Ages in [fromYears, toYears). */
  fromYears: number;
  toYears: number;
}

export interface PostpartumWindow {
  days: number;
}

export const REF_PREG_AGE: RefEntry & { data?: PregnancyAgeRange } = {
  id: "REF-PREG-AGE",
  text: "The age range, for patients whose sex at birth is female, in which pregnancy status is shown and prompted.",
  value: "12 to 50 years",
  source:
    "MedSync product setting, signed by the CSO 2026-10-05 (docs/ncd/diabetes/phase-5/stop5-signoff.json); the range nurse triage already used",
  url: "docs/emr/emr-clinical-reference.md#09-pregnancy",
  verifiedOn: "2026-10-05",
  confidence: "design",
  status: "signed",
  data: { fromYears: 12, toYears: 51 },
};

/** Could this patient be pregnant by age alone? null when the range is unsigned or the age unknown;
 *  sex is the caller's (a recorded male is never "could be pregnant"). */
export function inPregnancyAgeRange(ageYears: number | null | undefined): boolean | null {
  const r = REF_PREG_AGE.status === "signed" ? REF_PREG_AGE.data : undefined;
  if (!r || ageYears === null || ageYears === undefined) return null;
  return ageYears >= r.fromYears && ageYears < r.toYears;
}

export const REF_PREG_POSTPARTUM: RefEntry & { data?: PostpartumWindow } = {
  id: "REF-PREG-POSTPARTUM",
  text: "The postpartum window after delivery during which the postpartum state applies.",
  source:
    "WHO recommendations on maternal and newborn care for a positive postnatal experience (2022) — confirm at signing",
  url: "docs/emr/emr-clinical-reference.md#09-pregnancy",
  verifiedOn: "2026-09-26", // drafted; verified when signed
  confidence: "design",
  status: "pending_cso",
};

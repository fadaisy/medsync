/**
 * Encounter clerkship — cadre-write rules (PURE; the server action enforces
 * them, the DB RLS keeps reception out entirely). Decision-support framing: a
 * doctor / clinical-officer clerks (full history/exam/differential/plan); a
 * nurse records a nursing assessment + observations + allergies but not a final
 * medical diagnosis; a junior (intern) clerking carries a co-sign hook (soft —
 * surfaced for a senior to attest, never a hard block, mirroring the resus
 * leader model). INFERRED in docs/encounter-emr-engine-gate-a-proposal.md §B —
 * CSO to ratify the exact cadre→authority mapping.
 */

/** Cadres that perform a full medical clerking (history→exam→differential→plan). */
export const CLERKING_CADRE_CODES = [
  "INTERN_DOCTOR",
  "MEDICAL_OFFICER",
  "MEDICAL_OFFICER_SG",
  "CONSULTANT",
  "SENIOR_CONSULTANT",
  "CLINICAL_OFFICER",
] as const;

/** Junior cadres whose clerking is surfaced for senior co-sign (soft). */
export const COSIGN_REQUIRED_CADRE_CODES = ["INTERN_DOCTOR"] as const;

export interface ClerkshipWriteAuthority {
  /** May author a full clerking (incl. the differential). */
  canClerk: boolean;
  /** May set a diagnosis status to `final` (vs working). */
  canWriteFinalDiagnosis: boolean;
  /** A senior co-sign is surfaced (junior author) — soft, not a hard block. */
  requiresCosign: boolean;
  /** May record allergies / a nursing assessment (any clinical cadre). */
  canRecordAllergies: boolean;
  /** Non-clinical (reception) — no clinical write at all (also blocked at the DB). */
  clinical: boolean;
}

/**
 * Resolve a cadre's clerkship write authority. `isClinical` comes from the
 * cadre record (the same `is_clinical` the DB RLS uses to exclude reception).
 */
export function clerkshipWriteAuthority(
  cadreCode: string | null | undefined,
  isClinical: boolean,
): ClerkshipWriteAuthority {
  if (!isClinical) {
    return {
      canClerk: false,
      canWriteFinalDiagnosis: false,
      requiresCosign: false,
      canRecordAllergies: false,
      clinical: false,
    };
  }
  const code = cadreCode ?? "";
  const isClerker = (CLERKING_CADRE_CODES as readonly string[]).includes(code);
  const isJunior = (COSIGN_REQUIRED_CADRE_CODES as readonly string[]).includes(code);
  return {
    canClerk: isClerker,
    // A junior may clerk + record a WORKING differential, but a senior attests
    // the FINAL diagnosis (co-sign). Nurses (clinical, non-clerker) record a
    // nursing assessment + allergies, not a final medical diagnosis.
    canWriteFinalDiagnosis: isClerker && !isJunior,
    requiresCosign: isClerker && isJunior,
    canRecordAllergies: true, // any clinical cadre elicits/records allergies
    clinical: true,
  };
}

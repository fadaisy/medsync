import type { AcuityLevel } from "./types";

/**
 * Triage authority resolver — pure, deterministic (ratified §A.4 / R1).
 *
 * Decides, from a cadre + that hospital's clinical_cosign_policies rows,
 * whether the user may triage at all and whether they may DOWN-triage
 * (assign a level LESS acute than the engine computed — the high-stakes
 * action where under-triage harm happens).
 *
 * Safe defaults (kickoff §0.3 — bias up): no `triage_patient=allowed`
 * row → cannot triage; no `triage_downgrade=allowed` row → cannot
 * down-triage. Reception (non-clinical, no rows) is denied here AND at
 * the DB (triage_records RLS requires is_clinical=true).
 *
 * Lower acuity NUMBER = MORE acute (1 Red … 5 Blue). So "down-triage"
 * (less acute) means assigning a HIGHER number than computed.
 */
export interface CosignPolicyRow {
  cadreCode: string;
  actionKind: string;
  requirement: "allowed" | "cosign_required" | "blocked";
}

export interface AssignVerdict {
  allowed: boolean;
  direction: "up" | "down" | "none";
  reason?: string;
}

export interface TriageAuthority {
  mayTriage: boolean;
  mayDownTriage: boolean;
  /** Whether this cadre may set `assigned` given the `computed` level. */
  canAssignLevel: (computed: AcuityLevel, assigned: AcuityLevel) => AssignVerdict;
}

export function resolveTriageAuthority(
  cadreCode: string,
  policyRows: readonly CosignPolicyRow[],
): TriageAuthority {
  const mine = policyRows.filter((r) => r.cadreCode === cadreCode);
  const isAllowed = (action: string) =>
    mine.some((r) => r.actionKind === action && r.requirement === "allowed");

  const mayTriage = isAllowed("triage_patient");
  const mayDownTriage = isAllowed("triage_downgrade");

  function canAssignLevel(computed: AcuityLevel, assigned: AcuityLevel): AssignVerdict {
    if (!mayTriage) {
      return { allowed: false, direction: "none", reason: "Not authorised to triage." };
    }
    const direction: AssignVerdict["direction"] =
      assigned < computed ? "up" : assigned > computed ? "down" : "none";

    if (direction === "down" && !mayDownTriage) {
      return {
        allowed: false,
        direction: "down",
        reason: "Only doctors / clinical officers may assign a lower acuity than computed.",
      };
    }
    return { allowed: true, direction };
  }

  return { mayTriage, mayDownTriage, canAssignLevel };
}

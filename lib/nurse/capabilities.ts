import "server-only";

import type { NurseCadreCode, NurseGradeCode } from "./scope";
import { and, eq, isNull, or } from "drizzle-orm";

import { db } from "@/db";
import { clinicalCosignPolicies } from "@/db/schema/doctor-workspace";

/**
 * Nurse capability resolver. Reads clinical_cosign_policies for the
 * nurse's (hospital, department, cadre) and applies a grade overlay:
 *
 *   - ENROLLED downgrades policy "allowed" → "cosign_required" for
 *     `high_alert_med_administration`.
 *   - REGISTERED inherits the hospital-wide policy unchanged.
 *   - SPECIALIST inherits unchanged (specialist-nurse cadre OR
 *     specialist grade within nurse).
 *
 * The "in-charge" overlay is a separate signal (NurseScope.isInCharge)
 * — it grants ward-management actions (assignment board, escalation
 * queue) that aren't expressed as cosign policy.
 *
 * Fail closed: if no policy row exists for a (cadre, action), the
 * default is 'blocked'.
 */

export const NURSING_ACTION_KINDS = [
  "high_alert_med_administration",
  "independent_complex_procedure",
] as const;
export type NursingActionKind = (typeof NURSING_ACTION_KINDS)[number];

export type Requirement = "allowed" | "cosign_required" | "blocked";

export type NursingCapabilityMap = Record<NursingActionKind, Requirement>;

const SAFE_DEFAULT: Requirement = "blocked";

export async function resolveNursingCapabilities(args: {
  hospitalId: string;
  departmentId: string;
  cadreCode: NurseCadreCode;
  cadreGradeCode: NurseGradeCode | null;
}): Promise<NursingCapabilityMap> {
  const rows = await db
    .select({
      actionKind: clinicalCosignPolicies.actionKind,
      departmentId: clinicalCosignPolicies.departmentId,
      requirement: clinicalCosignPolicies.requirement,
    })
    .from(clinicalCosignPolicies)
    .where(
      and(
        eq(clinicalCosignPolicies.hospitalId, args.hospitalId),
        eq(clinicalCosignPolicies.cadreCode, args.cadreCode),
        or(
          isNull(clinicalCosignPolicies.departmentId),
          eq(clinicalCosignPolicies.departmentId, args.departmentId),
        )!,
      ),
    );

  const map: NursingCapabilityMap = {
    high_alert_med_administration: SAFE_DEFAULT,
    independent_complex_procedure: SAFE_DEFAULT,
  };

  for (const r of rows) {
    if (!NURSING_ACTION_KINDS.includes(r.actionKind as NursingActionKind)) continue;
    if (r.departmentId === null) {
      map[r.actionKind as NursingActionKind] = r.requirement as Requirement;
    }
  }
  for (const r of rows) {
    if (!NURSING_ACTION_KINDS.includes(r.actionKind as NursingActionKind)) continue;
    if (r.departmentId === args.departmentId) {
      map[r.actionKind as NursingActionKind] = r.requirement as Requirement;
    }
  }

  // Grade overlay: enrolled nurses get downgraded on high-alert
  // administration even when the cadre-level policy is 'allowed'.
  if (args.cadreGradeCode === "ENROLLED") {
    if (map.high_alert_med_administration === "allowed") {
      map.high_alert_med_administration = "cosign_required";
    }
    if (map.independent_complex_procedure === "allowed") {
      // ENROLLED defaults to blocked on complex procedure regardless of cadre policy.
      map.independent_complex_procedure = "blocked";
    } else if (map.independent_complex_procedure === "cosign_required") {
      map.independent_complex_procedure = "blocked";
    }
  }

  return map;
}

export const NURSING_ACTION_LABEL: Record<NursingActionKind, string> = {
  high_alert_med_administration: "High-alert medication administration",
  independent_complex_procedure: "Independent complex procedure",
};

export const REQUIREMENT_LABEL: Record<Requirement, string> = {
  allowed: "Allowed",
  cosign_required: "Needs senior nurse / in-charge co-sign",
  blocked: "Above your scope",
};

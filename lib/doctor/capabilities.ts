import "server-only";

import { and, eq, isNull, or } from "drizzle-orm";

import { db } from "@/db";
import { clinicalCosignPolicies } from "@/db/schema/doctor-workspace";

/**
 * Capability resolver — reads the cosign policy for a doctor's
 * (hospital, department, cadre) and returns the full action map.
 *
 * Department-specific policy overrides hospital-wide. If neither
 * exists for a given (cadre, action), the safe default is 'blocked'
 * — fail closed, never assume permission.
 *
 * This resolver is canonical for UI affordances (what to show / hide /
 * label as "needs review") AND for server-side action enforcement
 * (Edge Functions call this before executing or queuing a request).
 */

export const COSIGN_ACTION_KINDS = [
  "prescription_routine",
  "prescription_controlled",
  "order_high_cost_imaging",
  "admit_patient",
  "discharge_patient",
] as const;
export type CosignActionKind = (typeof COSIGN_ACTION_KINDS)[number];

export type Requirement = "allowed" | "cosign_required" | "blocked";

export type CapabilityMap = Record<CosignActionKind, Requirement>;

const SAFE_DEFAULT: Requirement = "blocked";

export async function resolveCapabilities(args: {
  hospitalId: string;
  departmentId: string;
  cadreCode: string;
}): Promise<CapabilityMap> {
  // Pull every policy row that matches (hospital, cadre) — both the
  // hospital-wide default (department_id IS NULL) and any department-
  // specific override. We then collapse by (action_kind) preferring
  // the department-specific row.
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

  const result: CapabilityMap = {
    prescription_routine: SAFE_DEFAULT,
    prescription_controlled: SAFE_DEFAULT,
    order_high_cost_imaging: SAFE_DEFAULT,
    admit_patient: SAFE_DEFAULT,
    discharge_patient: SAFE_DEFAULT,
  };

  // First pass: hospital-wide rows.
  for (const r of rows) {
    if (r.departmentId === null) {
      result[r.actionKind as CosignActionKind] = r.requirement as Requirement;
    }
  }
  // Second pass: department-specific overrides win.
  for (const r of rows) {
    if (r.departmentId === args.departmentId) {
      result[r.actionKind as CosignActionKind] = r.requirement as Requirement;
    }
  }

  return result;
}

/** The review queue's heading per request kind: the policy kinds, and confirm_diagnosis (0084, a
 *  junior's Final; raised by the EMR itself, never by a policy row). */
export const ACTION_LABEL: Record<CosignActionKind | "confirm_diagnosis", string> = {
  prescription_routine: "Routine prescription",
  prescription_controlled: "Controlled-substance prescription",
  order_high_cost_imaging: "High-cost imaging order (CT / MRI)",
  admit_patient: "Admit patient",
  discharge_patient: "Discharge patient",
  confirm_diagnosis: "Final diagnosis",
};

export const REQUIREMENT_LABEL: Record<Requirement, string> = {
  allowed: "Allowed",
  cosign_required: "Needs senior co-sign",
  blocked: "Above your scope",
};

import type { EncounterScope } from "./record";

/**
 * Adapt a clinical workspace scope (the doctor or nurse `require…Scope` result)
 * to the engine's `EncounterScope`. Both doctor and nurse cadres are
 * `is_clinical = true`, so the adapter stamps `isClinical: true`; `departmentId`
 * drives the `department_recent` access basis. Pure — no DB, no server-only.
 */
export interface ClinicalWorkspaceScope {
  userId: string;
  hospitalId: string;
  departmentId: string | null;
  cadreCode: string;
}

export function toEncounterScope(scope: ClinicalWorkspaceScope): EncounterScope {
  return {
    userId: scope.userId,
    hospitalId: scope.hospitalId,
    departmentId: scope.departmentId,
    cadreCode: scope.cadreCode,
    isClinical: true,
  };
}

import type { PermissionMap } from "@/lib/workspace-access/access";

import MAP from "@/data/lab/permission-map.v1.json";
import { cadrePermissions, mapProblems as problemsOf } from "@/lib/workspace-access/access";

/**
 * Lab access (Lab Phase 0, ADR 0221; LA-1..LA-6). Six permissions, derived on every request from
 * two facts and never stored: the viewer's approved or active lab-cadre affiliation, read through
 * the signed map in data/lab/permission-map.v1.json, and their open department_heads rows (head of
 * LABORATORY manages the whole lab, head of a lab section manages that section). The `lab_tech`
 * role in user_roles only carries the workspace for landing and MFA; the database keeps it in step
 * with affiliations (migration 0097). Pure: no I/O, so the scope, the guards and the tests share it.
 */

export const LAB_PERMISSIONS = [
  "lab.view",
  "lab.collect",
  "lab.receive",
  "lab.result.enter",
  "lab.result.release",
  "lab.manage",
] as const;
export type LabPermission = (typeof LAB_PERMISSIONS)[number];

const PERMISSION_MAP: PermissionMap = MAP;
export const PERMISSION_MAP_VERSION = PERMISSION_MAP.version;

/** The cadres the signed map names. A cadre not in the map holds no lab permission. */
export const LAB_MAP_CADRES: readonly string[] = Object.keys(PERMISSION_MAP.cadres);

export interface LabAccessFacts {
  /** The cadre of the viewer's approved or active affiliation at this hospital, if any. */
  cadreCode: string | null;
  /** Open department_heads rows: LABORATORY itself, and lab sections by id. */
  headOf: { laboratory: boolean; sectionIds: readonly string[] };
}

export interface LabAccess {
  permissions: ReadonlySet<LabPermission>;
  /** What `lab.manage` covers: the whole lab, some sections, or nothing. */
  manages: "lab" | readonly string[];
}

export function labAccess(facts: LabAccessFacts, map: PermissionMap = PERMISSION_MAP): LabAccess {
  // An unsigned map grants nothing, and lab.manage never comes from a cadre (LA-5).
  const permissions = cadrePermissions(map, facts.cadreCode, LAB_PERMISSIONS, ["lab.manage"]);
  const manages: LabAccess["manages"] = facts.headOf.laboratory
    ? "lab"
    : [...facts.headOf.sectionIds];
  if (manages === "lab" || manages.length > 0) permissions.add("lab.manage");
  return { permissions, manages };
}

export function can(access: Pick<LabAccess, "permissions">, permission: LabPermission): boolean {
  return access.permissions.has(permission);
}

/** Every problem with a map, for the test that keeps the shipped one honest. */
export function mapProblems(map: PermissionMap = PERMISSION_MAP): string[] {
  return problemsOf(map, LAB_PERMISSIONS, ["lab.manage"]);
}

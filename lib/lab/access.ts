import type { PermissionMap } from "@/lib/workspace-access/access";

import V1 from "@/data/lab/permission-map.v1.json";
import V2 from "@/data/lab/permission-map.v2.json";
import V3 from "@/data/lab/permission-map.v3.json";
import { cadrePermissions, mapProblems as problemsOf } from "@/lib/workspace-access/access";

/**
 * Lab access (Lab Phase 0, ADR 0221; LA-1..LA-6; Lab Phase 3 §4). Eleven permissions, derived on every request from
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
  // Lab Phase 3 (gate-a-proposal §4). The HMIS In-Charge and focal person are designations, not permissions
  // (hmis_designations, lib/lab/hmis-designations.ts).
  "lab.qc.override",
  "lab.stock.manage",
  "lab.eqa.manage",
  "lab.hmis.check",
  "poct.assess",
  // Lab Phase 4 (gate-a-proposal §4). The data protection and IPC leads are designations, not permissions
  // (hospital_designations).
  "lab.refer",
  "lab.refer.result",
  "lab.match.resolve",
  "lab.exchange.manage",
] as const;
export type LabPermission = (typeof LAB_PERMISSIONS)[number];

/** Headship carries these with lab.manage (substantive or acting head); no cadre ever does (LA-5). */
const FROM_HEADSHIP = [
  "lab.manage",
  "lab.qc.override",
  "lab.eqa.manage",
  "lab.hmis.check",
  "lab.exchange.manage",
] as const satisfies readonly LabPermission[];

/**
 * The signed map in force: 3.0.0 (Phase 4's referral and matching permissions) once the CSO signs it, else 2.0.0
 * (Phase 3's lab.stock.manage and poct.assess) once signed, else 1.0.0.
 */
const PERMISSION_MAP: PermissionMap =
  V3.status === "signed" ? V3 : V2.status === "signed" ? V2 : V1;
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
  // An unsigned map grants nothing, and headship permissions never come from a cadre (LA-5).
  const permissions = cadrePermissions(map, facts.cadreCode, LAB_PERMISSIONS, FROM_HEADSHIP);
  const manages: LabAccess["manages"] = facts.headOf.laboratory
    ? "lab"
    : [...facts.headOf.sectionIds];
  if (manages === "lab" || manages.length > 0) for (const p of FROM_HEADSHIP) permissions.add(p);
  return { permissions, manages };
}

export function can(access: Pick<LabAccess, "permissions">, permission: LabPermission): boolean {
  return access.permissions.has(permission);
}

/** Every problem with a map, for the test that keeps the shipped one honest. */
export function mapProblems(map: PermissionMap = PERMISSION_MAP): string[] {
  return problemsOf(map, LAB_PERMISSIONS, FROM_HEADSHIP);
}

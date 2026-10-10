import MAP from "@/data/lab/permission-map.v1.json";

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

interface PermissionMap {
  version: string;
  status: string;
  permissions: readonly string[];
  cadres: Record<string, readonly string[]>;
}

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

const isPermission = (p: string): p is LabPermission =>
  (LAB_PERMISSIONS as readonly string[]).includes(p);

export function labAccess(facts: LabAccessFacts, map: PermissionMap = PERMISSION_MAP): LabAccess {
  const permissions = new Set<LabPermission>();
  // An unsigned map grants nothing: the register and the CSO's signature are the only source.
  if (map.status === "signed" && facts.cadreCode) {
    for (const p of map.cadres[facts.cadreCode] ?? []) {
      // lab.manage never comes from a cadre (LA-5), whatever a map says.
      if (isPermission(p) && p !== "lab.manage") permissions.add(p);
    }
  }
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
  const problems: string[] = [];
  if (map.status !== "signed") problems.push(`status is ${map.status}, not signed`);
  for (const p of map.permissions) if (!isPermission(p)) problems.push(`unknown permission ${p}`);
  for (const [cadre, ps] of Object.entries(map.cadres)) {
    for (const p of ps) {
      if (!isPermission(p)) problems.push(`${cadre}: unknown permission ${p}`);
      if (p === "lab.manage") problems.push(`${cadre}: lab.manage cannot come from a cadre`);
    }
  }
  return problems;
}

import type { PermissionMap } from "@/lib/workspace-access/access";

import MAP from "@/data/pharmacy/permission-map.v1.json";
import { cadrePermissions, mapProblems as problemsOf } from "@/lib/workspace-access/access";

/**
 * Pharmacy access (Pharmacy Phase 0, ADR 0227; PA-1..PA-6). Six names; this phase grants one,
 * `pharmacy.view`, derived on every request from the viewer's approved or active pharmacy-cadre
 * affiliation through the signed map in data/pharmacy/permission-map.v1.json. The other five are
 * reserved: the type knows them, no map grants them, nothing checks them yet. The `pharmacy_staff`
 * role only carries the workspace (landing, MFA); migration 0098 keeps it in step with
 * affiliations. Pure.
 */

export const PHARMACY_PERMISSIONS = [
  "pharmacy.view",
  "pharmacy.review",
  "pharmacy.dispense",
  "pharmacy.stock",
  "pharmacy.controlled",
  "pharmacy.manage",
] as const;
export type PharmacyPermission = (typeof PHARMACY_PERMISSIONS)[number];

/** Reserved until the phase that grants them: never from any map in Phase 0. */
const NOT_GRANTED_YET: readonly PharmacyPermission[] = PHARMACY_PERMISSIONS.filter(
  (p) => p !== "pharmacy.view",
);

const PERMISSION_MAP: PermissionMap = MAP;
export const PHARMACY_MAP_VERSION = PERMISSION_MAP.version;

/** The cadres the signed map names (PA-2). A cadre not in the map holds no pharmacy permission. */
export const PHARMACY_MAP_CADRES: readonly string[] = Object.keys(PERMISSION_MAP.cadres);

export interface PharmacyAccess {
  permissions: ReadonlySet<PharmacyPermission>;
}

export function pharmacyAccess(
  cadreCode: string | null,
  map: PermissionMap = PERMISSION_MAP,
): PharmacyAccess {
  return { permissions: cadrePermissions(map, cadreCode, PHARMACY_PERMISSIONS, NOT_GRANTED_YET) };
}

export function can(access: PharmacyAccess, permission: PharmacyPermission): boolean {
  return access.permissions.has(permission);
}

export function mapProblems(map: PermissionMap = PERMISSION_MAP): string[] {
  return problemsOf(map, PHARMACY_PERMISSIONS, NOT_GRANTED_YET);
}

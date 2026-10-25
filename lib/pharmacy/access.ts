import type { PermissionMap } from "@/lib/workspace-access/access";

import MAP from "@/data/pharmacy/permission-map.v1.json";
import MAP_V2 from "@/data/pharmacy/permission-map.v2.json";
import MAP_V3 from "@/data/pharmacy/permission-map.v3.json";
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
  "pharmacy.store",
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

/* ─── Pharmacy Phase 1: the permission map, version 2 (D-PH1-03, PA2-1, PA2-2) ─── */

/** `pharmacy.manage` never comes from a cadre: only from a hub head assignment (PA2-3). */
const NOT_FROM_CADRE_V2: readonly PharmacyPermission[] = ["pharmacy.manage"];
export const PHARMACY_MAP_V2: PermissionMap = MAP_V2;

/**
 * The map the dispensing paths read. Version 2 is signed for building but provisional until legal
 * question 1 has an interim answer on record (D-PH1-03), so production keeps version 1 — the same
 * production gate as Phase 0's wording (CS-5). Phase 0's own paths keep `pharmacyAccess` and v1.
 */
export function dispensingMap(
  env: string | undefined = process.env.VERCEL_ENV,
  hospitalId: string | null = null,
  devHospitals: string | undefined = process.env.PHARMACY_DEV_HOSPITALS,
): PermissionMap {
  if (env !== "production") return PHARMACY_MAP_V2;
  // ADR 0394: the owner's development override, not a legal answer. Only hospital ids named one by one; no "all".
  const dev = (devHospitals ?? "").split(",").map((x) => x.trim());
  return hospitalId && dev.includes(hospitalId) ? PHARMACY_MAP_V2 : PERMISSION_MAP;
}

export function pharmacyDispensingAccess(
  cadreCode: string | null,
  map: PermissionMap = dispensingMap(),
): PharmacyAccess {
  const reserved = map === PERMISSION_MAP ? NOT_GRANTED_YET : NOT_FROM_CADRE_V2;
  return { permissions: cadrePermissions(map, cadreCode, PHARMACY_PERMISSIONS, reserved) };
}

export function mapV2Problems(map: PermissionMap = PHARMACY_MAP_V2): string[] {
  return problemsOf(map, PHARMACY_PERMISSIONS, NOT_FROM_CADRE_V2);
}

/* ─── Pharmacy Phase 2: the permission map, version 3 (D-PH2-02, Appendix A) ─── */

export const PHARMACY_MAP_V3: PermissionMap = MAP_V3;

/**
 * v3 adds only `pharmacy.store`. Phase 1's maps stay as they are; the store permission is added beside them
 * from v3, and only where `PHARMACY_STORE` is on for the hospital (lib/pharmacy/actor.ts).
 */
export function withStoreAccess(
  access: PharmacyAccess,
  cadreCode: string | null,
  storeOn: boolean,
): PharmacyAccess {
  if (!storeOn) return access;
  const v3 = cadrePermissions(PHARMACY_MAP_V3, cadreCode, PHARMACY_PERMISSIONS, NOT_FROM_CADRE_V2);
  if (!v3.has("pharmacy.store")) return access;
  return { permissions: new Set([...access.permissions, "pharmacy.store"]) };
}

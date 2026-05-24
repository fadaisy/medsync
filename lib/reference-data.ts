/**
 * Typed reference-data loaders for onboarding forms.
 *
 * Hits the public ref tables (regions, districts, subcounties,
 * councils, cadres, cadre_grades, specialties, roles) which carry
 * public-read RLS policies (migration 0008) — so they work from
 * both anon (signup pages before login) and authenticated contexts.
 *
 * Each loader returns a stable, sorted list ready to drop into a
 * Combobox / CascadingCombobox. Cascading filters (district →
 * subcounty, council → cadres, cadre → roles, etc.) are passed as
 * optional args.
 *
 * Uses the shared singleton db client at `@/db` so we don't fan
 * out connections per helper.
 */

import "server-only";

import type { HospitalDepartment } from "@/db/schema/hospital-departments";
import type { Hospital } from "@/db/schema/hospitals";
import type {
  Cadre,
  CadreGrade,
  Council,
  District,
  Region,
  Role,
  Specialty,
  Subcounty,
} from "@/db/schema/reference-data";
import { unstable_cache } from "next/cache";
import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { hospitalDepartments } from "@/db/schema/hospital-departments";
import { hospitals } from "@/db/schema/hospitals";
import {
  cadreGrades,
  cadres,
  councils,
  districts,
  regions,
  roles,
  specialties,
  subcounties,
} from "@/db/schema/reference-data";

/**
 * Reference-data tables only change when we ship a new migration that
 * re-seeds them. Cache each loader for 1 hour so a million page-renders
 * don't fan out to a million `SELECT * FROM districts` round-trips
 * against the prod pooler. Re-seeding code can call
 * `revalidateTag("reference-data")` to bust the cache immediately.
 *
 * Cache key includes the loader name + a JSON.stringify of opts so
 * cascading filters (district→subcounty, cadre→roles, etc.) stay
 * isolated.
 */
const REF_DATA_TAG = "reference-data";
const REF_DATA_TTL = 60 * 60; // 1 hour

function cached<TArgs extends unknown[], TResult>(
  name: string,
  fn: (...args: TArgs) => Promise<TResult>,
): (...args: TArgs) => Promise<TResult> {
  return unstable_cache(fn, [name], {
    revalidate: REF_DATA_TTL,
    tags: [REF_DATA_TAG],
  });
}

// ─── Geography ─────────────────────────────────────────────────────────

export const listRegions = cached(
  "listRegions",
  async (): Promise<Region[]> => db.select().from(regions).orderBy(asc(regions.name)),
);

export const listDistricts = cached(
  "listDistricts",
  async (opts?: { regionId?: string }): Promise<District[]> => {
    const q = db.select().from(districts).orderBy(asc(districts.name));
    if (opts?.regionId) {
      return q.where(eq(districts.regionId, opts.regionId));
    }
    return q;
  },
);

export const listSubcounties = cached(
  "listSubcounties",
  async (opts: { districtId: string }): Promise<Subcounty[]> =>
    db
      .select()
      .from(subcounties)
      .where(eq(subcounties.districtId, opts.districtId))
      .orderBy(asc(subcounties.name)),
);

// ─── Clinical catalog ──────────────────────────────────────────────────

export const listCouncils = cached(
  "listCouncils",
  async (): Promise<Council[]> => db.select().from(councils).orderBy(asc(councils.name)),
);

export const listCadres = cached(
  "listCadres",
  async (opts?: { councilId?: string }): Promise<Cadre[]> => {
    const q = db.select().from(cadres).orderBy(asc(cadres.sortOrder), asc(cadres.name));
    if (opts?.councilId) {
      return q.where(eq(cadres.councilId, opts.councilId));
    }
    return q;
  },
);

export const listCadreGrades = cached(
  "listCadreGrades",
  async (opts: { cadreId: string }): Promise<CadreGrade[]> =>
    db
      .select()
      .from(cadreGrades)
      .where(eq(cadreGrades.cadreId, opts.cadreId))
      .orderBy(asc(cadreGrades.sortOrder), asc(cadreGrades.name)),
);

/**
 * Specialties. By default returns only top-level rows
 * (`parent_id IS NULL`). Pass `parentId` to fetch sub-specialties of
 * a given parent; pass `null` explicitly to force the top-level
 * filter; omit `parentId` entirely to fetch all.
 */
export const listSpecialties = cached(
  "listSpecialties",
  async (opts?: { parentId?: string | null }): Promise<Specialty[]> => {
    const q = db.select().from(specialties).orderBy(asc(specialties.name));
    if (opts && opts.parentId !== undefined) {
      return q.where(
        opts.parentId === null
          ? isNull(specialties.parentId)
          : eq(specialties.parentId, opts.parentId),
      );
    }
    return q;
  },
);

export const listRoles = cached(
  "listRoles",
  async (opts?: {
    cadreId?: string;
    specialtyId?: string;
    departmentFamily?: string;
  }): Promise<Role[]> => {
    const wheres = [];
    if (opts?.cadreId) wheres.push(eq(roles.cadreId, opts.cadreId));
    if (opts?.specialtyId) wheres.push(eq(roles.specialtyId, opts.specialtyId));
    if (opts?.departmentFamily) wheres.push(eq(roles.departmentFamily, opts.departmentFamily));

    const q = db.select().from(roles).orderBy(asc(roles.sortOrder), asc(roles.name));

    if (wheres.length === 0) return q;
    return q.where(wheres.length === 1 ? wheres[0]! : and(...wheres));
  },
);

// ─── Hospitals + departments ───────────────────────────────────────────

/**
 * Hospitals listed for the staff-affiliation step (GATE D) and the
 * patient primary-facility chooser (GATE C). No filter today — Phase 1
 * has a small list (Mulago + onboarded pilots). Add a state filter
 * here once `hospitals.state` lands.
 */
export const listHospitals = cached(
  "listHospitals",
  async (): Promise<Hospital[]> => db.select().from(hospitals).orderBy(asc(hospitals.name)),
);

/**
 * Top-level departments at a hospital. Sub-departments hang off
 * `parent_id` (Phase 0.11 seeded e.g. Cardiology under Internal
 * Medicine at Mulago). For the affiliation form we surface the
 * top-level only and let the role combobox carry the sub-specialty.
 */
export const listDepartments = cached(
  "listDepartments",
  async (opts: { hospitalId: string }): Promise<HospitalDepartment[]> =>
    db
      .select()
      .from(hospitalDepartments)
      .where(
        and(
          eq(hospitalDepartments.hospitalId, opts.hospitalId),
          isNull(hospitalDepartments.parentId),
        ),
      )
      .orderBy(asc(hospitalDepartments.name)),
);

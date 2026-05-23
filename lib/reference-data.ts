/**
 * Typed reference-data loaders for onboarding forms.
 *
 * These hit the public ref_* tables which carry public-read RLS
 * policies (0009_onboarding_rls.sql) — so they work from both anon
 * (signup pages before login) and authenticated contexts.
 *
 * Each loader returns a stable, sorted list ready to drop into a
 * combobox/select. Cascading filters (district → subcounty, council
 * → cadres, cadre → roles) are passed as optional args.
 *
 * All loaders are server-only. The forms call them in a server
 * component, then pass the resulting options to the client combobox.
 */

import "server-only";

import type {
  Hospital,
  HospitalDepartment,
  RefCadre,
  RefCouncil,
  RefDistrict,
  RefRegion,
  RefRole,
  RefSpecialty,
  RefSubcounty,
} from "@/db/schema";
import { and, asc, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import {
  hospitalDepartments,
  hospitals,
  refCadres,
  refCouncils,
  refDistricts,
  refRegions,
  refRoles,
  refSpecialties,
  refSubcounties,
} from "@/db/schema";
import { env } from "@/lib/env";

// Pool 5 connections so onboarding pages (which fan out 6+ Promise.all
// queries — see /signup/clinical) don't serialize through a single
// socket. Supabase Free pooler caps at 15 concurrent connections, so
// staying well under that for the ref-data path keeps headroom for
// the auth and service clients.
const sql = postgres(env.DATABASE_URL, { prepare: false, max: 5, idle_timeout: 20 });
const db = drizzle(sql);

/* ─── Geography ────────────────────────────────────────────────────────── */

export async function listRegions(): Promise<RefRegion[]> {
  return db.select().from(refRegions).orderBy(asc(refRegions.name));
}

export async function listDistricts(opts?: { regionId?: string }): Promise<RefDistrict[]> {
  const q = db.select().from(refDistricts).orderBy(asc(refDistricts.name));
  if (opts?.regionId) {
    return q.where(eq(refDistricts.regionId, opts.regionId));
  }
  return q;
}

export async function listSubcounties(opts: { districtId: string }): Promise<RefSubcounty[]> {
  return db
    .select()
    .from(refSubcounties)
    .where(eq(refSubcounties.districtId, opts.districtId))
    .orderBy(asc(refSubcounties.name));
}

/* ─── Clinical catalog ─────────────────────────────────────────────────── */

export async function listCouncils(): Promise<RefCouncil[]> {
  return db.select().from(refCouncils).orderBy(asc(refCouncils.name));
}

export async function listCadres(opts?: { councilId?: string }): Promise<RefCadre[]> {
  const q = db.select().from(refCadres).orderBy(asc(refCadres.sortOrder), asc(refCadres.name));
  if (opts?.councilId) {
    return q.where(eq(refCadres.councilId, opts.councilId));
  }
  return q;
}

/**
 * Specialties — by default returns only top-level (parent_id IS NULL).
 * Pass `{ parentId }` to fetch sub-specialties of a given parent.
 */
export async function listSpecialties(opts?: {
  parentId?: string | null;
}): Promise<RefSpecialty[]> {
  const q = db.select().from(refSpecialties).orderBy(asc(refSpecialties.name));
  if (opts && opts.parentId !== undefined) {
    return q.where(
      opts.parentId === null
        ? isNull(refSpecialties.parentId)
        : eq(refSpecialties.parentId, opts.parentId),
    );
  }
  return q;
}

export async function listRoles(opts?: {
  cadreId?: string;
  specialtyId?: string;
  departmentFamily?: string;
}): Promise<RefRole[]> {
  const wheres = [];
  if (opts?.cadreId) wheres.push(eq(refRoles.cadreId, opts.cadreId));
  if (opts?.specialtyId) wheres.push(eq(refRoles.specialtyId, opts.specialtyId));
  if (opts?.departmentFamily) wheres.push(eq(refRoles.departmentFamily, opts.departmentFamily));

  const q = db.select().from(refRoles).orderBy(asc(refRoles.sortOrder), asc(refRoles.name));

  if (wheres.length === 0) return q;
  return q.where(wheres.length === 1 ? wheres[0]! : and(...wheres));
}

/* ─── Hospitals ────────────────────────────────────────────────────────── */

export async function listHospitals(): Promise<Hospital[]> {
  return db.select().from(hospitals).orderBy(asc(hospitals.name));
}

export async function listHospitalDepartments(opts?: {
  hospitalId?: string;
}): Promise<HospitalDepartment[]> {
  const q = db.select().from(hospitalDepartments).orderBy(asc(hospitalDepartments.name));
  if (opts?.hospitalId) {
    return q.where(eq(hospitalDepartments.hospitalId, opts.hospitalId));
  }
  return q;
}

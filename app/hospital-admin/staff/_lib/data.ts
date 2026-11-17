import "server-only";

import { and, asc, desc, eq, inArray, isNull, notInArray } from "drizzle-orm";

import { db } from "@/db";
import { clinicianProfiles, staffAffiliations } from "@/db/schema/clinician-profiles";
import { hospitalAdminRoster } from "@/db/schema/hospital-admin-roster";
import { hospitalDepartments } from "@/db/schema/hospital-departments";
import { hospitalStaffInvitations } from "@/db/schema/hospital-staff-invitations";
import { cadreGrades, cadres, councils, roles, specialties } from "@/db/schema/reference-data";
import { staffIdentityProfiles } from "@/db/schema/staff-identity-profiles";
import { userRoles } from "@/db/schema/user-roles";
import { users } from "@/db/schema/users";
import { BLOCKED_USER_STATES } from "@/lib/auth/reachable";
import { sortAdmins } from "./people";

/**
 * People (ADR 0520 phase 2): the page's reads, every one scoped to the admin's hospital. The four staff queries
 * moved here unchanged from the old Staff page; the admins query is new and only reads.
 */

export interface PendingAffiliationRow {
  id: string;
  fullName: string;
  email: string;
  /** Drives which evidence block the panel renders. Clinical → council
   * + licence. Non-clinical → NIN-on-file + appointment letter +
   * authorising officer. Migration 0033 added cadres.is_clinical for
   * this. */
  isClinical: boolean;
  cadreName: string;
  cadreGradeName: string | null;
  roleName: string;
  departmentName: string;
  specialtyName: string | null;
  employmentType: string;
  reviewNote: string | null;
  createdAtIso: string;
  /** Days since submission, computed server-side at fetch time.
   * The client renders this as the aging chip without calling
   * Date.now() during render (which React's new purity rules flag). */
  daysSinceSubmission: number;

  // Clinical-only fields (null for non-clinical applicants).
  councilName: string | null;
  /** e.g. "UMDPC" — drives the register link in the approval sheet. */
  councilCode: string | null;
  registrationNumber: string | null;
  registrationExpiry: string | null;
  licenceDocumentPath: string | null;

  // Non-clinical-only fields (null for clinical applicants).
  ninOnFile: boolean;
  staffNumber: string | null;
  appointmentLetterPath: string | null;
  authorisingOfficerName: string | null;
  authorisingOfficerRole: string | null;
}

export async function fetchPendingAffiliations(
  hospitalId: string,
): Promise<PendingAffiliationRow[]> {
  // LEFT joins on the cadre-conditional rows so non-clinical applicants
  // (no clinician_profiles row, no council on cadre, but has a
  // staff_identity_profiles row) still surface in this queue.
  const rows = await db
    .select({
      id: staffAffiliations.id,
      employmentType: staffAffiliations.employmentType,
      reviewNote: staffAffiliations.reviewNote,
      createdAt: staffAffiliations.createdAt,
      fullName: users.fullName,
      email: users.email,
      cadreName: cadres.name,
      isClinical: cadres.isClinical,
      cadreGradeName: cadreGrades.name,
      roleName: roles.name,
      departmentName: hospitalDepartments.name,
      specialtyName: specialties.name,
      councilName: councils.name,
      councilCode: councils.code,
      registrationNumber: clinicianProfiles.registrationNumber,
      registrationExpiry: clinicianProfiles.registrationExpiry,
      licenceDocumentPath: clinicianProfiles.licenceDocumentPath,
      identityProfileId: staffIdentityProfiles.id,
      staffNumber: staffIdentityProfiles.staffNumber,
      appointmentLetterPath: staffIdentityProfiles.appointmentLetterUrl,
      authorisingOfficerName: staffIdentityProfiles.authorisingOfficerName,
      authorisingOfficerRole: staffIdentityProfiles.authorisingOfficerRole,
    })
    .from(staffAffiliations)
    .innerJoin(users, eq(users.id, staffAffiliations.userId))
    .innerJoin(cadres, eq(cadres.id, staffAffiliations.cadreId))
    .leftJoin(clinicianProfiles, eq(clinicianProfiles.id, staffAffiliations.userId))
    .leftJoin(councils, eq(councils.id, clinicianProfiles.councilId))
    .leftJoin(staffIdentityProfiles, eq(staffIdentityProfiles.id, staffAffiliations.userId))
    .leftJoin(cadreGrades, eq(cadreGrades.id, staffAffiliations.cadreGradeId))
    .innerJoin(roles, eq(roles.id, staffAffiliations.roleId))
    .innerJoin(hospitalDepartments, eq(hospitalDepartments.id, staffAffiliations.departmentId))
    .leftJoin(specialties, eq(specialties.id, staffAffiliations.specialtyId))
    .where(
      and(
        eq(staffAffiliations.hospitalId, hospitalId),
        eq(staffAffiliations.state, "pending_approval"),
      ),
    )
    .orderBy(desc(staffAffiliations.createdAt));

  const nowMs = Date.now();

  return rows.map((r) => ({
    id: r.id,
    fullName: r.fullName,
    email: r.email,
    isClinical: r.isClinical,
    cadreName: r.cadreName,
    cadreGradeName: r.cadreGradeName,
    roleName: r.roleName,
    departmentName: r.departmentName,
    specialtyName: r.specialtyName,
    employmentType: r.employmentType,
    reviewNote: r.reviewNote,
    createdAtIso: r.createdAt.toISOString(),
    daysSinceSubmission: Math.floor((nowMs - r.createdAt.getTime()) / 86_400_000),
    councilName: r.councilName,
    councilCode: r.councilCode,
    registrationNumber: r.registrationNumber,
    registrationExpiry: r.registrationExpiry ? r.registrationExpiry.toString() : null,
    licenceDocumentPath: r.licenceDocumentPath,
    ninOnFile: r.identityProfileId !== null,
    staffNumber: r.staffNumber,
    appointmentLetterPath: r.appointmentLetterPath,
    authorisingOfficerName: r.authorisingOfficerName,
    authorisingOfficerRole: r.authorisingOfficerRole,
  }));
}

/* ─── Directory ────────────────────────────────────────────────────── */

export interface DirectoryAffiliationRow {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  cadreName: string;
  roleId: string;
  roleName: string;
  departmentId: string;
  departmentName: string;
  employmentType: string;
  state: string;
  /** NULL for non-clinical staff, who have no council (ADR 0520: they were missing from the directory). */
  councilName: string | null;
  /** Council registration number — operationally queryable, intentionally
   * plaintext, but the UI keeps it masked-until-expanded. NULL for non-clinical staff. */
  registrationNumber: string | null;
}

const DIRECTORY_STATES = ["approved", "active", "suspended", "deactivated"] as const;

export async function fetchDirectoryAffiliations(
  hospitalId: string,
): Promise<DirectoryAffiliationRow[]> {
  const rows = await db
    .select({
      id: staffAffiliations.id,
      userId: staffAffiliations.userId,
      roleId: staffAffiliations.roleId,
      departmentId: staffAffiliations.departmentId,
      employmentType: staffAffiliations.employmentType,
      state: staffAffiliations.state,
      fullName: users.fullName,
      email: users.email,
      cadreName: cadres.name,
      roleName: roles.name,
      departmentName: hospitalDepartments.name,
      councilName: councils.name,
      registrationNumber: clinicianProfiles.registrationNumber,
    })
    .from(staffAffiliations)
    .innerJoin(users, eq(users.id, staffAffiliations.userId))
    // Left joins: non-clinical staff have no clinician profile or council and must still be listed.
    .leftJoin(clinicianProfiles, eq(clinicianProfiles.id, staffAffiliations.userId))
    .leftJoin(councils, eq(councils.id, clinicianProfiles.councilId))
    .innerJoin(cadres, eq(cadres.id, staffAffiliations.cadreId))
    .innerJoin(roles, eq(roles.id, staffAffiliations.roleId))
    .innerJoin(hospitalDepartments, eq(hospitalDepartments.id, staffAffiliations.departmentId))
    .where(
      and(
        eq(staffAffiliations.hospitalId, hospitalId),
        inArray(staffAffiliations.state, [...DIRECTORY_STATES]),
      ),
    )
    .orderBy(asc(users.fullName));

  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    fullName: r.fullName,
    email: r.email,
    cadreName: r.cadreName,
    roleId: r.roleId,
    roleName: r.roleName,
    departmentId: r.departmentId,
    departmentName: r.departmentName,
    employmentType: r.employmentType,
    state: r.state,
    councilName: r.councilName,
    registrationNumber: r.registrationNumber,
  }));
}

export interface DirectoryDepartmentOption {
  id: string;
  name: string;
}

export async function fetchHospitalDepartments(
  hospitalId: string,
): Promise<DirectoryDepartmentOption[]> {
  const rows = await db
    .select({ id: hospitalDepartments.id, name: hospitalDepartments.name })
    .from(hospitalDepartments)
    .where(eq(hospitalDepartments.hospitalId, hospitalId))
    .orderBy(asc(hospitalDepartments.name));
  return rows;
}

export interface DirectoryRoleOption {
  id: string;
  name: string;
  cadreName: string;
}

/* ─── Invitations ──────────────────────────────────────────────────── */

export interface InvitationRow {
  id: string;
  email: string;
  name: string | null;
  source: string;
  invitedAtIso: string;
  expiresAtIso: string;
  acceptedAtIso: string | null;
  revokedAtIso: string | null;
  revocationReason: string | null;
  status: "pending" | "accepted" | "revoked" | "expired";
}

export async function fetchInvitations(hospitalId: string): Promise<InvitationRow[]> {
  const rows = await db
    .select({
      id: hospitalStaffInvitations.id,
      email: hospitalStaffInvitations.invitedEmail,
      name: hospitalStaffInvitations.invitedName,
      source: hospitalStaffInvitations.source,
      invitedAt: hospitalStaffInvitations.invitedAt,
      expiresAt: hospitalStaffInvitations.expiresAt,
      acceptedAt: hospitalStaffInvitations.acceptedAt,
      revokedAt: hospitalStaffInvitations.revokedAt,
      revocationReason: hospitalStaffInvitations.revocationReason,
    })
    .from(hospitalStaffInvitations)
    .where(eq(hospitalStaffInvitations.hospitalId, hospitalId))
    .orderBy(desc(hospitalStaffInvitations.invitedAt));

  const nowMs = Date.now();
  return rows.map((r) => {
    const acceptedAtIso = r.acceptedAt?.toISOString() ?? null;
    const revokedAtIso = r.revokedAt?.toISOString() ?? null;
    const expiresAtIso = r.expiresAt.toISOString();
    const expired = !acceptedAtIso && !revokedAtIso && r.expiresAt.getTime() < nowMs;
    const status: InvitationRow["status"] = acceptedAtIso
      ? "accepted"
      : revokedAtIso
        ? "revoked"
        : expired
          ? "expired"
          : "pending";
    return {
      id: r.id,
      email: r.email,
      name: r.name,
      source: r.source,
      invitedAtIso: r.invitedAt.toISOString(),
      expiresAtIso,
      acceptedAtIso,
      revokedAtIso,
      revocationReason: r.revocationReason,
      status,
    };
  });
}

export async function fetchHospitalRoles(): Promise<DirectoryRoleOption[]> {
  // Roles are catalog-wide, not hospital-scoped. The admin sees the
  // full catalog when picking a new role (filtered client-side by
  // search). The role row carries cadre_id; we join to surface the
  // cadre label so the admin doesn't pick a nurse role for a doctor.
  const rows = await db
    .select({
      id: roles.id,
      name: roles.name,
      cadreName: cadres.name,
    })
    .from(roles)
    .innerJoin(cadres, eq(cadres.id, roles.cadreId))
    .orderBy(asc(cadres.name), asc(roles.name));
  return rows;
}

/* ─── Admins ───────────────────────────────────────────────────────── */

export interface HospitalAdminRow {
  userId: string;
  fullName: string;
  email: string;
  /** From the current `hospital_admin_roster` row; null when the roster has none (an admin from before it). */
  designation: "primary" | "backup" | null;
  /** When they were designated, or else when the role was granted. */
  sinceIso: string;
}

/**
 * Who holds `hospital_admin` at this hospital (`user_roles`, the grant), with their current roster designation
 * (`hospital_admin_roster`, succeeded_at IS NULL). A blocked account is left out, as the admin scope does.
 */
export async function fetchHospitalAdmins(hospitalId: string): Promise<HospitalAdminRow[]> {
  const rows = await db
    .select({
      userId: userRoles.userId,
      fullName: users.fullName,
      email: users.email,
      grantedAt: userRoles.createdAt,
      designation: hospitalAdminRoster.designation,
      designatedAt: hospitalAdminRoster.designatedAt,
    })
    .from(userRoles)
    .innerJoin(users, eq(users.id, userRoles.userId))
    .leftJoin(
      hospitalAdminRoster,
      and(
        eq(hospitalAdminRoster.hospitalId, userRoles.hospitalId),
        eq(hospitalAdminRoster.userId, userRoles.userId),
        isNull(hospitalAdminRoster.succeededAt),
      ),
    )
    .where(
      and(
        eq(userRoles.hospitalId, hospitalId),
        eq(userRoles.role, "hospital_admin"),
        notInArray(users.state, [...BLOCKED_USER_STATES]),
      ),
    )
    .orderBy(asc(users.fullName));

  // One row per person: a person with two current roster rows shows the primary one.
  const byUser = new Map<string, HospitalAdminRow>();
  for (const r of rows) {
    const designation =
      r.designation === "primary" || r.designation === "backup" ? r.designation : null;
    const prev = byUser.get(r.userId);
    if (prev && (prev.designation === "primary" || designation === null)) continue;
    byUser.set(r.userId, {
      userId: r.userId,
      fullName: r.fullName,
      email: r.email,
      designation,
      sinceIso: (r.designatedAt ?? r.grantedAt).toISOString(),
    });
  }
  return sortAdmins([...byUser.values()]);
}

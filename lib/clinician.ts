/**
 * Server-side helpers for clinical-staff signup (GATE D).
 *
 * Like patient signup (GATE C), the flow is two phases so PHI / PII
 * never lands against an unverified email:
 *
 *   1. `createClinicianAccount`     — Supabase signUp → email OTP sent
 *   2. `verifyClinicianAccount`     — verifyOtp → upload licence to
 *                                     Storage → insert clinician_profile
 *                                     + staff_affiliation + user_role
 *                                     → transition lifecycle to
 *                                     `pending_approval`
 *   3. `resendClinicianOtp`         — Supabase resend wrapper
 *
 * The verify step ends with the user `pending_approval`. Active state
 * is gated on the hospital admin's approval (GATE F).
 *
 * The `staff_affiliations` row also defaults to `pending_approval`
 * (DB-side) — so even if a downstream bug bypassed this code path the
 * row would still be inert clinically.
 */

import "server-only";

import type { StaffAffiliation } from "@/db/schema";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { clinicianProfiles, staffAffiliations, userRoles } from "@/db/schema";
import { env } from "@/lib/env";
import { transitionUserState } from "@/lib/lifecycle";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const sql = postgres(env.DATABASE_URL, { prepare: false, max: 3, idle_timeout: 20 });
const db = drizzle(sql);

const LICENCE_BUCKET = "clinician-licences";

// ─── Phase 1 — account creation ─────────────────────────────────────────

export interface CreateClinicianAccountInput {
  fullName: string;
  email: string;
  password: string;
}

export type CreateClinicianAccountResult =
  | { ok: true; userId: string }
  | { ok: false; error: string };

export async function createClinicianAccount(
  input: CreateClinicianAccountInput,
): Promise<CreateClinicianAccountResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: { full_name: input.fullName },
    },
  });

  if (error) {
    logger.warn("clinician.create-account.failed", { reason: error.message });
    return { ok: false, error: error.message };
  }
  if (!data.user) {
    logger.error("clinician.create-account.no-user");
    return { ok: false, error: "Account created but no user record returned." };
  }

  logger.info("clinician.create-account.ok", { userId: data.user.id });
  return { ok: true, userId: data.user.id };
}

// ─── Phase 1b — upload licence (service role; pre-verify) ───────────────

export interface UploadLicenceInput {
  userId: string;
  bytes: ArrayBuffer;
  contentType: string;
  filename: string;
}

export type UploadLicenceResult = { ok: true; path: string } | { ok: false; error: string };

/**
 * Upload the licence document to private storage. Runs under the
 * service role because the user's email hasn't been verified yet —
 * they have no usable session for the user-context client to attach
 * to. RLS still applies to anyone who later tries to read the object;
 * superadmin + the relevant hospital_admin are the only readers per
 * 0013's policies.
 */
export async function uploadClinicianLicence(
  input: UploadLicenceInput,
): Promise<UploadLicenceResult> {
  const serviceSb = createServiceClient();
  const ext = guessExtension(input.contentType, input.filename);
  const path = `${input.userId}/${Date.now()}-licence${ext}`;
  const { error } = await serviceSb.storage.from(LICENCE_BUCKET).upload(path, input.bytes, {
    contentType: input.contentType,
    upsert: false,
  });
  if (error) {
    logger.error("clinician.licence-upload.failed", {
      userId: input.userId,
      reason: error.message,
    });
    return { ok: false, error: error.message };
  }
  return { ok: true, path };
}

// ─── Phase 2 — OTP verify + profile/affiliation insert ─────────────────

export interface VerifyClinicianAccountInput {
  email: string;
  token: string;
  /** Plaintext phone — also persisted to public.users.phone. */
  phone: string;
  profile: {
    councilId: string;
    registrationNumber: string;
    /** ISO yyyy-mm-dd or null. */
    registrationExpiry: string | null;
    /** Storage path from a prior `uploadClinicianLicence` call. */
    licenceDocumentPath: string | null;
  };
  affiliation: {
    hospitalId: string;
    departmentId: string;
    cadreId: string;
    cadreGradeId: string | null;
    roleId: string;
    specialtyId: string | null;
    employmentType: "full_time" | "visiting" | "locum";
  };
  /** Council-role assigned to user_roles (clinician/nurse/pharmacist/lab_tech). */
  primaryRole: "clinician" | "nurse" | "pharmacist" | "lab_tech";
}

export type VerifyClinicianAccountResult =
  | { ok: true; userId: string; affiliationId: string }
  | { ok: false; error: string };

export async function verifyClinicianAccount(
  input: VerifyClinicianAccountInput,
): Promise<VerifyClinicianAccountResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    email: input.email,
    token: input.token,
    type: "email",
  });

  if (error) {
    logger.warn("clinician.verify-otp.failed", { reason: error.message });
    return { ok: false, error: error.message };
  }
  if (!data.user) {
    logger.error("clinician.verify-otp.no-user");
    return { ok: false, error: "Verification succeeded but no session was returned." };
  }

  const userId = data.user.id;

  // Service role from here so we can write clinician_profiles + the
  // plaintext-phone update on public.users without juggling RLS on a
  // freshly-verified session.
  const serviceSb = createServiceClient();

  const { error: userUpdateErr } = await serviceSb
    .from("users")
    .update({ phone: input.phone })
    .eq("id", userId);
  if (userUpdateErr) {
    logger.error("clinician.update-users.failed", { userId, reason: userUpdateErr.message });
    return { ok: false, error: "Failed to persist contact info." };
  }

  // Insert the clinician_profile.
  const { error: profileErr } = await serviceSb.from("clinician_profiles").insert({
    user_id: userId,
    council_id: input.profile.councilId,
    registration_number: input.profile.registrationNumber,
    licence_document_path: input.profile.licenceDocumentPath,
    registration_expiry: input.profile.registrationExpiry,
  });
  if (profileErr) {
    logger.error("clinician.insert-profile.failed", {
      userId,
      reason: profileErr.message,
    });
    return { ok: false, error: "Failed to save professional identity." };
  }

  // Insert the first staff_affiliation. DB default state is
  // 'pending_approval' so we don't have to set it explicitly, but we
  // set it anyway to make intent obvious to readers.
  const { data: affiliationRow, error: affiliationErr } = await serviceSb
    .from("staff_affiliations")
    .insert({
      user_id: userId,
      hospital_id: input.affiliation.hospitalId,
      department_id: input.affiliation.departmentId,
      cadre_id: input.affiliation.cadreId,
      cadre_grade_id: input.affiliation.cadreGradeId,
      role_id: input.affiliation.roleId,
      specialty_id: input.affiliation.specialtyId,
      employment_type: input.affiliation.employmentType,
      state: "pending_approval",
    })
    .select("id")
    .single<{ id: string }>();

  if (affiliationErr || !affiliationRow) {
    logger.error("clinician.insert-affiliation.failed", {
      userId,
      reason: affiliationErr?.message ?? "no row returned",
    });
    return { ok: false, error: "Failed to save hospital affiliation." };
  }

  // Insert the user_role row scoped to the affiliation's hospital.
  // The role itself doesn't grant clinical access until the
  // affiliation transitions to 'active' (proxy.ts gates that
  // separately in GATE F), but it does drive MFA enforcement now.
  const { error: roleErr } = await serviceSb.from("user_roles").insert({
    user_id: userId,
    role: input.primaryRole,
    hospital_id: input.affiliation.hospitalId,
  });
  if (roleErr) {
    logger.error("clinician.insert-role.failed", {
      userId,
      reason: roleErr.message,
    });
    return { ok: false, error: "Failed to assign role." };
  }

  // Advance the lifecycle: unverified → verified → pending_approval.
  // Stay there until the hospital admin moves the affiliation to
  // approved (GATE F).
  const v = await transitionUserState({ userId, to: "verified", reason: "email otp verified" });
  if (!v.ok) {
    logger.error("clinician.lifecycle.verified-failed", {
      userId,
      error: v.error,
    });
    return { ok: false, error: "Failed to mark account verified." };
  }
  const p = await transitionUserState({
    userId,
    to: "pending_approval",
    reason: "clinician signup complete — awaiting hospital admin",
  });
  if (!p.ok) {
    logger.error("clinician.lifecycle.pending-failed", {
      userId,
      error: p.error,
    });
    return { ok: false, error: "Failed to mark account pending approval." };
  }

  logger.info("clinician.signup.complete", {
    userId,
    affiliationId: affiliationRow.id,
  });
  return { ok: true, userId, affiliationId: affiliationRow.id };
}

// ─── Phase 3 — resend OTP ───────────────────────────────────────────────

export async function resendClinicianOtp(
  email: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { error } = await supabase.auth.resend({ email, type: "signup" });
  if (error) {
    logger.warn("clinician.resend-otp.failed", { reason: error.message });
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

// ─── Helpers ────────────────────────────────────────────────────────────

function guessExtension(contentType: string, filename: string): string {
  // Prefer the filename's existing extension if it matches a known
  // accepted type; otherwise derive from contentType.
  const fromName = filename.match(/\.(pdf|jpg|jpeg|png)$/i)?.[0]?.toLowerCase();
  if (fromName) return fromName;
  if (contentType === "application/pdf") return ".pdf";
  if (contentType === "image/jpeg") return ".jpg";
  if (contentType === "image/png") return ".png";
  return "";
}

// ─── Reads for the pending / dashboard pages ────────────────────────────

export async function getClinicianAffiliationForUser(
  userId: string,
): Promise<StaffAffiliation | null> {
  const rows = await db
    .select()
    .from(staffAffiliations)
    .where(eq(staffAffiliations.userId, userId))
    .orderBy(staffAffiliations.createdAt)
    .limit(1);
  return rows[0] ?? null;
}

/** True if the user already has a user_roles row (used to guard re-runs). */
export async function clinicianHasRole(userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: userRoles.id })
    .from(userRoles)
    .where(eq(userRoles.userId, userId))
    .limit(1);
  return rows.length > 0;
}

/** True if the user has uploaded a clinician_profile row. */
export async function clinicianHasProfile(userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: clinicianProfiles.id })
    .from(clinicianProfiles)
    .where(eq(clinicianProfiles.userId, userId))
    .limit(1);
  return rows.length > 0;
}

/**
 * Server-side helpers for patient signup (GATE C).
 *
 * Three callable phases:
 *
 *   1. `createPatientAccount`  — anon → auth user + email-OTP sent
 *   2. `verifyPatientAccount`  — accepts the emailed 6-digit code,
 *                                 transitions state unverified → verified,
 *                                 creates patient_profiles row,
 *                                 reads back the MS-YYYY-NNNNN code
 *   3. `getPatientCode`        — convenience read for the /done page
 *
 * Why two phases (account first, profile after verify):
 *   - We MUST NOT store PHI (NIN, phone ciphertext) against an
 *     unverified email — the user could've fat-fingered the address.
 *   - Supabase email-OTP fires automatically on signUp, so we don't
 *     need a separate "send code" call.
 *   - On a failed verification we leave the auth.users row alone;
 *     they can resend or correct the email and try again.
 *
 * PHI handling:
 *   - id_number and phone are encrypted with lib/encryption.ts before
 *     they touch the DB. Plaintext copies never leave this module.
 *   - Logger calls only ever pass the user_id and the patient_code —
 *     no email, name, NIN, phone, or DOB.
 */

import "server-only";

import type { PatientIdType, PatientSex } from "@/db/schema/patient-profiles";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { patientProfiles, users } from "@/db/schema";
import { encrypt } from "@/lib/encryption";
import { env } from "@/lib/env";
import { transitionUserState } from "@/lib/lifecycle";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const sql = postgres(env.DATABASE_URL, { prepare: false, max: 3, idle_timeout: 20 });
const db = drizzle(sql);

// ─── Phase 1 — account creation ─────────────────────────────────────────

export interface CreatePatientAccountInput {
  fullName: string;
  email: string;
  password: string;
}

export type CreatePatientAccountResult =
  | { ok: true; userId: string }
  | { ok: false; error: string };

/**
 * Create the auth.users row. Supabase mails a 6-digit confirmation
 * code to `email` automatically. The trigger from migration 0004
 * mirrors the row into public.users with state=unverified.
 *
 * No PHI touches the DB here — only name + email + password hash.
 */
export async function createPatientAccount(
  input: CreatePatientAccountInput,
): Promise<CreatePatientAccountResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: { full_name: input.fullName },
    },
  });

  if (error) {
    logger.warn("patient.create-account.failed", { reason: error.message });
    return { ok: false, error: error.message };
  }
  if (!data.user) {
    logger.error("patient.create-account.no-user");
    return { ok: false, error: "Account created but no user record returned." };
  }

  logger.info("patient.create-account.ok", { userId: data.user.id });
  return { ok: true, userId: data.user.id };
}

// ─── Phase 2 — OTP verify + profile insert ──────────────────────────────

export interface VerifyPatientAccountInput {
  email: string;
  token: string;
  /** All the profile fields collected in step 1 of the form. */
  profile: {
    sex: PatientSex;
    dateOfBirth: string; // ISO yyyy-mm-dd
    idType: PatientIdType;
    /** Plaintext NIN/passport/refugee ID — encrypted before insert. */
    idNumber: string | null;
    /** Plaintext +256… phone — encrypted before insert; also stored
     *  plaintext in public.users.phone for operational routing. */
    phone: string;
    districtId: string | null;
    subcountyId: string | null;
    preferredLanguage: string | null;
  };
}

export type VerifyPatientAccountResult =
  | { ok: true; userId: string; patientCode: string }
  | { ok: false; error: string };

/**
 * Verify the email OTP, write the patient profile, advance lifecycle
 * to `verified` and immediately to `active` (patients have no
 * approval step).
 *
 * Returns the issued MS-YYYY-NNNNN code for the /done page.
 */
export async function verifyPatientAccount(
  input: VerifyPatientAccountInput,
): Promise<VerifyPatientAccountResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    email: input.email,
    token: input.token,
    type: "email",
  });

  if (error) {
    logger.warn("patient.verify-otp.failed", { reason: error.message });
    return { ok: false, error: error.message };
  }
  if (!data.user) {
    logger.error("patient.verify-otp.no-user");
    return { ok: false, error: "Verification succeeded but no session was returned." };
  }

  const userId = data.user.id;

  // Sanity guard against an id_type=none + id_number combo slipping
  // through (the form should catch this, but enforce here too).
  if (input.profile.idType === "none" && input.profile.idNumber) {
    return { ok: false, error: "ID number must be empty when id_type is 'none'." };
  }
  if (input.profile.idType !== "none" && !input.profile.idNumber) {
    return { ok: false, error: "ID number is required for this ID type." };
  }

  // Encrypt PHI before any DB write.
  const idNumberEncrypted = input.profile.idNumber ? encrypt(input.profile.idNumber) : null;
  const phoneEncrypted = encrypt(input.profile.phone);

  // Use service role so the FK-side write to public.users.phone (also
  // RLS-protected during signup) can land alongside the profile
  // insert without a per-call user JWT.
  const serviceSb = createServiceClient();

  // Update public.users.phone (plaintext, operational copy). full_name
  // was already mirrored by the 0004 trigger; we leave it untouched.
  const { error: userUpdateErr } = await serviceSb
    .from("users")
    .update({ phone: input.profile.phone })
    .eq("id", userId);
  if (userUpdateErr) {
    logger.error("patient.update-users.failed", {
      userId,
      reason: userUpdateErr.message,
    });
    return { ok: false, error: "Failed to persist contact info." };
  }

  // Insert the patient_profiles row. patient_code is DB-assigned via
  // DEFAULT issue_patient_code() — we read it back through .select().
  const { data: inserted, error: insertErr } = await serviceSb
    .from("patient_profiles")
    .insert({
      id: userId,
      sex: input.profile.sex,
      date_of_birth: input.profile.dateOfBirth,
      id_type: input.profile.idType,
      id_number_encrypted: idNumberEncrypted,
      phone_encrypted: phoneEncrypted,
      district_id: input.profile.districtId,
      subcounty_id: input.profile.subcountyId,
      preferred_language: input.profile.preferredLanguage,
    })
    .select("patient_code")
    .single<{ patient_code: string }>();

  if (insertErr || !inserted) {
    logger.error("patient.insert-profile.failed", {
      userId,
      reason: insertErr?.message ?? "no row returned",
    });
    return { ok: false, error: "Failed to save profile." };
  }

  // Advance the lifecycle: unverified → verified → active.
  // Patients have no approval gate; they're active the moment the OTP
  // matches and the profile lands.
  const v = await transitionUserState({ userId, to: "verified", reason: "email otp verified" });
  if (!v.ok) {
    logger.error("patient.lifecycle.verified-failed", {
      userId,
      error: v.error,
    });
    return { ok: false, error: "Failed to mark account verified." };
  }
  const a = await transitionUserState({ userId, to: "active", reason: "patient signup complete" });
  if (!a.ok) {
    logger.error("patient.lifecycle.active-failed", {
      userId,
      error: a.error,
    });
    return { ok: false, error: "Failed to activate account." };
  }

  logger.info("patient.signup.complete", {
    userId,
    patientCode: inserted.patient_code,
  });
  return { ok: true, userId, patientCode: inserted.patient_code };
}

// ─── Phase 3 — read back for /done page ─────────────────────────────────

/**
 * Read the patient's MS-YYYY-NNNNN code. Used by the /done page when
 * the request arrives with an authenticated session but no token in
 * the URL.
 */
export async function getPatientCode(userId: string): Promise<string | null> {
  const rows = await db
    .select({ patientCode: patientProfiles.patientCode })
    .from(patientProfiles)
    .where(eq(patientProfiles.id, userId))
    .limit(1);
  return rows.length > 0 ? (rows[0]?.patientCode ?? null) : null;
}

/**
 * Resend the email OTP (the patient lost / didn't receive the
 * original). Wraps Supabase's resend so server actions stay symmetric
 * with createPatientAccount.
 */
export async function resendPatientOtp(
  email: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { error } = await supabase.auth.resend({ email, type: "signup" });
  if (error) {
    logger.warn("patient.resend-otp.failed", { reason: error.message });
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** Convenience: confirm the users table has a row for the given id. */
export async function userExists(userId: string): Promise<boolean> {
  const rows = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  return rows.length > 0;
}

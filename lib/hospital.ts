/**
 * Server-side helpers for hospital signup (GATE E).
 *
 * The flow mirrors the clinician path (GATE D):
 *
 *   1. `createHospitalAccount`        — Supabase signUp → email OTP
 *   2. `uploadAuthorisationDocument`  — service-role; pre-verify
 *   3. `verifyHospitalApplication`    — verifyOtp → insert
 *                                       hospital_applications →
 *                                       lifecycle unverified →
 *                                       verified → pending_approval
 *   4. `resendHospitalOtp`            — Supabase resend wrapper
 *
 * Unlike the clinician path there's no `staff_affiliations` insert
 * here — the applicant doesn't yet belong to any hospital (their
 * application IS the hospital). On superadmin approval (GATE F):
 *   - a row is created in public.hospitals
 *   - the applicant's user_roles row is set to hospital_admin scoped
 *     to that new hospital
 *   - hospital_applications.state moves to approved + the row points
 *     at approved_hospital_id
 */

import "server-only";

import type { HospitalApplication, HospitalLevel, HospitalOwnership } from "@/db/schema";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { hospitalApplications } from "@/db/schema";
import { env } from "@/lib/env";
import { transitionUserState } from "@/lib/lifecycle";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const sql = postgres(env.DATABASE_URL, { prepare: false, max: 3, idle_timeout: 20 });
const db = drizzle(sql);

const AUTHORISATION_BUCKET = "hospital-authorisations";

// ─── Phase 1 — account creation ─────────────────────────────────────────

export interface CreateHospitalAccountInput {
  fullName: string;
  email: string;
  password: string;
}

export type CreateHospitalAccountResult =
  | { ok: true; userId: string }
  | { ok: false; error: string };

export async function createHospitalAccount(
  input: CreateHospitalAccountInput,
): Promise<CreateHospitalAccountResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: { full_name: input.fullName },
    },
  });

  if (error) {
    logger.warn("hospital.create-account.failed", { reason: error.message });
    return { ok: false, error: error.message };
  }
  if (!data.user) {
    logger.error("hospital.create-account.no-user");
    return { ok: false, error: "Account created but no user record returned." };
  }
  logger.info("hospital.create-account.ok", { userId: data.user.id });
  return { ok: true, userId: data.user.id };
}

// ─── Phase 1b — upload authorisation letter ─────────────────────────────

export interface UploadAuthorisationInput {
  userId: string;
  bytes: ArrayBuffer;
  contentType: string;
  filename: string;
}

export type UploadAuthorisationResult = { ok: true; path: string } | { ok: false; error: string };

export async function uploadHospitalAuthorisation(
  input: UploadAuthorisationInput,
): Promise<UploadAuthorisationResult> {
  const serviceSb = createServiceClient();
  const ext = guessExtension(input.contentType, input.filename);
  const path = `${input.userId}/${Date.now()}-authorisation${ext}`;
  const { error } = await serviceSb.storage.from(AUTHORISATION_BUCKET).upload(path, input.bytes, {
    contentType: input.contentType,
    upsert: false,
  });
  if (error) {
    logger.error("hospital.authorisation-upload.failed", {
      userId: input.userId,
      reason: error.message,
    });
    return { ok: false, error: error.message };
  }
  return { ok: true, path };
}

// ─── Phase 2 — OTP verify + application insert ─────────────────────────

export interface VerifyHospitalApplicationInput {
  email: string;
  token: string;
  /** Plaintext phone — also persisted to public.users.phone. */
  phone: string;
  hospital: {
    name: string;
    level: HospitalLevel;
    ownership: HospitalOwnership;
    registrationNumber: string;
    registrationAuthority: string | null;
    districtId: string | null;
    subcountyId: string | null;
    physicalAddress: string;
    institutionalEmailDomain: string | null;
  };
  applicant: {
    role: string;
    authorisationDocumentPath: string | null;
  };
}

export type VerifyHospitalApplicationResult =
  | { ok: true; userId: string; applicationId: string }
  | { ok: false; error: string };

export async function verifyHospitalApplication(
  input: VerifyHospitalApplicationInput,
): Promise<VerifyHospitalApplicationResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    email: input.email,
    token: input.token,
    type: "email",
  });

  if (error) {
    logger.warn("hospital.verify-otp.failed", { reason: error.message });
    return { ok: false, error: error.message };
  }
  if (!data.user) {
    logger.error("hospital.verify-otp.no-user");
    return { ok: false, error: "Verification succeeded but no session was returned." };
  }

  const userId = data.user.id;
  const serviceSb = createServiceClient();

  // Plaintext phone copy on public.users (operational routing).
  const { error: userUpdateErr } = await serviceSb
    .from("users")
    .update({ phone: input.phone })
    .eq("id", userId);
  if (userUpdateErr) {
    logger.error("hospital.update-users.failed", { userId, reason: userUpdateErr.message });
    return { ok: false, error: "Failed to persist contact info." };
  }

  const { data: appRow, error: insertErr } = await serviceSb
    .from("hospital_applications")
    .insert({
      applicant_user_id: userId,
      hospital_name: input.hospital.name,
      level: input.hospital.level,
      ownership: input.hospital.ownership,
      registration_number: input.hospital.registrationNumber,
      registration_authority: input.hospital.registrationAuthority,
      district_id: input.hospital.districtId,
      subcounty_id: input.hospital.subcountyId,
      physical_address: input.hospital.physicalAddress,
      institutional_email_domain: input.hospital.institutionalEmailDomain,
      applicant_role: input.applicant.role,
      authorisation_document_path: input.applicant.authorisationDocumentPath,
      state: "pending_approval",
    })
    .select("id")
    .single<{ id: string }>();

  if (insertErr || !appRow) {
    logger.error("hospital.insert-application.failed", {
      userId,
      reason: insertErr?.message ?? "no row returned",
    });
    return { ok: false, error: "Failed to save hospital application." };
  }

  // Advance lifecycle unverified → verified → pending_approval. No
  // user_roles row at this point — that's set on approval (GATE F).
  const v = await transitionUserState({ userId, to: "verified", reason: "email otp verified" });
  if (!v.ok) {
    logger.error("hospital.lifecycle.verified-failed", { userId, error: v.error });
    return { ok: false, error: "Failed to mark account verified." };
  }
  const p = await transitionUserState({
    userId,
    to: "pending_approval",
    reason: "hospital application submitted — awaiting superadmin",
  });
  if (!p.ok) {
    logger.error("hospital.lifecycle.pending-failed", { userId, error: p.error });
    return { ok: false, error: "Failed to mark account pending approval." };
  }

  logger.info("hospital.application.complete", {
    userId,
    applicationId: appRow.id,
  });
  return { ok: true, userId, applicationId: appRow.id };
}

// ─── Phase 3 — resend ───────────────────────────────────────────────────

export async function resendHospitalOtp(
  email: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { error } = await supabase.auth.resend({ email, type: "signup" });
  if (error) {
    logger.warn("hospital.resend-otp.failed", { reason: error.message });
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

// ─── Reads ─────────────────────────────────────────────────────────────

export async function getHospitalApplicationForUser(
  userId: string,
): Promise<HospitalApplication | null> {
  const rows = await db
    .select()
    .from(hospitalApplications)
    .where(eq(hospitalApplications.applicantUserId, userId))
    .limit(1);
  return rows[0] ?? null;
}

// ─── Helpers ────────────────────────────────────────────────────────────

function guessExtension(contentType: string, filename: string): string {
  const fromName = filename.match(/\.(pdf|jpg|jpeg|png)$/i)?.[0]?.toLowerCase();
  if (fromName) return fromName;
  if (contentType === "application/pdf") return ".pdf";
  if (contentType === "image/jpeg") return ".jpg";
  if (contentType === "image/png") return ".png";
  return "";
}

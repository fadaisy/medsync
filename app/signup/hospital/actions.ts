"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { HOSPITAL_LEVEL_VALUES, HOSPITAL_OWNERSHIP_VALUES } from "@/db/schema";
import {
  createHospitalAccount,
  resendHospitalOtp,
  uploadHospitalAuthorisation,
  verifyHospitalApplication,
} from "@/lib/hospital";
import { logger } from "@/lib/logger";

/**
 * Server actions powering /signup/hospital.
 *
 * Identical shape to GATE D (clinical):
 *
 *   submitHospitalSignupAction
 *     → validate full form (incl. authorisation file)
 *     → createHospitalAccount → emailed OTP
 *     → uploadHospitalAuthorisation (service role, before email confirmed)
 *     → cookie-stash metadata + Storage path
 *     → redirect to /signup/hospital/verify
 *
 *   verifyHospitalOtpAction
 *     → verifyOtp → insert hospital_applications row
 *     → transition lifecycle unverified → verified → pending_approval
 *     → redirect to /signup/hospital/pending
 *
 *   resendHospitalOtpAction
 */

const PENDING_COOKIE = "msc_pending_hospital";
const PENDING_TTL_SECONDS = 30 * 60;
const MAX_AUTH_BYTES = 5 * 1024 * 1024;

const PhoneSchema = z
  .string()
  .min(7)
  .max(20)
  .regex(/^\+?[0-9 ()-]+$/, "Phone must be digits, spaces, dashes, parentheses, optionally with +");

const DomainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(120)
  .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, "Use a bare domain (e.g. mulago.go.ug — no @, no scheme)")
  .optional()
  .or(z.literal(""));

const SubmitSchema = z.object({
  // Account
  full_name: z.string().trim().min(1, "Required.").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email."),
  password: z
    .string()
    .min(12, "Password must be at least 12 characters.")
    .max(72, "Password must be 72 characters or fewer."),
  phone: PhoneSchema,
  applicant_role: z.string().trim().min(1, "Required.").max(120),

  // Hospital
  hospital_name: z.string().trim().min(1, "Required.").max(200),
  level: z.enum(HOSPITAL_LEVEL_VALUES),
  ownership: z.enum(HOSPITAL_OWNERSHIP_VALUES),
  registration_number: z.string().trim().min(1, "Required.").max(120),
  registration_authority: z.string().trim().max(200).optional().or(z.literal("")),
  district_id: z.string().uuid("Pick a district."),
  subcounty_id: z.string().uuid().optional().or(z.literal("")),
  physical_address: z.string().trim().min(1, "Required.").max(400),
  institutional_email_domain: DomainSchema,

  consent: z
    .string()
    .optional()
    .refine((v) => v === "on", "You must confirm you have authority to submit this application."),
});

export type HospitalFieldKey =
  | "full_name"
  | "email"
  | "password"
  | "phone"
  | "applicant_role"
  | "authorisation_document"
  | "hospital_name"
  | "level"
  | "ownership"
  | "registration_number"
  | "registration_authority"
  | "district_id"
  | "subcounty_id"
  | "physical_address"
  | "institutional_email_domain"
  | "consent";

export type HospitalSignupState = {
  errors?: Partial<Record<HospitalFieldKey | "_form", string>>;
  values?: Partial<Record<HospitalFieldKey, string>>;
};

interface PendingHospitalCookie {
  email: string;
  fullName: string;
  phone: string;
  applicantRole: string;
  hospitalName: string;
  level: (typeof HOSPITAL_LEVEL_VALUES)[number];
  ownership: (typeof HOSPITAL_OWNERSHIP_VALUES)[number];
  registrationNumber: string;
  registrationAuthority: string | null;
  districtId: string;
  subcountyId: string | null;
  physicalAddress: string;
  institutionalEmailDomain: string | null;
  authorisationDocumentPath: string | null;
}

function decodeCookieValue(raw: string | undefined): PendingHospitalCookie | null {
  if (!raw) return null;
  try {
    return JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as PendingHospitalCookie;
  } catch {
    return null;
  }
}

function encodeCookieValue(payload: PendingHospitalCookie): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function emptyToNull(s: string | undefined): string | null {
  return s && s !== "" ? s : null;
}

const HOSPITAL_FIELD_KEYS: HospitalFieldKey[] = [
  "full_name",
  "email",
  "phone",
  "applicant_role",
  "hospital_name",
  "level",
  "ownership",
  "registration_number",
  "registration_authority",
  "district_id",
  "subcounty_id",
  "physical_address",
  "institutional_email_domain",
  "consent",
];

// ─── Action 1 — submit ─────────────────────────────────────────────────

export async function submitHospitalSignupAction(
  _prev: HospitalSignupState,
  formData: FormData,
): Promise<HospitalSignupState> {
  const raw = Object.fromEntries(formData.entries());
  const parsed = SubmitSchema.safeParse(raw);

  if (!parsed.success) {
    const flat = parsed.error.flatten().fieldErrors as Record<string, string[] | undefined>;
    const errors: HospitalSignupState["errors"] = {};
    const values: HospitalSignupState["values"] = {};
    for (const key of HOSPITAL_FIELD_KEYS) {
      const v = formData.get(key);
      if (typeof v === "string") values[key] = v;
      const fieldErr = flat[key]?.[0];
      if (fieldErr) errors[key] = fieldErr;
    }
    return { errors, values };
  }

  const v = parsed.data;

  // Validate authorisation file.
  const authFile = formData.get("authorisation_document");
  let authMeta: { bytes: ArrayBuffer; contentType: string; filename: string } | null = null;
  if (authFile instanceof File && authFile.size > 0) {
    if (authFile.size > MAX_AUTH_BYTES) {
      return {
        errors: { authorisation_document: "Document is too large (5 MB max)." },
        values: stripFormData(raw),
      };
    }
    if (
      authFile.type !== "application/pdf" &&
      authFile.type !== "image/jpeg" &&
      authFile.type !== "image/png"
    ) {
      return {
        errors: { authorisation_document: "Document must be PDF, JPG, or PNG." },
        values: stripFormData(raw),
      };
    }
    authMeta = {
      bytes: await authFile.arrayBuffer(),
      contentType: authFile.type,
      filename: authFile.name,
    };
  } else {
    return {
      errors: { authorisation_document: "Upload your letter of authority to continue." },
      values: stripFormData(raw),
    };
  }

  // Create the auth user.
  const acct = await createHospitalAccount({
    fullName: v.full_name,
    email: v.email,
    password: v.password,
  });
  if (!acct.ok) {
    return { errors: { _form: acct.error }, values: stripFormData(raw) };
  }

  // Upload authorisation letter (service role, pre-verify).
  const uploaded = await uploadHospitalAuthorisation({
    userId: acct.userId,
    bytes: authMeta.bytes,
    contentType: authMeta.contentType,
    filename: authMeta.filename,
  });
  if (!uploaded.ok) {
    return {
      errors: { _form: `Document upload failed: ${uploaded.error}` },
      values: stripFormData(raw),
    };
  }

  const payload: PendingHospitalCookie = {
    email: v.email,
    fullName: v.full_name,
    phone: v.phone,
    applicantRole: v.applicant_role,
    hospitalName: v.hospital_name,
    level: v.level,
    ownership: v.ownership,
    registrationNumber: v.registration_number,
    registrationAuthority: emptyToNull(v.registration_authority),
    districtId: v.district_id,
    subcountyId: emptyToNull(v.subcounty_id),
    physicalAddress: v.physical_address,
    institutionalEmailDomain: emptyToNull(v.institutional_email_domain),
    authorisationDocumentPath: uploaded.path,
  };

  const jar = await cookies();
  jar.set(PENDING_COOKIE, encodeCookieValue(payload), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/signup/hospital",
    maxAge: PENDING_TTL_SECONDS,
  });

  logger.info("hospital.signup.submit-ok");
  redirect("/signup/hospital/verify");
}

function stripFormData(raw: Record<string, FormDataEntryValue>): HospitalSignupState["values"] {
  const out: HospitalSignupState["values"] = {};
  for (const k of HOSPITAL_FIELD_KEYS) {
    const v = raw[k];
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

// ─── Action 2 — verify OTP ─────────────────────────────────────────────

const VerifySchema = z.object({
  token: z.string().regex(/^\d{6}$/, "Enter the 6-digit code from your email."),
});

export type HospitalVerifyState = {
  error?: string;
};

export async function verifyHospitalOtpAction(
  _prev: HospitalVerifyState,
  formData: FormData,
): Promise<HospitalVerifyState> {
  const parsed = VerifySchema.safeParse({ token: formData.get("token") });
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors.token?.[0] ?? "Invalid code." };
  }

  const jar = await cookies();
  const pending = decodeCookieValue(jar.get(PENDING_COOKIE)?.value);
  if (!pending) {
    return { error: "Your pending application has expired. Please start over." };
  }

  const result = await verifyHospitalApplication({
    email: pending.email,
    token: parsed.data.token,
    phone: pending.phone,
    hospital: {
      name: pending.hospitalName,
      level: pending.level,
      ownership: pending.ownership,
      registrationNumber: pending.registrationNumber,
      registrationAuthority: pending.registrationAuthority,
      districtId: pending.districtId,
      subcountyId: pending.subcountyId,
      physicalAddress: pending.physicalAddress,
      institutionalEmailDomain: pending.institutionalEmailDomain,
    },
    applicant: {
      role: pending.applicantRole,
      authorisationDocumentPath: pending.authorisationDocumentPath,
    },
  });

  if (!result.ok) {
    return { error: result.error };
  }

  jar.delete(PENDING_COOKIE);
  redirect("/signup/hospital/pending");
}

// ─── Action 3 — resend ─────────────────────────────────────────────────

export type HospitalResendState = {
  status: "idle" | "sent" | "error";
  message?: string;
};

export async function resendHospitalOtpAction(
  _prev: HospitalResendState,
  _formData: FormData,
): Promise<HospitalResendState> {
  const jar = await cookies();
  const pending = decodeCookieValue(jar.get(PENDING_COOKIE)?.value);
  if (!pending) {
    return { status: "error", message: "Your pending application has expired. Please start over." };
  }
  const result = await resendHospitalOtp(pending.email);
  if (!result.ok) return { status: "error", message: result.error };
  return { status: "sent", message: "A new code has been emailed." };
}

// ─── Server-side cookie peek for the /verify page header ────────────────

export async function readPendingHospitalEmail(): Promise<string | null> {
  const jar = await cookies();
  const pending = decodeCookieValue(jar.get(PENDING_COOKIE)?.value);
  return pending?.email ?? null;
}

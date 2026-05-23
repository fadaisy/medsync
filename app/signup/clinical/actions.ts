"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  createClinicianAccount,
  resendClinicianOtp,
  uploadClinicianLicence,
  verifyClinicianAccount,
} from "@/lib/clinician";
import { logger } from "@/lib/logger";

/**
 * Server actions powering /signup/clinical.
 *
 * Phases mirror GATE C (patient signup) plus a licence upload that
 * happens immediately after the auth user lands:
 *
 *   1. submitClinicalSignupAction
 *        → validate full form (incl. licence file)
 *        → createClinicianAccount → emailed OTP
 *        → uploadClinicianLicence  (service role, before email confirmed)
 *        → cookie-stash the metadata + licence path
 *        → redirect to /signup/clinical/verify
 *
 *   2. verifyClinicalOtpAction
 *        → verifyOtp
 *        → insert clinician_profiles + staff_affiliations + user_roles
 *        → transition lifecycle unverified → verified → pending_approval
 *        → redirect to /signup/clinical/pending
 *
 *   3. resendClinicalOtpAction
 *
 * Cookie envelope is httpOnly, sameSite=strict, Secure-in-prod,
 * 30-minute TTL. Carries no password and no licence bytes — only the
 * server-issued Storage path.
 */

const PENDING_COOKIE = "msc_pending_clinical";
const PENDING_TTL_SECONDS = 30 * 60;
const MAX_LICENCE_BYTES = 5 * 1024 * 1024;

const PrimaryRoleSchema = z.enum(["clinician", "nurse", "pharmacist", "lab_tech"]);
const EmploymentTypeSchema = z.enum(["full_time", "visiting", "locum"]);

const PhoneSchema = z
  .string()
  .min(7)
  .max(20)
  .regex(/^\+?[0-9 ()-]+$/, "Phone must be digits, spaces, dashes, parentheses, optionally with +");

const SubmitSchema = z.object({
  full_name: z.string().trim().min(1, "Required.").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email."),
  password: z
    .string()
    .min(12, "Password must be at least 12 characters.")
    .max(72, "Password must be 72 characters or fewer."),
  phone: PhoneSchema,

  council_id: z.string().uuid("Pick a council."),
  registration_number: z.string().trim().min(1, "Required.").max(80),
  registration_expiry: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick an expiry date.")
    .optional()
    .or(z.literal("")),

  hospital_id: z.string().uuid("Pick a hospital."),
  department_id: z.string().uuid("Pick a department."),
  cadre_id: z.string().uuid("Pick a cadre."),
  cadre_grade_id: z.string().uuid().optional().or(z.literal("")),
  role_id: z.string().uuid("Pick a role."),
  specialty_id: z.string().uuid().optional().or(z.literal("")),
  employment_type: EmploymentTypeSchema,
  primary_role: PrimaryRoleSchema,

  consent: z
    .string()
    .optional()
    .refine((v) => v === "on", "You must accept the staff terms to continue."),
});

export type ClinicalFieldKey =
  | "full_name"
  | "email"
  | "password"
  | "phone"
  | "council_id"
  | "registration_number"
  | "registration_expiry"
  | "licence_document"
  | "hospital_id"
  | "department_id"
  | "cadre_id"
  | "cadre_grade_id"
  | "role_id"
  | "specialty_id"
  | "employment_type"
  | "primary_role"
  | "consent";

export type ClinicalSignupState = {
  errors?: Partial<Record<ClinicalFieldKey | "_form", string>>;
  values?: Partial<Record<ClinicalFieldKey, string>>;
};

interface PendingClinicalCookie {
  email: string;
  fullName: string;
  phone: string;
  councilId: string;
  registrationNumber: string;
  registrationExpiry: string | null;
  licenceDocumentPath: string | null;
  hospitalId: string;
  departmentId: string;
  cadreId: string;
  cadreGradeId: string | null;
  roleId: string;
  specialtyId: string | null;
  employmentType: "full_time" | "visiting" | "locum";
  primaryRole: "clinician" | "nurse" | "pharmacist" | "lab_tech";
}

function decodeCookieValue(raw: string | undefined): PendingClinicalCookie | null {
  if (!raw) return null;
  try {
    return JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as PendingClinicalCookie;
  } catch {
    return null;
  }
}

function encodeCookieValue(payload: PendingClinicalCookie): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function emptyToNull(s: string | undefined): string | null {
  return s && s !== "" ? s : null;
}

const CLINICAL_FIELD_KEYS: ClinicalFieldKey[] = [
  "full_name",
  "email",
  "phone",
  "council_id",
  "registration_number",
  "registration_expiry",
  "hospital_id",
  "department_id",
  "cadre_id",
  "cadre_grade_id",
  "role_id",
  "specialty_id",
  "employment_type",
  "primary_role",
  "consent",
];

// ─── Action 1 — submit ─────────────────────────────────────────────────

export async function submitClinicalSignupAction(
  _prev: ClinicalSignupState,
  formData: FormData,
): Promise<ClinicalSignupState> {
  const raw = Object.fromEntries(formData.entries());
  const parsed = SubmitSchema.safeParse(raw);

  if (!parsed.success) {
    const flat = parsed.error.flatten().fieldErrors as Record<string, string[] | undefined>;
    const errors: ClinicalSignupState["errors"] = {};
    const values: ClinicalSignupState["values"] = {};
    for (const key of CLINICAL_FIELD_KEYS) {
      const v = formData.get(key);
      if (typeof v === "string") values[key] = v;
      const fieldErr = flat[key]?.[0];
      if (fieldErr) errors[key] = fieldErr;
    }
    return { errors, values };
  }

  const v = parsed.data;

  // Validate the licence file (an optional `licence_document` file
  // entry on the form). We accept null at this gate so the user can
  // upload it later from the dashboard — but the form should require
  // it; this is a defensive backstop.
  const licenceFile = formData.get("licence_document");
  let licenceMeta: { bytes: ArrayBuffer; contentType: string; filename: string } | null = null;
  if (licenceFile instanceof File && licenceFile.size > 0) {
    if (licenceFile.size > MAX_LICENCE_BYTES) {
      return {
        errors: { licence_document: "Licence file is too large (5 MB max)." },
        values: stripFormData(raw),
      };
    }
    if (
      licenceFile.type !== "application/pdf" &&
      licenceFile.type !== "image/jpeg" &&
      licenceFile.type !== "image/png"
    ) {
      return {
        errors: { licence_document: "Licence must be PDF, JPG, or PNG." },
        values: stripFormData(raw),
      };
    }
    licenceMeta = {
      bytes: await licenceFile.arrayBuffer(),
      contentType: licenceFile.type,
      filename: licenceFile.name,
    };
  } else {
    return {
      errors: { licence_document: "Upload your licence to continue." },
      values: stripFormData(raw),
    };
  }

  // Create the auth user.
  const acct = await createClinicianAccount({
    fullName: v.full_name,
    email: v.email,
    password: v.password,
  });
  if (!acct.ok) {
    return { errors: { _form: acct.error }, values: stripFormData(raw) };
  }

  // Upload the licence (service role; before email confirmation).
  const uploaded = await uploadClinicianLicence({
    userId: acct.userId,
    bytes: licenceMeta.bytes,
    contentType: licenceMeta.contentType,
    filename: licenceMeta.filename,
  });
  if (!uploaded.ok) {
    return {
      errors: { _form: `Licence upload failed: ${uploaded.error}` },
      values: stripFormData(raw),
    };
  }

  const payload: PendingClinicalCookie = {
    email: v.email,
    fullName: v.full_name,
    phone: v.phone,
    councilId: v.council_id,
    registrationNumber: v.registration_number,
    registrationExpiry: emptyToNull(v.registration_expiry),
    licenceDocumentPath: uploaded.path,
    hospitalId: v.hospital_id,
    departmentId: v.department_id,
    cadreId: v.cadre_id,
    cadreGradeId: emptyToNull(v.cadre_grade_id),
    roleId: v.role_id,
    specialtyId: emptyToNull(v.specialty_id),
    employmentType: v.employment_type,
    primaryRole: v.primary_role,
  };

  const jar = await cookies();
  jar.set(PENDING_COOKIE, encodeCookieValue(payload), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/signup/clinical",
    maxAge: PENDING_TTL_SECONDS,
  });

  logger.info("clinician.signup.submit-ok");
  redirect("/signup/clinical/verify");
}

function stripFormData(raw: Record<string, FormDataEntryValue>): ClinicalSignupState["values"] {
  const out: ClinicalSignupState["values"] = {};
  for (const k of CLINICAL_FIELD_KEYS) {
    const v = raw[k];
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

// ─── Action 2 — verify OTP ─────────────────────────────────────────────

const VerifySchema = z.object({
  token: z.string().regex(/^\d{6}$/, "Enter the 6-digit code from your email."),
});

export type ClinicalVerifyState = {
  error?: string;
};

export async function verifyClinicalOtpAction(
  _prev: ClinicalVerifyState,
  formData: FormData,
): Promise<ClinicalVerifyState> {
  const parsed = VerifySchema.safeParse({ token: formData.get("token") });
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors.token?.[0] ?? "Invalid code." };
  }

  const jar = await cookies();
  const pending = decodeCookieValue(jar.get(PENDING_COOKIE)?.value);
  if (!pending) {
    return { error: "Your pending signup has expired. Please start over." };
  }

  const result = await verifyClinicianAccount({
    email: pending.email,
    token: parsed.data.token,
    phone: pending.phone,
    profile: {
      councilId: pending.councilId,
      registrationNumber: pending.registrationNumber,
      registrationExpiry: pending.registrationExpiry,
      licenceDocumentPath: pending.licenceDocumentPath,
    },
    affiliation: {
      hospitalId: pending.hospitalId,
      departmentId: pending.departmentId,
      cadreId: pending.cadreId,
      cadreGradeId: pending.cadreGradeId,
      roleId: pending.roleId,
      specialtyId: pending.specialtyId,
      employmentType: pending.employmentType,
    },
    primaryRole: pending.primaryRole,
  });

  if (!result.ok) {
    return { error: result.error };
  }

  jar.delete(PENDING_COOKIE);
  redirect("/signup/clinical/pending");
}

// ─── Action 3 — resend OTP ─────────────────────────────────────────────

export type ClinicalResendState = {
  status: "idle" | "sent" | "error";
  message?: string;
};

export async function resendClinicalOtpAction(
  _prev: ClinicalResendState,
  _formData: FormData,
): Promise<ClinicalResendState> {
  const jar = await cookies();
  const pending = decodeCookieValue(jar.get(PENDING_COOKIE)?.value);
  if (!pending) {
    return { status: "error", message: "Your pending signup has expired. Please start over." };
  }
  const result = await resendClinicianOtp(pending.email);
  if (!result.ok) return { status: "error", message: result.error };
  return { status: "sent", message: "A new code has been emailed." };
}

// ─── Server-side cookie peek for the /verify page header ────────────────

export async function readPendingClinicalEmail(): Promise<string | null> {
  const jar = await cookies();
  const pending = decodeCookieValue(jar.get(PENDING_COOKIE)?.value);
  return pending?.email ?? null;
}

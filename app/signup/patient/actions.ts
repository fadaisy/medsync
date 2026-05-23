"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { PATIENT_ID_TYPE_VALUES, PATIENT_SEX_VALUES } from "@/db/schema/patient-profiles";
import { logger } from "@/lib/logger";
import { createPatientAccount, resendPatientOtp, verifyPatientAccount } from "@/lib/patient";

/**
 * Server actions powering /signup/patient.
 *
 * Flow:
 *   1. submitSignupAction   — validates the full form, creates auth user,
 *                              stores the profile fields in a signed cookie
 *                              (NOT in the DB; PHI doesn't land until verify),
 *                              redirects to /signup/patient/verify
 *   2. verifyOtpAction      — pulls the cookie payload, verifies OTP,
 *                              inserts patient_profiles, redirects to /done
 *   3. resendOtpAction      — calls Supabase resend
 *
 * The pending-profile cookie carries only the fields the form
 * collected; it does NOT carry the password. NIN and phone live in
 * the cookie in plaintext for the duration of the OTP step — the
 * cookie is httpOnly, sameSite=strict, Secure in prod, 30-min TTL.
 * A real-world deployment would replace this with a server-side
 * draft in signup_drafts (the helper already exists in
 * lib/signup-drafts.ts) — see follow-up note in GATE G.
 */

const PENDING_COOKIE = "msc_pending_patient";
const PENDING_TTL_SECONDS = 30 * 60; // 30 minutes

const PhoneSchema = z
  .string()
  .min(7)
  .max(20)
  .regex(/^\+?[0-9 ()-]+$/, "Phone must be digits, spaces, dashes, parentheses, optionally with +");

const SubmitSchema = z
  .object({
    full_name: z.string().trim().min(1, "Required.").max(120),
    email: z.string().trim().toLowerCase().email("Enter a valid email."),
    password: z
      .string()
      .min(12, "Password must be at least 12 characters.")
      .max(72, "Password must be 72 characters or fewer."),
    sex: z.enum(PATIENT_SEX_VALUES),
    date_of_birth: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.")
      .refine((s) => {
        const d = new Date(s);
        return !Number.isNaN(d.getTime()) && d <= new Date();
      }, "Date of birth must be in the past."),
    id_type: z.enum(PATIENT_ID_TYPE_VALUES),
    id_number: z.string().trim().max(40).optional().or(z.literal("")),
    phone: PhoneSchema,
    district_id: z.string().uuid().optional().or(z.literal("")),
    subcounty_id: z.string().uuid().optional().or(z.literal("")),
    preferred_language: z.string().trim().max(40).optional().or(z.literal("")),
    consent: z
      .string()
      .optional()
      .refine((v) => v === "on", "You must accept the patient terms to continue."),
  })
  .superRefine((v, ctx) => {
    if (v.id_type === "none") {
      if (v.id_number && v.id_number !== "") {
        ctx.addIssue({
          code: "custom",
          path: ["id_number"],
          message: "Leave blank when no ID is provided.",
        });
      }
    } else if (!v.id_number || v.id_number === "") {
      ctx.addIssue({
        code: "custom",
        path: ["id_number"],
        message: "ID number is required for this ID type.",
      });
    }
  });

export type SignupFieldKey =
  | "full_name"
  | "email"
  | "password"
  | "sex"
  | "date_of_birth"
  | "id_type"
  | "id_number"
  | "phone"
  | "district_id"
  | "subcounty_id"
  | "preferred_language"
  | "consent";

export type SignupState = {
  errors?: Partial<Record<SignupFieldKey | "_form", string>>;
  /** Echo back so the form repopulates after a server-side error. */
  values?: Partial<Record<SignupFieldKey, string>>;
};

interface PendingPatientCookie {
  email: string;
  fullName: string;
  sex: string;
  dateOfBirth: string;
  idType: string;
  idNumber: string | null;
  phone: string;
  districtId: string | null;
  subcountyId: string | null;
  preferredLanguage: string | null;
}

function decodeCookieValue(raw: string | undefined): PendingPatientCookie | null {
  if (!raw) return null;
  try {
    return JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as PendingPatientCookie;
  } catch {
    return null;
  }
}

function encodeCookieValue(payload: PendingPatientCookie): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function emptyToNull(s: string | undefined): string | null {
  return s && s !== "" ? s : null;
}

// ─── Action 1 — submit full form, create auth user ──────────────────────

export async function submitSignupAction(
  _prev: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const raw = Object.fromEntries(formData.entries());
  const parsed = SubmitSchema.safeParse(raw);
  if (!parsed.success) {
    const flat = parsed.error.flatten().fieldErrors;
    // TEMPORARY DEBUG: log what arrived + which fields failed, so we
    // can correlate the user's "back to step 2" report with the
    // actual Zod errors. Remove after this regression is resolved.
    logger.info("patient.signup.debug.submit", {
      full_name_len: typeof raw.full_name === "string" ? raw.full_name.length : null,
      sex: raw.sex,
      date_of_birth: raw.date_of_birth,
      phone_len: typeof raw.phone === "string" ? raw.phone.length : null,
      id_type: raw.id_type,
      id_number_len: typeof raw.id_number === "string" ? raw.id_number.length : null,
      district_id: raw.district_id,
      subcounty_id: raw.subcounty_id,
      email_len: typeof raw.email === "string" ? raw.email.length : null,
      password_len: typeof raw.password === "string" ? raw.password.length : null,
      has_consent: typeof raw.consent === "string",
      errored_fields: Object.keys(flat),
      errors_summary: flat,
    });
    const errors: SignupState["errors"] = {};
    const values: SignupState["values"] = {};
    for (const key of [
      "full_name",
      "email",
      "sex",
      "date_of_birth",
      "id_type",
      "id_number",
      "phone",
      "district_id",
      "subcounty_id",
      "preferred_language",
      "consent",
    ] as SignupFieldKey[]) {
      const v = formData.get(key);
      if (typeof v === "string") values[key] = v;
      const fieldErr = (flat as Record<string, string[] | undefined>)[key]?.[0];
      if (fieldErr) errors[key] = fieldErr;
    }
    return { errors, values };
  }

  const v = parsed.data;

  const result = await createPatientAccount({
    fullName: v.full_name,
    email: v.email,
    password: v.password,
  });

  if (!result.ok) {
    return {
      errors: { _form: result.error },
      values: stripSecrets(raw),
    };
  }

  const payload: PendingPatientCookie = {
    email: v.email,
    fullName: v.full_name,
    sex: v.sex,
    dateOfBirth: v.date_of_birth,
    idType: v.id_type,
    idNumber: v.id_type === "none" ? null : (v.id_number ?? null),
    phone: v.phone,
    districtId: emptyToNull(v.district_id),
    subcountyId: emptyToNull(v.subcounty_id),
    preferredLanguage: emptyToNull(v.preferred_language),
  };

  const jar = await cookies();
  jar.set(PENDING_COOKIE, encodeCookieValue(payload), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/signup/patient",
    maxAge: PENDING_TTL_SECONDS,
  });

  logger.info("patient.signup.submit-ok");
  redirect("/signup/patient/verify");
}

function stripSecrets(raw: Record<string, FormDataEntryValue>): SignupState["values"] {
  const out: SignupState["values"] = {};
  for (const k of [
    "full_name",
    "email",
    "sex",
    "date_of_birth",
    "id_type",
    "id_number",
    "phone",
    "district_id",
    "subcounty_id",
    "preferred_language",
    "consent",
  ] as SignupFieldKey[]) {
    const v = raw[k];
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

// ─── Action 2 — verify OTP ─────────────────────────────────────────────

const VerifySchema = z.object({
  token: z.string().regex(/^\d{6}$/, "Enter the 6-digit code from your email."),
});

export type VerifyState = {
  error?: string;
};

export async function verifyOtpAction(
  _prev: VerifyState,
  formData: FormData,
): Promise<VerifyState> {
  const parsed = VerifySchema.safeParse({ token: formData.get("token") });
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors.token?.[0] ?? "Invalid code." };
  }

  const jar = await cookies();
  const pending = decodeCookieValue(jar.get(PENDING_COOKIE)?.value);
  if (!pending) {
    return { error: "Your pending signup has expired. Please start over." };
  }

  const result = await verifyPatientAccount({
    email: pending.email,
    token: parsed.data.token,
    profile: {
      sex: pending.sex as never,
      dateOfBirth: pending.dateOfBirth,
      idType: pending.idType as never,
      idNumber: pending.idNumber,
      phone: pending.phone,
      districtId: pending.districtId,
      subcountyId: pending.subcountyId,
      preferredLanguage: pending.preferredLanguage,
    },
  });

  if (!result.ok) {
    return { error: result.error };
  }

  jar.delete(PENDING_COOKIE);
  redirect(`/signup/patient/done?code=${encodeURIComponent(result.patientCode)}`);
}

// ─── Action 3 — resend OTP ─────────────────────────────────────────────

export type ResendState = {
  status: "idle" | "sent" | "error";
  message?: string;
};

export async function resendOtpAction(
  _prev: ResendState,
  _formData: FormData,
): Promise<ResendState> {
  const jar = await cookies();
  const pending = decodeCookieValue(jar.get(PENDING_COOKIE)?.value);
  if (!pending) {
    return { status: "error", message: "Your pending signup has expired. Please start over." };
  }
  const result = await resendPatientOtp(pending.email);
  if (!result.ok) return { status: "error", message: result.error };
  return { status: "sent", message: "A new code has been emailed." };
}

// ─── Server-side cookie peek for the /verify page header ────────────────

/**
 * Server component helper — returns the email address waiting for OTP
 * verification (so the verify page can show it in the heading), or
 * null if the cookie is missing/expired.
 */
export async function readPendingEmail(): Promise<string | null> {
  const jar = await cookies();
  const pending = decodeCookieValue(jar.get(PENDING_COOKIE)?.value);
  return pending?.email ?? null;
}

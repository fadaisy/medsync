"use server";

import type { ComboboxItem } from "@/components/forms";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { consentVersions } from "@/db/schema/consent-versions";
import { hospitalDpaVersions } from "@/db/schema/hospital-dpa-versions";
import { encrypt } from "@/lib/encryption";
import { logger } from "@/lib/logger";
import { listSubcounties } from "@/lib/reference-data";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { looseUuid, pickFromList } from "@/lib/zod-helpers";
import {
  ALL_DEPARTMENT_CODES,
  BED_CAPACITY_BANDS,
  CONNECTIVITY_CHOICES,
  DIAGNOSTIC_CHOICES,
  EMR_CHOICES,
  LICENSING_BODY_CHOICES,
  OPD_BANDS,
  POWER_CHOICES,
  SERVICE_OFFERED_CHOICES,
  SPECIALISED_CLINIC_CHOICES,
  STAFF_BANDS,
  SUPPORT_SERVICE_CHOICES,
} from "./_catalog";

const UUID_RE = /^[0-9a-f-]{36}$/i;
const PHONE_E164_UG = /^\+2567\d{8}$|^\+256[23489]\d{7,8}$/;
const EMAIL_DOMAIN_RE = /^[a-z0-9.-]+\.[a-z]{2,}$/i;
const YEAR_NOW = new Date().getFullYear();

export async function loadSubcountiesForDistrictActionHospital(
  districtId: string,
): Promise<ComboboxItem[]> {
  if (!UUID_RE.test(districtId)) return [];
  const rows = await listSubcounties({ districtId });
  return rows.map((s) => ({ value: s.id, label: s.name }));
}

/* ─── Lightweight lead capture (anon) — UNCHANGED from Phase 0 ─────── */

const HospitalLeadSchema = z.object({
  hospital_name: z.string().min(1, "Required.").max(160),
  facility_level: z.enum([
    "hc_ii",
    "hc_iii",
    "hc_iv",
    "general",
    "regional_referral",
    "national_referral",
    "private",
    "other",
  ]),
  ownership: z.enum(["public_moh", "private", "pnfp", "private_clinic"]),
  district_id: pickFromList("district"),
  contact_name: z.string().min(1).max(120),
  contact_role: z.string().min(1).max(80),
  contact_email: z.string().email(),
  contact_phone: z.string().regex(PHONE_E164_UG, "Enter a Ugandan phone number."),
  notes: z.string().max(2000).optional(),
  source: z.string().max(60).optional(),
});

export type HospitalLeadErrors = Partial<
  Record<keyof z.infer<typeof HospitalLeadSchema> | "_form", string>
>;
export type HospitalLeadState = {
  ok?: boolean;
  errors?: HospitalLeadErrors;
  values?: Record<string, string | undefined>;
};

export async function submitHospitalLeadAction(
  _prev: HospitalLeadState,
  formData: FormData,
): Promise<HospitalLeadState> {
  const raw = Object.fromEntries(formData.entries()) as Record<string, string>;
  const parsed = HospitalLeadSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    return {
      errors: Object.fromEntries(
        Object.entries(fieldErrors).map(([k, v]) => [k, v?.[0]]),
      ) as HospitalLeadErrors,
      values: raw,
    };
  }
  const input = parsed.data;
  const service = createServiceClient();
  const { error } = await service.from("hospital_leads").insert({
    hospital_name: input.hospital_name,
    facility_level: input.facility_level,
    ownership: input.ownership,
    district_id: input.district_id,
    contact_name: input.contact_name,
    contact_role: input.contact_role,
    contact_email: input.contact_email.toLowerCase(),
    contact_phone: input.contact_phone,
    notes: input.notes ?? null,
    source: input.source ?? null,
  });
  if (error) {
    logger.error("hospital-lead.insert_failed", { reason: error.message });
    return {
      errors: { _form: "Couldn't save your interest right now. Please try again." },
      values: raw,
    };
  }
  logger.info("hospital-lead.captured", { source: input.source ?? null });
  return { ok: true };
}

/* ─── Full application (authenticated) — EXTENDED for the upgrade ───── */

const departmentCodes = ALL_DEPARTMENT_CODES;
const clinicCodes = SPECIALISED_CLINIC_CHOICES.map((c) => c.code);
const diagnosticCodes = DIAGNOSTIC_CHOICES.map((c) => c.code);
const supportCodes = SUPPORT_SERVICE_CHOICES.map((c) => c.code);
const serviceCodes = SERVICE_OFFERED_CHOICES.map((c) => c.code);
const bedBands = BED_CAPACITY_BANDS.map((c) => c.code);
const staffBands = STAFF_BANDS.map((c) => c.code);
const opdBands = OPD_BANDS.map((c) => c.code);
const connectivityCodes = CONNECTIVITY_CHOICES.map((c) => c.code);
const powerCodes = POWER_CHOICES.map((c) => c.code);
const emrCodes = EMR_CHOICES.map((c) => c.code);
const licensingCodes = LICENSING_BODY_CHOICES.map((c) => c.code);

/** Parse repeated FormData fields (multi-select / multi-checkbox). */
function getAll(formData: FormData, key: string): string[] {
  return formData.getAll(key).filter((v): v is string => typeof v === "string" && v.length > 0);
}

function subsetCheck<T extends string>(allowed: ReadonlyArray<T>, field: string) {
  const allowedSet = new Set<string>(allowed);
  return z.array(z.string()).refine((arr) => arr.every((v) => allowedSet.has(v)), {
    message: `Invalid ${field} selection.`,
  });
}

const HospitalApplicationSchema = z.object({
  /* ─── Section B — Institution profile ─────────────────────────── */
  hospital_name: z.string().min(1, "Required.").max(160),
  hospital_aka: z.string().max(160).optional(),
  facility_level: z.enum([
    "hc_ii",
    "hc_iii",
    "hc_iv",
    "general",
    "regional_referral",
    "national_referral",
    "private",
    "other",
  ]),
  ownership: z.enum(["public_moh", "private", "pnfp", "private_clinic"]),
  year_established: z.coerce
    .number()
    .int()
    .min(1900)
    .max(YEAR_NOW, `Year cannot be in the future.`)
    .optional(),
  region_id: looseUuid("Pick a region from the list.").optional(),
  district_id: pickFromList("district"),
  subcounty_id: looseUuid("Pick a subcounty from the list.").optional(),
  physical_address: z.string().min(1, "Required.").max(400),
  main_phone: z.string().regex(PHONE_E164_UG, "Enter a Ugandan phone number."),
  official_email: z.string().email(),
  website: z.string().url().max(300).optional(),

  /* ─── Section C — Departments ─────────────────────────────────── */
  departments: subsetCheck(departmentCodes, "department").refine((arr) => arr.length >= 1, {
    message: "Pick at least one department.",
  }),
  /** UUIDs from `specialties` table — IM sub-specialties (kickoff §C nested list). */
  im_subspecialties: z.array(z.string().regex(UUID_RE)).optional(),
  /** Free-text "other department" entries — capped at 5. */
  departments_other: z.array(z.string().min(1).max(120)).max(5).optional(),
  /** Must be one of the codes in `departments`. Enforced post-parse. */
  primary_department: z.string().min(1, "Pick a primary department."),

  /* ─── Section D — Clinical & operating profile ────────────────── */
  specialised_clinics: subsetCheck(clinicCodes, "clinic").optional(),
  specialised_clinics_other: z.array(z.string().min(1).max(120)).max(5).optional(),
  diagnostic_services: subsetCheck(diagnosticCodes, "diagnostic").optional(),
  support_services: subsetCheck(supportCodes, "support service").optional(),
  has_onsite_pharmacy: z.enum(["yes", "no"], { message: "Required." }),
  services_offered: subsetCheck(serviceCodes, "service offered").optional(),
  bed_capacity_band: z.enum(bedBands as [string, ...string[]]).optional(),
  clinical_staff_band: z.enum(staffBands as [string, ...string[]]).optional(),
  daily_opd_band: z.enum(opdBands as [string, ...string[]]).optional(),
  internet_connectivity: z.enum(connectivityCodes as [string, ...string[]], {
    message: "Required.",
  }),
  power_backup: z.enum(powerCodes as [string, ...string[]]).optional(),
  existing_emr: z.enum(emrCodes as [string, ...string[]]).optional(),
  existing_emr_name: z.string().max(160).optional(),

  /* ─── Section E6 — Verification & authority ───────────────────── */
  registration_number: z.string().min(1, "Required.").max(120),
  registration_authority: z.string().max(160).optional(),
  licensing_body: z.enum(licensingCodes as [string, ...string[]], { message: "Required." }),
  institutional_email_domain: z
    .string()
    .regex(EMAIL_DOMAIN_RE, "Enter a domain like mulago.go.ug."),

  applicant_full_name: z.string().min(1, "Required.").max(120),
  applicant_role: z.string().min(1, "Required.").max(80),
  applicant_work_email: z.string().email("Enter a valid email."),
  applicant_phone: z.string().regex(PHONE_E164_UG, "Enter a Ugandan phone number."),
  applicant_council_number: z.string().max(80).optional(),

  authority_officer_name: z.string().min(1, "Required.").max(120),
  authority_officer_title: z.string().min(1, "Required.").max(80),
  callback_contact_value: z.string().min(1, "Required.").max(200),
  callback_contact_kind: z.enum(["phone", "email"], { message: "Required." }),

  /* ─── Section E7 — Agreement + account ─────────────────────────── */
  signatory_name: z.string().min(1, "Required.").max(120),
  signatory_title: z.string().min(1, "Required.").max(80),
  authorised_to_bind: z.literal("on", { message: "You must confirm authority." }),
  accept_agreement: z.literal("on", { message: "Acceptance is required." }),
  agreement_version_id: z.string().regex(UUID_RE, "Reload the page."),
  agreement_body_sha256: z.string().regex(/^[a-f0-9]{64}$/i),

  applicant_password: z
    .string()
    .min(12, "Password must be at least 12 characters.")
    .max(72, "Password must be 72 characters or fewer."),

  /* ─── Patient-style data-processing consent (applicant's own data) ─── */
  data_processing_consent: z.literal("on", { message: "Consent is required." }),
  data_processing_consent_version: z.string().min(1),
  data_processing_consent_body_sha256: z.string().regex(/^[a-f0-9]{64}$/i),
});

export type HospitalApplicationErrors = Partial<
  Record<keyof z.infer<typeof HospitalApplicationSchema> | "_form", string>
>;
export type HospitalApplicationState = {
  errors?: HospitalApplicationErrors;
  values?: Record<string, string | string[] | undefined>;
};

export async function submitHospitalApplicationAction(
  _prev: HospitalApplicationState,
  formData: FormData,
): Promise<HospitalApplicationState> {
  const licenceFile = formData.get("facility_licence_document");
  const authorityFile = formData.get("authority_letter_document");

  // Mixed-shape raw payload: arrays for multi-selects, strings for scalars.
  const raw: Record<string, string | string[]> = {};
  for (const [k] of formData.entries()) {
    if (raw[k] !== undefined) continue; // already collected
    const all = getAll(formData, k);
    if (all.length === 0) continue;
    const first = all[0];
    if (all.length === 1 && first !== undefined) raw[k] = first;
    else raw[k] = all;
  }
  // Convert known multi-select keys to arrays even when only one option ticked.
  for (const key of [
    "departments",
    "im_subspecialties",
    "departments_other",
    "specialised_clinics",
    "specialised_clinics_other",
    "diagnostic_services",
    "support_services",
    "services_offered",
  ]) {
    raw[key] = getAll(formData, key);
  }

  // Drop empty optional scalars before Zod sees them.
  const cleaned: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (Array.isArray(v)) cleaned[k] = v;
    else if (v !== "") cleaned[k] = v;
  }

  const parsed = HospitalApplicationSchema.safeParse(cleaned);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    return {
      errors: Object.fromEntries(
        Object.entries(fieldErrors).map(([k, v]) => [k, v?.[0]]),
      ) as HospitalApplicationErrors,
      values: raw as Record<string, string | string[] | undefined>,
    };
  }
  const input = parsed.data;

  // Cross-field: primary_department must be one of the picked departments.
  if (!input.departments.includes(input.primary_department)) {
    return {
      errors: { primary_department: "Primary must be one of your selected departments." },
      values: raw as Record<string, string | string[] | undefined>,
    };
  }

  // Required file uploads (Section E6 documentary evidence — kickoff).
  if (!(licenceFile instanceof File) || licenceFile.size === 0) {
    return {
      errors: { _form: "Facility licence document is required." },
      values: raw as Record<string, string | string[] | undefined>,
    };
  }
  if (!(authorityFile instanceof File) || authorityFile.size === 0) {
    return {
      errors: { _form: "Signed authorisation letter is required." },
      values: raw as Record<string, string | string[] | undefined>,
    };
  }

  // Cross-check the patient-style data-processing consent SHA.
  const [activeConsent] = await db
    .select()
    .from(consentVersions)
    .where(eq(consentVersions.version, input.data_processing_consent_version))
    .limit(1);
  if (
    !activeConsent ||
    activeConsent.bodySha256.toLowerCase() !==
      input.data_processing_consent_body_sha256.toLowerCase()
  ) {
    return {
      errors: { _form: "Consent text is out of date — please reload and accept again." },
      values: raw as Record<string, string | string[] | undefined>,
    };
  }

  // Cross-check the hospital DPA SHA — anti-tamper on the agreement gate.
  const [activeDpa] = await db
    .select()
    .from(hospitalDpaVersions)
    .where(eq(hospitalDpaVersions.id, input.agreement_version_id))
    .orderBy(desc(hospitalDpaVersions.effectiveDate))
    .limit(1);
  if (
    !activeDpa ||
    activeDpa.bodySha256.toLowerCase() !== input.agreement_body_sha256.toLowerCase()
  ) {
    return {
      errors: {
        _form:
          "The agreement text on this page is out of date — please reload to see the current version and accept again.",
      },
      values: raw as Record<string, string | string[] | undefined>,
    };
  }

  // Domain-mismatch flag — applicant's work email domain vs declared institutional domain.
  const applicantDomain = input.applicant_work_email.split("@").at(-1)?.toLowerCase() ?? "";
  const declaredDomain = input.institutional_email_domain.toLowerCase();
  const domainMismatch = applicantDomain !== declaredDomain;

  // Create the applicant account.
  const supabase = await createClient();
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email: input.applicant_work_email.toLowerCase(),
    password: input.applicant_password,
    options: { data: { full_name: input.applicant_full_name } },
  });
  if (signUpError || !signUpData.user) {
    return {
      errors: { _form: signUpError?.message ?? "Couldn't create your account." },
      values: raw as Record<string, string | string[] | undefined>,
    };
  }
  const userId = signUpData.user.id;

  const service = createServiceClient();

  // Upload supporting documents to the existing hospital-authorisations
  // bucket, prefixed by purpose. GATE-G ops setup may split this into
  // dedicated buckets later; for now one bucket + path prefix keeps the
  // wiring simple while preserving private-RLS access.
  async function upload(file: File, prefix: string): Promise<string | null> {
    const ext = (file.name.split(".").pop() ?? "bin").toLowerCase().slice(0, 5);
    const key = `${userId}/${prefix}-${crypto.randomUUID()}.${ext}`;
    const { error } = await service.storage.from("hospital-authorisations").upload(key, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
    if (error) {
      logger.warn("hospital-application.doc.upload_failed", {
        reason: error.message,
        prefix,
      });
      return null;
    }
    return key;
  }

  const licencePath = await upload(licenceFile, "licence");
  const authorityPath = await upload(authorityFile, "authority");
  if (!licencePath || !authorityPath) {
    // Roll back the auth user since the application can't be persisted.
    await service.auth.admin.deleteUser(userId).catch(() => undefined);
    return {
      errors: { _form: "Couldn't upload your documents. Try again with smaller files." },
      values: raw as Record<string, string | string[] | undefined>,
    };
  }

  // Encrypt callback contact value (PII — phone or email of a senior officer).
  const callbackCt = encrypt(input.callback_contact_value);

  const { data: insertedApp, error: insertError } = await service
    .from("hospital_applications")
    .insert({
      applicant_user_id: userId,

      // Legacy columns (kept compatible with existing approval flow)
      hospital_name: input.hospital_name,
      facility_level: input.facility_level,
      ownership: input.ownership,
      registration_number: input.registration_number,
      registration_authority: input.registration_authority ?? null,
      district_id: input.district_id,
      subcounty_id: input.subcounty_id ?? null,
      physical_address: input.physical_address,
      institutional_email_domain: declaredDomain,
      applicant_role: input.applicant_role,
      authorisation_document_path: authorityPath, // legacy column = authority letter

      // Section B extensions
      hospital_aka: input.hospital_aka ?? null,
      year_established: input.year_established ?? null,
      main_phone: input.main_phone,
      official_email: input.official_email.toLowerCase(),
      website: input.website ?? null,
      region_id: input.region_id ?? null,

      // Section D arrays + bands
      specialised_clinics: input.specialised_clinics ?? [],
      specialised_clinics_other: input.specialised_clinics_other ?? [],
      diagnostic_services: input.diagnostic_services ?? [],
      support_services: input.support_services ?? [],
      services_offered: input.services_offered ?? [],
      has_onsite_pharmacy: input.has_onsite_pharmacy === "yes",
      bed_capacity_band: input.bed_capacity_band ?? null,
      clinical_staff_band: input.clinical_staff_band ?? null,
      daily_opd_band: input.daily_opd_band ?? null,
      internet_connectivity: input.internet_connectivity,
      power_backup: input.power_backup ?? null,
      existing_emr: input.existing_emr ?? null,
      existing_emr_name:
        input.existing_emr === "existing" ? (input.existing_emr_name ?? null) : null,

      // Section E6 — applicant + authority + verification
      licensing_body: input.licensing_body,
      facility_licence_path: licencePath,
      applicant_full_name: input.applicant_full_name,
      applicant_work_email: input.applicant_work_email.toLowerCase(),
      applicant_phone: input.applicant_phone,
      applicant_council_number: input.applicant_council_number ?? null,
      authority_officer_name: input.authority_officer_name,
      authority_officer_title: input.authority_officer_title,
      authority_letter_path: authorityPath,
      callback_contact_value: callbackCt,
      callback_contact_kind: input.callback_contact_kind,
      email_domain_mismatch: domainMismatch,

      // Section E7 — agreement metadata
      signatory_name: input.signatory_name,
      signatory_title: input.signatory_title,
      authorised_to_bind: true,
      agreement_accepted_version: input.agreement_version_id,
      agreement_accepted_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (insertError || !insertedApp) {
    logger.error("hospital-application.insert_failed", { reason: insertError?.message });
    await service.auth.admin.deleteUser(userId).catch(() => undefined);
    return {
      errors: { _form: "Couldn't save your application. Please try again." },
      values: raw as Record<string, string | string[] | undefined>,
    };
  }
  const applicationId = insertedApp.id;

  // Junction inserts — departments + IM sub-specialties.
  const departmentRows = input.departments.map((code) => ({
    application_id: applicationId,
    department_family: code,
    is_primary: code === input.primary_department,
  }));
  const { error: deptErr } = await service
    .from("hospital_application_departments")
    .insert(departmentRows);
  if (deptErr) {
    logger.warn("hospital-application.departments_insert_failed", { reason: deptErr.message });
    // Don't roll back — primary application row is more valuable; departments can be edited.
  }
  if (input.im_subspecialties && input.im_subspecialties.length > 0) {
    const specRows = input.im_subspecialties.map((id) => ({
      application_id: applicationId,
      specialty_id: id,
    }));
    const { error: specErr } = await service
      .from("hospital_application_specialties")
      .insert(specRows);
    if (specErr) {
      logger.warn("hospital-application.specialties_insert_failed", { reason: specErr.message });
    }
  }

  // Applicant's personal data-processing consent (their data on the platform).
  const phoneCt = encrypt(input.applicant_phone);
  await service.from("consent_records").insert({
    user_id: userId,
    consent_type: "data_processing",
    consent_text_sha256: activeConsent.bodySha256,
    granted_at: new Date().toISOString(),
  });
  await service
    .from("users")
    .update({ state: "pending_approval", phone: phoneCt })
    .eq("id", userId);

  logger.info("hospital-application.submitted", {
    facility_level: input.facility_level,
    departments_count: input.departments.length,
    domain_mismatch: domainMismatch,
  });

  revalidatePath("/");
  redirect("/?welcomed=hospital-pending");
}

"use server";

import type { HospitalAdminScope } from "@/lib/hospital-admin/scope";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { CAPACITY_MODES, PAYMENT_POSTURES, serviceLines } from "@/db/schema";
import { env } from "@/lib/env";
import {
  assertScopeOwnsHospital,
  requireHospitalAdminScope,
  ScopeViolationError,
} from "@/lib/hospital-admin/scope";
import { logger } from "@/lib/logger";
import { callEdge } from "@/lib/supabase/edge";
import { createClient } from "@/lib/supabase/server";
import { PATIENT_REASON_CODES } from "@/supabase/functions/_shared/sessions-sql";

/**
 * Server Action proxying to ha-update-department-policy.
 *
 * Same contract as the staff and intake actions: scope is resolved
 * server-side (the form's hospital_id is never trusted — it is not even
 * sent), the caller's JWT is forwarded from the cookie rather than handed to
 * client JS, and the Edge Function owns the audit, the role check and the
 * mutation. This layer's only jobs are shaping FormData and surfacing the
 * function's own error text verbatim.
 */

export type PolicyFormState = { ok?: boolean; error?: string; created?: boolean };

/**
 * Mirrors the Edge Function's schema, which mirrors the DB CHECKs. Three
 * copies of the same numbers is not duplication to be factored away — the
 * form, the function and the table are three trust boundaries, and the one
 * that stops a bad value cheapest is the one closest to the operator.
 */
const PolicySchema = z
  .object({
    department_id: z.string().uuid("Pick a department."),
    default_slot_minutes: z.coerce.number().int().min(5).max(240),
    default_buffer_minutes: z.coerce.number().int().min(0).max(60),
    default_auto_confirm: z.boolean(),
    bookable_weekdays: z
      .array(z.coerce.number().int().min(1).max(7))
      .min(
        1,
        "Pick at least one day — a department with no bookable days takes neither bookings nor app walk-ins.",
      ),
    bookable_start_minutes_local: z.number().int().min(0).max(1440),
    bookable_end_minutes_local: z.number().int().min(0).max(1440),
    reminder_lead_minutes: z.array(z.number().int().min(1).max(10_080)).min(1).max(2),
    allow_virtual: z.boolean(),
    notes: z.string().max(500).nullable(),
    reason: z.string().min(8, "Audit note ≥ 8 characters — this write is audited."),
  })
  .refine((v) => v.bookable_end_minutes_local > v.bookable_start_minutes_local, {
    message: "Closing time must be after opening time.",
    path: ["bookable_end_minutes_local"],
  });

export async function updateDepartmentPolicyAction(
  _prev: PolicyFormState,
  formData: FormData,
): Promise<PolicyFormState> {
  const start = minutesFromTime(formData.get("bookable_start_local"));
  const end = minutesFromTime(formData.get("bookable_end_local"));
  if (start === null || end === null) {
    return { error: "Opening and closing times are required (HH:MM)." };
  }

  const parsed = PolicySchema.safeParse({
    department_id: formData.get("department_id"),
    default_slot_minutes: formData.get("default_slot_minutes"),
    default_buffer_minutes: formData.get("default_buffer_minutes"),
    default_auto_confirm: formData.get("default_auto_confirm") === "on",
    // Checkboxes sharing one name — getAll() is the array, no JSON round trip.
    bookable_weekdays: formData.getAll("bookable_weekdays"),
    bookable_start_minutes_local: start,
    bookable_end_minutes_local: end,
    reminder_lead_minutes: formData.get("reminder_plan") === "two" ? [1440, 60] : [1440],
    allow_virtual: formData.get("allow_virtual") === "on",
    notes: stringOrNull(formData.get("notes")),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors).flat().find(Boolean);
    return { error: first ?? "Please check the values." };
  }

  const scope = await requireHospitalAdminScope();
  const supabase = await createClient();
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) return { error: "Not authenticated." };

  try {
    const res = await fetch(
      `${env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ha-update-department-policy`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
          "x-request-id": crypto.randomUUID(),
        },
        body: JSON.stringify({ hospital_id: scope.hospitalId, ...parsed.data }),
      },
    );
    const text = await res.text();
    if (!res.ok) {
      let detail = text;
      try {
        const p = JSON.parse(text) as { error?: string | { message?: string } };
        if (typeof p.error === "string") detail = p.error;
        else if (p.error?.message) detail = p.error.message;
      } catch {
        /* keep raw */
      }
      logger.warn("hospital-admin.scheduling.policy.failed", { status: res.status });
      return { error: detail || `Edge Function returned ${res.status}.` };
    }
    const payload = JSON.parse(text) as { data?: { created?: boolean } };
    revalidatePath("/hospital-admin/scheduling");
    return { ok: true, created: payload.data?.created };
  } catch (e) {
    logger.error("hospital-admin.scheduling.policy.network", { reason: String(e) });
    return {
      error:
        "Couldn't reach the scheduling-policy service. If you're in local dev, run: npx supabase functions deploy ha-update-department-policy",
    };
  }
}

/** "08:00" → 480. Null for anything an `<input type="time">` wouldn't emit. */
function minutesFromTime(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function stringOrNull(v: FormDataEntryValue | null): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

/* ─── Gate B: service lines + session templates ─────────────────────── */

/**
 * Both editors post to Edge Functions written against the Gate B contract
 * (`ha-upsert-service-line`, `ha-upsert-session-template`). As with the
 * policy action: scope is resolved here, `hospital_id` is pinned from it,
 * and the function owns role check, audit and the write. The schemas mirror
 * the 0058 CHECKs so the operator gets a sentence instead of a 500.
 */

export type CapacityActionState = { ok?: boolean; error?: string };

const SERVICE_LINE_REASON_CODES = [...PATIENT_REASON_CODES, "other"] as const;

const ServiceLineSchema = z
  .object({
    id: z.string().uuid().optional(),
    department_id: z.string().uuid("Pick a department."),
    name: z.string().trim().min(2, "Name the service line.").max(120),
    slug: z.string().optional(),
    capacity_mode: z.enum(CAPACITY_MODES),
    time_to_care_days: z.coerce.number().int().min(1).max(365),
    continuity_default: z.boolean(),
    confidential: z.boolean(),
    payment_posture: z.enum(PAYMENT_POSTURES),
    fee_ugx: z.coerce.number().int().min(0).nullable(),
    deposit_ugx: z.coerce.number().int().min(0).nullable(),
    reason_codes: z
      .array(z.enum(SERVICE_LINE_REASON_CODES))
      .min(1, "Tick at least one reason a patient can book this line for."),
    is_default: z.boolean(),
    active: z.boolean(),
    reason: z.string().min(8, "Audit note ≥ 8 characters — this write is audited."),
  })
  .refine((v) => v.payment_posture === "none" || v.fee_ugx !== null, {
    message: "A fee is required unless the payment posture is 'none'.",
    path: ["fee_ugx"],
  });

export async function upsertServiceLineAction(
  _prev: CapacityActionState,
  formData: FormData,
): Promise<CapacityActionState> {
  const parsed = ServiceLineSchema.safeParse({
    id: stringOrNull(formData.get("id")) ?? undefined,
    department_id: formData.get("department_id"),
    name: formData.get("name"),
    slug: stringOrNull(formData.get("slug")) ?? undefined,
    capacity_mode: formData.get("capacity_mode"),
    time_to_care_days: formData.get("time_to_care_days"),
    continuity_default: formData.get("continuity_default") === "on",
    confidential: formData.get("confidential") === "on",
    payment_posture: formData.get("payment_posture"),
    fee_ugx: stringOrNull(formData.get("fee_ugx")),
    deposit_ugx: stringOrNull(formData.get("deposit_ugx")),
    reason_codes: formData.getAll("reason_codes"),
    is_default: formData.get("is_default") === "on",
    active: formData.get("active") === "on",
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const scope = await requireHospitalAdminScope();
  if (parsed.data.id) await assertLineOwned(scope, parsed.data.id);

  const result = await callEdge(
    "ha-upsert-service-line",
    { hospital_id: scope.hospitalId, ...parsed.data },
    "hospital-admin.scheduling",
  );
  if (!result.ok) return { error: result.error };
  revalidatePath("/hospital-admin/scheduling");
  return { ok: true };
}

const Ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a calendar date.");

const SessionTemplateSchema = z
  .object({
    id: z.string().uuid().optional(),
    service_line_id: z.string().uuid("Pick a service line."),
    clinician_user_id: z.string().uuid().nullable(),
    venue: z.string().trim().max(160).nullable(),
    weekday: z.coerce.number().int().min(1).max(7),
    start_minutes_local: z.number().int().min(0).max(1440),
    duration_minutes: z.coerce.number().int().min(15).max(720),
    capacity_total: z.coerce.number().int().min(1).max(500),
    // Blank → the function applies Part 8 #4 (60 % of total, rounded up).
    capacity_booked: z.coerce.number().int().min(1).max(500).optional(),
    interleave_booked: z.coerce.number().int().min(1).max(20),
    interleave_walk_in: z.coerce.number().int().min(1).max(20),
    overbooking_factor: z.coerce.number().min(1).max(2),
    valid_from: Ymd,
    valid_until: Ymd.nullable(),
    active: z.boolean(),
    reason: z.string().min(8, "Audit note ≥ 8 characters — this write is audited."),
  })
  .refine((v) => v.capacity_booked === undefined || v.capacity_booked <= v.capacity_total, {
    message: "Booked allocation cannot exceed the session's total capacity.",
    path: ["capacity_booked"],
  })
  .refine((v) => v.valid_until === null || v.valid_until >= v.valid_from, {
    message: "Valid-until must be on or after valid-from.",
    path: ["valid_until"],
  });

export async function upsertSessionTemplateAction(
  _prev: CapacityActionState,
  formData: FormData,
): Promise<CapacityActionState> {
  const start = minutesFromTime(formData.get("start_local"));
  if (start === null) return { error: "Start time is required (HH:MM)." };

  const parsed = SessionTemplateSchema.safeParse({
    id: stringOrNull(formData.get("id")) ?? undefined,
    service_line_id: formData.get("service_line_id"),
    clinician_user_id: stringOrNull(formData.get("clinician_user_id")),
    venue: stringOrNull(formData.get("venue")),
    weekday: formData.get("weekday"),
    start_minutes_local: start,
    duration_minutes: formData.get("duration_minutes"),
    capacity_total: formData.get("capacity_total"),
    capacity_booked: stringOrNull(formData.get("capacity_booked")) ?? undefined,
    interleave_booked: formData.get("interleave_booked"),
    interleave_walk_in: formData.get("interleave_walk_in"),
    overbooking_factor: formData.get("overbooking_factor"),
    valid_from: formData.get("valid_from"),
    valid_until: stringOrNull(formData.get("valid_until")),
    active: formData.get("active") === "on",
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const scope = await requireHospitalAdminScope();
  await assertLineOwned(scope, parsed.data.service_line_id);

  const result = await callEdge(
    "ha-upsert-session-template",
    { hospital_id: scope.hospitalId, ...parsed.data },
    "hospital-admin.scheduling",
  );
  if (!result.ok) return { error: result.error };
  revalidatePath("/hospital-admin/scheduling");
  return { ok: true };
}

/**
 * The Edge Function re-checks this; the pre-check means a stale or forged
 * id gets a clean scope violation here rather than a "service returned an
 * error" round trip — the same defence-in-depth the staff actions use.
 */
async function assertLineOwned(scope: HospitalAdminScope, lineId: string): Promise<void> {
  const [row] = await db
    .select({ hospitalId: serviceLines.hospitalId })
    .from(serviceLines)
    .where(eq(serviceLines.id, lineId))
    .limit(1);
  if (!row) throw new ScopeViolationError("Service line does not exist for this admin's scope.");
  assertScopeOwnsHospital(scope, row.hospitalId);
}

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Please check the values.";
}

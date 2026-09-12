"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { env } from "@/lib/env";
import { requireHospitalAdminScope } from "@/lib/hospital-admin/scope";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";

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

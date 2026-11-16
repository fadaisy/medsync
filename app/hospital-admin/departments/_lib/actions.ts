"use server";

import type { HubResult } from "./types";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireHospitalAdminScope } from "@/lib/hospital-admin/scope";
import { callEdge } from "@/lib/supabase/edge";

/*
 * The Departments page's booking rules (ADR 0516 phase 2; moved from the Booking policy page). The scope comes from
 * requireHospitalAdminScope(), never the page; ha-update-department-policy owns the role check, the audit and the
 * write. This schema mirrors the function's, which mirrors the table's CHECKs, so a bad value is refused in words
 * before it travels.
 */

const Rules = z
  .object({
    department_id: z.string().uuid("Pick a department."),
    default_slot_minutes: z.number().int().min(5).max(240),
    default_buffer_minutes: z.number().int().min(0).max(60),
    default_auto_confirm: z.boolean(),
    bookable_weekdays: z
      .array(z.number().int().min(1).max(7))
      .min(
        1,
        "Pick at least one day: a department with no bookable days takes neither bookings nor app walk-ins.",
      )
      .max(7),
    bookable_start_minutes_local: z.number().int().min(0).max(1440),
    bookable_end_minutes_local: z.number().int().min(0).max(1440),
    reminder_lead_minutes: z.array(z.number().int().min(1).max(10_080)).min(1).max(2),
    allow_virtual: z.boolean(),
    notes: z.string().trim().max(500).nullable(),
    reason: z.string().trim().min(8, "Say why in 8 characters or more: this change is audited."),
  })
  .refine((v) => v.bookable_end_minutes_local > v.bookable_start_minutes_local, {
    message: "The end must be after the start.",
    path: ["bookable_end_minutes_local"],
  });

export async function saveBookingRulesAction(input: z.input<typeof Rules>): Promise<HubResult> {
  const parsed = Rules.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the booking rules." };
  }
  const scope = await requireHospitalAdminScope();
  const r = await callEdge(
    "ha-update-department-policy",
    { ...parsed.data, notes: parsed.data.notes || null, hospital_id: scope.hospitalId },
    "hospital-admin.departments.rules",
  );
  if (!r.ok) return { ok: false, error: r.error };
  revalidatePath("/hospital-admin/departments");
  return { ok: true };
}

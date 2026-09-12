"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireReceptionScope } from "@/lib/reception/scope";
import { callEdge } from "@/lib/supabase/edge";

/**
 * Reception server actions. Thin wrappers around the Edge Functions
 * (ha-check-in-patient, ha-cancel-intake). The Edge Functions own
 * auth + audit; these wrappers handle scope-pin + form parsing +
 * revalidation.
 */

export type ReceptionActionState = { ok?: boolean; error?: string };

/* ─── Check-in a booked patient ─────────────────────────────────── */

const CheckInSchema = z.object({
  appointment_id: z.string().uuid(),
  reason: z
    .string()
    .min(8, "Reason ≥ 8 chars (audited).")
    .default("Booked patient checked in at front desk."),
});

export async function checkInPatientAction(
  _prev: ReceptionActionState,
  formData: FormData,
): Promise<ReceptionActionState> {
  const parsed = CheckInSchema.safeParse({
    appointment_id: formData.get("appointment_id"),
    reason: formData.get("reason") ?? undefined,
  });
  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors).flat().find(Boolean);
    return { error: first ?? "Please check the values." };
  }
  await requireReceptionScope();
  const result = await callEdge("ha-check-in-patient", parsed.data, "reception");
  if (!result.ok) return { error: result.error };
  revalidatePath("/reception");
  revalidatePath("/reception/expected");
  revalidatePath("/reception/flow");
  return { ok: true };
}

/* ─── Check-in a declared (patient-initiated) intake ───────────── */

const CheckInDeclaredSchema = z.object({
  intake_id: z.string().uuid(),
  reason: z
    .string()
    .min(8, "Reason ≥ 8 chars (audited).")
    .default("Patient-declared queue ticket checked in at front desk."),
});

/**
 * Reception flips a patient-declared 'declared' intake to 'arrived'
 * + stamps checked_in_at + inserts the dept queue row. Same Edge
 * Function as appointment check-in; just dispatched by intake_id
 * (book-or-queue, migration 0035).
 */
export async function checkInDeclaredIntakeAction(
  _prev: ReceptionActionState,
  formData: FormData,
): Promise<ReceptionActionState> {
  const parsed = CheckInDeclaredSchema.safeParse({
    intake_id: formData.get("intake_id"),
    reason: formData.get("reason") ?? undefined,
  });
  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors).flat().find(Boolean);
    return { error: first ?? "Please check the values." };
  }
  await requireReceptionScope();
  const result = await callEdge("ha-check-in-patient", parsed.data, "reception");
  if (!result.ok) return { error: result.error };
  revalidatePath("/reception");
  revalidatePath("/reception/expected");
  revalidatePath("/reception/find");
  revalidatePath("/reception/flow");
  return { ok: true };
}

/* ─── Cancel an intake ──────────────────────────────────────────── */

const CancelIntakeSchema = z.object({
  intake_id: z.string().uuid(),
  reason: z.string().min(8, "Reason ≥ 8 chars (audited)."),
});

export async function cancelIntakeAction(
  _prev: ReceptionActionState,
  formData: FormData,
): Promise<ReceptionActionState> {
  const parsed = CancelIntakeSchema.safeParse({
    intake_id: formData.get("intake_id"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors).flat().find(Boolean);
    return { error: first ?? "Please check the values." };
  }
  await requireReceptionScope();
  const result = await callEdge("ha-cancel-intake", parsed.data, "reception");
  if (!result.ok) return { error: result.error };
  revalidatePath("/reception");
  revalidatePath("/reception/flow");
  return { ok: true };
}

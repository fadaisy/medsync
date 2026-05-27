"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireDoctorScope } from "@/lib/doctor/scope";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";

/**
 * Doctor scheduling actions — thin wrappers around existing Edge
 * Functions (no engine change beyond ha-record-walkin, which is the
 * one net-new Edge Function flagged in the GATE A proposal §2).
 *
 *   - confirm / decline a pending appointment (reuse existing fns)
 *   - mark a confirmed appointment as arrived (ha-mark-arrived)
 *   - record a walk-in (ha-record-walkin — net-new)
 *   - start an encounter (ha-start-encounter — existing)
 */

export type DoctorScheduleActionState = { ok?: boolean; error?: string };

async function callEdge(
  name: string,
  body: Record<string, unknown>,
): Promise<{ ok: true; data?: unknown } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) return { ok: false, error: "Not authenticated." };
  try {
    const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        "x-request-id": crypto.randomUUID(),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      let detail = await res.text();
      try {
        const parsed = JSON.parse(detail) as { error?: string | { message?: string } };
        if (typeof parsed.error === "string") detail = parsed.error;
        else if (parsed.error?.message) detail = parsed.error.message;
      } catch {
        /* keep raw */
      }
      logger.warn(`doctor.schedule.${name}.failed`, { status: res.status });
      return { ok: false, error: detail || `Edge Function returned ${res.status}.` };
    }
    const data = (await res.json()) as unknown;
    return { ok: true, data };
  } catch (e) {
    logger.error(`doctor.schedule.${name}.network`, { reason: String(e) });
    return { ok: false, error: `Couldn't reach ${name}.` };
  }
}

/* ─── Approve / decline a pending appointment ────────────────────── */

const ApprovalSchema = z.object({
  appointment_id: z.string().uuid(),
  reason: z.string().min(8, "Note ≥ 8 chars (audited)."),
});

export async function approveAppointmentAction(
  _prev: DoctorScheduleActionState,
  formData: FormData,
): Promise<DoctorScheduleActionState> {
  const parsed = ApprovalSchema.safeParse({
    appointment_id: formData.get("appointment_id"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors.reason?.[0] ?? "Invalid input." };
  }
  await requireDoctorScope();
  const result = await callEdge("ha-confirm-appointment-request", parsed.data);
  if (!result.ok) return { error: result.error };
  revalidatePath("/doctor/schedule");
  return { ok: true };
}

export async function declineAppointmentAction(
  _prev: DoctorScheduleActionState,
  formData: FormData,
): Promise<DoctorScheduleActionState> {
  const parsed = ApprovalSchema.safeParse({
    appointment_id: formData.get("appointment_id"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors.reason?.[0] ?? "Invalid input." };
  }
  await requireDoctorScope();
  const result = await callEdge("ha-decline-appointment-request", parsed.data);
  if (!result.ok) return { error: result.error };
  revalidatePath("/doctor/schedule");
  return { ok: true };
}

/* ─── Record walk-in ─────────────────────────────────────────────── */

const WalkinSchema = z.object({
  patient_user_id: z.string().uuid(),
  urgent: z.boolean().optional().default(false),
  notes: z.string().max(500).optional(),
  reason: z.string().min(8, "Reason ≥ 8 chars (audited)."),
});

export async function recordWalkinAction(
  _prev: DoctorScheduleActionState,
  formData: FormData,
): Promise<DoctorScheduleActionState> {
  const parsed = WalkinSchema.safeParse({
    patient_user_id: formData.get("patient_user_id"),
    urgent: formData.get("urgent") === "true",
    notes: (formData.get("notes") as string | null)?.trim() || undefined,
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors).flat().find(Boolean);
    return { error: first ?? "Check the form values." };
  }
  const scope = await requireDoctorScope();
  const result = await callEdge("ha-record-walkin", {
    hospital_id: scope.hospitalId,
    department_id: scope.departmentId,
    ...parsed.data,
  });
  if (!result.ok) return { error: result.error };
  revalidatePath("/doctor/schedule");
  return { ok: true };
}

/* ─── Start encounter from a queue entry ─────────────────────────── */

const StartEncounterSchema = z.object({
  appointment_id: z.string().uuid().optional(),
  queue_entry_id: z.string().uuid().optional(),
  reason: z.string().min(8, "Reason ≥ 8 chars (audited).").default("Calling next patient."),
});

export async function startEncounterAction(payload: {
  appointmentId?: string;
  queueEntryId?: string;
  reason?: string;
}): Promise<DoctorScheduleActionState> {
  const parsed = StartEncounterSchema.safeParse({
    appointment_id: payload.appointmentId,
    queue_entry_id: payload.queueEntryId,
    reason: payload.reason ?? "Calling next patient.",
  });
  if (!parsed.success) {
    return { error: "Need an appointment or queue entry to start." };
  }
  if (!parsed.data.appointment_id && !parsed.data.queue_entry_id) {
    return { error: "Need an appointment or queue entry to start." };
  }
  await requireDoctorScope();
  const result = await callEdge("ha-start-encounter", parsed.data);
  if (!result.ok) return { error: result.error };
  revalidatePath("/doctor/schedule");
  return { ok: true };
}

/* ─── Set scheduling settings (auto-confirm, slot, buffer, virtual, OOH) ─ */

const SettingsSchema = z.object({
  auto_confirm: z.boolean(),
  default_slot_minutes: z.number().int().min(5).max(240),
  buffer_minutes: z.number().int().min(0).max(60),
  allow_virtual: z.boolean(),
  allow_out_of_hours_override: z.boolean(),
  reason: z.string().min(8, "Reason ≥ 8 chars (audited).").default("Adjusted scheduling settings."),
});

export async function updateSchedulingSettingsAction(
  _prev: DoctorScheduleActionState,
  formData: FormData,
): Promise<DoctorScheduleActionState> {
  const parsed = SettingsSchema.safeParse({
    auto_confirm: formData.get("auto_confirm") === "true",
    default_slot_minutes: Number(formData.get("default_slot_minutes")),
    buffer_minutes: Number(formData.get("buffer_minutes")),
    allow_virtual: formData.get("allow_virtual") === "true",
    allow_out_of_hours_override: formData.get("allow_out_of_hours_override") === "true",
    reason: (formData.get("reason") as string | null) ?? undefined,
  });
  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors).flat().find(Boolean);
    return { error: first ?? "Check the values." };
  }
  const scope = await requireDoctorScope();
  const result = await callEdge("ha-set-clinician-settings", {
    clinician_user_id: scope.userId,
    hospital_id: scope.hospitalId,
    ...parsed.data,
  });
  if (!result.ok) return { error: result.error };
  revalidatePath("/doctor/schedule");
  return { ok: true };
}

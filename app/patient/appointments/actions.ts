"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { requirePatientScope } from "@/lib/patient/scope";
import { createClient } from "@/lib/supabase/server";

const CancelArgs = z.object({
  appointment_id: z.string().uuid(),
  reason: z.string().min(8, "Reason ≥ 8 chars required."),
});

/**
 * `slot` is the radio's value: "<startsAtIso>|<endsAtIso>", both derived by
 * the page from `buildSlots`. One field rather than two hidden inputs, so a
 * start can never reach the Edge Function paired with someone else's end.
 * ISO-8601 contains no "|", so the split is unambiguous.
 */
const RescheduleArgs = z.object({
  appointment_id: z.string().uuid(),
  slot: z.string().regex(/^[^|]+\|[^|]+$/, "Choose a day."),
  reason: z.string().min(8, "Reason ≥ 8 chars required."),
});

export type PatientApptActionState = { ok?: boolean; error?: string };

const ArrivedArgs = z.object({ appointment_id: z.string().uuid() });

/**
 * PRD §3.5 — the patient's own "I have arrived", over the existing
 * `ha-mark-arrived` (which already authorises a patient on their own
 * confirmed appointment: confirmed → arrived + a queue entry). The refusal
 * sentence, when there is one, is the Edge Function's own and is shown as is.
 */
export async function markArrivedAction(
  _prev: PatientApptActionState,
  formData: FormData,
): Promise<PatientApptActionState> {
  const parsed = ArrivedArgs.safeParse({ appointment_id: formData.get("appointment_id") });
  if (!parsed.success) return { error: "Invalid input." };
  await requirePatientScope();
  return callAsPatient({
    fn: "ha-mark-arrived",
    logKey: "patient.appointments.arrived",
    verb: "Arrival",
    service: "arrival",
    body: { ...parsed.data, reason: "Patient confirmed arrival from the app." },
  });
}

export async function cancelMyAppointmentAction(
  _prev: PatientApptActionState,
  formData: FormData,
): Promise<PatientApptActionState> {
  const parsed = CancelArgs.safeParse({
    appointment_id: formData.get("appointment_id"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors.reason?.[0] ?? "Invalid input." };
  }
  await requirePatientScope();
  return callAsPatient({
    fn: "cancel-appointment",
    logKey: "patient.appointments.cancel",
    verb: "Cancel",
    service: "cancel",
    body: parsed.data,
  });
}

/**
 * ADR 0084 §13 — reschedule above cancel. A reminder with no way out pushed
 * short-notice cancellations from 0.6% to 7.2% in the NHS QI series, and only
 * 20 of 35 freed slots were reused for want of a clerk. `reschedule-appointment`
 * mints the new row, flips the old one to 'rescheduled' and re-queues the SMS
 * reminders itself — and because 'rescheduled' is not a live status, the old
 * slot is back in `buildSlots`'s offer the moment this returns. No human in
 * the loop, which is the whole point.
 *
 * The 14-day horizon is NOT re-enforced here: §8 confines it to
 * `pt-request-appointment` so clinician- and system-created recall stay
 * uncapped, and this Edge Function serves all three. The patient surface
 * offers 14 days because that is what it derives, not because a guard says so.
 */
export async function rescheduleMyAppointmentAction(
  _prev: PatientApptActionState,
  formData: FormData,
): Promise<PatientApptActionState> {
  const parsed = RescheduleArgs.safeParse({
    appointment_id: formData.get("appointment_id"),
    slot: formData.get("slot"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    const fields = parsed.error.flatten().fieldErrors;
    return { error: fields.slot?.[0] ?? fields.reason?.[0] ?? "Invalid input." };
  }
  const [newStartsAt, newEndsAt] = parsed.data.slot.split("|");
  await requirePatientScope();
  return callAsPatient({
    fn: "reschedule-appointment",
    logKey: "patient.appointments.reschedule",
    verb: "Move",
    service: "rescheduling",
    body: {
      appointment_id: parsed.data.appointment_id,
      new_starts_at: newStartsAt,
      new_ends_at: newEndsAt,
      reason: parsed.data.reason,
    },
  });
}

/* ─── Gate E (ADR 0090): confirm, rebook, waitlist ───────────────── */

const IdArg = (key: string) => z.object({ [key]: z.string().uuid() });

/** "Confirm I'm coming" — answers the T-24h request; no SMS fallback follows. */
export async function confirmAttendanceAction(
  _prev: PatientApptActionState,
  formData: FormData,
): Promise<PatientApptActionState> {
  const parsed = IdArg("appointment_id").safeParse({
    appointment_id: formData.get("appointment_id"),
  });
  if (!parsed.success) return { error: "Invalid input." };
  await requirePatientScope();
  return callAsPatient({
    fn: "pt-confirm-attendance",
    logKey: "patient.appointments.confirm",
    verb: "Confirm",
    service: "confirmation",
    body: parsed.data,
  });
}

/** One tap onto the pre-selected next clinic day after the clinic cancelled a day. */
export async function acceptRebookingAction(
  _prev: PatientApptActionState,
  formData: FormData,
): Promise<PatientApptActionState> {
  const parsed = z
    .object({ cancelled_appointment_id: z.string().uuid(), session_id: z.string().uuid() })
    .safeParse({
      cancelled_appointment_id: formData.get("cancelled_appointment_id"),
      session_id: formData.get("session_id"),
    });
  if (!parsed.success) return { error: "Invalid input." };
  await requirePatientScope();
  return callAsPatient({
    fn: "pt-accept-rebooking",
    logKey: "patient.appointments.rebook",
    verb: "Booking",
    service: "booking",
    body: parsed.data,
  });
}

export async function withdrawWaitlistAction(
  _prev: PatientApptActionState,
  formData: FormData,
): Promise<PatientApptActionState> {
  const parsed = IdArg("waitlist_entry_id").safeParse({
    waitlist_entry_id: formData.get("waitlist_entry_id"),
  });
  if (!parsed.success) return { error: "Invalid input." };
  await requirePatientScope();
  return callAsPatient({
    fn: "pt-withdraw-waitlist",
    logKey: "patient.waitlist.withdraw",
    verb: "Leaving the list",
    service: "waitlist",
    body: parsed.data,
  });
}

/** "Take this place" — books through the core with the entry id as the idempotency key. */
export async function acceptWaitlistOfferAction(
  _prev: PatientApptActionState,
  formData: FormData,
): Promise<PatientApptActionState> {
  const parsed = IdArg("waitlist_entry_id").safeParse({
    waitlist_entry_id: formData.get("waitlist_entry_id"),
  });
  if (!parsed.success) return { error: "Invalid input." };
  await requirePatientScope();
  return callAsPatient({
    fn: "pt-accept-waitlist-offer",
    logKey: "patient.waitlist.accept",
    verb: "Booking",
    service: "booking",
    body: parsed.data,
  });
}

/**
 * POST to an Edge Function as the signed-in patient and surface the server's
 * own message verbatim.
 *
 * Both mutations on this surface need the identical call — bearer token,
 * `x-request-id`, JSON body — and the identical error discipline: a patient
 * who cannot cancel or move a visit must be told exactly why, not "something
 * went wrong". Two copies of that is how one of them loses its request id.
 */
async function callAsPatient(args: {
  fn: string;
  /** logger key prefix; `.failed` / `.network` are appended. */
  logKey: string;
  /** Sentence-case verb for the status fallback: "Cancel failed (status 500)." */
  verb: string;
  /** Lower-case noun for the network fallback: "Couldn't reach the cancel service." */
  service: string;
  body: Record<string, unknown>;
}): Promise<PatientApptActionState> {
  const supabase = await createClient();
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) return { error: "Not authenticated." };

  try {
    const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${args.fn}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        "x-request-id": crypto.randomUUID(),
      },
      body: JSON.stringify(args.body),
    });
    if (!res.ok) {
      let detail = await res.text();
      try {
        const j = JSON.parse(detail) as { error?: string | { message?: string } };
        if (typeof j.error === "string") detail = j.error;
        else if (j.error?.message) detail = j.error.message;
      } catch {
        /* keep */
      }
      logger.warn(`${args.logKey}.failed`, { status: res.status });
      return { error: detail || `${args.verb} failed (status ${res.status}).` };
    }
  } catch (e) {
    logger.error(`${args.logKey}.network`, { reason: String(e) });
    return { error: `Couldn't reach the ${args.service} service.` };
  }
  revalidatePath("/patient");
  revalidatePath("/patient/appointments");
  return { ok: true };
}

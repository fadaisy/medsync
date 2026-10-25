"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { PAY_COPY } from "@/content/patient/book";
import { PATIENT_WEB_COPY } from "@/content/patient/web";
import { logger } from "@/lib/logger";
import { patientFlag } from "@/lib/patient-web/flags";
import { fetchLiveIntakeToday } from "@/lib/patient/appointments";
import { requirePatientScope } from "@/lib/patient/scope";
import { callEdge } from "@/lib/supabase/edge";
import { createClient } from "@/lib/supabase/server";
import { PATIENT_REASON_CODES } from "@/supabase/functions/_shared/sessions-sql";

/**
 * Book's writes that the old web has no action for, the phone's own (mobile/src/lib/booking.ts,
 * data/visits.ts, data/attachments.ts): saving a place in today's line (`pt-declare-intake`), giving it up
 * (`ha-cancel-intake`, which admits the patient while the row is `declared`), one attachment row under RLS
 * (migration 0186), and the simulated payment. Edge refusals reach the screen word for word.
 */

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

function refresh() {
  revalidatePath("/pw/patient", "layout");
  revalidatePath("/patient", "layout");
}

const Declare = z.object({
  departmentId: z.string().uuid(),
  submissionId: z.string().uuid().nullable(),
});

/**
 * Save my place in a clinic. A refusal because a ticket already exists today recovers that ticket instead
 * (the phone's `joinLine`). An intake goes to a clinic, never to a doctor.
 */
export async function saveMyPlaceAction(
  input: z.input<typeof Declare>,
): Promise<Result<{ intakeId: string }>> {
  const parsed = Declare.safeParse(input);
  if (!parsed.success) return { ok: false, error: PATIENT_WEB_COPY.offline };
  const scope = await requirePatientScope();
  if (!scope.primaryHospitalId) return { ok: false, error: "Choose the hospital you go to first." };
  const res = await callEdge<{ data?: { intake_id?: string } }>(
    "pt-declare-intake",
    {
      hospital_id: scope.primaryHospitalId,
      receiving_department_id: parsed.data.departmentId,
      presenting_complaint: null,
      ...(parsed.data.submissionId ? { symptom_submission_id: parsed.data.submissionId } : {}),
    },
    "patient-web.book",
  );
  let intakeId = res.ok ? res.data?.data?.intake_id : undefined;
  if (!intakeId) {
    const live = await fetchLiveIntakeToday(scope.userId, scope.primaryHospitalId).catch(
      () => null,
    );
    if (!live) return { ok: false, error: res.ok ? PATIENT_WEB_COPY.offline : res.error };
    intakeId = live.id;
  }
  refresh();
  return { ok: true, intakeId };
}

export async function giveUpPlaceAction(intakeId: string): Promise<Result> {
  if (!z.string().uuid().safeParse(intakeId).success)
    return { ok: false, error: PATIENT_WEB_COPY.offline };
  await requirePatientScope();
  const res = await callEdge(
    "ha-cancel-intake",
    {
      intake_id: intakeId,
      // The web's own string, so the audit log reads the same whichever client cancelled.
      reason: "Patient cancelled their own queue ticket before checking in.",
    },
    "patient-web.book",
  );
  if (!res.ok) return { ok: false, error: res.error };
  refresh();
  return { ok: true };
}

const Attachment = z.object({
  appointmentId: z.string().uuid(),
  kind: z.enum(["photo", "video", "voice"]),
  storagePath: z.string().min(1).max(300),
  mime: z.string().min(1).max(100),
  bytes: z.number().int().min(0).max(52_428_800),
  durationMs: z.number().int().min(0).nullable(),
});

/** One row for a file the browser already put in the patient's own folder (the phone's `sendAttachments`). */
export async function recordAttachmentAction(input: z.input<typeof Attachment>): Promise<Result> {
  const parsed = Attachment.safeParse(input);
  if (!parsed.success) return { ok: false, error: PATIENT_WEB_COPY.offline };
  const scope = await requirePatientScope();
  const a = parsed.data;
  if (!a.storagePath.startsWith(`${scope.userId}/${a.appointmentId}/`))
    return { ok: false, error: PATIENT_WEB_COPY.offline };
  const supabase = await createClient();
  const { error } = await supabase.from("appointment_attachments").insert({
    appointment_id: a.appointmentId,
    uploaded_by: scope.userId,
    kind: a.kind,
    storage_path: a.storagePath,
    mime: a.mime,
    bytes: a.bytes,
    duration_ms: a.durationMs,
  });
  if (error) {
    logger.warn("patient-web.attachment_failed", { reason: error.message });
    return { ok: false, error: PATIENT_WEB_COPY.offline };
  }
  return { ok: true };
}

/**
 * The payments seam (mobile/src/data/visits.ts `payments`): it never moves money. With `mobilePayments` off it
 * simulates a success and the ticket says "Demo payment"; on, there is still no Mobile Money integration, so it
 * refuses with words.
 */
export async function payAction(fee: number | null): Promise<Result<{ demo: boolean }>> {
  if (!fee || fee <= 0) return { ok: false, error: PAY_COPY.noFee };
  await requirePatientScope();
  if (!patientFlag("mobilePayments")) return { ok: true, demo: true };
  return { ok: false, error: PAY_COPY.notConnected };
}

const RequestDay = z
  .object({
    hospitalId: z.string().uuid(),
    reason: z.enum(PATIENT_REASON_CODES),
    note: z.string().max(500),
    idempotencyKey: z.string().uuid(),
    submissionId: z.string().uuid().nullable(),
    forProvisionalId: z.string().uuid().nullable(),
    sessionId: z.string().uuid().nullable(),
    slot: z
      .object({
        clinicianUserId: z.string().uuid(),
        departmentId: z.string().uuid(),
        startsAtIso: z.string().datetime({ offset: true }),
        endsAtIso: z.string().datetime({ offset: true }),
        serviceLineId: z.string().uuid().optional(),
      })
      .nullable(),
  })
  .refine((i) => (i.slot ? 1 : 0) + (i.sessionId ? 1 : 0) === 1);

export interface DayReceipt {
  appointment_id: string;
  status: string;
  booking_code: string | null;
}

/**
 * Ask for a day (the phone's `requestAppointment`): a place in a clinic day or a clinician's slot, one
 * idempotency key per attempt, at the hospital the days came from (a doctor's may not be the patient's own,
 * ADR 0086). A catalogue report filed before this door rides with it (ADR 0098 ruling 3).
 */
export async function requestDayAction(
  input: z.input<typeof RequestDay>,
): Promise<Result<{ receipt: DayReceipt }>> {
  const parsed = RequestDay.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please check your selections and try again." };
  await requirePatientScope();
  const i = parsed.data;
  const res = await callEdge<{ data?: DayReceipt }>(
    "pt-request-appointment",
    {
      hospital_id: i.hospitalId,
      reason: i.reason,
      reason_note: i.note.trim() || null,
      idempotency_key: i.idempotencyKey,
      channel: "web",
      ...(i.forProvisionalId ? { for_provisional_id: i.forProvisionalId } : {}),
      ...(i.submissionId ? { symptom_submission_id: i.submissionId } : {}),
      ...(i.slot
        ? {
            slot: {
              clinician_user_id: i.slot.clinicianUserId,
              department_id: i.slot.departmentId,
              starts_at: i.slot.startsAtIso,
              ends_at: i.slot.endsAtIso,
              ...(i.slot.serviceLineId ? { service_line_id: i.slot.serviceLineId } : {}),
            },
          }
        : { session: { session_id: i.sessionId } }),
    },
    "patient-web.book",
  );
  if (!res.ok) return { ok: false, error: res.error };
  const receipt = res.data?.data;
  if (!receipt?.appointment_id)
    return { ok: false, error: "The hospital's system answered, but not with a booking." };
  refresh();
  return { ok: true, receipt };
}

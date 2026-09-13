/**
 * ha-check-in-patient — reception flips an inbound patient to
 * physically-present state. Two modes (exactly one required):
 *
 *   A) appointment_id — booked-arrival check-in (the original path):
 *      1. appointment.status confirmed → arrived
 *      2. queue_entries row (scheduled_arrival, waiting)  — skip virtual
 *      3. patient_intakes row (booked_arrival, awaiting_triage)
 *
 *   B) intake_id — patient-declared check-in (book-or-queue, mig 0035):
 *      1. patient_intakes.status declared → arrived + checked_in_at=now()
 *      2. queue_entries row (walk_in, waiting) — same boundary as (A2)
 *      No new intake row; the patient's declared row IS the intake.
 *
 * Auth: reception or hospital_admin at the hospital, or superadmin.
 *
 * Note: ha-mark-arrived already does step (A1)+(A2). This Edge Function
 * adds (A3) + (B), and relaxes auth so a non-clinical reception user
 * (RECEPTION cadre) can call it. Mirrors ha-register-intake's
 * broad-staff auth.
 */
import { z } from "npm:zod@4.4.3";

import { getCaller, serviceClient } from "../_shared/auth.ts";
import { preflight } from "../_shared/cors.ts";
import {
  badRequest,
  conflict,
  forbidden,
  methodNotAllowed,
  notFound,
  ok,
  serverError,
  unauthorized,
} from "../_shared/errors.ts";
import { authoriseAtHospital } from "../_shared/hospital-admin-scope.ts";
import { makeLogger } from "../_shared/logger.ts";
import { networkContext, recordSaAudit } from "../_shared/sa-audit.ts";
import { DEFAULT_TIME_ZONE, startOfLocalDay } from "../_shared/slots.ts";

const log = makeLogger("ha-check-in-patient");

const InputSchema = z
  .object({
    appointment_id: z.string().uuid().optional(),
    intake_id: z.string().uuid().optional(),
    reason: z
      .string()
      .min(8, "Reason ≥ 8 chars required (audited).")
      .default("Patient checked in at front desk."),
  })
  .refine((v) => !!v.appointment_id !== !!v.intake_id, {
    message: "Provide exactly one of appointment_id or intake_id.",
  });

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const init = { origin, requestId };
  const pre = preflight(request);
  if (pre) return pre;
  if (request.method !== "POST") return methodNotAllowed(init);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Body must be JSON", init);
  }
  const parsed = InputSchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid input", init, parsed.error.flatten());
  const input = parsed.data;

  const caller = await getCaller(request);
  if (!caller) return unauthorized(init);

  const sb = serviceClient();
  const { ipAddress, userAgent } = networkContext(request);

  /* ─── Mode A: appointment_id (booked-arrival path) ───────────── */
  if (input.appointment_id) {
    const { data: appt, error: apptErr } = await sb
      .from("appointments")
      .select(
        "id, hospital_id, department_id, patient_user_id, provisional_patient_id, status, type",
      )
      .eq("id", input.appointment_id)
      .maybeSingle();
    if (apptErr) return serverError(apptErr.message, init);
    if (!appt) return notFound(init, "appointment not found");
    if (appt.status !== "confirmed") {
      return badRequest(`Appointment is in '${appt.status}' — only confirmed can check in.`, init);
    }

    const authError = await authoriseAtHospital(caller.id, appt.hospital_id);
    if (authError) return forbidden(init, authError);

    // A provisional booking (migration 0060) is checked in only once the desk
    // has confirmed who it is for — ha-reconcile-identity sets patient_user_id.
    // queue_entries needs a patient, and the intake row would name nobody.
    if (!appt.patient_user_id) {
      return conflict("Confirm who this booking is for before checking in.", init);
    }

    try {
      await recordSaAudit({
        actorId: caller.id,
        action: "check_in_patient",
        targetKind: "appointment",
        targetId: appt.id,
        reason: input.reason,
        requestId,
        ipAddress,
        userAgent,
        beforeData: { status: appt.status },
        afterData: { status: "arrived" },
      });
    } catch (e) {
      log.error("sa_audit failed; aborting", { requestId, reason: String(e) });
      return serverError("audit write failed", init);
    }

    const { error: updateError } = await sb
      .from("appointments")
      .update({ status: "arrived" })
      .eq("id", appt.id);
    if (updateError) {
      log.error("status update failed", { requestId, reason: updateError.message });
      return serverError("check-in failed", init);
    }

    const queueEntryId =
      appt.type === "virtual"
        ? null
        : await insertQueueRow(sb, {
            hospital_id: appt.hospital_id,
            department_id: appt.department_id,
            patient_user_id: appt.patient_user_id,
            appointment_id: appt.id,
            kind: "scheduled_arrival",
            requestId,
          });

    const { data: intakeRow, error: intakeError } = await sb
      .from("patient_intakes")
      .insert({
        hospital_id: appt.hospital_id,
        entry_type_code: "booked_arrival",
        entry_point: appt.type === "virtual" ? "virtual" : "opd",
        receiving_department_id: appt.department_id,
        patient_user_id: appt.patient_user_id,
        // Provenance of a booking made without an account (migration 0060),
        // kept so an un-reconcile can null the patient without orphaning the row.
        provisional_patient_id: appt.provisional_patient_id ?? null,
        appointment_id: appt.id,
        priority_hint: "routine",
        status: "awaiting_triage",
        registered_by_user_id: caller.id,
      })
      .select("id")
      .single();
    if (intakeError) {
      log.warn("intake insert failed (continuing)", { requestId, reason: intakeError.message });
    }

    log.info("checked in (booked)", {
      requestId,
      appointment_id: appt.id,
      queue_entry_id: queueEntryId,
      intake_id: intakeRow?.id ?? null,
    });
    return ok(
      {
        appointment_id: appt.id,
        queue_entry_id: queueEntryId,
        intake_id: intakeRow?.id ?? null,
      },
      init,
    );
  }

  /* ─── Mode B: intake_id (declared → arrived) ─────────────────── */
  const intakeId = input.intake_id!;
  const { data: intake, error: intakeErr } = await sb
    .from("patient_intakes")
    .select("id, hospital_id, receiving_department_id, patient_user_id, status")
    .eq("id", intakeId)
    .maybeSingle();
  if (intakeErr) return serverError(intakeErr.message, init);
  if (!intake) return notFound(init, "intake not found");
  if (intake.status !== "declared") {
    return badRequest(
      `Intake is in '${intake.status}' — only declared intakes need check-in.`,
      init,
    );
  }

  const authError = await authoriseAtHospital(caller.id, intake.hospital_id);
  if (authError) return forbidden(init, authError);

  try {
    await recordSaAudit({
      actorId: caller.id,
      action: "check_in_patient",
      targetKind: "patient_intake",
      targetId: intake.id,
      reason: input.reason,
      requestId,
      ipAddress,
      userAgent,
      beforeData: { status: intake.status },
      afterData: { status: "arrived" },
    });
  } catch (e) {
    log.error("sa_audit failed; aborting", { requestId, reason: String(e) });
    return serverError("audit write failed", init);
  }

  const checkedInAt = new Date().toISOString();
  const { error: flipErr } = await sb
    .from("patient_intakes")
    .update({ status: "arrived", checked_in_at: checkedInAt })
    .eq("id", intake.id);
  if (flipErr) {
    log.error("intake flip failed", { requestId, reason: flipErr.message });
    return serverError("check-in failed", init);
  }

  const queueEntryId = intake.receiving_department_id
    ? await insertQueueRow(sb, {
        hospital_id: intake.hospital_id,
        department_id: intake.receiving_department_id,
        patient_user_id: intake.patient_user_id,
        appointment_id: null,
        kind: "walk_in",
        requestId,
      })
    : null;

  log.info("checked in (declared)", {
    requestId,
    intake_id: intake.id,
    queue_entry_id: queueEntryId,
  });
  return ok(
    {
      intake_id: intake.id,
      queue_entry_id: queueEntryId,
    },
    init,
  );
});

/* ─── helpers ─────────────────────────────────────────────────────── */

async function insertQueueRow(
  sb: ReturnType<typeof serviceClient>,
  args: {
    hospital_id: string;
    department_id: string | null;
    patient_user_id: string | null;
    appointment_id: string | null;
    kind: "scheduled_arrival" | "walk_in";
    requestId: string;
  },
): Promise<string | null> {
  if (!args.department_id) return null;
  // The hospital's today, not UTC's, or numbering restarts at 03:00 EAT.
  const startOfDay = startOfLocalDay(new Date(), DEFAULT_TIME_ZONE);
  const { count } = await sb
    .from("queue_entries")
    .select("id", { count: "exact", head: true })
    .eq("hospital_id", args.hospital_id)
    .eq("department_id", args.department_id)
    .gte("arrived_at", startOfDay.toISOString());
  const sequenceNumber = (count ?? 0) + 1;

  const { data: row, error } = await sb
    .from("queue_entries")
    .insert({
      hospital_id: args.hospital_id,
      department_id: args.department_id,
      appointment_id: args.appointment_id,
      patient_user_id: args.patient_user_id,
      kind: args.kind,
      state: "waiting",
      sequence_number: sequenceNumber,
    })
    .select("id")
    .single();
  if (error) {
    log.warn("queue insert failed (continuing)", {
      requestId: args.requestId,
      reason: error.message,
    });
    return null;
  }
  return row?.id ?? null;
}

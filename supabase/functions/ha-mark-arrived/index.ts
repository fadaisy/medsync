/**
 * ha-mark-arrived — patient (or reception/nurse) confirms arrival.
 *
 *   - Flips the appointment status confirmed → arrived.
 *   - Creates a queue_entries row in state='waiting'. Virtual
 *     appointments DON'T create a queue entry (no physical waiting).
 *   - Computes sequence_number per (hospital, department, date).
 *
 * Callable by:
 *   - The patient on their own appointment (the digital pre-queue).
 *   - Reception / nurse / clinician at the hospital.
 *   - Admin / superadmin.
 */
import { z } from "npm:zod@4.4.3";

import { getCaller, hasRole, serviceClient } from "../_shared/auth.ts";
import { preflight } from "../_shared/cors.ts";
import {
  badRequest,
  forbidden,
  methodNotAllowed,
  notFound,
  ok,
  serverError,
  unauthorized,
} from "../_shared/errors.ts";
import { requireHospitalAdminScope } from "../_shared/hospital-admin-scope.ts";
import { makeLogger } from "../_shared/logger.ts";
import { networkContext, recordSaAudit } from "../_shared/sa-audit.ts";
import { DEFAULT_TIME_ZONE, startOfLocalDay } from "../_shared/slots.ts";

const log = makeLogger("ha-mark-arrived");

const InputSchema = z.object({
  appointment_id: z.string().uuid(),
  reason: z.string().min(8, "Reason ≥ 8 chars required (audited)."),
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
  const { data: appt, error } = await sb
    .from("appointments")
    .select("id, hospital_id, department_id, patient_user_id, clinician_user_id, status, type")
    .eq("id", input.appointment_id)
    .maybeSingle();
  if (error) return serverError(error.message, init);
  if (!appt) return notFound(init, "appointment not found");

  const isSuperadmin = await hasRole(caller.id, "superadmin");
  const isPatient = caller.id === appt.patient_user_id;
  const isClinician = caller.id === appt.clinician_user_id;
  const isNurse = await hasRole(caller.id, "nurse", appt.hospital_id);
  if (!isSuperadmin && !isPatient && !isClinician && !isNurse) {
    if (!(await hasRole(caller.id, "hospital_admin", appt.hospital_id))) {
      return forbidden(init);
    }
    const scope = await requireHospitalAdminScope(caller.id, appt.hospital_id);
    if (!scope.ok) return forbidden(init, scope.reason);
  }

  if (appt.status !== "confirmed") {
    return badRequest(
      `Appointment is in '${appt.status}' — only confirmed appointments can mark arrival.`,
      init,
    );
  }

  const { ipAddress, userAgent } = networkContext(request);
  try {
    await recordSaAudit({
      actorId: caller.id,
      action: "mark_arrived",
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

  // 1. Flip status.
  const { error: updateError } = await sb
    .from("appointments")
    .update({ status: "arrived" })
    .eq("id", appt.id);
  if (updateError) {
    log.error("status update failed", { requestId, reason: updateError.message });
    return serverError("mark-arrived failed", init);
  }

  // 2. Virtual appointments: no physical queue entry (PRD §1.5).
  let queueEntryId: string | null = null;
  if (appt.type !== "virtual") {
    // Compute the next sequence_number for (hospital, department, today) —
    // the hospital's today, not UTC's, or numbering restarts at 03:00 EAT.
    const startOfDay = startOfLocalDay(new Date(), DEFAULT_TIME_ZONE);
    const { count } = await sb
      .from("queue_entries")
      .select("id", { count: "exact", head: true })
      .eq("hospital_id", appt.hospital_id)
      .eq("department_id", appt.department_id)
      .gte("arrived_at", startOfDay.toISOString());
    const sequenceNumber = (count ?? 0) + 1;

    const { data: queueRow, error: queueError } = await sb
      .from("queue_entries")
      .insert({
        hospital_id: appt.hospital_id,
        department_id: appt.department_id,
        appointment_id: appt.id,
        patient_user_id: appt.patient_user_id,
        kind: "scheduled_arrival",
        state: "waiting",
        sequence_number: sequenceNumber,
      })
      .select("id")
      .single();
    if (queueError) {
      log.warn("queue insert failed (appointment marked arrived)", {
        requestId,
        appointment_id: appt.id,
        reason: queueError.message,
      });
    } else {
      queueEntryId = queueRow?.id ?? null;
    }
  }

  log.info("marked arrived", {
    requestId,
    appointment_id: appt.id,
    queue_entry_id: queueEntryId,
    is_virtual: appt.type === "virtual",
  });
  return ok({ appointment_id: appt.id, queue_entry_id: queueEntryId }, init);
});

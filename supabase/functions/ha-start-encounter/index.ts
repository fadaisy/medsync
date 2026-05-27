/**
 * ha-start-encounter — clinician calls a queue entry for rooming.
 *
 *   - Flips the appointment status arrived → in_progress.
 *   - Creates an encounters row (minimal seam to the future clinical
 *     module — id, appointment, patient, clinician, hospital, dept,
 *     started_at, state='in_progress').
 *   - Updates the queue_entries row: state='being_seen', called_at,
 *     called_by_user_id, encounter_id.
 *
 * Callable by:
 *   - The clinician on their own appointment.
 *   - A nurse at the hospital (rooming support).
 *   - Admin / superadmin.
 *
 * After this point, scheduling hands off. The clinical module (when
 * it ships) owns the encounter row's vitals, notes, completion, etc.
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

const log = makeLogger("ha-start-encounter");

const InputSchema = z.object({
  /** Either appointment_id (in-person + virtual both supported) or
   * queue_entry_id (walk-in path) must be set. We resolve one from
   * the other server-side. */
  appointment_id: z.string().uuid().optional(),
  queue_entry_id: z.string().uuid().optional(),
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

  if (!input.appointment_id && !input.queue_entry_id) {
    return badRequest("appointment_id or queue_entry_id required", init);
  }

  const caller = await getCaller(request);
  if (!caller) return unauthorized(init);

  const sb = serviceClient();

  // Resolve appointment + (optional) queue entry.
  let appointmentId = input.appointment_id ?? null;
  const queueEntryId = input.queue_entry_id ?? null;
  if (queueEntryId && !appointmentId) {
    const { data: qe } = await sb
      .from("queue_entries")
      .select("appointment_id")
      .eq("id", queueEntryId)
      .maybeSingle();
    if (!qe || !qe.appointment_id) {
      return notFound(init, "queue entry has no linked appointment");
    }
    appointmentId = qe.appointment_id;
  }

  const { data: appt, error: aErr } = await sb
    .from("appointments")
    .select("id, hospital_id, department_id, patient_user_id, clinician_user_id, status, type")
    .eq("id", appointmentId!)
    .maybeSingle();
  if (aErr) return serverError(aErr.message, init);
  if (!appt) return notFound(init, "appointment not found");

  const isSuperadmin = await hasRole(caller.id, "superadmin");
  const isClinician = caller.id === appt.clinician_user_id;
  const isNurse = await hasRole(caller.id, "nurse", appt.hospital_id);
  if (!isSuperadmin && !isClinician && !isNurse) {
    if (!(await hasRole(caller.id, "hospital_admin", appt.hospital_id))) {
      return forbidden(init);
    }
    const scope = await requireHospitalAdminScope(caller.id, appt.hospital_id);
    if (!scope.ok) return forbidden(init, scope.reason);
  }

  // Virtual flow: appointment goes confirmed → in_progress directly
  // (no arrived step, no queue entry).
  const okFromArrived = appt.status === "arrived";
  const okFromConfirmedVirtual = appt.status === "confirmed" && appt.type === "virtual";
  if (!okFromArrived && !okFromConfirmedVirtual) {
    return badRequest(
      `Appointment is in '${appt.status}' — must be arrived (or confirmed+virtual) to start.`,
      init,
    );
  }

  const { ipAddress, userAgent } = networkContext(request);

  // Audit first.
  try {
    await recordSaAudit({
      actorId: caller.id,
      action: "start_encounter",
      targetKind: "appointment",
      targetId: appt.id,
      reason: input.reason,
      requestId,
      ipAddress,
      userAgent,
      beforeData: { status: appt.status },
      afterData: { status: "in_progress" },
    });
  } catch (e) {
    log.error("sa_audit failed; aborting", { requestId, reason: String(e) });
    return serverError("audit write failed", init);
  }

  // 1. Create encounter.
  const nowIso = new Date().toISOString();
  const { data: encounter, error: eErr } = await sb
    .from("encounters")
    .insert({
      hospital_id: appt.hospital_id,
      appointment_id: appt.id,
      patient_user_id: appt.patient_user_id,
      clinician_user_id: appt.clinician_user_id,
      department_id: appt.department_id,
      started_at: nowIso,
      state: "in_progress",
    })
    .select("id")
    .single();
  if (eErr || !encounter) {
    log.error("encounter insert failed", { requestId, reason: eErr?.message });
    return serverError("encounter create failed", init);
  }

  // 2. Flip appointment to in_progress.
  const { error: aUpd } = await sb
    .from("appointments")
    .update({ status: "in_progress" })
    .eq("id", appt.id);
  if (aUpd) {
    log.warn("appointment status update failed (encounter created)", {
      requestId,
      appointment_id: appt.id,
      encounter_id: encounter.id,
      reason: aUpd.message,
    });
  }

  // 3. Update queue entry if there is one (resolved or supplied).
  if (queueEntryId) {
    await sb
      .from("queue_entries")
      .update({
        state: "being_seen",
        called_at: nowIso,
        called_by_user_id: caller.id,
        encounter_id: encounter.id,
      })
      .eq("id", queueEntryId);
  } else {
    // For an appointment-driven start, find and update the queue
    // entry if it exists.
    await sb
      .from("queue_entries")
      .update({
        state: "being_seen",
        called_at: nowIso,
        called_by_user_id: caller.id,
        encounter_id: encounter.id,
      })
      .eq("appointment_id", appt.id)
      .eq("state", "waiting");
  }

  log.info("encounter started", {
    requestId,
    appointment_id: appt.id,
    encounter_id: encounter.id,
  });
  return ok(
    {
      appointment_id: appt.id,
      encounter_id: encounter.id,
      status: "in_progress",
    },
    init,
  );
});

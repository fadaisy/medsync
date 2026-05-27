/**
 * reschedule-appointment — move an appointment to a new slot.
 *
 * Behaviour:
 *   - Mints a NEW appointments row at the new slot, copying everything
 *     else (clinician, department, patient, reason, type) from the
 *     original.
 *   - Old row gets status='rescheduled' + cancelled_reason naming
 *     the new row.
 *   - New row's status copies the original (a confirmed appointment
 *     stays confirmed; a pending_approval stays pending).
 *   - rescheduled_from_appointment_id on the new row links back.
 *   - Reminders for the old row are cancelled; new reminders are
 *     queued for the new row using the original notify_lead_minutes
 *     (or department defaults).
 *
 * Allowed by: patient (own appointment), clinician (own), admin, superadmin.
 *
 * Refuses to reschedule a finalised status (cancelled, declined,
 * completed, no_show, rescheduled).
 */
import { z } from "npm:zod@4.4.3";

import { getCaller, hasRole, serviceClient } from "../_shared/auth.ts";
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
import { requireHospitalAdminScope } from "../_shared/hospital-admin-scope.ts";
import { makeLogger } from "../_shared/logger.ts";
import { networkContext, recordSaAudit } from "../_shared/sa-audit.ts";

const log = makeLogger("reschedule-appointment");

const InputSchema = z.object({
  appointment_id: z.string().uuid(),
  new_starts_at: z.string().datetime({ offset: true }),
  new_ends_at: z.string().datetime({ offset: true }),
  reason: z.string().min(8, "Reason ≥ 8 chars required."),
});

const RESCHEDULABLE = new Set(["requested", "pending_approval", "confirmed"]);

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

  if (new Date(input.new_ends_at) <= new Date(input.new_starts_at)) {
    return badRequest("new_ends_at must be > new_starts_at.", init);
  }

  const caller = await getCaller(request);
  if (!caller) return unauthorized(init);

  const sb = serviceClient();
  const { data: appt, error } = await sb
    .from("appointments")
    .select(
      "id, hospital_id, department_id, patient_user_id, clinician_user_id, " +
        "status, reason, reason_note, type, priority, notify_lead_minutes",
    )
    .eq("id", input.appointment_id)
    .maybeSingle();
  if (error) return serverError(error.message, init);
  if (!appt) return notFound(init, "appointment not found");

  const isSuperadmin = await hasRole(caller.id, "superadmin");
  const isPatient = caller.id === appt.patient_user_id;
  const isClinician = caller.id === appt.clinician_user_id;
  if (!isSuperadmin && !isPatient && !isClinician) {
    if (!(await hasRole(caller.id, "hospital_admin", appt.hospital_id))) {
      return forbidden(init);
    }
    const scope = await requireHospitalAdminScope(caller.id, appt.hospital_id);
    if (!scope.ok) return forbidden(init, scope.reason);
  }

  if (!RESCHEDULABLE.has(appt.status)) {
    return badRequest(
      `Appointment is in '${appt.status}' — reschedule isn't allowed from here.`,
      init,
    );
  }

  // Refuse double-book at the new slot.
  const { data: dup } = await sb
    .from("appointments")
    .select("id")
    .eq("clinician_user_id", appt.clinician_user_id)
    .eq("starts_at", input.new_starts_at)
    .in("status", ["requested", "pending_approval", "confirmed", "arrived", "in_progress"])
    .limit(1)
    .maybeSingle();
  if (dup) return conflict("Someone else has that slot — pick another.", init);

  // Look up the lead times to copy onto the new row's reminders.
  const leadMinutes: number[] = appt.notify_lead_minutes ??
    (
      await sb
        .from("department_scheduling_policy")
        .select("reminder_lead_minutes")
        .eq("department_id", appt.department_id)
        .maybeSingle()
    ).data?.reminder_lead_minutes ?? [1440, 60];

  const { ipAddress, userAgent } = networkContext(request);

  // 1. Audit first.
  try {
    await recordSaAudit({
      actorId: caller.id,
      action: "reschedule_appointment",
      targetKind: "appointment",
      targetId: appt.id,
      reason: input.reason,
      requestId,
      ipAddress,
      userAgent,
      beforeData: { status: appt.status },
      afterData: {
        status: "rescheduled",
        new_starts_at: input.new_starts_at,
        new_ends_at: input.new_ends_at,
      },
    });
  } catch (e) {
    log.error("sa_audit failed; aborting", { requestId, reason: String(e) });
    return serverError("audit write failed", init);
  }

  // 2. Create the new appointment.
  const { data: newRow, error: insertError } = await sb
    .from("appointments")
    .insert({
      hospital_id: appt.hospital_id,
      department_id: appt.department_id,
      patient_user_id: appt.patient_user_id,
      clinician_user_id: appt.clinician_user_id,
      starts_at: input.new_starts_at,
      ends_at: input.new_ends_at,
      reason: appt.reason,
      reason_note: appt.reason_note,
      origin: isPatient ? "patient" : isClinician ? "clinician" : "reception",
      status: appt.status,
      priority: appt.priority,
      type: appt.type,
      rescheduled_from_appointment_id: appt.id,
      created_by_user_id: caller.id,
      notify_lead_minutes: leadMinutes,
    })
    .select("id, status")
    .single();
  if (insertError || !newRow) {
    log.error("new appointment insert failed", { requestId, reason: insertError?.message });
    return serverError("reschedule failed (new row)", init);
  }

  // 3. Flip the old row.
  const { error: updateError } = await sb
    .from("appointments")
    .update({
      status: "rescheduled",
      cancelled_reason: `Rescheduled to ${input.new_starts_at}`,
      cancelled_by_user_id: caller.id,
    })
    .eq("id", appt.id);
  if (updateError) {
    log.warn("old appointment flip failed (new row already created)", {
      requestId,
      old_id: appt.id,
      new_id: newRow.id,
      reason: updateError.message,
    });
  }

  // 4. Reap old reminders + queue new ones.
  await sb
    .from("appointment_reminders")
    .update({ state: "cancelled" })
    .eq("appointment_id", appt.id)
    .eq("state", "queued");

  const startsMs = new Date(input.new_starts_at).getTime();
  const reminderRows = leadMinutes
    .filter((m) => m > 0)
    .map((m) => ({
      appointment_id: newRow.id,
      channel: "in_app" as const,
      scheduled_at: new Date(startsMs - m * 60_000).toISOString(),
    }));
  if (reminderRows.length > 0) {
    await sb.from("appointment_reminders").insert(reminderRows);
  }

  log.info("appointment rescheduled", {
    requestId,
    old_id: appt.id,
    new_id: newRow.id,
  });
  return ok(
    {
      old_appointment_id: appt.id,
      new_appointment_id: newRow.id,
      new_status: newRow.status,
    },
    init,
  );
});

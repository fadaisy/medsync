/**
 * pt-confirm-attendance — "Confirm I'm coming" (Gate E, ADR 0090; PRD §3.2.3).
 *
 * Input: appointment_id. The caller must be the appointment's patient, or
 * the booking agent who made it (a household member has no app of their
 * own). A `confirmed` visit that has not started gets
 * `confirmed_by_patient_at = now()`; the pending confirmation-request
 * dispatch is acknowledged so no SMS fallback follows. Idempotent: a
 * second confirmation answers with the first timestamp.
 *
 * Not confirming costs the patient nothing by default (PRD §3.3.4); only a
 * facility that sets `release_unconfirmed_hours` releases unconfirmed
 * places, and this is the action that keeps one.
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
import { makeLogger } from "../_shared/logger.ts";
import { networkContext, recordSaAudit } from "../_shared/sa-audit.ts";

const log = makeLogger("pt-confirm-attendance");

const InputSchema = z.object({ appointment_id: z.string().uuid() });

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

  const caller = await getCaller(request);
  if (!caller) return unauthorized(init);
  const sb = serviceClient();

  const { data: appt, error } = await sb
    .from("appointments")
    .select("id, status, starts_at, patient_user_id, created_by_user_id, confirmed_by_patient_at")
    .eq("id", parsed.data.appointment_id)
    .maybeSingle();
  if (error) return serverError(error.message, init);
  if (!appt) return notFound(init, "appointment not found");
  if (appt.patient_user_id !== caller.id && appt.created_by_user_id !== caller.id) {
    return forbidden(init, "this is not your visit");
  }
  if (appt.confirmed_by_patient_at) {
    return ok({ appointment_id: appt.id, confirmed_by_patient_at: appt.confirmed_by_patient_at }, init);
  }
  if (appt.status !== "confirmed") {
    return conflict("This visit is not in a state that can be confirmed.", init, {
      status: appt.status,
    });
  }
  if (new Date(appt.starts_at).getTime() <= Date.now()) {
    return conflict("This visit has already started.", init);
  }

  const now = new Date().toISOString();
  const { error: updateError } = await sb
    .from("appointments")
    .update({ confirmed_by_patient_at: now })
    .eq("id", appt.id)
    .is("confirmed_by_patient_at", null);
  if (updateError) return serverError(updateError.message, init);

  // The confirmation request is answered: no SMS fallback needed, and a
  // not-yet-sent one is no longer worth sending.
  await sb
    .from("notification_dispatches")
    .update({ acknowledged_at: now })
    .eq("related_kind", "appointment")
    .eq("related_id", appt.id)
    .eq("kind", "confirmation_request")
    .is("acknowledged_at", null);
  await sb
    .from("notification_dispatches")
    .update({ state: "cancelled", failure_reason: "confirmed_by_patient" })
    .eq("related_kind", "appointment")
    .eq("related_id", appt.id)
    .eq("kind", "confirmation_request")
    .in("state", ["queued", "held"]);

  const { ipAddress, userAgent } = networkContext(request);
  try {
    await recordSaAudit({
      actorId: caller.id,
      action: "confirm_attendance",
      targetKind: "appointment",
      targetId: appt.id,
      reason: "patient confirmed attendance",
      requestId,
      ipAddress,
      userAgent,
      afterData: { confirmed_by_patient_at: now },
    });
  } catch (e) {
    log.warn("sa_audit failed (confirmation already recorded)", { requestId, reason: String(e) });
  }

  log.info("attendance confirmed", { requestId, appointment_id: appt.id });
  return ok({ appointment_id: appt.id, confirmed_by_patient_at: now }, init);
});

/**
 * pt-accept-rebooking — one tap onto the next clinic day after a cancelled
 * one (Gate E, ADR 0090; PRD §3.2.6 "nobody is dropped silently").
 *
 * Inputs:
 *   - cancelled_appointment_id   the booking `ha-cancel-session` cancelled
 *   - session_id                 the clinic day to take — the pre-selected
 *                                next equivalent one from the
 *                                `session_cancelled` payload, or any other
 *                                published day of the same line
 *
 * The caller must be the cancelled booking's patient or the agent who made
 * it. The new booking goes THROUGH THE CORE with idempotency key
 * `rebook:<cancelled_appointment_id>` — one rebooking per cancelled visit,
 * retried safely. The reason, note and symptoms are copied from the cancelled row.
 */
import { z } from "npm:zod@4.4.3";

import { getCaller, serviceClient } from "../_shared/auth.ts";
import { bookAppointment, toBookingResponse } from "../_shared/book.ts";
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

const log = makeLogger("pt-accept-rebooking");

const InputSchema = z.object({
  cancelled_appointment_id: z.string().uuid(),
  session_id: z.string().uuid(),
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

  const { data: old, error } = await sb
    .from("appointments")
    .select(
      "id, hospital_id, status, cancelled_reason, reason, reason_note, symptoms, patient_user_id, " +
        "provisional_patient_id, created_by_user_id, session_id, clinic_sessions(service_line_id)",
    )
    .eq("id", input.cancelled_appointment_id)
    .maybeSingle();
  if (error) return serverError(error.message, init);
  if (!old) return notFound(init, "appointment not found");
  if (old.patient_user_id !== caller.id && old.created_by_user_id !== caller.id) {
    return forbidden(init, "this is not your visit");
  }
  if (old.status !== "cancelled" || old.cancelled_reason !== "session_cancelled") {
    return conflict("This visit was not cancelled by the clinic.", init, { status: old.status });
  }

  // The target must be a published day of the SAME line at the same hospital;
  // the core checks everything else (future, horizon, reason, capacity).
  const oldLine = (old.clinic_sessions as { service_line_id: string } | null)?.service_line_id;
  const { data: target } = await sb
    .from("clinic_sessions")
    .select("id, service_line_id, hospital_id")
    .eq("id", input.session_id)
    .eq("status", "published")
    .maybeSingle();
  if (!target || target.hospital_id !== old.hospital_id || target.service_line_id !== oldLine) {
    return notFound(init, "That clinic day is not open for booking — refresh and pick again.");
  }

  const { ipAddress, userAgent } = networkContext(request);
  const result = await bookAppointment(
    { sb, init, log },
    {
      patient: old.patient_user_id
        ? { userId: old.patient_user_id }
        : { provisionalId: old.provisional_patient_id as string },
      actorId: caller.id,
      origin: "patient",
      channel: "app",
      hospitalId: old.hospital_id,
      reason: old.reason,
      note: old.reason_note ?? null,
      symptoms: old.symptoms ?? null,
      idempotencyKey: `rebook:${old.id}`,
      session: { sessionId: target.id },
      horizonDays: null,
      rateLimit: {
        perHour: 5,
        message: "You've asked for several visits in the last hour. Try again later.",
      },
      audit: {
        action: "book_appointment",
        reason: `rebooked after session cancellation of ${old.id}`,
        requestId,
        ipAddress,
        userAgent,
      },
    },
  );
  if (!result.ok) return result.response;

  if (!result.replayed) {
    try {
      await recordSaAudit({
        actorId: caller.id,
        action: "accept_rebooking",
        targetKind: "appointment",
        targetId: old.id,
        reason: "patient accepted rebooking after session cancellation",
        requestId,
        ipAddress,
        userAgent,
        afterData: { new_appointment_id: result.row.id, session_id: target.id },
      });
    } catch (e) {
      log.warn("sa_audit failed (booking already created)", { requestId, reason: String(e) });
    }
  }

  log.info("rebooking accepted", {
    requestId,
    cancelled_appointment_id: old.id,
    appointment_id: result.row.id,
    replayed: result.replayed,
  });
  return ok({ cancelled_appointment_id: old.id, ...toBookingResponse(result.row) }, init);
});

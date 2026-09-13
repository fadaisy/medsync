/**
 * pt-accept-waitlist-offer — "Take this place" (Gate E, ADR 0090; PRD §3.3.3).
 *
 * Input: waitlist_entry_id. The caller must be the entry's patient or its
 * creator (a booking agent), the entry must be `offered` and the offer
 * still open. The booking goes THROUGH THE CORE (`bookAppointment`) with
 * the offered clinic day (session) or the released row's slot, and the
 * ENTRY ID as the idempotency key — a retry answers with the same booking.
 *
 * An offer is a notification, never a hold (C12): if the place was taken
 * again, the core answers 409 and the entry goes back to `waiting` with its
 * ORIGINAL created_at, so the patient keeps their turn. The message says so.
 */
import { z } from "npm:zod@4.4.3";

import { getCaller, serviceClient } from "../_shared/auth.ts";
import type { SlotInput } from "../_shared/book.ts";
import { bookAppointment, bookingResponse, toBookingResponse } from "../_shared/book.ts";
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

const log = makeLogger("pt-accept-waitlist-offer");

const InputSchema = z.object({ waitlist_entry_id: z.string().uuid() });

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

  const { data: entry, error } = await sb
    .from("waitlist_entries")
    .select(
      "id, hospital_id, service_line_id, state, reason, patient_user_id, provisional_patient_id, " +
        "created_by_user_id, offered_session_id, offer_expires_at, released_appointment_id, " +
        "accepted_appointment_id",
    )
    .eq("id", parsed.data.waitlist_entry_id)
    .maybeSingle();
  if (error) return serverError(error.message, init);
  if (!entry) return notFound(init, "waitlist entry not found");
  if (entry.patient_user_id !== caller.id && entry.created_by_user_id !== caller.id) {
    return forbidden(init, "this is not your waitlist entry");
  }
  if (entry.state === "accepted" && entry.accepted_appointment_id) {
    // A replay of a finished accept: answer with the booking it made.
    const { data: prior } = await sb
      .from("appointments")
      .select(
        "id, status, booking_code, position_number, arrival_window_start, arrival_window_end, provisional_patient_id",
      )
      .eq("id", entry.accepted_appointment_id)
      .maybeSingle();
    if (prior) return bookingResponse({ ok: true, row: prior, replayed: true }, init);
  }
  if (entry.state !== "offered") {
    return conflict("This offer is no longer open.", init, { state: entry.state });
  }
  if (entry.offer_expires_at && new Date(entry.offer_expires_at).getTime() <= Date.now()) {
    return conflict("This offer has closed. You are still on the list.", init, {
      state: entry.state,
    });
  }

  // What is being accepted: a clinic day, or the released row's slot.
  let mode: { session: { sessionId: string } } | { slot: SlotInput };
  if (entry.offered_session_id) {
    mode = { session: { sessionId: entry.offered_session_id } };
  } else {
    if (!entry.released_appointment_id) {
      return conflict("This offer is no longer open.", init, { state: entry.state });
    }
    const { data: released } = await sb
      .from("appointments")
      .select("clinician_user_id, department_id, starts_at, ends_at, type")
      .eq("id", entry.released_appointment_id)
      .maybeSingle();
    if (!released) return conflict("This offer is no longer open.", init, { state: entry.state });
    mode = {
      slot: {
        clinician_user_id: released.clinician_user_id,
        department_id: released.department_id,
        starts_at: released.starts_at,
        ends_at: released.ends_at,
        type: released.type === "virtual" ? "virtual" : "in_person",
        service_line_id: entry.service_line_id,
      },
    };
  }

  const { ipAddress, userAgent } = networkContext(request);
  const result = await bookAppointment(
    { sb, init, log },
    {
      patient: entry.patient_user_id
        ? { userId: entry.patient_user_id }
        : { provisionalId: entry.provisional_patient_id as string },
      actorId: caller.id,
      origin: "patient",
      channel: "app",
      hospitalId: entry.hospital_id,
      reason: entry.reason,
      note: null,
      idempotencyKey: entry.id,
      ...mode,
      // The offer was for capacity the facility published; no horizon on top.
      horizonDays: null,
      rateLimit: {
        perHour: 5,
        message: "You've asked for several visits in the last hour. Try again later.",
      },
      audit: {
        action: "book_appointment",
        reason: "waitlist offer accepted",
        requestId,
        ipAddress,
        userAgent,
      },
    },
  );

  if (!result.ok) {
    // 409 from the core = the place went to someone else. Back in line, same turn.
    if (result.response.status === 409) {
      await sb
        .from("waitlist_entries")
        .update({
          state: "waiting",
          offered_session_id: null,
          offered_starts_at: null,
          offer_expires_at: null,
          released_appointment_id: null,
        })
        .eq("id", entry.id)
        .eq("state", "offered");
      return conflict(
        "Someone took this place just before you. You keep your turn on the list and we will tell you when the next one opens.",
        init,
      );
    }
    return result.response;
  }

  await sb
    .from("waitlist_entries")
    .update({ state: "accepted", accepted_appointment_id: result.row.id })
    .eq("id", entry.id)
    .in("state", ["offered", "waiting"]);

  try {
    await recordSaAudit({
      actorId: caller.id,
      action: "accept_waitlist_offer",
      targetKind: "waitlist_entry",
      targetId: entry.id,
      reason: "waitlist offer accepted",
      requestId,
      ipAddress,
      userAgent,
      beforeData: { state: "offered" },
      afterData: { state: "accepted", appointment_id: result.row.id },
    });
  } catch (e) {
    log.warn("sa_audit failed (booking already created)", { requestId, reason: String(e) });
  }

  log.info("waitlist offer accepted", {
    requestId,
    waitlist_entry_id: entry.id,
    appointment_id: result.row.id,
    replayed: result.replayed,
  });
  return ok({ waitlist_entry_id: entry.id, ...toBookingResponse(result.row) }, init);
});

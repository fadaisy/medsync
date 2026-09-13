/**
 * ha-cancel-session — the in-charge cancels a clinic day (Gate E, ADR 0090;
 * PRD §3.2.6: "every affected patient notified by push and SMS with an
 * automatic offer of the next equivalent session, pre-selected, one tap to
 * accept. Nobody is dropped silently.").
 *
 * Inputs:
 *   - session_id
 *   - reason        ≥ 10 characters, audited, shown to nobody verbatim
 *   - dry_run?      true → count the affected bookings and answer without
 *                   changing anything, so the console can show the number
 *                   before the person confirms
 *
 * Sensitive. Callable by a superadmin, a hospital_admin of the session's
 * hospital (state-checked), or the clinician the session names — the
 * closest thing the roster has to "the HOD of the session" (ADR 0090).
 *
 * On execute, in this order:
 *   1. audit `cancel_session` with the count (fail closed);
 *   2. the session → 'cancelled' (reason, by, at), booked_count → 0
 *      (positions released; next_position untouched);
 *   3. every LIVE booking → 'cancelled', reason 'session_cancelled';
 *   4. their queued reminders / dispatches reaped;
 *   5. ONE `session_cancelled` dispatch per patient — push AND SMS — with
 *      the next equivalent session's id in the payload (the next published,
 *      non-full day of the same line after now), so the app can pre-select
 *      it and `pt-accept-rebooking` books it in one tap;
 *   6. offers standing on this day go back to `waiting` — the offer is
 *      moot, the place in line is not.
 *
 * `session_cancelled` is exempt from the per-run send cap: 300 patients
 * hear within one run.
 */
import { z } from "npm:zod@4.4.3";

import { getCaller, hasRole, serviceClient } from "../_shared/auth.ts";
import { preflight } from "../_shared/cors.ts";
import { dispatchRows } from "../_shared/dispatches.ts";
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
import { LIVE_APPOINTMENT_STATUSES } from "../_shared/slots.ts";

const log = makeLogger("ha-cancel-session");

const InputSchema = z.object({
  session_id: z.string().uuid(),
  reason: z.string().trim().min(10, "Reason ≥ 10 chars required."),
  dry_run: z.boolean().optional(),
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

  const { data: session, error } = await sb
    .from("clinic_sessions")
    .select("id, hospital_id, service_line_id, clinician_user_id, starts_at, status, booked_count")
    .eq("id", input.session_id)
    .maybeSingle();
  if (error) return serverError(error.message, init);
  if (!session) return notFound(init, "clinic day not found");

  const isSuperadmin = await hasRole(caller.id, "superadmin");
  const isSessionClinician = !!session.clinician_user_id && caller.id === session.clinician_user_id;
  if (!isSuperadmin && !isSessionClinician) {
    if (!(await hasRole(caller.id, "hospital_admin", session.hospital_id))) {
      return forbidden(init, "only the hospital admin or this clinic day's clinician can cancel it");
    }
    const scope = await requireHospitalAdminScope(caller.id, session.hospital_id);
    if (!scope.ok) return forbidden(init, scope.reason);
  }

  if (session.status === "cancelled") {
    return ok({ session_id: session.id, status: "cancelled", affected: 0, dry_run: false }, init);
  }
  if (session.status !== "published" && session.status !== "draft") {
    return conflict(`This clinic day is '${session.status}' and cannot be cancelled.`, init);
  }

  // Everyone who holds a live booking on this day, and how to reach them.
  const { data: live, error: liveError } = await sb
    .from("appointments")
    .select(
      "id, patient_user_id, provisional_patient_id, provisional_patients(phone_encrypted)",
    )
    .eq("session_id", session.id)
    .in("status", [...LIVE_APPOINTMENT_STATUSES]);
  if (liveError) return serverError(liveError.message, init);
  const affected = (live ?? []) as {
    id: string;
    patient_user_id: string | null;
    provisional_patient_id: string | null;
    provisional_patients: { phone_encrypted: string } | null;
  }[];

  // The next equivalent day: same line, published, not full, after now.
  const { data: nextRows } = await sb.rpc("next_sessions_of_line", {
    p_line: session.service_line_id,
    p_after: new Date().toISOString(),
  });
  const next =
    ((nextRows ?? []) as { id: string; starts_at: string }[]).find((s) => s.id !== session.id) ??
    null;

  if (input.dry_run) {
    return ok(
      {
        session_id: session.id,
        status: session.status,
        affected: affected.length,
        next_session: next,
        dry_run: true,
      },
      init,
    );
  }

  const { ipAddress, userAgent } = networkContext(request);
  try {
    await recordSaAudit({
      actorId: caller.id,
      action: "cancel_session",
      targetKind: "clinic_session",
      targetId: session.id,
      reason: input.reason,
      requestId,
      ipAddress,
      userAgent,
      beforeData: { status: session.status, booked_count: session.booked_count },
      afterData: {
        status: "cancelled",
        affected: affected.length,
        next_session_id: next?.id ?? null,
      },
    });
  } catch (e) {
    log.error("sa_audit failed; aborting", { requestId, reason: String(e) });
    return serverError("audit write failed", init);
  }

  const now = new Date().toISOString();
  const { data: flipped, error: sessionError } = await sb
    .from("clinic_sessions")
    .update({
      status: "cancelled",
      cancelled_reason: input.reason,
      cancelled_by_user_id: caller.id,
      cancelled_at: now,
      booked_count: 0,
    })
    .eq("id", session.id)
    .in("status", ["published", "draft"])
    .select("id")
    .maybeSingle();
  if (sessionError) {
    log.error("session cancel failed", { requestId, reason: sessionError.message });
    return serverError("cancel failed", init);
  }
  if (!flipped) {
    // A concurrent cancel won; nothing more to do.
    return ok({ session_id: session.id, status: "cancelled", affected: 0, dry_run: false }, init);
  }

  const ids = affected.map((a) => a.id);
  if (ids.length > 0) {
    const { error: apptError } = await sb
      .from("appointments")
      .update({
        status: "cancelled",
        cancelled_reason: "session_cancelled",
        cancelled_by_user_id: caller.id,
      })
      .in("id", ids)
      .in("status", [...LIVE_APPOINTMENT_STATUSES]);
    if (apptError) {
      log.error("appointment cancel failed after session cancelled", {
        requestId,
        session_id: session.id,
        reason: apptError.message,
      });
      return serverError("cancel failed (bookings)", init);
    }
    await sb
      .from("appointment_reminders")
      .update({ state: "cancelled" })
      .in("appointment_id", ids)
      .eq("state", "queued");
    await sb
      .from("notification_dispatches")
      .update({ state: "cancelled", failure_reason: "session_cancelled" })
      .eq("related_kind", "appointment")
      .in("related_id", ids)
      .in("state", ["queued", "held"]);

    // One session_cancelled dispatch per patient, push AND SMS.
    const rows = affected.flatMap((a) => {
      const phone = a.provisional_patients?.phone_encrypted;
      const recipient = a.patient_user_id
        ? { userId: a.patient_user_id }
        : phone
          ? { phoneEncrypted: phone }
          : null;
      if (!recipient) {
        log.warn("cancelled booking has no reachable recipient", {
          requestId,
          appointment_id: a.id,
        });
        return [];
      }
      return dispatchRows({
        kind: "session_cancelled",
        hospitalId: session.hospital_id,
        recipient,
        nowIso: now,
        appointmentId: a.id,
        cancelledSessionId: session.id,
        nextSessionId: next?.id ?? null,
        nextSessionStartsAtIso: next?.starts_at ?? null,
      });
    });
    if (rows.length > 0) {
      const { error: dispatchError } = await sb
        .from("notification_dispatches")
        .upsert(rows, { onConflict: "idempotency_key", ignoreDuplicates: true });
      if (dispatchError) {
        log.error("session_cancelled dispatch insert failed", {
          requestId,
          session_id: session.id,
          reason: dispatchError.message,
        });
      }
    }
  }

  // Offers standing on this day are moot; the place in line is not.
  await sb
    .from("waitlist_entries")
    .update({
      state: "waiting",
      offered_session_id: null,
      offered_starts_at: null,
      offer_expires_at: null,
      released_appointment_id: null,
    })
    .eq("offered_session_id", session.id)
    .eq("state", "offered");

  log.info("clinic day cancelled", {
    requestId,
    session_id: session.id,
    affected: ids.length,
    next_session_id: next?.id ?? null,
  });
  return ok(
    {
      session_id: session.id,
      status: "cancelled",
      affected: ids.length,
      next_session: next,
      dry_run: false,
    },
    init,
  );
});

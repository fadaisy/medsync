/**
 * system-ussd-act — a phone acts for itself (Gate F, ADR 0091): `cancel`
 * (USSD "3", SMS "CANCEL <code>"), `confirm` (USSD "4", SMS "YES <code>"),
 * or `stop` (SMS "STOP"). Service-role only; a user JWT is refused.
 *
 * Inputs: { action: 'cancel' | 'confirm' | 'stop', booking_code?, phone_e164, channel: 'ussd' | 'sms' }
 *
 * stop    = the phone goes on `sms_opt_outs` (covers a provisional with no
 *           account — the dispatcher refuses every SMS to it, the receipt
 *           included); an account holder with this phone has their
 *           `sms_communication` consent revoked, audited `sms_stop`.
 *
 * The code alone is not authority: the visit must BELONG to the phone —
 * its provisional patient's `phone_hmac`, or its account holder's
 * `patient_profiles.phone_hmac` (0062), equals the caller's. A code that
 * is not this phone's answers 404 exactly like one that does not exist.
 *
 * cancel  = `cancel-appointment`'s path, audited as the system actor with
 *           the channel in the reason: status → cancelled, the session
 *           place released, pending dispatches reaped, the freed place
 *           offered to the waitlist (`releaseCapacity`).
 * confirm = `pt-confirm-attendance`'s path: `confirmed_by_patient_at`, the
 *           confirmation-request dispatch acknowledged.
 *
 * Answers 409 with `{ state }` when the visit is not in a state the action
 * applies to — the route turns that into the "cannot … now" sentence.
 */
import { z } from "npm:zod@4.4.3";

import { serviceClient } from "../_shared/auth.ts";
import { preflight } from "../_shared/cors.ts";
import { blindIndex } from "../_shared/encryption.ts";
import {
  badRequest,
  conflict,
  methodNotAllowed,
  notFound,
  ok,
  serverError,
  unauthorized,
} from "../_shared/errors.ts";
import { makeLogger } from "../_shared/logger.ts";
import { networkContext, recordSaAudit } from "../_shared/sa-audit.ts";
import { isServiceRoleCall, systemActorId } from "../_shared/system-actor.ts";
import { cancelPendingDispatches, releaseCapacity } from "../_shared/waitlist.ts";

const log = makeLogger("system-ussd-act");

const CANCELLABLE_STATES = new Set(["requested", "pending_approval", "confirmed", "arrived"]);

const InputSchema = z
  .object({
    action: z.enum(["cancel", "confirm", "stop"]),
    booking_code: z
      .string()
      .regex(/^[A-HJ-NP-Z2-9]{6}$/)
      .optional(),
    phone_e164: z.string().regex(/^\+2567\d{8}$|^\+256[23489]\d{7,8}$/),
    channel: z.enum(["ussd", "sms"]),
  })
  .refine((i) => i.action === "stop" || !!i.booking_code, { message: "booking_code required." });

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const init = { origin, requestId };
  const pre = preflight(request);
  if (pre) return pre;
  if (request.method !== "POST") return methodNotAllowed(init);
  if (!isServiceRoleCall(request)) return unauthorized(init, "service role required");
  const actorId = systemActorId();
  if (!actorId) return serverError("MEDSYNC_SYSTEM_ACTOR_UUID is not configured.", init);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Body must be JSON", init);
  }
  const parsed = InputSchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid input", init, parsed.error.flatten());
  const input = parsed.data;
  const sb = serviceClient();

  let phoneHmac: string;
  try {
    phoneHmac = await blindIndex(input.phone_e164, Deno.env.get("MEDSYNC_PHI_KEY") as string);
  } catch (e) {
    log.error("encryption unavailable", { requestId, reason: String(e) });
    return serverError("MEDSYNC_PHI_KEY is not configured for Functions.", init);
  }

  const { ipAddress, userAgent } = networkContext(request);
  const now = new Date().toISOString();

  if (input.action === "stop") {
    const { error: optError } = await sb
      .from("sms_opt_outs")
      .upsert({ phone_hmac: phoneHmac }, { onConflict: "phone_hmac", ignoreDuplicates: true });
    if (optError) return serverError(optError.message, init);
    const { data: holders } = await sb
      .from("patient_profiles")
      .select("id")
      .eq("phone_hmac", phoneHmac);
    for (const h of holders ?? []) {
      await sb
        .from("consent_records")
        .update({ revoked_at: now })
        .eq("user_id", h.id)
        .eq("consent_type", "sms_communication")
        .is("revoked_at", null);
      try {
        await recordSaAudit({
          actorId,
          action: "sms_stop",
          targetKind: "user",
          targetId: h.id,
          reason: "patient replied STOP by SMS",
          requestId,
          ipAddress,
          userAgent,
          afterData: { sms_communication: "revoked", channel: input.channel },
        });
      } catch (e) {
        log.warn("sa_audit failed (opt-out already recorded)", { requestId, reason: String(e) });
      }
    }
    log.info("sms opt-out recorded", { requestId, account_holders: holders?.length ?? 0 });
    return ok({ stopped: true }, init);
  }

  // The visit, and whose phone it belongs to. Future visits only: a code from
  // a visit that already happened is not something a phone can act on.
  const { data: appt, error } = await sb
    .from("appointments")
    .select(
      "id, hospital_id, status, session_id, starts_at, confirmed_by_patient_at, patient_user_id, " +
        "provisional_patients(phone_hmac), patient_profiles(phone_hmac)",
    )
    .eq("booking_code", input.booking_code as string)
    .gt("starts_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return serverError(error.message, init);
  const provHmac = (appt?.provisional_patients as { phone_hmac: string } | null)?.phone_hmac;
  const profileHmac = (appt?.patient_profiles as { phone_hmac: string | null } | null)?.phone_hmac;
  if (!appt || (provHmac !== phoneHmac && profileHmac !== phoneHmac)) {
    return notFound(init, "No visit with that code for this phone.");
  }

  if (input.action === "confirm") {
    if (appt.confirmed_by_patient_at) {
      return ok(
        { appointment_id: appt.id, confirmed_by_patient_at: appt.confirmed_by_patient_at },
        init,
      );
    }
    if (appt.status !== "confirmed")
      return conflict("not confirmable", init, { state: appt.status });
    const { error: updateError } = await sb
      .from("appointments")
      .update({ confirmed_by_patient_at: now })
      .eq("id", appt.id)
      .is("confirmed_by_patient_at", null);
    if (updateError) return serverError(updateError.message, init);
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
    try {
      await recordSaAudit({
        actorId,
        action: "confirm_attendance",
        targetKind: "appointment",
        targetId: appt.id,
        reason: `patient confirmed attendance by ${input.channel}`,
        requestId,
        ipAddress,
        userAgent,
        afterData: { confirmed_by_patient_at: now, channel: input.channel },
      });
    } catch (e) {
      log.warn("sa_audit failed (confirmation already recorded)", { requestId, reason: String(e) });
    }
    log.info("attendance confirmed", {
      requestId,
      appointment_id: appt.id,
      channel: input.channel,
    });
    return ok({ appointment_id: appt.id, confirmed_by_patient_at: now }, init);
  }

  // cancel
  if (!CANCELLABLE_STATES.has(appt.status)) {
    return conflict("not cancellable", init, { state: appt.status });
  }
  const reason = `Cancelled by the patient by ${input.channel}.`;
  try {
    await recordSaAudit({
      actorId,
      action: "cancel_appointment",
      targetKind: "appointment",
      targetId: appt.id,
      reason,
      requestId,
      ipAddress,
      userAgent,
      beforeData: { status: appt.status },
      afterData: { status: "cancelled", cancelled_reason: reason, channel: input.channel },
    });
  } catch (e) {
    log.error("sa_audit failed; aborting", { requestId, reason: String(e) });
    return serverError("audit write failed", init);
  }
  const { data: flipped, error: cancelError } = await sb
    .from("appointments")
    .update({ status: "cancelled", cancelled_reason: reason, cancelled_by_user_id: actorId })
    .eq("id", appt.id)
    .in("status", [...CANCELLABLE_STATES])
    .select("id")
    .maybeSingle();
  if (cancelError) return serverError("cancel failed", init);
  if (appt.session_id && flipped) {
    const { error: releaseError } = await sb.rpc("release_session_position", {
      p_session: appt.session_id,
    });
    if (releaseError) {
      log.error("release_session_position failed — a place is leaked", {
        requestId,
        session_id: appt.session_id,
        reason: releaseError.message,
      });
    }
  }
  await sb
    .from("appointment_reminders")
    .update({ state: "cancelled" })
    .eq("appointment_id", appt.id)
    .eq("state", "queued");
  await cancelPendingDispatches(sb, "appointment", appt.id, "appointment_cancelled");
  if (flipped) await releaseCapacity(sb, appt.id, log, requestId);

  log.info("appointment cancelled", { requestId, appointment_id: appt.id, channel: input.channel });
  return ok({ appointment_id: appt.id, status: "cancelled" }, init);
});

/**
 * pt-rate-visit — a patient rates a visit they attended (ADR 0085 §2).
 *
 * Inputs:
 *   - appointment_id   the visit
 *   - stars            1–5
 *   - comment          optional, ≤ 500 characters
 *
 * Flow:
 *   1. The caller must be the appointment's patient.
 *   2. The visit must have happened: `ends_at` in the past and status in
 *      arrived / in_progress / completed. A confirmed visit nobody marked
 *      arrived may not have happened, and a rating of it would be a rating
 *      of nothing — refused with a sentence, not silently stored.
 *   3. Upsert on `appointment_id`: re-rating replaces.
 *   4. Audit + return.
 *
 * This is the ONLY writer of `visit_ratings`; the table has no INSERT
 * policy for authenticated. Every star shown anywhere came through here.
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

const log = makeLogger("pt-rate-visit");

/** The statuses that prove the patient was there. */
const ATTENDED = ["arrived", "in_progress", "completed"] as const;

const InputSchema = z.object({
  appointment_id: z.string().uuid(),
  stars: z.number().int().min(1).max(5),
  comment: z.string().trim().max(500).nullable().optional(),
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

  // 1-2. The visit, and whether it was the caller's and happened.
  const { data: appt, error: apptError } = await sb
    .from("appointments")
    .select("id, patient_user_id, clinician_user_id, hospital_id, status, ends_at")
    .eq("id", input.appointment_id)
    .maybeSingle();
  if (apptError) return serverError(apptError.message, init);
  if (!appt) return notFound(init, "That visit isn't on your record.");
  if (appt.patient_user_id !== caller.id) {
    return forbidden(init, "You can only rate your own visits.");
  }
  const attended = (ATTENDED as readonly string[]).includes(appt.status);
  const over = new Date(appt.ends_at).getTime() < Date.now();
  if (!attended || !over) {
    return conflict("You can rate a visit once it has happened.", init);
  }

  // 3. One row per visit; a second rating replaces the first.
  const comment = input.comment?.trim() ? input.comment.trim() : null;
  const { data: saved, error: saveError } = await sb
    .from("visit_ratings")
    .upsert(
      {
        appointment_id: appt.id,
        patient_user_id: caller.id,
        clinician_user_id: appt.clinician_user_id,
        hospital_id: appt.hospital_id,
        stars: input.stars,
        comment,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "appointment_id" },
    )
    .select("id, stars")
    .single();
  if (saveError || !saved) {
    log.error("rating upsert failed", { requestId, reason: saveError?.message });
    return serverError("Couldn't save your rating. Try again.", init);
  }

  // 4. Audit — after the write, and a failure here does not undo it: the
  //    rating is the patient's and is already true.
  const { ipAddress, userAgent } = networkContext(request);
  try {
    await recordSaAudit({
      actorId: caller.id,
      action: "rate_visit",
      targetKind: "appointment",
      targetId: appt.id,
      reason: `Patient rated visit ${input.stars}/5.`,
      requestId,
      ipAddress,
      userAgent,
      beforeData: null,
      afterData: { stars: input.stars, has_comment: comment !== null },
    });
  } catch (e) {
    log.warn("sa_audit failed (rating already saved)", { requestId, reason: String(e) });
  }

  log.info("visit rated", { requestId, appointment_id: appt.id, stars: input.stars });
  return ok({ rating_id: saved.id, stars: saved.stars }, init);
});

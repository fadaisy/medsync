/**
 * pt-request-same-day — "be seen today": the patient-callable same-day path
 * (PRD MS-PRD-SYM-001 §7 U outcome; ADR 0098 ruling 6).
 *
 * Until this function the urgent-slot search belonged to the monitoring
 * engine alone (`system-propose-urgent-appointment`, 7 days out, `origin
 * 'system_urgent'`). Here the SAME search (`_shared/urgent-slot.ts`) runs
 * over one window — now until the end of the hospital's civil day — and the
 * SAME booking core writes the row, with the two differences the ruling
 * names: `priority 'urgent'` and `symptom_tier` on the appointment.
 * `reason` is `new_concern`: `urgent_review` stays system-only (the
 * `origin='patient'` CHECK is the backstop).
 *
 * The door is a symptom report the caller made (`pt-submit-symptoms`) whose
 * tier is U — or E, once the interrupt was declined (`pt-emergency-event`)
 * and the patient still wants a clinic today. R has no same-day door: that
 * is "book a visit". No slot today is a 404 with its own code so the client
 * can offer today's queue (`pt-declare-intake`) rather than an error.
 *
 * Widening: the caller's chosen department first, else the department whose
 * name matches the report's service-line hint, else every clinical
 * affiliation at the hospital — navigation, not routing (§2 non-goals): the
 * words the clinic reads are the catalog's lay labels, unchanged.
 */

import type { SubmissionAudience, Tier } from "../_shared/symptom-catalog/types.ts";
import { z } from "npm:zod@4.4.3";

import { getCaller, serviceClient } from "../_shared/auth.ts";
import { bookAppointment, bookingResponse } from "../_shared/book.ts";
import { corsHeaders, preflight } from "../_shared/cors.ts";
import {
  badRequest,
  conflict,
  methodNotAllowed,
  notFound,
  serverError,
  unauthorized,
} from "../_shared/errors.ts";
import { makeLogger } from "../_shared/logger.ts";
import { networkContext, recordSaAudit } from "../_shared/sa-audit.ts";
import { DEFAULT_TIME_ZONE, endOfLocalDay } from "../_shared/slots.ts";
import { submissionSymptoms } from "../_shared/submission-symptoms.ts";
import { CATALOG, classify } from "../_shared/symptom-catalog/index.ts";
import { findCandidates, findEarliestSlot } from "../_shared/urgent-slot.ts";

const log = makeLogger("pt-request-same-day");

/** "Today" — never further; the horizon the core enforces on top of the window. */
const SAME_DAY_HORIZON_DAYS = 1;
/** ADR 0088: the standard patient rate limit, shared with the ordinary booking path. */
const RATE_LIMIT_PER_HOUR = 5;

const InputSchema = z.object({
  hospital_id: z.string().uuid(),
  submission_id: z.string().uuid(),
  department_id: z.string().uuid().optional(),
  /** As in pt-request-appointment: opaque, compared for equality only. */
  idempotency_key: z.string().min(16).max(128),
});

interface SubmissionRow {
  id: string;
  patient_user_id: string | null;
  audience: SubmissionAudience;
  items: unknown;
  qualifiers: unknown;
  computed_tier: Tier;
  outcome: string;
  appointment_id: string | null;
  channel: "web" | "app" | "desk";
}

/** 404 with its own code — the client's cue to offer today's queue, not an error. */
function noSameDaySlot(init: { origin: string | null; requestId: string }): Response {
  return new Response(
    JSON.stringify({
      ok: false,
      error: {
        code: "no_same_day_slot",
        message: "No clinic has a slot left today. You can join today's queue instead.",
      },
    }),
    {
      status: 404,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(init.origin),
        "X-Request-Id": init.requestId,
      },
    },
  );
}

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

  // 1. The report must be the caller's own. A row that is someone else's
  //    reads as absent — the id alone must not confirm a report exists.
  const { data: subRow, error: subError } = await sb
    .from("symptom_submissions")
    .select(
      "id, patient_user_id, audience, items, qualifiers, computed_tier, outcome, appointment_id, channel",
    )
    .eq("id", input.submission_id)
    .maybeSingle();
  if (subError) return serverError(subError.message, init);
  const sub = subRow as SubmissionRow | null;
  if (!sub || sub.patient_user_id !== caller.id) {
    return notFound(init, "That symptom report was not found.");
  }

  // 2. The tier opens or closes this door (ADR 0098 ruling 6).
  const eligible =
    sub.computed_tier === "U" ||
    (sub.computed_tier === "E" && sub.outcome === "emergency_declined");
  if (!eligible) {
    return badRequest(
      sub.computed_tier === "E"
        ? "This report needs emergency help now — use the Emergency sheet."
        : "This report can be booked as an ordinary visit.",
      init,
      { tier: sub.computed_tier },
    );
  }
  if (sub.outcome === "same_day" && sub.appointment_id) {
    return conflict("This report already has a same-day booking.", init, {
      appointment_id: sub.appointment_id,
    });
  }

  // 3. Where to look first. The hint is recomputed from the server's own
  //    package (the same rule as pt-submit-symptoms: never a client's word).
  const items: string[] = Array.isArray(sub.items)
    ? sub.items.filter((k: unknown): k is string => typeof k === "string")
    : [];
  const qualifiers =
    sub.qualifiers && typeof sub.qualifiers === "object" && !Array.isArray(sub.qualifiers)
      ? (sub.qualifiers as Record<string, Record<string, string>>)
      : {};
  const hint = classify({ audience: sub.audience, items, qualifiers }, CATALOG).serviceLineHint;

  let preferredDepartmentId: string | null = input.department_id ?? null;
  if (!preferredDepartmentId && hint) {
    // "diabetes_ncd" → "diabetes": the first word is the one a department is named by.
    const word = hint.split("_")[0] as string;
    const { data: dept } = await sb
      .from("hospital_departments")
      .select("id")
      .eq("hospital_id", input.hospital_id)
      .ilike("name", `%${word}%`)
      .limit(1)
      .maybeSingle();
    preferredDepartmentId = (dept as { id: string } | null)?.id ?? null;
  }

  // 4. The earliest slot before the hospital's day ends — the one search the
  //    monitoring engine runs, bounded to today.
  const now = new Date();
  const candidates = await findCandidates(sb, input.hospital_id, preferredDepartmentId);
  const slot = await findEarliestSlot(
    sb,
    input.hospital_id,
    candidates,
    endOfLocalDay(now, DEFAULT_TIME_ZONE),
    now,
  );

  // 5. Audit FIRST (fail closed), before any row changes — the request and
  //    what the search found. Counts and the tier only, never the words.
  const { ipAddress, userAgent } = networkContext(request);
  try {
    await recordSaAudit({
      actorId: caller.id,
      action: "request_same_day",
      targetKind: "symptom_submission",
      targetId: sub.id,
      reason: slot
        ? `Patient asked to be seen today (tier ${sub.computed_tier}); a slot was found.`
        : `Patient asked to be seen today (tier ${sub.computed_tier}); no slot left today.`,
      requestId,
      ipAddress,
      userAgent,
      beforeData: { outcome: sub.outcome },
      afterData: {
        hospital_id: input.hospital_id,
        tier: sub.computed_tier,
        item_count: items.length,
        preferred_department_id: preferredDepartmentId,
        candidate_count: candidates.length,
        slot_found: slot !== null,
        slot_department_id: slot?.departmentId ?? null,
      },
    });
  } catch (e) {
    log.error("sa_audit failed; aborting", { requestId, reason: String(e) });
    return serverError("audit write failed", init);
  }

  if (!slot) {
    log.info("no same-day slot", {
      requestId,
      submission_id: sub.id,
      candidate_count: candidates.length,
    });
    return noSameDaySlot(init);
  }

  // 6. Book through the ONE writer. Everything a booking needs — replay,
  //    rate limit, slot validation, booking code, receipt, audit — is the
  //    core's; this function only chose the slot.
  const result = await bookAppointment(
    { sb, init, log },
    {
      patient: { userId: caller.id },
      actorId: caller.id,
      origin: "patient",
      channel: sub.channel === "desk" ? "web" : sub.channel,
      hospitalId: input.hospital_id,
      reason: "new_concern",
      note: null,
      symptoms: submissionSymptoms(CATALOG, sub),
      priority: "urgent",
      symptomTier: sub.computed_tier,
      symptomSubmissionId: sub.id,
      idempotencyKey: input.idempotency_key,
      slot: {
        clinician_user_id: slot.clinicianUserId,
        department_id: slot.departmentId,
        starts_at: slot.startsAtIso,
        ends_at: slot.endsAtIso,
        type: "in_person",
      },
      horizonDays: SAME_DAY_HORIZON_DAYS,
      rateLimit: {
        perHour: RATE_LIMIT_PER_HOUR,
        message: "You've asked for several visits in the last hour. Try again later.",
      },
      audit: {
        action: "book_appointment",
        reason: `Patient same-day booking from a tier ${sub.computed_tier} symptom report.`,
        requestId,
        ipAddress,
        userAgent,
      },
    },
  );
  if (!result.ok) return result.response;

  // 7. Link the report to what became of it. The booking stands either way;
  //    a failed link is logged, not surfaced — the patient has their slot.
  const { error: linkError } = await sb
    .from("symptom_submissions")
    .update({ outcome: "same_day", appointment_id: result.row.id })
    .eq("id", sub.id);
  if (linkError) {
    log.warn("submission link failed (booking already made)", {
      requestId,
      submission_id: sub.id,
      appointment_id: result.row.id,
      reason: linkError.message,
    });
  }

  log.info("same-day booked", {
    requestId,
    submission_id: sub.id,
    appointment_id: result.row.id,
    department_id: slot.departmentId,
    replayed: result.replayed,
  });
  return bookingResponse(result, init);
});

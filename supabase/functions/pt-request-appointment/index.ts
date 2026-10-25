/**
 * pt-request-appointment — patient books a visit, in slot or session mode
 * (Gate C, ADR 0088; capacity modes per ADR 0087; household booking per
 * ADR 0089).
 *
 * Input — common:
 *   - hospital_id        any active hospital (ADR 0086)
 *   - reason             one of the 13 Appendix A codes, or "other"
 *   - reason_note        optional patient-supplied context
 *   - symptoms           optional (ADR 0095): what the patient said is
 *                        bothering them, each with a duration — words for
 *                        the clinic, stored as written, never routed on
 *   - idempotency_key    REQUIRED. One per wizard submission, reused across
 *                        retries; a replay returns the row the first attempt
 *                        made, with the same 200 body (Gate A §5.5).
 *   - channel            'web' | 'app' — where the booking came in
 *   - for_provisional_id optional (Gate D): book for a household member —
 *                        a provisional_patients row the caller holds a live
 *                        booking_agents link to. The booking is inserted
 *                        with patient_user_id NULL and created_by = caller;
 *                        a confidential line is refused (PRD §2.9).
 *   and EXACTLY ONE of
 *   - slot: { clinician_user_id, department_id, starts_at, ends_at, type?,
 *             service_line_id? }   — today's path, unchanged behaviour
 *   - session: { session_id }      — a position in a published clinic day
 *
 * Everything after authorisation — replay → patient exists → rate limit
 * (5 per rolling hour → 429) → the mode's own checks → INSERT with a
 * booking code → receipt + reminder rows → audit — is `_shared/book.ts`,
 * shared verbatim with `ha-book-on-behalf`. Read that file for the rules.
 *
 * Boundary rules unchanged from before:
 *   - The patient acts as themselves (caller.id = patient), or as the
 *     booking agent of a household member.
 *   - ADR 0084 §8: a PATIENT may not hold a booking more than 14 days out.
 *     Enforced here and deliberately nowhere else — see the constant.
 */

import { z } from "npm:zod@4.4.3";

import { getCaller, serviceClient } from "../_shared/auth.ts";
import { beyondHorizonMessage, bookAppointment, bookingResponse } from "../_shared/book.ts";
import { PATIENT_BOOKING_HORIZON_DAYS } from "../_shared/booking-horizon.ts";
import { preflight } from "../_shared/cors.ts";
import {
  badRequest,
  conflict,
  forbidden,
  methodNotAllowed,
  notFound,
  serverError,
  unauthorized,
} from "../_shared/errors.ts";
import { makeLogger } from "../_shared/logger.ts";
import { networkContext } from "../_shared/sa-audit.ts";
import { PATIENT_REASON_CODES } from "../_shared/sessions-sql.ts";
import { submissionSymptoms } from "../_shared/submission-symptoms.ts";
import { CATALOG } from "../_shared/symptom-catalog/catalog.v0.1.ts";
import {
  MAX_QUALIFIER_KEY,
  MAX_QUALIFIER_LABEL,
  MAX_SYMPTOM_LABEL,
  MAX_SYMPTOM_QUALIFIERS,
  MAX_SYMPTOMS,
  SYMPTOM_DURATION_CODES,
} from "../_shared/symptoms.ts";

const log = makeLogger("pt-request-appointment");

/**
 * ADR 0084 §8 — the patient-held booking horizon. 9.1% no-show at 0–2 weeks
 * against 38.3% at 6 months in the resident-clinic arm; 14 is the floor of
 * the measured curve, and our baseline is worse than that study's.
 *
 * A rule, not a promise: the patient surface advertises real availability
 * ("Choose from the days the clinic has open"), never "the next 2 weeks".
 * Applies to both modes — a session is a day the patient holds too.
 */

/** ADR 0088: booking requests per patient per rolling hour before a 429. */
const RATE_LIMIT_PER_HOUR = 5;

const SlotSchema = z.object({
  clinician_user_id: z.string().uuid(),
  department_id: z.string().uuid(),
  starts_at: z.string().datetime({ offset: true }),
  ends_at: z.string().datetime({ offset: true }),
  type: z.enum(["in_person", "virtual"]).default("in_person"),
  /** When the wizard chose a line, its reason list is enforced. The phone's slot path sends none. */
  service_line_id: z.string().uuid().optional(),
});

const SessionSchema = z.object({
  session_id: z.string().uuid(),
});

const InputSchema = z
  .object({
    hospital_id: z.string().uuid(),
    /**
     * Appendix A's 13 plus 'other'. `urgent_review` is system-only (ADR 0084
     * §12 / 0053's CHECK is the backstop); this enum is the message.
     */
    reason: z.enum([...PATIENT_REASON_CODES, "other"]),
    reason_note: z.string().max(500).nullable().optional(),
    symptoms: z
      .array(
        z.object({
          code: z.string().max(64).nullable(),
          label: z.string().trim().min(1).max(MAX_SYMPTOM_LABEL),
          // v2 (ADR 0098 ruling 3): a catalog item carries qualifiers, not a chip.
          duration: z.enum(SYMPTOM_DURATION_CODES).nullable().optional(),
          qualifiers: z
            .array(
              z.object({
                key: z.string().trim().min(1).max(MAX_QUALIFIER_KEY),
                option: z.string().trim().min(1).max(MAX_QUALIFIER_KEY),
                label: z.string().trim().min(1).max(MAX_QUALIFIER_LABEL),
              }),
            )
            .max(MAX_SYMPTOM_QUALIFIERS)
            .optional(),
        }),
      )
      .max(MAX_SYMPTOMS)
      .nullable()
      .optional(),
    /**
     * ADR 0098 / PRD G5: the catalog pre-step's submission. When present the
     * server reads the report and its tier from the row it wrote itself —
     * a client-supplied tier is never trusted — and the descriptive
     * `symptoms` above are ignored in favour of the catalog's own.
     */
    symptom_submission_id: z.string().uuid().optional(),
    /**
     * A uuid from `crypto.randomUUID()` is what both clients send; any opaque
     * 16–128 char string is accepted so a client with no uuid source still
     * gets replay safety. It is only ever compared for equality.
     */
    idempotency_key: z.string().min(16).max(128),
    channel: z.enum(["web", "app"]),
    /** Gate D: a household member (a live booking_agents link is required). */
    for_provisional_id: z.string().uuid().optional(),
    slot: SlotSchema.optional(),
    session: SessionSchema.optional(),
  })
  .refine((i) => (i.slot ? 1 : 0) + (i.session ? 1 : 0) === 1, {
    message: "Send exactly one of `slot` or `session`.",
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

  if (input.slot) {
    if (new Date(input.slot.ends_at) <= new Date(input.slot.starts_at)) {
      return badRequest("ends_at must be > starts_at.", init);
    }
    // Checked before any read: an out-of-range request should cost nothing,
    // and it cannot become in-range further down.
    if (
      new Date(input.slot.starts_at).getTime() >
      Date.now() + PATIENT_BOOKING_HORIZON_DAYS * 86_400_000
    ) {
      return badRequest(beyondHorizonMessage(PATIENT_BOOKING_HORIZON_DAYS), init);
    }
  }

  const caller = await getCaller(request);
  if (!caller) return unauthorized(init);

  const sb = serviceClient();

  // Booking for a household member: the caller must be a patient who holds
  // a LIVE booking_agents link to exactly this provisional record. The
  // core then inserts patient_user_id NULL, created_by = the caller.
  let patient: { userId: string } | { provisionalId: string } = { userId: caller.id };
  if (input.for_provisional_id) {
    const { data: self, error: selfError } = await sb
      .from("patient_profiles")
      .select("id")
      .eq("id", caller.id)
      .maybeSingle();
    if (selfError) return serverError(selfError.message, init);
    if (!self) {
      return forbidden(init, "only patients can request appointments through this surface");
    }
    const { data: link, error: linkError } = await sb
      .from("booking_agents")
      .select("id")
      .eq("agent_user_id", caller.id)
      .eq("provisional_patient_id", input.for_provisional_id)
      .is("revoked_at", null)
      .maybeSingle();
    if (linkError) return serverError(linkError.message, init);
    if (!link) return forbidden(init, "That person is not on your household list.");
    patient = { provisionalId: input.for_provisional_id };
  }

  // The catalog pre-step's report, when there was one: the caller's own row,
  // or a 404 that does not confirm anyone else's exists.
  let symptoms = input.symptoms ?? null;
  let symptomTier: "E" | "U" | "R" | null = null;
  if (input.symptom_submission_id) {
    const { data: subRow, error: subError } = await sb
      .from("symptom_submissions")
      .select("id, patient_user_id, items, qualifiers, computed_tier, outcome")
      .eq("id", input.symptom_submission_id)
      .maybeSingle();
    if (subError) return serverError(subError.message, init);
    const sub = subRow as {
      id: string;
      patient_user_id: string | null;
      items: unknown;
      qualifiers: unknown;
      computed_tier: "E" | "U" | "R";
      outcome: string;
    } | null;
    if (!sub || sub.patient_user_id !== caller.id) {
      return notFound(init, "That report was not found.");
    }
    // An emergency-tier report books only after the interrupt was declined
    // (`pt-emergency-event` → `emergency_declined`) — the same gate as
    // `pt-request-same-day`. A client that skipped the interrupt gets a 409.
    if (sub.computed_tier === "E" && sub.outcome !== "emergency_declined") {
      return conflict("This report needs the Emergency sheet first.", init, {
        tier: sub.computed_tier,
      });
    }
    symptoms = submissionSymptoms(CATALOG, sub);
    symptomTier = sub.computed_tier;
  }

  const { ipAddress, userAgent } = networkContext(request);
  const result = await bookAppointment(
    { sb, init, log },
    {
      patient,
      actorId: caller.id,
      origin: "patient",
      channel: input.channel,
      hospitalId: input.hospital_id,
      reason: input.reason,
      note: input.reason_note ?? null,
      symptoms,
      symptomTier,
      symptomSubmissionId: input.symptom_submission_id ?? null,
      idempotencyKey: input.idempotency_key,
      slot: input.slot,
      session: input.session ? { sessionId: input.session.session_id } : undefined,
      horizonDays: PATIENT_BOOKING_HORIZON_DAYS,
      rateLimit: {
        perHour: RATE_LIMIT_PER_HOUR,
        message: "You've asked for several visits in the last hour. Try again later.",
      },
      audit: {
        action: "book_appointment",
        reason: input.reason_note?.trim()
          ? `${input.for_provisional_id ? "Agent booked for a household member" : "Patient self-booked"}: ${input.reason_note.slice(0, 200)}`
          : `${input.for_provisional_id ? "Agent booked for a household member" : "Patient self-booked"} (${input.reason}).`,
        requestId,
        ipAddress,
        userAgent,
      },
    },
  );
  if (result.ok && input.symptom_submission_id) {
    // The link back is a second write; a failure leaves the booking whole.
    const { error: linkError } = await sb
      .from("symptom_submissions")
      .update({ outcome: "booked", appointment_id: result.row.id })
      .eq("id", input.symptom_submission_id)
      .eq("patient_user_id", caller.id);
    if (linkError) log.warn("submission link failed", { requestId, reason: linkError.message });
  }
  return bookingResponse(result, init);
});

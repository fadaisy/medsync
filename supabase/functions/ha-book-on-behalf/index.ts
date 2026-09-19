/**
 * ha-book-on-behalf — the desk books a visit for a caller or a walk-in
 * (Gate D, ADR 0089; PRD §3.4 "Book on behalf: audited, patient notified").
 *
 * Auth: superadmin, a hospital_admin of the hospital, or any active staff
 * affiliation at it — reception, nurse, clinician (`authoriseAtHospital`).
 *
 * Input:
 *   - hospital_id, idempotency_key (16–128 chars, one per submission),
 *     channel 'desk', reason (Appendix A's 13 + 'other'), note?
 *   - EXACTLY ONE of slot { … } | session { session_id }  — as pt-request-appointment
 *   - EXACTLY ONE of
 *       patient_user_id            an existing patient account
 *       provisional {              a caller with no account (PRD §2.8):
 *         declared_name,             1–120 chars
 *         phone_e164,                Uganda E.164, the shape 0053 checks
 *         date_of_birth? | age_years?,  at least one
 *         phone_verified: false      the desk cannot verify a phone; always false
 *       }
 *
 * Adults only (Gate H ruling, ADR 0094): a provisional caller whose stated
 * age, or whose date of birth on today's date in the hospital's zone, is
 * under 18 is refused with the one sentence the desk form already shows —
 * the server, not just the client. The same numbers pt-add-household-member
 * applies to a household member.
 *
 * A provisional caller becomes ONE `provisional_patients` row — name and
 * phone AES-256-GCM (`_shared/encryption.ts`, the same wire format the Next
 * side reads), `phone_hmac` the blind index — created by this desk user at
 * this hospital, and the booking names it (`provisional_patient_id`,
 * `patient_user_id` NULL). Nothing here touches the MPI: the desk reconciles
 * on arrival through ha-reconcile-identity. The receipt SMS goes to the
 * provisional phone via the ordinary dispatcher.
 *
 * Everything after authorisation is `_shared/book.ts`, shared with
 * pt-request-appointment: replay → exists → rate limit (60 per desk user
 * per rolling hour) → the mode → INSERT + code → receipt + reminders →
 * audit `book_on_behalf`. No booking horizon for the desk.
 *
 * Response: Gate C's body + `provisional_patient_id` (null for an account).
 */

import { z } from "npm:zod@4.4.3";

import { getCaller, serviceClient } from "../_shared/auth.ts";
import {
  bookAppointment,
  bookingResponse,
  findReplay,
  toBookingResponse,
} from "../_shared/book.ts";
import { preflight } from "../_shared/cors.ts";
import { blindIndex, encrypt } from "../_shared/encryption.ts";
import {
  badRequest,
  forbidden,
  methodNotAllowed,
  ok,
  serverError,
  unauthorized,
} from "../_shared/errors.ts";
import { authoriseAtHospital } from "../_shared/hospital-admin-scope.ts";
import { makeLogger } from "../_shared/logger.ts";
import { networkContext } from "../_shared/sa-audit.ts";
import { PATIENT_REASON_CODES } from "../_shared/sessions-sql.ts";
import { DEFAULT_TIME_ZONE, localDateKey } from "../_shared/slots.ts";

const log = makeLogger("ha-book-on-behalf");

/** Bookings one desk user may make per rolling hour before a 429. */
const RATE_LIMIT_PER_HOUR = 60;

const MINOR_REFUSAL = "Booking for a child is not available yet.";
const ADULT_YEARS = 18;

/** Whole years from one YYYY-MM-DD to another — the birthday not yet reached this year does not count. */
function yearsBetween(dob: string, today: string): number {
  const years = Number(today.slice(0, 4)) - Number(dob.slice(0, 4));
  return today.slice(5) < dob.slice(5) ? years - 1 : years;
}

/** The Ugandan E.164 shape migration 0053 checks on hospitals.emergency_phone. */
const UG_E164 = /^[+]2567[0-9]{8}$|^[+]256[23489][0-9]{7,8}$/;

const SlotSchema = z.object({
  clinician_user_id: z.string().uuid(),
  department_id: z.string().uuid(),
  starts_at: z.string().datetime({ offset: true }),
  ends_at: z.string().datetime({ offset: true }),
  type: z.enum(["in_person", "virtual"]).default("in_person"),
  service_line_id: z.string().uuid().optional(),
});

const ProvisionalSchema = z
  .object({
    declared_name: z.string().trim().min(1).max(120),
    phone_e164: z
      .string()
      .trim()
      .regex(
        UG_E164,
        "Enter the number in full international form with no spaces, e.g. +256XXXXXXXXX.",
      ),
    date_of_birth: z.string().date().optional(),
    age_years: z.number().int().min(0).max(130).optional(),
    /** The desk cannot verify a phone; the value is accepted only as false. */
    phone_verified: z.literal(false),
  })
  .refine((p) => p.date_of_birth !== undefined || p.age_years !== undefined, {
    message: "Give a date of birth or an age.",
  });

const InputSchema = z
  .object({
    hospital_id: z.string().uuid(),
    idempotency_key: z.string().min(16).max(128),
    channel: z.literal("desk"),
    reason: z.enum([...PATIENT_REASON_CODES, "other"]),
    note: z.string().max(500).nullable().optional(),
    slot: SlotSchema.optional(),
    session: z.object({ session_id: z.string().uuid() }).optional(),
    patient_user_id: z.string().uuid().optional(),
    provisional: ProvisionalSchema.optional(),
  })
  .refine((i) => (i.slot ? 1 : 0) + (i.session ? 1 : 0) === 1, {
    message: "Send exactly one of `slot` or `session`.",
  })
  .refine((i) => (i.patient_user_id ? 1 : 0) + (i.provisional ? 1 : 0) === 1, {
    message: "Send exactly one of `patient_user_id` or `provisional`.",
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

  // Adults only: EVERY number given must clear 18 — the typed age and the
  // date of birth against today in the hospital's zone. "Age 18" beside a
  // 2015 birthday is a child with a typo, and a child is refused.
  if (input.provisional) {
    const today = localDateKey(new Date(), DEFAULT_TIME_ZONE);
    const statedAges = [
      input.provisional.age_years,
      input.provisional.date_of_birth
        ? yearsBetween(input.provisional.date_of_birth, today)
        : undefined,
    ].filter((n): n is number => n !== undefined);
    const statedAge = Math.min(...statedAges);
    if (statedAge < ADULT_YEARS) return badRequest(MINOR_REFUSAL, init);
  }

  const caller = await getCaller(request);
  if (!caller) return unauthorized(init);

  const authError = await authoriseAtHospital(caller.id, input.hospital_id);
  if (authError) return forbidden(init, authError);

  const sb = serviceClient();

  // A retry must not mint a second provisional row: ask the core first.
  const prior = await findReplay(sb, caller.id, input.idempotency_key);
  if (prior) return ok(toBookingResponse(prior), init);

  let patient: { userId: string } | { provisionalId: string };
  if (input.patient_user_id) {
    patient = { userId: input.patient_user_id };
  } else {
    const p = input.provisional as z.infer<typeof ProvisionalSchema>;
    const phiKey = Deno.env.get("MEDSYNC_PHI_KEY");
    let row: Record<string, unknown>;
    try {
      row = {
        hospital_id: input.hospital_id,
        declared_name_encrypted: await encrypt(p.declared_name, phiKey as string),
        phone_encrypted: await encrypt(p.phone_e164, phiKey as string),
        phone_hmac: await blindIndex(p.phone_e164, phiKey as string),
        date_of_birth: p.date_of_birth ?? null,
        age_years: p.age_years ?? null,
        phone_verified_at: null,
        created_by_user_id: caller.id,
      };
    } catch (e) {
      // A key problem, never a data one: nothing about the caller is logged.
      log.error("encryption unavailable", { requestId, reason: String(e) });
      return serverError("MEDSYNC_PHI_KEY is not configured for Functions.", init);
    }
    const { data: prov, error: provError } = await sb
      .from("provisional_patients")
      .insert(row)
      .select("id")
      .single();
    if (provError || !prov) {
      log.error("provisional insert failed", { requestId, reason: provError?.message });
      return serverError("could not create the caller's record", init);
    }
    patient = { provisionalId: prov.id as string };
  }

  const { ipAddress, userAgent } = networkContext(request);
  const result = await bookAppointment(
    { sb, init, log },
    {
      patient,
      actorId: caller.id,
      origin: "reception",
      channel: "desk",
      hospitalId: input.hospital_id,
      reason: input.reason,
      note: input.note ?? null,
      idempotencyKey: input.idempotency_key,
      slot: input.slot,
      session: input.session ? { sessionId: input.session.session_id } : undefined,
      horizonDays: null,
      rateLimit: {
        perHour: RATE_LIMIT_PER_HOUR,
        message: "This desk has made many bookings in the last hour. Try again shortly.",
      },
      audit: {
        action: "book_on_behalf",
        reason: input.note?.trim()
          ? `Desk booked on behalf: ${input.note.slice(0, 200)}`
          : `Desk booked on behalf (${input.reason}).`,
        requestId,
        ipAddress,
        userAgent,
      },
    },
  );

  // A provisional row minted for a booking that did not happen is noise for
  // the desk's reconciliation list; it holds no booking, so it can go.
  if (!result.ok && "provisionalId" in patient) {
    const { error } = await sb
      .from("provisional_patients")
      .delete()
      .eq("id", patient.provisionalId);
    if (error) log.warn("orphan provisional not removed (sweeper will)", { requestId });
  }
  return bookingResponse(result, init);
});

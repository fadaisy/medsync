/**
 * system-ussd-book — a USSD caller books a visit (Gate F, ADR 0091; PRD
 * §3.2 journey 2, §2.8). Service-role only: the `/api/ussd` route calls it
 * with the project's service-role key; a user JWT is refused.
 *
 * Inputs:
 *   - phone_e164        the carrier-verified caller (Africa's Talking's phoneNumber)
 *   - declared_name     what the caller typed
 *   - age_years | date_of_birth   one of the two (provisional_patients CHECK)
 *   - hospital_id, service_line_id
 *   - session_id | slot { clinician_user_id, department_id, starts_at, ends_at }
 *   - idempotency_key   the USSD session id — a replayed callback books nothing twice
 *
 * Identity (C4, PRD §2.8): the booking is for a PROVISIONAL patient, minted
 * here with `phone_verified_at = now()` (the carrier verified it). An
 * existing unreconciled/confirmed provisional for the same phone at the same
 * hospital, still inside its expiry, is REUSED so the desk sees one record
 * per caller, not one per call. NEVER linked to a patient_profiles row —
 * even when the phone matches one; reception reconciles at the desk.
 *
 * The reason: USSD asks none (the menu is six levels). The line's first
 * Appendix A reason code stands — an administrative word the desk can
 * change; PRD §7.2 rule 1 is untouched (no clinical question anywhere).
 *
 * Booking goes THROUGH THE CORE (`bookAppointment`, origin 'ussd', channel
 * 'ussd'): the same checks, code, window and dispatch rows as the app. The
 * core's per-actor rate limit is left wide (the system actor books for
 * every caller); the per-PHONE limit is the route's, on `ussd_sessions`.
 */
import { z } from "npm:zod@4.4.3";

import { serviceClient } from "../_shared/auth.ts";
import { bookAppointment, bookingResponse, findReplay } from "../_shared/book.ts";
import { preflight } from "../_shared/cors.ts";
import { blindIndex, encrypt } from "../_shared/encryption.ts";
import {
  badRequest,
  methodNotAllowed,
  notFound,
  ok,
  serverError,
  unauthorized,
} from "../_shared/errors.ts";
import { makeLogger } from "../_shared/logger.ts";
import { networkContext } from "../_shared/sa-audit.ts";
import { DEFAULT_TIME_ZONE, localDateKey } from "../_shared/slots.ts";
import { isServiceRoleCall, systemActorId } from "../_shared/system-actor.ts";

const log = makeLogger("system-ussd-book");

const PHONE_E164_UG = /^\+2567\d{8}$|^\+256[23489]\d{7,8}$/;

/** The desk's refusal (ha-book-on-behalf), repeated here: a feature phone is a desk with no clerk. */
const MINOR_REFUSAL = "Booking for a child is not available yet.";
const ADULT_YEARS = 18;

/** Whole years from one YYYY-MM-DD to another — the birthday not yet reached this year does not count. */
function yearsBetween(dob: string, today: string): number {
  const years = Number(today.slice(0, 4)) - Number(dob.slice(0, 4));
  return today.slice(5) < dob.slice(5) ? years - 1 : years;
}

const InputSchema = z
  .object({
    phone_e164: z.string().regex(PHONE_E164_UG),
    declared_name: z.string().trim().min(2).max(80),
    age_years: z.number().int().min(0).max(130).optional(),
    date_of_birth: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    hospital_id: z.string().uuid(),
    service_line_id: z.string().uuid(),
    session_id: z.string().uuid().optional(),
    slot: z
      .object({
        clinician_user_id: z.string().uuid(),
        department_id: z.string().uuid(),
        starts_at: z.string().datetime({ offset: true }),
        ends_at: z.string().datetime({ offset: true }),
      })
      .optional(),
    idempotency_key: z.string().min(8).max(120),
  })
  .refine((i) => (i.session_id ? 1 : 0) + (i.slot ? 1 : 0) === 1, {
    message: "Send exactly one of session_id or slot.",
  })
  .refine((i) => i.age_years !== undefined || i.date_of_birth !== undefined, {
    message: "Send age_years or date_of_birth.",
  });

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

  // Adults only (ADR 0094 ruling 3, as on the desk): every number given must
  // clear 18, in the hospital's zone. The sentence fits a USSD END screen.
  const today = localDateKey(new Date(), DEFAULT_TIME_ZONE);
  const statedAges = [
    input.age_years,
    input.date_of_birth ? yearsBetween(input.date_of_birth, today) : undefined,
  ].filter((n): n is number => n !== undefined);
  if (statedAges.length > 0 && Math.min(...statedAges) < ADULT_YEARS) {
    return badRequest(MINOR_REFUSAL, init);
  }

  const sb = serviceClient();

  // A replayed callback answers with the booking it already made.
  const prior = await findReplay(sb, actorId, input.idempotency_key);
  if (prior) return bookingResponse({ ok: true, row: prior, replayed: true }, init);

  const { data: line } = await sb
    .from("service_lines")
    .select("id, hospital_id, reason_codes, active")
    .eq("id", input.service_line_id)
    .eq("hospital_id", input.hospital_id)
    .eq("active", true)
    .maybeSingle();
  if (!line) return notFound(init, "That clinic is not open for booking.");
  const reason = (line.reason_codes as string[])[0] ?? "other";

  const phiKey = Deno.env.get("MEDSYNC_PHI_KEY");
  let phoneHmac: string;
  let phoneEncrypted: string;
  let nameEncrypted: string;
  try {
    phoneHmac = await blindIndex(input.phone_e164, phiKey as string);
    phoneEncrypted = await encrypt(input.phone_e164, phiKey as string);
    nameEncrypted = await encrypt(input.declared_name, phiKey as string);
  } catch (e) {
    log.error("encryption unavailable", { requestId, reason: String(e) });
    return serverError("MEDSYNC_PHI_KEY is not configured for Functions.", init);
  }

  // Reuse this phone's live provisional at this hospital; else mint one.
  const { data: existing } = await sb
    .from("provisional_patients")
    .select("id")
    .eq("hospital_id", input.hospital_id)
    .eq("phone_hmac", phoneHmac)
    .in("reconciliation_state", ["unreconciled", "confirmed"])
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  let provisionalId = existing?.id as string | undefined;
  let minted = false;
  if (!provisionalId) {
    const { data: prov, error: provError } = await sb
      .from("provisional_patients")
      .insert({
        hospital_id: input.hospital_id,
        declared_name_encrypted: nameEncrypted,
        phone_encrypted: phoneEncrypted,
        phone_hmac: phoneHmac,
        date_of_birth: input.date_of_birth ?? null,
        age_years: input.age_years ?? null,
        // Carrier-verified: the call came from this number.
        phone_verified_at: new Date().toISOString(),
        created_by_user_id: actorId,
      })
      .select("id")
      .single();
    if (provError || !prov) {
      log.error("provisional insert failed", { requestId, reason: provError?.message });
      return serverError("could not create the caller's record", init);
    }
    provisionalId = prov.id as string;
    minted = true;
  }

  const { ipAddress, userAgent } = networkContext(request);
  const result = await bookAppointment(
    { sb, init, log },
    {
      patient: { provisionalId },
      actorId,
      origin: "ussd",
      channel: "ussd",
      hospitalId: input.hospital_id,
      reason,
      note: null,
      idempotencyKey: input.idempotency_key,
      ...(input.session_id
        ? { session: { sessionId: input.session_id } }
        : {
            slot: {
              ...(input.slot as NonNullable<typeof input.slot>),
              type: "in_person" as const,
              service_line_id: input.service_line_id,
            },
          }),
      // The 14-day horizon is the menu's (it only lists the next 14 days).
      horizonDays: 14,
      // ponytail: the system actor books for every USSD caller, so the core's
      // per-actor limit cannot be the per-phone one — that lives on
      // ussd_sessions in the route. Ceiling: a burst that exhausts this before
      // the route's own gate; upgrade path: a per-phone count here too.
      rateLimit: { perHour: 5_000, message: "MedSync is busy. Try again in a moment." },
      audit: {
        action: "book_appointment",
        reason: "booked by USSD",
        requestId,
        ipAddress,
        userAgent,
      },
    },
  );

  if (!result.ok && minted) {
    // A provisional minted for a booking that failed is deleted again.
    await sb.from("provisional_patients").delete().eq("id", provisionalId);
  }
  if (!result.ok) return result.response;
  return ok(
    {
      appointment_id: result.row.id,
      status: result.row.status,
      booking_code: result.row.booking_code,
      position_number: result.row.position_number,
      arrival_window_start: result.row.arrival_window_start,
      arrival_window_end: result.row.arrival_window_end,
      provisional_patient_id: provisionalId,
      replayed: result.replayed,
    },
    init,
  );
});

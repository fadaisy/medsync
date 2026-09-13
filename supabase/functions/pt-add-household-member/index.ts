/**
 * pt-add-household-member — a patient adds someone they book for
 * (Gate D, ADR 0089; PRD §2.9 "one account, many patients").
 *
 * Auth: the caller must be a patient (a patient_profiles row). Adults only
 * at this gate (Part 8 #12 is unruled): `declared_adult` must be true AND
 * the given age / date of birth must not say otherwise — a minor is refused
 * with "Booking for a child is not available yet."
 *
 * Input: { member_label, phone_e164, date_of_birth? | age_years?, declared_adult, relationship }
 *   member_label   1–80 chars — the name the agent uses for this person; the
 *                  household list shows it. Also the encrypted declared name.
 *   phone_e164     Uganda E.164 (the 0053 shape) — the member's own phone; a
 *                  confidential line's receipt goes there, never to the agent.
 *   relationship   'parent' | 'guardian' | 'child' | 'spouse' | 'relative' | 'vht' | 'other'
 *
 * Creates ONE provisional_patients row (name + phone AES-256-GCM via
 * `_shared/encryption.ts`, `phone_hmac` the blind index, hospital_id NULL —
 * a household member is not at any facility until booked, created_by = the
 * caller) and ONE booking_agents row linking the caller to it. Nothing here
 * touches the MPI or any clinical record. Audit `add_booking_agent`.
 *
 * Response: { booking_agent_id, provisional_patient_id, member_label, relationship, consent_basis }
 */

import { z } from "npm:zod@4.4.3";

import { getCaller, serviceClient } from "../_shared/auth.ts";
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
import { makeLogger } from "../_shared/logger.ts";
import { networkContext, recordSaAudit } from "../_shared/sa-audit.ts";

const log = makeLogger("pt-add-household-member");

const MINOR_REFUSAL = "Booking for a child is not available yet.";
/** Live household members one account may hold. */
const MAX_LIVE_MEMBERS = 20;
const ADULT_YEARS = 18;

/** The Ugandan E.164 shape migration 0053 checks on hospitals.emergency_phone. */
const UG_E164 = /^[+]2567[0-9]{8}$|^[+]256[23489][0-9]{7,8}$/;

const InputSchema = z
  .object({
    member_label: z.string().trim().min(1).max(80),
    phone_e164: z
      .string()
      .trim()
      .regex(
        UG_E164,
        "Enter the number in full international form with no spaces, e.g. +256XXXXXXXXX.",
      ),
    date_of_birth: z.string().date().optional(),
    age_years: z.number().int().min(0).max(130).optional(),
    declared_adult: z.boolean(),
    relationship: z.enum(["parent", "guardian", "child", "spouse", "relative", "vht", "other"]),
  })
  .refine((p) => p.date_of_birth !== undefined || p.age_years !== undefined, {
    message: "Give a date of birth or an age.",
  });

/** Whole years between a YYYY-MM-DD and today, in the only zone we serve. */
function yearsSince(isoDate: string, now = new Date()): number {
  const [y, m, d] = isoDate.split("-").map(Number) as [number, number, number];
  let years = now.getUTCFullYear() - y;
  const beforeBirthday =
    now.getUTCMonth() + 1 < m || (now.getUTCMonth() + 1 === m && now.getUTCDate() < d);
  if (beforeBirthday) years -= 1;
  return years;
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

  // Adults only: the declaration AND the numbers must agree.
  const statedAge =
    input.age_years ?? (input.date_of_birth ? yearsSince(input.date_of_birth) : null);
  if (!input.declared_adult || (statedAge !== null && statedAge < ADULT_YEARS)) {
    return badRequest(MINOR_REFUSAL, init);
  }

  const caller = await getCaller(request);
  if (!caller) return unauthorized(init);

  const sb = serviceClient();
  const { data: self, error: selfError } = await sb
    .from("patient_profiles")
    .select("id")
    .eq("id", caller.id)
    .maybeSingle();
  if (selfError) return serverError(selfError.message, init);
  if (!self) return forbidden(init, "only patients can hold a household list");

  // ponytail: a flat cap on live members is the whole abuse guard — each
  // member is an encrypted row a sweeper never touches (it holds a live
  // link). A per-hour rate limit can replace it if the cap ever binds.
  const { count: live, error: countError } = await sb
    .from("booking_agents")
    .select("id", { count: "exact", head: true })
    .eq("agent_user_id", caller.id)
    .is("revoked_at", null);
  if (countError) return serverError(countError.message, init);
  if ((live ?? 0) >= MAX_LIVE_MEMBERS) {
    return badRequest("Your household list is full.", init);
  }

  const phiKey = Deno.env.get("MEDSYNC_PHI_KEY");
  let row: Record<string, unknown>;
  try {
    row = {
      hospital_id: null,
      declared_name_encrypted: await encrypt(input.member_label, phiKey as string),
      phone_encrypted: await encrypt(input.phone_e164, phiKey as string),
      phone_hmac: await blindIndex(input.phone_e164, phiKey as string),
      date_of_birth: input.date_of_birth ?? null,
      age_years: input.age_years ?? null,
      phone_verified_at: null,
      created_by_user_id: caller.id,
    };
  } catch (e) {
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
    return serverError("could not create the member's record", init);
  }

  const { data: link, error: linkError } = await sb
    .from("booking_agents")
    .insert({
      agent_user_id: caller.id,
      provisional_patient_id: prov.id,
      member_label: input.member_label,
      relationship: input.relationship,
      consent_basis: "agent_declared",
      declared_adult: true,
    })
    .select("id, consent_basis")
    .single();
  if (linkError || !link) {
    // Leave no half-member behind; the row holds no booking.
    await sb.from("provisional_patients").delete().eq("id", prov.id);
    log.error("booking_agents insert failed", { requestId, reason: linkError?.message });
    return serverError("could not add the member", init);
  }

  const { ipAddress, userAgent } = networkContext(request);
  try {
    await recordSaAudit({
      actorId: caller.id,
      action: "add_booking_agent",
      targetKind: "booking_agent",
      targetId: link.id,
      reason: `Patient added a household member (${input.relationship}).`,
      requestId,
      ipAddress,
      userAgent,
      beforeData: null,
      afterData: {
        provisional_patient_id: prov.id,
        relationship: input.relationship,
        consent_basis: link.consent_basis,
        declared_adult: true,
      },
    });
  } catch (e) {
    log.warn("sa_audit failed (member already added)", { requestId, reason: String(e) });
  }

  log.info("household member added", { requestId, booking_agent_id: link.id });
  return ok(
    {
      booking_agent_id: link.id,
      provisional_patient_id: prov.id,
      member_label: input.member_label,
      relationship: input.relationship,
      consent_basis: link.consent_basis,
    },
    init,
  );
});

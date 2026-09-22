/**
 * pt-create-pre-arrival — "Tell a hospital I'm coming" (PRD MS-PRD-SYM-001
 * §8.3, §8.7, §9.4 `createPreArrival`; ADR 0098 rulings 5, 8 and Gate A
 * item 3).
 *
 * THE CALLER IS OPTIONAL. A bystander must be able to act, so a signed-out
 * request is honoured: the anon key still carries a JWT past the gateway and
 * `getCaller` returns null. Signed-in → `verified = true`; signed-out → the
 * callback number is REQUIRED, the row is `verified = false` (the board shows
 * the badge) and the §8.7 rate limits apply: 3/hour per device and 5/day per
 * phone, counted by blind index — the raw device id and phone never land in
 * a column. No OTP anywhere in this path: friction kills.
 *
 * Hoax downgrade (§8.7): a device or phone hash with HOAX_DOWNGRADE_THRESHOLD
 * rows marked `hoax` inside 24 h is refused with `call_only` — the client
 * keeps the call buttons up and drops the pre-alert. Calling is never blocked.
 *
 * What lands: the `emergency_pre_arrivals` row (PHI columns encrypted: the
 * callback phone and, only on the explicit per-alert toggle, the location),
 * a `pre_arrival_outbox` row for the notifications engine when the facility
 * has an SMS number (nothing ever reports it as sent — §8.6), the submission's
 * outcome flipped to `emergency`, and the audit row FIRST (fail closed) —
 * facility, tier, counts and `verified` only.
 *
 * The reporter token: 32 random bytes, returned ONCE, stored only as a blind
 * index. It is what an unauthenticated reporter uses on E3 to read status,
 * cancel or declare arrival (pt-pre-arrival-status) — a capability, not a
 * session. Nothing in a log line is a phone, a coordinate or the token.
 */

import { z } from "npm:zod@4.4.3";

import { getCaller, serviceClient } from "../_shared/auth.ts";
import { corsHeaders, preflight } from "../_shared/cors.ts";
import { blindIndex, decrypt, encrypt } from "../_shared/encryption.ts";
import {
  badRequest,
  forbidden,
  methodNotAllowed,
  notFound,
  ok,
  serverError,
  tooManyRequests,
} from "../_shared/errors.ts";
import { makeLogger } from "../_shared/logger.ts";
import {
  composeFacilitySms,
  ETA_BANDS,
  HOAX_DOWNGRADE_MS,
  HOAX_DOWNGRADE_THRESHOLD,
  RATE_LIMITS,
  TRANSPORT_MODES,
} from "../_shared/pre-arrival.ts";
import { networkContext, recordSaAudit } from "../_shared/sa-audit.ts";
import { CATALOG, t } from "../_shared/symptom-catalog/index.ts";
import { systemActorId } from "../_shared/system-actor.ts";

const log = makeLogger("pt-create-pre-arrival");

/** E.164 as migration 0053 spells it, or the local 10-digit form a Ugandan types (0XXXXXXXXX). */
const UG_E164 = /^[+]2567[0-9]{8}$|^[+]256[23489][0-9]{7,8}$/;
const UG_LOCAL = /^0[0-9]{9}$/;

/** One phone, one hash: the local form becomes E.164 before it is hashed or stored. */
function normalisePhone(raw: string): string | null {
  const s = raw.replace(/[\s\-()]/g, "");
  if (UG_E164.test(s)) return s;
  if (UG_LOCAL.test(s)) return `+256${s.slice(1)}`;
  return null;
}

const HOUR_MS = 3_600_000;
const EXPIRES_MS = 6 * HOUR_MS;

const InputSchema = z.object({
  facility_id: z.string().uuid(),
  submission_id: z.string().uuid().optional(),
  subject: z.object({
    audience: z.enum(["adult", "child_u2m", "child_2m_5y", "child_5_12", "pregnant"]),
    age_band: z.string().max(32).optional(),
    sex: z.enum(["female", "male", "unknown"]).optional(),
    pregnant: z.boolean().optional(),
  }),
  /** Catalog keys, in the order chosen; empty means "Not sure". */
  red_flags: z.array(z.string().min(1).max(64)).max(12).default([]),
  tier: z.enum(["E", "U", "R"]).default("E"),
  isolation_flag: z.boolean().default(false),
  onset_at: z.string().datetime({ offset: true }).optional(),
  last_known_well_at: z.string().datetime({ offset: true }).optional(),
  transport_mode: z.enum(TRANSPORT_MODES),
  eta_band: z.enum(ETA_BANDS),
  callback_phone: z.string().trim().max(24).optional(),
  /** Only on the explicit per-alert toggle (PRD §8.3 last row; ADR 0098 ruling 9). */
  share_location: z
    .object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })
    .optional(),
  /** A client-generated stable id; hashed before it is counted or stored. */
  device_hash: z.string().min(16).max(128),
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

  // Optional on purpose — see the header. Null is a bystander, not an error.
  const caller = await getCaller(request);
  const verified = !!caller;

  // Unknown keys are refused, not ignored (the board prints their lay labels).
  const known = new Map(CATALOG.items.map((i) => [i.key, i]));
  const unknown = input.red_flags.filter((k) => !known.has(k));
  if (unknown.length) {
    return badRequest("Some danger signs are not in this catalog version.", init, {
      unknown_items: unknown,
      catalog_version: CATALOG.version,
    });
  }

  let callbackPhone = input.callback_phone ? normalisePhone(input.callback_phone) : null;
  if (input.callback_phone && !callbackPhone) {
    return badRequest("Enter a Ugandan number, e.g. 07XXXXXXXX or +2567XXXXXXXX.", init);
  }
  if (!caller && !callbackPhone) {
    return badRequest("A callback number is needed so the hospital can reach you.", init);
  }

  const phiKey = Deno.env.get("MEDSYNC_PHI_KEY");
  if (!phiKey) return serverError("MEDSYNC_PHI_KEY is not configured for Functions.", init);

  const sb = serviceClient();

  // Whose alert: a signed-in patient is the subject when the alert is about
  // themselves (an adult — pregnant or not — with no age band); anyone else signed in is
  // the reporter. "Account phone / entered" (§8.3): the profile's number
  // stands in when none was typed, so the board can always call back.
  let patientUserId: string | null = null;
  let reporterUserId: string | null = null;
  if (caller) {
    const { data: patient } = await sb
      .from("patient_profiles")
      .select("id, phone_encrypted")
      .eq("id", caller.id)
      .maybeSingle();
    if (
      patient &&
      (input.subject.audience === "adult" || input.subject.audience === "pregnant") &&
      !input.subject.age_band
    ) {
      patientUserId = caller.id;
    } else {
      reporterUserId = caller.id;
    }
    if (!callbackPhone && patient?.phone_encrypted) {
      try {
        callbackPhone = normalisePhone(await decrypt(patient.phone_encrypted, phiKey));
      } catch (e) {
        log.warn("account phone unreadable (continuing)", { requestId, reason: String(e) });
      }
    }
  }
  const { data: facility, error: facilityError } = await sb
    .from("hospitals")
    .select(
      "id, name, pre_alert_enabled, emergency_phone, emergency_sms_number, emergency_entrance_directions, ambulance_number",
    )
    .eq("id", input.facility_id)
    .maybeSingle();
  if (facilityError) return serverError(facilityError.message, init);
  if (!facility) return notFound(init, "facility not found");
  if (!facility.pre_alert_enabled) {
    return forbidden(init, "This hospital does not take pre-alerts yet — please call them.");
  }

  // Hashes, never the values (§8.7 "hashes salted, never raw").
  let deviceHash: string;
  let phoneHash: string | null;
  try {
    deviceHash = await blindIndex(input.device_hash, phiKey);
    phoneHash = callbackPhone ? await blindIndex(callbackPhone, phiKey) : null;
  } catch (e) {
    log.error("blind index failed", { requestId, reason: String(e) });
    return serverError("could not process the request", init);
  }

  const now = Date.now();
  const countRows = async (
    column: "device_hash" | "phone_hash",
    hash: string,
    sinceMs: number,
    status?: "hoax",
  ): Promise<number> => {
    // A hoax counts from when the desk marked it (closed_at), a rate-limit
    // row from when it was sent.
    let q = sb
      .from("emergency_pre_arrivals")
      .select("id", { count: "exact", head: true })
      .eq(column, hash)
      .gte(status ? "closed_at" : "created_at", new Date(now - sinceMs).toISOString());
    if (status) q = q.eq("status", status);
    const { count, error } = await q;
    if (error) throw new Error(error.message);
    return count ?? 0;
  };

  try {
    // Hoax downgrade applies to everyone; calling is never blocked (§8.7).
    const hoaxes =
      (await countRows("device_hash", deviceHash, HOAX_DOWNGRADE_MS, "hoax")) +
      (phoneHash ? await countRows("phone_hash", phoneHash, HOAX_DOWNGRADE_MS, "hoax") : 0);
    if (hoaxes >= HOAX_DOWNGRADE_THRESHOLD) {
      log.warn("pre-alert refused: call-only", { requestId, facility_id: facility.id });
      // Not `forbidden()`: the client branches on `call_only` to keep the call
      // buttons and drop the pre-alert form.
      return new Response(
        JSON.stringify({
          ok: false,
          error: { code: "call_only", message: "Please call the hospital directly." },
        }),
        {
          status: 403,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(origin),
            "X-Request-Id": requestId,
          },
        },
      );
    }
    // Rate limits are the unauthenticated floor (§8.7); a signed-in reporter is accountable by id.
    if (!caller) {
      if ((await countRows("device_hash", deviceHash, HOUR_MS)) >= RATE_LIMITS.perDeviceHour) {
        return tooManyRequests(
          "Too many pre-alerts from this device — please call the hospital.",
          init,
        );
      }
      if (
        phoneHash &&
        (await countRows("phone_hash", phoneHash, 24 * HOUR_MS)) >= RATE_LIMITS.perPhoneDay
      ) {
        return tooManyRequests(
          "Too many pre-alerts for this number today — please call the hospital.",
          init,
        );
      }
    }
  } catch (e) {
    log.error("rate-limit read failed", { requestId, reason: String(e) });
    return serverError("could not process the request", init);
  }

  // PHI: encrypt or refuse — never a plaintext fallback.
  let callbackPhoneEnc: string | null = null;
  let locationEnc: string | null = null;
  // Precise location is for dispatch (PRD §8.3): a facility with no ambulance
  // line has nothing to do with it, so it is dropped here whatever the client sent.
  const shareLocation = facility.ambulance_number ? input.share_location : null;
  try {
    if (callbackPhone) callbackPhoneEnc = await encrypt(callbackPhone, phiKey);
    if (shareLocation) locationEnc = await encrypt(JSON.stringify(shareLocation), phiKey);
  } catch (e) {
    log.error("encryption failed", { requestId, reason: String(e) });
    return serverError("could not store the pre-alert", init);
  }

  // The reporter's capability: returned once, stored only as a blind index.
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = btoa(String.fromCharCode(...tokenBytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  let reporterTokenHash: string;
  try {
    reporterTokenHash = await blindIndex(token, phiKey);
  } catch (e) {
    log.error("token hash failed", { requestId, reason: String(e) });
    return serverError("could not store the pre-alert", init);
  }

  const actorId = caller?.id ?? systemActorId();
  if (!actorId) {
    log.error("no audit actor: MEDSYNC_SYSTEM_ACTOR_UUID unset", { requestId });
    return serverError("pre-alert unavailable", init);
  }

  // The catalog report rides along only when THIS caller owns it and it is
  // not yet linked: `submission_id` is client-supplied, and a stranger's row
  // must never be attached to an (unauthenticated) pre-alert, nor its
  // existence confirmed by an FK failure. Submissions always have an owner
  // (`pt-submit-symptoms` requires a session), so no caller → no link.
  let ownedSubmissionId: string | null = null;
  if (input.submission_id && caller) {
    const { data: owned } = await sb
      .from("symptom_submissions")
      .select("id")
      .eq("id", input.submission_id)
      .is("pre_arrival_id", null)
      .or(`patient_user_id.eq.${caller.id},reporter_user_id.eq.${caller.id}`)
      .maybeSingle();
    ownedSubmissionId = (owned as { id: string } | null)?.id ?? null;
  }

  // Audit FIRST (fail closed), on an id minted here. Never a phone or a coordinate.
  const preArrivalId = crypto.randomUUID();
  const { ipAddress, userAgent } = networkContext(request);
  try {
    await recordSaAudit({
      actorId,
      action: "create_pre_arrival",
      targetKind: "emergency_pre_arrival",
      targetId: preArrivalId,
      reason: `Pre-alert (${input.tier}) sent to a facility, ${verified ? "verified" : "unverified"} reporter.`,
      requestId,
      ipAddress,
      userAgent,
      beforeData: null,
      afterData: {
        facility_id: facility.id,
        tier: input.tier,
        red_flag_count: input.red_flags.length,
        isolation_flag: input.isolation_flag,
        verified,
        has_location: locationEnc !== null,
        submission_id: ownedSubmissionId,
      },
    });
  } catch (e) {
    log.error("sa_audit failed; aborting", { requestId, reason: String(e) });
    return serverError("audit write failed", init);
  }

  const expiresAt = new Date(now + EXPIRES_MS).toISOString();
  const { error: insertError } = await sb.from("emergency_pre_arrivals").insert({
    id: preArrivalId,
    facility_id: facility.id,
    submission_id: ownedSubmissionId,
    patient_user_id: patientUserId,
    reporter_user_id: reporterUserId,
    subject_descriptor: {
      audience: input.subject.audience,
      ageBand: input.subject.age_band ?? null,
      sex: input.subject.sex ?? null,
      pregnant: input.subject.pregnant ?? input.subject.audience === "pregnant",
    },
    red_flags: input.red_flags,
    tier: input.tier,
    isolation_flag: input.isolation_flag,
    onset_at: input.onset_at ?? null,
    last_known_well_at: input.last_known_well_at ?? null,
    transport_mode: input.transport_mode,
    eta_band: input.eta_band,
    callback_phone_enc: callbackPhoneEnc,
    location_enc: locationEnc,
    status: "sent",
    verified,
    reporter_token_hash: reporterTokenHash,
    device_hash: deviceHash,
    phone_hash: phoneHash,
    expires_at: expiresAt,
  });
  if (insertError) {
    log.error("pre-arrival insert failed", { requestId, reason: insertError.message });
    return serverError("could not send the pre-alert", init);
  }

  // The same body the patient's own SIM can send (§8.6) and the outbox holds.
  const firstFlag = input.red_flags[0];
  const smsBody = composeFacilitySms({
    tier: input.tier,
    dangerSign: firstFlag ? t(CATALOG, known.get(firstFlag)!.labelKey) : null,
    etaBand: input.eta_band,
    transport: input.transport_mode,
    callback: callbackPhone ?? "the app (no number given)",
  });
  if (facility.emergency_sms_number) {
    // The body names the callback number, so the outbox holds it as
    // ciphertext (same key); the notifications engine decrypts on send. The
    // sweeper drops these rows with the 30-day PHI purge.
    let bodyEnc: string | null = null;
    try {
      bodyEnc = await encrypt(smsBody, phiKey);
    } catch (e) {
      log.warn("outbox body encryption failed (continuing)", { requestId, reason: String(e) });
    }
    const { error: outboxError } = bodyEnc
      ? await sb.from("pre_arrival_outbox").insert({
          pre_arrival_id: preArrivalId,
          facility_id: facility.id,
          channel: "facility_sms",
          body: bodyEnc,
          state: "awaiting_notifications_engine",
        })
      : { error: null };
    // The row itself is the delivery channel (§8.6); the outbox is best-effort.
    if (outboxError)
      log.warn("outbox insert failed (continuing)", { requestId, reason: outboxError.message });
  }

  if (ownedSubmissionId) {
    const { error: subError } = await sb
      .from("symptom_submissions")
      .update({ outcome: "emergency", pre_arrival_id: preArrivalId })
      .eq("id", ownedSubmissionId)
      .is("pre_arrival_id", null);
    if (subError)
      log.warn("submission outcome update failed (continuing)", {
        requestId,
        reason: subError.message,
      });
  }

  log.info("pre-alert sent", {
    requestId,
    pre_arrival_id: preArrivalId,
    facility_id: facility.id,
    tier: input.tier,
    red_flag_count: input.red_flags.length,
    verified,
    has_location: locationEnc !== null,
    outbox: !!facility.emergency_sms_number,
  });
  return ok(
    {
      pre_arrival_id: preArrivalId,
      token,
      status: "sent",
      expires_at: expiresAt,
      facility: {
        name: facility.name,
        emergency_phone: facility.emergency_phone ?? null,
        emergency_sms_number: facility.emergency_sms_number ?? null,
        directions: facility.emergency_entrance_directions ?? null,
      },
      sms_fallback_body: facility.emergency_sms_number ? smsBody : null,
    },
    init,
  );
});

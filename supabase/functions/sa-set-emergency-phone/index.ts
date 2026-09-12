/**
 * sa-set-emergency-phone — records (or clears) hospitals.emergency_phone, the
 * number rendered as the `tel:` link beside "Go to the hospital's emergency
 * entrance" (ADR 0084 §3, column added by migration 0053).
 *
 * Superadmin-only. Audited BEFORE the mutation, so a partial failure leaves a
 * documented intent rather than an unrecorded change.
 *
 * ONE WRITE PATH, CALLABLE AT ANY TIME — deliberately NOT folded into
 * sa-activate-hospital. That function's ACTIVATABLE_FROM set excludes
 * 'active', so a field carried on activation could never reach a hospital
 * that is already live — which is every hospital at the beachhead. Activation
 * is the moment the superadmin is PROMPTED for a number; this is the only
 * place one is stored. Per ADR 0023, one function per action.
 *
 * THE NUMBER MUST HAVE BEEN DIALLED. "Verified" in §3 means a human rang it
 * and the emergency entrance answered — not that it parsed, and never that it
 * was copied from hospital_applications.main_phone, which is a self-asserted
 * switchboard (migration 0053 refuses that backfill in writing: routing
 * someone mid-stroke to an office line that rings 09:00–17:00 is worse than
 * giving them no number at all). Nothing in this function can check that a
 * human dialled it, which is exactly why `reason` is required and audited —
 * the audit row is the only record that anyone did.
 *
 * CLEARING IS ALLOWED (`emergency_phone: null`), and that is a safety
 * requirement rather than a convenience. A number that turns out to be wrong
 * — dead line, reassigned, rings an empty office at 02:00 — must be
 * removable, because §3 makes "destination alone, no number" the correct
 * state whenever no verified number exists. A wrong number on the
 * highest-stakes instruction in the product is not a safe state; no number
 * is. Without an audited clear the only remedies would be leaving the bad
 * number live or a hand-edit that bypasses the audit trail entirely. The
 * CHECK constraint already admits NULL for the same reason.
 *
 * ⚠️ DEPLOY AFTER MIGRATION 0054. That migration widens
 * sa_audit_log_action_check to admit 'set_emergency_phone'; it is GATED, so
 * the owner applies it. Deployed first, recordSaAudit throws, this function
 * returns 500 and NOTHING IS WRITTEN — the audit-first contract failing
 * closed, which is the right direction but an inert button.
 */

import { z } from "npm:zod@4.4.3";

import { getCaller, hasRole, serviceClient } from "../_shared/auth.ts";
import { preflight } from "../_shared/cors.ts";
import {
  badRequest,
  forbidden,
  methodNotAllowed,
  notFound,
  ok,
  serverError,
  unauthorized,
} from "../_shared/errors.ts";
import { makeLogger } from "../_shared/logger.ts";
import { networkContext, recordSaAudit } from "../_shared/sa-audit.ts";

const log = makeLogger("sa-set-emergency-phone");

/**
 * Mirrors `hospitals_emergency_phone_format` (migration 0053) character for
 * character — same [+] / [0-9] spelling, same alternation, same bounds — so a
 * bad number is refused with a sentence here instead of surfacing a raw
 * Postgres constraint violation from the bottom of the stack. If one is ever
 * edited, edit both; the Drizzle mirror in db/schema/hospitals.ts is the third
 * copy and the source of truth for the shape.
 */
const UG_E164 = /^[+]2567[0-9]{8}$|^[+]256[23489][0-9]{7,8}$/;

const InputSchema = z.object({
  hospital_id: z.string().uuid(),
  /** `null` clears the number — see the header. */
  emergency_phone: z
    .string()
    .trim()
    .regex(
      UG_E164,
      "Enter the number in full international form with no spaces, e.g. +256XXXXXXXXX. Send null to remove the number.",
    )
    .nullable(),
  reason: z.string().min(8),
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
  if (!parsed.success) {
    // The format message is the whole point of mirroring the constraint —
    // surface it rather than a generic "Invalid input".
    const first = parsed.error.issues[0]?.message;
    return badRequest(first ?? "Invalid input", init, parsed.error.flatten());
  }
  const input = parsed.data;

  const caller = await getCaller(request);
  if (!caller) return unauthorized(init);
  if (!(await hasRole(caller.id, "superadmin"))) return forbidden(init, "superadmin required");

  const sb = serviceClient();
  const { data: hospital } = await sb
    .from("hospitals")
    .select("id, name, emergency_phone")
    .eq("id", input.hospital_id)
    .maybeSingle();
  if (!hospital) return notFound(init, "hospital not found");

  // No state gate. A number is set at activation *by prompt*, not by coupling,
  // and a hospital already live is the case that most needs one.

  const { ipAddress, userAgent } = networkContext(request);
  try {
    await recordSaAudit({
      actorId: caller.id,
      action: "set_emergency_phone",
      targetKind: "hospital",
      targetId: hospital.id,
      reason: input.reason,
      requestId,
      ipAddress,
      userAgent,
      // The value belongs in the audit row: an institutional emergency line is
      // not patient PII, and "which number did we ship, who verified it, when"
      // is the only question this trail exists to answer.
      beforeData: { emergency_phone: hospital.emergency_phone },
      afterData: { emergency_phone: input.emergency_phone },
    });
  } catch (e) {
    log.error("audit insert failed", { requestId, reason: String(e) });
    return serverError("audit write failed", init);
  }

  const { error } = await sb
    .from("hospitals")
    .update({ emergency_phone: input.emergency_phone })
    .eq("id", hospital.id);
  if (error) {
    log.error("update failed", { requestId, reason: error.message });
    return serverError("update failed", init);
  }

  // Redacted: the number itself never enters the log stream — ids and a
  // boolean only, same as every sibling.
  log.info("emergency phone recorded", {
    requestId,
    hospital_id: hospital.id,
    cleared: input.emergency_phone === null,
  });
  return ok(
    { hospital_id: hospital.id, has_emergency_phone: input.emergency_phone !== null },
    init,
  );
});

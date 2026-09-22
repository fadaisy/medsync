/**
 * sa-verify-emergency-contact — marks an `emergency_contacts` row verified
 * (or back to unverified), and optionally activates/deactivates it (PRD
 * MS-PRD-SYM-001 §9.3 "four-eyes (safety-critical reference data)";
 * migration 0066 §4 + §10; ADR 0098 ruling 8; runbook
 * docs/runbooks/emergency-contacts-verification.md).
 *
 * "VERIFIED" MEANS A HUMAN DIALLED IT and the right service answered. The
 * function cannot check that, which is why `reason` is required and
 * audited and why this is four-eyes-class: the number on the Emergency
 * sheet's primary button is the highest-stakes string in the product, and
 * production renders `verified` rows only (Gate CS).
 *
 * Four-eyes rides the existing wiring. `sa_pending_approvals.action` is
 * CHECKed (migration 0018) and `delete_reference_data` is the only
 * reference-data action it admits, so that key is used with a `payload.intent`
 * of `verify_emergency_contact` (the sa-create-superadmin precedent —
 * `demote_superadmin` for a create). With one real superadmin the request
 * auto-satisfies and executes here; with two or more it waits in
 * `pending_second_approval` for a confirming superadmin's executor.
 *
 * Audited FIRST (fail closed) as `verify_emergency_contact`; the pending row
 * is stamped executed after the UPDATE lands, failed if it does not.
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
import { markFourEyesExecuted, markFourEyesFailed, requestFourEyes } from "../_shared/four-eyes.ts";
import { makeLogger } from "../_shared/logger.ts";
import { networkContext, recordSaAudit } from "../_shared/sa-audit.ts";

const log = makeLogger("sa-verify-emergency-contact");

const InputSchema = z.object({
  contact_id: z.string().uuid(),
  verification_status: z.enum(["verified", "unverified"]),
  active: z.boolean().optional(),
  /** Who dialled it, when, what answered — the only record that anyone did. */
  reason: z.string().trim().min(8).max(500),
});

interface ContactRow {
  id: string;
  key: string;
  number: string | null;
  verification_status: string;
  active: boolean;
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
  if (!(await hasRole(caller.id, "superadmin"))) return forbidden(init, "superadmin required");

  const sb = serviceClient();
  const { data: row, error: rowError } = await sb
    .from("emergency_contacts")
    .select("id, key, number, verification_status, active")
    .eq("id", input.contact_id)
    .maybeSingle();
  if (rowError) return serverError(rowError.message, init);
  const contact = (row as ContactRow | null) ?? null;
  if (!contact) return notFound(init, "emergency contact not found");

  // `emergency_contacts_verified_has_number`: a number nobody can dial cannot be verified.
  if (input.verification_status === "verified" && !contact.number) {
    return badRequest("This contact has no number yet — source it before verifying.", init);
  }

  const nowIso = new Date().toISOString();
  const patch = {
    verification_status: input.verification_status,
    verified_by_user_id: input.verification_status === "verified" ? caller.id : null,
    verified_at: input.verification_status === "verified" ? nowIso : null,
    ...(input.active !== undefined ? { active: input.active } : {}),
  };

  const fe = await requestFourEyes({
    action: "delete_reference_data",
    targetKind: "reference_data",
    targetId: contact.id,
    justification: input.reason,
    requestedBy: caller.id,
    payload: { intent: "verify_emergency_contact", contact_key: contact.key, ...patch },
  });

  const { ipAddress, userAgent } = networkContext(request);
  if (!fe.proceed) {
    await recordSaAudit({
      actorId: caller.id,
      action: "four_eyes_request",
      targetKind: "emergency_contact",
      targetId: contact.id,
      reason: input.reason,
      requestId,
      ipAddress,
      userAgent,
      afterData: { pending_id: fe.pendingId, intent: "verify_emergency_contact", ...patch },
    });
    return ok(
      { contact_id: contact.id, pending_id: fe.pendingId, awaiting_second_approval: true },
      init,
    );
  }

  try {
    await recordSaAudit({
      actorId: caller.id,
      action: "verify_emergency_contact",
      targetKind: "emergency_contact",
      targetId: contact.id,
      reason: input.reason,
      requestId,
      ipAddress,
      userAgent,
      beforeData: { verification_status: contact.verification_status, active: contact.active },
      afterData: { ...patch, pending_id: fe.pendingId, auto_satisfied: true },
    });
  } catch (e) {
    await markFourEyesFailed(fe.pendingId, `audit insert failed: ${String(e)}`);
    log.error("audit insert failed", { requestId, reason: String(e) });
    return serverError("audit write failed", init);
  }

  const { error } = await sb.from("emergency_contacts").update(patch).eq("id", contact.id);
  if (error) {
    await markFourEyesFailed(fe.pendingId, `emergency_contacts update: ${error.message}`);
    log.error("update failed", { requestId, reason: error.message });
    return serverError("update failed", init);
  }
  await markFourEyesExecuted(fe.pendingId);

  log.info("emergency contact verification recorded", {
    requestId,
    contact_id: contact.id,
    contact_key: contact.key,
    verification_status: input.verification_status,
    active: patch.active ?? contact.active,
    pending_id: fe.pendingId,
  });
  return ok(
    {
      contact_id: contact.id,
      verification_status: input.verification_status,
      active: patch.active ?? contact.active,
      pending_id: fe.pendingId,
      auto_satisfied: true,
    },
    init,
  );
});

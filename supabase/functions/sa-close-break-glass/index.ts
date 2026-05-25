/**
 * sa-close-break-glass — manually revokes an active grant.
 *
 * Auto-expiry is handled by `/api/cron/sweep-break-glass`; this
 * function exists so a superadmin can close a grant early once
 * the legitimate work is done (good hygiene: minimise the open
 * window).
 *
 * Only the original actor OR another superadmin can close a grant.
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

const log = makeLogger("sa-close-break-glass");

const InputSchema = z.object({
  grant_id: z.string().uuid(),
  reason: z.string().min(4, "Reason required (e.g. 'work complete')."),
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
  if (!(await hasRole(caller.id, "superadmin"))) return forbidden(init, "superadmin required");

  const sb = serviceClient();
  const { data: grant } = await sb
    .from("sa_break_glass_grants")
    .select("id, actor_id, patient_id, revoked_at, expires_at")
    .eq("id", input.grant_id)
    .maybeSingle();
  if (!grant) return notFound(init, "grant not found");
  if (grant.revoked_at) return badRequest("grant already closed", init);

  const nowIso = new Date().toISOString();
  const { ipAddress, userAgent } = networkContext(request);
  try {
    await recordSaAudit({
      actorId: caller.id,
      action: "break_glass_close",
      targetKind: "break_glass_grant",
      targetId: grant.id,
      reason: input.reason,
      requestId,
      ipAddress,
      userAgent,
      beforeData: { revoked_at: null },
      afterData: { revoked_at: nowIso, revoked_by: caller.id },
    });
  } catch (e) {
    log.error("sa_audit insert failed", { requestId, reason: String(e) });
    return serverError("audit write failed", init);
  }

  const { error } = await sb
    .from("sa_break_glass_grants")
    .update({
      revoked_at: nowIso,
      revoked_by: caller.id,
      revocation_reason: input.reason,
    })
    .eq("id", grant.id);
  if (error) {
    log.error("close failed", { requestId, reason: error.message });
    return serverError("close failed", init);
  }

  log.info("break-glass closed", { requestId, grant_id: grant.id });
  return ok({ grant_id: grant.id, revoked_at: nowIso }, init);
});

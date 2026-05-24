/**
 * sa-reset-user-mfa — un-enrols a user's TOTP factor(s) via Supabase
 * Auth admin API. The user must re-enrol on next login.
 *
 * Used when a user loses their MFA device or the factor is suspected
 * compromised. Superadmin-only, audited.
 */

import { z } from "https://esm.sh/zod@4.4.3";

import { getCaller, hasRole, serviceClient } from "../_shared/auth.ts";
import { preflight } from "../_shared/cors.ts";
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

const log = makeLogger("sa-reset-user-mfa");

const InputSchema = z.object({
  user_id: z.string().uuid(),
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
  if (!parsed.success) return badRequest("Invalid input", init, parsed.error.flatten());
  const input = parsed.data;

  const caller = await getCaller(request);
  if (!caller) return unauthorized(init);
  if (!(await hasRole(caller.id, "superadmin"))) return forbidden(init, "superadmin required");

  const sb = serviceClient();
  const { ipAddress, userAgent } = networkContext(request);
  try {
    await recordSaAudit({
      actorId: caller.id,
      action: "reset_user_mfa",
      targetKind: "user",
      targetId: input.user_id,
      reason: input.reason,
      requestId,
      ipAddress,
      userAgent,
    });
  } catch (e) {
    log.error("audit insert failed", { requestId, reason: String(e) });
    return serverError("audit write failed", init);
  }

  // List then unenrol every factor on the user.
  const { data: factors, error: listErr } = await sb.auth.admin.mfa.listFactors({
    userId: input.user_id,
  });
  if (listErr) {
    log.error("list factors failed", { requestId, reason: listErr.message });
    return serverError("list factors failed", init);
  }
  const removed: string[] = [];
  for (const f of factors?.factors ?? []) {
    const { error: delErr } = await sb.auth.admin.mfa.deleteFactor({
      userId: input.user_id,
      id: f.id,
    });
    if (delErr) {
      log.warn("delete factor failed", { requestId, factor_id: f.id, reason: delErr.message });
      continue;
    }
    removed.push(f.id);
  }

  log.info("mfa reset", { requestId, user_id: input.user_id, removed: removed.length });
  return ok({ user_id: input.user_id, factors_removed: removed.length }, init);
});

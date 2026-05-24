/**
 * sa-create-superadmin — single most powerful action in the system.
 *
 * Four-eyes-class. Wires through `requestFourEyes` so the day a
 * second real superadmin exists, this action enters
 * `pending_second_approval` and waits for them to confirm via
 * `sa-confirm-action`. With one real superadmin today, it
 * auto-satisfies and executes immediately — but the pending row
 * still lands so the trail shows that four-eyes was attempted.
 *
 * Refuses to elevate the caller (no self-elevation).
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
import { markFourEyesExecuted, markFourEyesFailed, requestFourEyes } from "../_shared/four-eyes.ts";
import { makeLogger } from "../_shared/logger.ts";
import { networkContext, recordSaAudit } from "../_shared/sa-audit.ts";

const log = makeLogger("sa-create-superadmin");

const InputSchema = z.object({
  target_user_id: z.string().uuid(),
  justification: z.string().min(8),
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
  if (input.target_user_id === caller.id) {
    return forbidden(init, "cannot grant superadmin to yourself");
  }
  if (await hasRole(input.target_user_id, "superadmin")) {
    return badRequest("target is already a superadmin", init);
  }

  // Note: kickoff classes this as `deactivate_superadmin`/`demote_superadmin`
  // four-eyes-class. Adding a NEW superadmin is symmetric — creating
  // another holder of god-mode power deserves the same gate. We use
  // the `demote_superadmin` action key here since that's the closest
  // semantic match in the existing CHECK list. (The enum can be
  // extended to `create_superadmin` in a later migration.)
  const fe = await requestFourEyes({
    action: "demote_superadmin",
    targetKind: "user",
    targetId: input.target_user_id,
    justification: input.justification,
    requestedBy: caller.id,
    payload: { intent: "create_superadmin" },
  });

  const { ipAddress, userAgent } = networkContext(request);

  if (!fe.proceed) {
    // Two or more real superadmins exist; pending second approval.
    await recordSaAudit({
      actorId: caller.id,
      action: "four_eyes_request",
      targetKind: "user",
      targetId: input.target_user_id,
      reason: input.justification,
      requestId,
      ipAddress,
      userAgent,
      afterData: { pending_id: fe.pendingId, intent: "create_superadmin" },
    });
    return ok({ pending_id: fe.pendingId, awaiting_second_approval: true }, init);
  }

  // Auto-satisfied — execute now.
  const sb = serviceClient();
  try {
    await recordSaAudit({
      actorId: caller.id,
      action: "create_superadmin",
      targetKind: "user",
      targetId: input.target_user_id,
      reason: input.justification,
      requestId,
      ipAddress,
      userAgent,
      afterData: {
        pending_id: fe.pendingId,
        auto_satisfied: true,
        real_superadmin_count_at_request: fe.realSuperadminCount,
      },
    });
  } catch (e) {
    await markFourEyesFailed(fe.pendingId, `audit insert failed: ${String(e)}`);
    return serverError("audit write failed", init);
  }

  const { error } = await sb.from("user_roles").insert({
    user_id: input.target_user_id,
    role: "superadmin",
    hospital_id: null,
    created_by: caller.id,
  });
  if (error) {
    await markFourEyesFailed(fe.pendingId, `user_roles insert: ${error.message}`);
    log.error("user_roles insert failed", { requestId, reason: error.message });
    return serverError("create superadmin failed", init);
  }

  await markFourEyesExecuted(fe.pendingId);
  log.info("superadmin created (auto-satisfied)", {
    requestId,
    target_user_id: input.target_user_id,
    pending_id: fe.pendingId,
  });
  return ok(
    {
      target_user_id: input.target_user_id,
      pending_id: fe.pendingId,
      auto_satisfied: true,
    },
    init,
  );
});

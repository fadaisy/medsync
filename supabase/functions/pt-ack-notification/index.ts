/**
 * pt-ack-notification — the phone reports a push was received or opened
 * (Gate E, ADR 0090). "Ack" is what stops the SMS fallback.
 *
 * Input: dispatch_id. The caller must be the row's recipient. Sets
 * `acknowledged_at` once; a second ack is a no-op 200. No audit row: one
 * per push at volume would bury the break-glass entries the audit log
 * exists to surface (the same call the dispatcher makes).
 */
import { z } from "npm:zod@4.4.3";

import { getCaller, serviceClient } from "../_shared/auth.ts";
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

const InputSchema = z.object({ dispatch_id: z.string().uuid() });

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

  const caller = await getCaller(request);
  if (!caller) return unauthorized(init);
  const sb = serviceClient();

  const { data: row, error } = await sb
    .from("notification_dispatches")
    .select("id, recipient_user_id, acknowledged_at, related_kind, related_id, kind")
    .eq("id", parsed.data.dispatch_id)
    .maybeSingle();
  if (error) return serverError(error.message, init);
  if (!row) return notFound(init, "notification not found");
  if (row.recipient_user_id !== caller.id) return forbidden(init, "not your notification");

  const now = row.acknowledged_at ?? new Date().toISOString();
  if (!row.acknowledged_at) {
    const { error: updateError } = await sb
      .from("notification_dispatches")
      .update({ acknowledged_at: now })
      .eq("id", row.id)
      .is("acknowledged_at", null);
    if (updateError) return serverError(updateError.message, init);
  }
  return ok(
    {
      dispatch_id: row.id,
      acknowledged_at: now,
      kind: row.kind,
      related_kind: row.related_kind,
      related_id: row.related_id,
    },
    init,
  );
});

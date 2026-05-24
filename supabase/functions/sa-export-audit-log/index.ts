/**
 * sa-export-audit-log — exports filtered sa_audit_log rows AND
 * records the export itself as an audited action.
 *
 * Per kickoff section 5: "export — itself an audited action."
 * The watchers being watched applies to the audit console too —
 * downloading the audit log creates a row in the audit log noting
 * who downloaded it and which filter they applied.
 *
 * Output: JSON. (CSV transformation happens client-side; the
 * function returns the row data + the count so the caller can
 * stream it as a download.)
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

const log = makeLogger("sa-export-audit-log");

const InputSchema = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  actor_id: z.string().uuid().optional(),
  action: z.string().max(60).optional(),
  target_kind: z.string().max(40).optional(),
  reason: z.string().min(8, "Export reason ≥ 8 chars required."),
  /** Hard cap so a misclick doesn't pull the whole table. */
  limit: z.number().int().min(1).max(10_000).default(5_000),
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

  // 1. Record the export FIRST so a downstream query failure still
  //    leaves the attempt on record (export of zero rows is still an
  //    intent worth logging).
  const { ipAddress, userAgent } = networkContext(request);
  try {
    await recordSaAudit({
      actorId: caller.id,
      action: "export_audit_log",
      targetKind: "audit_log_export",
      targetId: requestId, // the request id IS the export identifier
      reason: input.reason,
      requestId,
      ipAddress,
      userAgent,
      afterData: {
        filter: {
          from: input.from ?? null,
          to: input.to ?? null,
          actor_id: input.actor_id ?? null,
          action: input.action ?? null,
          target_kind: input.target_kind ?? null,
          limit: input.limit,
        },
      },
    });
  } catch (e) {
    log.error("audit-write failed; aborting export", { requestId, reason: String(e) });
    return serverError("audit write failed", init);
  }

  // 2. Run the actual filtered query.
  let q = sb
    .from("sa_audit_log")
    .select(
      "id, timestamp, actor_id, action, target_kind, target_id, reason, request_id, ip_address, user_agent",
    )
    .order("timestamp", { ascending: false })
    .limit(input.limit);
  if (input.from) q = q.gte("timestamp", `${input.from}T00:00:00Z`);
  if (input.to) q = q.lt("timestamp", `${input.to}T23:59:59.999Z`);
  if (input.actor_id) q = q.eq("actor_id", input.actor_id);
  if (input.action) q = q.eq("action", input.action);
  if (input.target_kind) q = q.eq("target_kind", input.target_kind);
  const { data, error } = await q;
  if (error) {
    log.error("export query failed", { requestId, reason: error.message });
    return serverError("export query failed", init);
  }

  log.info("audit-log exported", { requestId, rows: data?.length ?? 0 });
  return ok({ rows: data ?? [], request_id: requestId }, init);
});

/**
 * ha-cancel-clinician-availability — soft-cancel an availability block.
 *
 * Refuses to cancel a `bookable` block when it has live (requested /
 * pending_approval / confirmed) appointments inside its window — the
 * operator must reschedule / cancel those first.
 *
 * For non-bookable blocks (teaching, ward_round, admin, leave) the
 * cancel is unconditional.
 *
 * Audit: action=cancel_clinician_availability, reason ≥ 8 chars.
 */

import { z } from "npm:zod@4.4.3";

import { getCaller, hasRole, serviceClient } from "../_shared/auth.ts";
import { preflight } from "../_shared/cors.ts";
import {
  badRequest,
  conflict,
  forbidden,
  methodNotAllowed,
  notFound,
  ok,
  serverError,
  unauthorized,
} from "../_shared/errors.ts";
import { requireHospitalAdminScope } from "../_shared/hospital-admin-scope.ts";
import { makeLogger } from "../_shared/logger.ts";
import { networkContext, recordSaAudit } from "../_shared/sa-audit.ts";

const log = makeLogger("ha-cancel-clinician-availability");

const InputSchema = z.object({
  block_id: z.string().uuid(),
  reason: z.string().min(8, "Reason ≥ 8 chars required (audited)."),
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

  const sb = serviceClient();
  const { data: block, error } = await sb
    .from("availability_blocks")
    .select("id, hospital_id, clinician_user_id, kind, starts_at, ends_at, state")
    .eq("id", input.block_id)
    .maybeSingle();
  if (error) return serverError(error.message, init);
  if (!block) return notFound(init, "block not found");
  if (block.state === "cancelled") return badRequest("block is already cancelled", init);

  const isSuperadmin = await hasRole(caller.id, "superadmin");
  const isSelf = caller.id === block.clinician_user_id;
  if (!isSuperadmin && !isSelf) {
    if (!(await hasRole(caller.id, "hospital_admin", block.hospital_id))) {
      return forbidden(init);
    }
    const scope = await requireHospitalAdminScope(caller.id, block.hospital_id);
    if (!scope.ok) return forbidden(init, scope.reason);
  }

  // Block bookable cancels with live appointments inside.
  if (block.kind === "bookable") {
    const { count } = await sb
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("clinician_user_id", block.clinician_user_id)
      .in("status", ["requested", "pending_approval", "confirmed"])
      .gte("starts_at", block.starts_at)
      .lt("starts_at", block.ends_at);
    if ((count ?? 0) > 0) {
      return conflict(
        `${count} live appointment${count === 1 ? "" : "s"} fall inside this block — reschedule or cancel them first.`,
        init,
      );
    }
  }

  const { ipAddress, userAgent } = networkContext(request);
  try {
    await recordSaAudit({
      actorId: caller.id,
      action: "cancel_clinician_availability",
      targetKind: "availability_block",
      targetId: block.id,
      reason: input.reason,
      requestId,
      ipAddress,
      userAgent,
      beforeData: { state: block.state },
      afterData: { state: "cancelled" },
    });
  } catch (e) {
    log.error("sa_audit failed; aborting", { requestId, reason: String(e) });
    return serverError("audit write failed", init);
  }

  const { error: updateError } = await sb
    .from("availability_blocks")
    .update({ state: "cancelled" })
    .eq("id", block.id);
  if (updateError) {
    log.error("cancel update failed", { requestId, reason: updateError.message });
    return serverError("cancel failed", init);
  }

  log.info("availability cancelled", { requestId, block_id: block.id });
  return ok({ block_id: block.id, state: "cancelled" }, init);
});

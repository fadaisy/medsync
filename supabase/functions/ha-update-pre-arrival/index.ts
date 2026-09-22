/**
 * ha-update-pre-arrival — the Incoming board's Acknowledge / Ready / Not
 * arriving / Hoax (PRD MS-PRD-SYM-001 §8.5; §9.4 `updatePreArrivalStatus`;
 * ADR 0098 ruling 5). Arrival is its own function (ha-pre-arrival-arrived)
 * because it creates or links an intake.
 *
 * Auth: anyone with an active affiliation at the pre-alert's facility —
 * reception, nurse, clinician — or its hospital admin, or superadmin
 * (`authoriseAtHospital`, the same set the RLS SELECT policy admits). The
 * facility comes from the row, never from the body.
 *
 * `seen` stamps who acknowledged and when (E3 flips to "Seen by hospital");
 * `ready` stamps `ready_at`; `not_arriving` and `hoax` close the row and
 * need a reason ≥ 8 — hoax feeds §8.7's downgrade, so the word must be
 * justified. `canTransition` or 409. Audited FIRST (fail closed).
 */

import type { PreArrivalStatus } from "../_shared/pre-arrival.ts";
import { z } from "npm:zod@4.4.3";

import { getCaller, serviceClient } from "../_shared/auth.ts";
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
import { authoriseAtHospital } from "../_shared/hospital-admin-scope.ts";
import { makeLogger } from "../_shared/logger.ts";
import { canTransition } from "../_shared/pre-arrival.ts";
import { networkContext, recordSaAudit } from "../_shared/sa-audit.ts";

const log = makeLogger("ha-update-pre-arrival");

const InputSchema = z
  .object({
    pre_arrival_id: z.string().uuid(),
    status: z.enum(["seen", "ready", "not_arriving", "hoax"]),
    reason: z.string().trim().min(8).max(500).optional(),
  })
  .refine((v) => !!v.reason || (v.status !== "not_arriving" && v.status !== "hoax"), {
    message: "Closing a pre-alert as not arriving or hoax needs a reason (8+ characters).",
    path: ["reason"],
  });

interface PreArrivalRow {
  id: string;
  facility_id: string;
  status: PreArrivalStatus;
  acknowledged_at: string | null;
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

  const sb = serviceClient();
  const { data: row, error: rowError } = await sb
    .from("emergency_pre_arrivals")
    .select("id, facility_id, status, acknowledged_at")
    .eq("id", input.pre_arrival_id)
    .maybeSingle();
  if (rowError) return serverError(rowError.message, init);
  const pa = (row as PreArrivalRow | null) ?? null;
  if (!pa) return notFound(init, "pre-alert not found");

  const denied = await authoriseAtHospital(caller.id, pa.facility_id);
  if (denied) return forbidden(init, denied);

  if (!canTransition(pa.status, input.status)) {
    return conflict(`Cannot mark a ${pa.status} pre-alert as ${input.status}.`, init, {
      status: pa.status,
    });
  }

  const nowIso = new Date().toISOString();
  const patch: Record<string, unknown> = { status: input.status };
  if (input.status === "seen") {
    patch.acknowledged_by_user_id = caller.id;
    patch.acknowledged_at = nowIso;
  } else if (input.status === "ready") {
    patch.ready_at = nowIso;
    // Ready without a prior Acknowledge still counts as seen (E3 shows the later state).
    if (!pa.acknowledged_at) {
      patch.acknowledged_by_user_id = caller.id;
      patch.acknowledged_at = nowIso;
    }
  } else {
    patch.closed_at = nowIso;
  }

  const { ipAddress, userAgent } = networkContext(request);
  try {
    await recordSaAudit({
      actorId: caller.id,
      action: "update_pre_arrival",
      targetKind: "emergency_pre_arrival",
      targetId: pa.id,
      reason: input.reason ?? `Board marked the pre-alert ${input.status}.`,
      requestId,
      ipAddress,
      userAgent,
      beforeData: { status: pa.status },
      afterData: { status: input.status, facility_id: pa.facility_id },
    });
  } catch (e) {
    log.error("sa_audit failed; aborting", { requestId, reason: String(e) });
    return serverError("audit write failed", init);
  }

  const { data: updated, error: updateError } = await sb
    .from("emergency_pre_arrivals")
    .update(patch)
    .eq("id", pa.id)
    // Re-pinned: two board viewers clicking at once — the second gets a 409, not a silent overwrite.
    .eq("status", pa.status)
    .select("id")
    .maybeSingle();
  if (updateError) {
    log.error("pre-arrival update failed", { requestId, reason: updateError.message });
    return serverError("could not update the pre-alert", init);
  }
  if (!updated) return conflict("Someone else updated this pre-alert first — reload.", init);

  log.info("pre-alert updated", {
    requestId,
    pre_arrival_id: pa.id,
    facility_id: pa.facility_id,
    from: pa.status,
    to: input.status,
  });
  return ok({ pre_arrival_id: pa.id, status: input.status }, init);
});

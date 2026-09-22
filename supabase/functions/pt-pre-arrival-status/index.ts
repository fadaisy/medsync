/**
 * pt-pre-arrival-status — E3 (PRD MS-PRD-SYM-001 §8.4; §9.4 `cancelPreArrival`;
 * ADR 0098 ruling 5). One function reads the status and takes the two
 * reporter-side actions, because the same authorisation gates all three.
 *
 * THE CALLER IS OPTIONAL. Two ways to prove the row is yours, either
 * suffices: the reporter token pt-create-pre-arrival returned once (checked
 * as a blind index against `reporter_token_hash` — the plaintext is never
 * stored), or a signed-in caller who is the row's patient or reporter. A row
 * that is not yours reads as absent: the id alone must not confirm a
 * pre-alert exists (PRD §9.3 "reads/cancels own row").
 *
 * `cancel` → `cancelled` ("I'm no longer coming"); `arrived` → `arrived`
 * (reporter-declared — the board still marks arrival with
 * ha-pre-arrival-arrived, which is what creates the intake; this only
 * closes the card). Both go through `canTransition`: a closed row has no
 * exits. Audited FIRST (fail closed) as `update_pre_arrival`, actor = the
 * caller or the system actor for an anonymous reporter.
 *
 * Nothing in a log line is a token, a phone or a coordinate.
 */

import type { PreArrivalStatus } from "../_shared/pre-arrival.ts";
import { z } from "npm:zod@4.4.3";

import { getCaller, serviceClient } from "../_shared/auth.ts";
import { preflight } from "../_shared/cors.ts";
import { blindIndex } from "../_shared/encryption.ts";
import {
  badRequest,
  conflict,
  methodNotAllowed,
  notFound,
  ok,
  serverError,
} from "../_shared/errors.ts";
import { makeLogger } from "../_shared/logger.ts";
import { canTransition } from "../_shared/pre-arrival.ts";
import { networkContext, recordSaAudit } from "../_shared/sa-audit.ts";
import { systemActorId } from "../_shared/system-actor.ts";

const log = makeLogger("pt-pre-arrival-status");

const InputSchema = z.object({
  pre_arrival_id: z.string().uuid(),
  /** The capability pt-create-pre-arrival returned; optional for a signed-in patient/reporter. */
  token: z.string().min(16).max(128).optional(),
  action: z.enum(["cancel", "arrived"]).optional(),
});

interface PreArrivalRow {
  id: string;
  facility_id: string;
  patient_user_id: string | null;
  reporter_user_id: string | null;
  status: PreArrivalStatus;
  acknowledged_at: string | null;
  ready_at: string | null;
  arrived_at: string | null;
  expires_at: string;
  reporter_token_hash: string;
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

  // Optional on purpose — see the header.
  const caller = await getCaller(request);
  if (!caller && !input.token) return badRequest("A token or a signed-in session is needed.", init);

  const sb = serviceClient();
  const { data: row, error: rowError } = await sb
    .from("emergency_pre_arrivals")
    .select(
      "id, facility_id, patient_user_id, reporter_user_id, status, acknowledged_at, ready_at, arrived_at, expires_at, reporter_token_hash",
    )
    .eq("id", input.pre_arrival_id)
    .maybeSingle();
  if (rowError) return serverError(rowError.message, init);
  const pa = (row as PreArrivalRow | null) ?? null;
  if (!pa) return notFound(init, "pre-alert not found");

  // Yours by token or by identity — else absent.
  let owned = !!caller && (caller.id === pa.patient_user_id || caller.id === pa.reporter_user_id);
  if (!owned && input.token) {
    const phiKey = Deno.env.get("MEDSYNC_PHI_KEY");
    if (!phiKey) return serverError("MEDSYNC_PHI_KEY is not configured for Functions.", init);
    try {
      owned = (await blindIndex(input.token, phiKey)) === pa.reporter_token_hash;
    } catch (e) {
      log.error("token hash failed", { requestId, reason: String(e) });
      return serverError("could not read the pre-alert", init);
    }
  }
  if (!owned) return notFound(init, "pre-alert not found");

  const { data: facility } = await sb
    .from("hospitals")
    .select("name, emergency_phone, emergency_sms_number, emergency_entrance_directions")
    .eq("id", pa.facility_id)
    .maybeSingle();

  const view = (p: PreArrivalRow) => ({
    status: p.status,
    acknowledged_at: p.acknowledged_at,
    ready_at: p.ready_at,
    arrived_at: p.arrived_at,
    expires_at: p.expires_at,
    facility: {
      name: facility?.name ?? null,
      emergency_phone: facility?.emergency_phone ?? null,
      emergency_sms_number: facility?.emergency_sms_number ?? null,
      directions: facility?.emergency_entrance_directions ?? null,
    },
  });

  if (!input.action) return ok(view(pa), init);

  // "We've arrived" from the reporter stamps `arrived_at` and leaves the row
  // OPEN: only the desk's Arrived (`ha-pre-arrival-arrived`) closes it, because
  // that is the tap that creates the intake. Closing it here would drop the
  // card from the board before anyone could convert it.
  const to: PreArrivalStatus = input.action === "cancel" ? "cancelled" : pa.status;
  if (!canTransition(pa.status, input.action === "cancel" ? "cancelled" : "arrived")) {
    return conflict(`This pre-alert is already ${pa.status}.`, init, { status: pa.status });
  }
  if (input.action === "arrived" && pa.arrived_at) return ok(view(pa), init);

  const actorId = caller?.id ?? systemActorId();
  if (!actorId) {
    log.error("no audit actor: MEDSYNC_SYSTEM_ACTOR_UUID unset", { requestId });
    return serverError("pre-alert unavailable", init);
  }

  const { ipAddress, userAgent } = networkContext(request);
  try {
    await recordSaAudit({
      actorId,
      action: "update_pre_arrival",
      targetKind: "emergency_pre_arrival",
      targetId: pa.id,
      reason:
        input.action === "cancel"
          ? "Reporter cancelled: no longer coming."
          : "Reporter declared arrival.",
      requestId,
      ipAddress,
      userAgent,
      beforeData: { status: pa.status },
      afterData: {
        status: to,
        ...(input.action === "arrived" ? { reporter_arrived: true } : {}),
        by: caller ? "user" : "token",
      },
    });
  } catch (e) {
    log.error("sa_audit failed; aborting", { requestId, reason: String(e) });
    return serverError("audit write failed", init);
  }

  const nowIso = new Date().toISOString();
  const { data: updated, error: updateError } = await sb
    .from("emergency_pre_arrivals")
    .update(input.action === "cancel" ? { status: to, closed_at: nowIso } : { arrived_at: nowIso })
    .eq("id", pa.id)
    // Re-pinned so a board action that landed between the read and this write wins.
    .eq("status", pa.status)
    .select("id")
    .maybeSingle();
  if (updateError) {
    log.error("pre-arrival update failed", { requestId, reason: updateError.message });
    return serverError("could not update the pre-alert", init);
  }
  if (!updated) return conflict("The hospital updated this pre-alert first — reload.", init);

  log.info("pre-alert updated by reporter", {
    requestId,
    pre_arrival_id: pa.id,
    facility_id: pa.facility_id,
    from: pa.status,
    to,
    signed_in: !!caller,
  });
  return ok(
    view({
      ...pa,
      status: to,
      arrived_at: input.action === "arrived" ? nowIso : pa.arrived_at,
    }),
    init,
  );
});

/**
 * ha-set-service-line-fee — set, change or clear what a service line costs
 * when a clinician of a given cadre is the one seen (Gate G, ADR 0092;
 * migration 0063).
 *
 * Inputs:
 *   - hospital_id
 *   - service_line_id   a line at that hospital
 *   - cadre_id          a clinical cadre from public.cadres
 *   - fee_ugx           integer ≥ 0, or null to REMOVE the override so the
 *                       line's flat fee answers again for that cadre
 *   - reason            ≥ 8 chars, audited
 *
 * Sensitive: hospital_admin at the hospital, or superadmin. Audited as
 * `set_service_line_fee` with the before/after values, fail-closed. Bookings
 * already held keep their own quote (appointments.quoted_fee_*): this changes
 * what FUTURE bookings are told, and only that.
 *
 * A line whose payment_posture is 'none' refuses an override — a fee on a
 * free line is a contradiction the console should not be able to express.
 */
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
import { networkContext, recordSaAudit } from "../_shared/sa-audit.ts";

const log = makeLogger("ha-set-service-line-fee");

const InputSchema = z.object({
  hospital_id: z.string().uuid(),
  service_line_id: z.string().uuid(),
  cadre_id: z.string().uuid(),
  /** The highest figure in MoH Annex I is UGX 3,000,000; the CHECK stops at ten million. */
  fee_ugx: z.number().int().min(0).max(10_000_000).nullable(),
  reason: z.string().trim().min(8, "Reason ≥ 8 chars required."),
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
  const denied = await authoriseAtHospital(caller.id, input.hospital_id);
  if (denied) return forbidden(init, denied);
  const sb = serviceClient();

  const { data: line, error: lineError } = await sb
    .from("service_lines")
    .select("id, name, payment_posture, fee_ugx")
    .eq("id", input.service_line_id)
    .eq("hospital_id", input.hospital_id)
    .maybeSingle();
  if (lineError) return serverError(lineError.message, init);
  if (!line) return notFound(init, "service line not found at this hospital");
  if (input.fee_ugx !== null && line.payment_posture === "none") {
    return conflict("This clinic is free. Set a payment posture on the line first.", init);
  }

  const { data: cadre } = await sb
    .from("cadres")
    .select("id, name, is_clinical")
    .eq("id", input.cadre_id)
    .maybeSingle();
  if (!cadre) return notFound(init, "cadre not found");
  if (!cadre.is_clinical) return badRequest("Only a clinical cadre can carry a fee.", init);

  const { data: existing } = await sb
    .from("service_line_fees")
    .select("id, fee_ugx")
    .eq("service_line_id", line.id)
    .eq("cadre_id", cadre.id)
    .maybeSingle();

  const { ipAddress, userAgent } = networkContext(request);
  try {
    await recordSaAudit({
      actorId: caller.id,
      action: "set_service_line_fee",
      targetKind: "service_line_fee",
      // The line is the stable target; an override row may not exist yet.
      targetId: line.id,
      reason: input.reason,
      requestId,
      ipAddress,
      userAgent,
      beforeData: { cadre: cadre.name, fee_ugx: existing?.fee_ugx ?? null },
      afterData: { cadre: cadre.name, fee_ugx: input.fee_ugx },
    });
  } catch (e) {
    log.error("sa_audit failed; aborting", { requestId, reason: String(e) });
    return serverError("audit write failed", init);
  }

  if (input.fee_ugx === null) {
    const { error } = await sb
      .from("service_line_fees")
      .delete()
      .eq("service_line_id", line.id)
      .eq("cadre_id", cadre.id);
    if (error) return serverError(error.message, init);
    log.info("fee override cleared", { requestId, service_line_id: line.id, cadre: cadre.name });
    return ok({ service_line_id: line.id, cadre_id: cadre.id, fee_ugx: null }, init);
  }

  const { error } = await sb
    .from("service_line_fees")
    .upsert(
      { service_line_id: line.id, cadre_id: cadre.id, fee_ugx: input.fee_ugx },
      { onConflict: "service_line_id,cadre_id" },
    );
  if (error) return serverError(error.message, init);
  log.info("fee override set", { requestId, service_line_id: line.id, cadre: cadre.name });
  return ok({ service_line_id: line.id, cadre_id: cadre.id, fee_ugx: input.fee_ugx }, init);
});

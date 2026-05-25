/**
 * sa-activate-hospital — flips hospitals.state to `active`.
 *
 * Superadmin-only. Audited. Idempotent (activating an already-active
 * hospital returns ok with `already_active: true`).
 *
 * Hospital-registration-upgrade extension (GATE C):
 *   - Enforces the agreement gate (ADR 0017) via
 *     `requireCurrentAgreement`: refuses activation when no
 *     unsuperseded `hospital_agreements` row exists for the hospital.
 *   - Allowed starting states: `provisioning`, `agreement_signed`,
 *     `suspended`, `agreement_expired`. Legacy `pending_approval` and
 *     `approved` are also accepted so pre-upgrade applications can
 *     still be activated.
 *
 * Does NOT require four-eyes — activation is forward-direction and
 * reversible via the (deferred) suspend flow.
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
import { requireCurrentAgreement } from "../_shared/hospital-agreement-gate.ts";
import { makeLogger } from "../_shared/logger.ts";
import { networkContext, recordSaAudit } from "../_shared/sa-audit.ts";

const log = makeLogger("sa-activate-hospital");

const InputSchema = z.object({
  hospital_id: z.string().uuid(),
  reason: z.string().min(8),
});

const ACTIVATABLE_FROM = new Set([
  "provisioning",
  "agreement_signed",
  "suspended",
  "agreement_expired",
  // Back-compat with hospitals created before the upgrade.
  "pending_approval",
  "approved",
]);

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
  const { data: hospital } = await sb
    .from("hospitals")
    .select("id, name, state")
    .eq("id", input.hospital_id)
    .maybeSingle();
  if (!hospital) return notFound(init, "hospital not found");

  if (hospital.state === "active") {
    return ok({ hospital_id: hospital.id, already_active: true }, init);
  }

  if (!ACTIVATABLE_FROM.has(hospital.state)) {
    return badRequest(
      `Hospital is in state '${hospital.state}'; cannot transition to active from here.`,
      init,
    );
  }

  // ─── Agreement gate (ADR 0017) ─────────────────────────────────────────
  // No hospital may reach `active` without an unsuperseded
  // hospital_agreements row. Both the applicant_flow and
  // superadmin_offline paths funnel through this same check.
  const gate = await requireCurrentAgreement(sb, hospital.id);
  if (!gate.ok) {
    log.warn("agreement-gate refused activation", {
      requestId,
      hospital_id: hospital.id,
      reason: gate.reason,
    });
    return badRequest(gate.reason, init);
  }

  const { ipAddress, userAgent } = networkContext(request);
  try {
    await recordSaAudit({
      actorId: caller.id,
      action: "activate_hospital",
      targetKind: "hospital",
      targetId: hospital.id,
      reason: input.reason,
      requestId,
      ipAddress,
      userAgent,
      beforeData: { state: hospital.state },
      afterData: {
        state: "active",
        agreement_id: gate.agreementId,
        dpa_version_id: gate.dpaVersionId,
      },
    });
  } catch (e) {
    log.error("audit insert failed", { requestId, reason: String(e) });
    return serverError("audit write failed", init);
  }

  const { error } = await sb.from("hospitals").update({ state: "active" }).eq("id", hospital.id);
  if (error) {
    log.error("update failed", { requestId, reason: error.message });
    return serverError("update failed", init);
  }

  log.info("hospital activated", {
    requestId,
    hospital_id: hospital.id,
    agreement_id: gate.agreementId,
  });
  return ok(
    {
      hospital_id: hospital.id,
      state: "active",
      agreement_id: gate.agreementId,
      dpa_version_id: gate.dpaVersionId,
    },
    init,
  );
});

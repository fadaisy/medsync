/**
 * ha-set-clinician-settings — upsert clinician_scheduling_settings row.
 *
 * Per-(clinician, hospital) row. Sets auto_confirm + slot/buffer +
 * virtual/out-of-hours toggles.
 *
 * Callable by:
 *   - The clinician themselves for their own (clinician, hospital).
 *   - A hospital_admin / superadmin for any clinician at THEIR hospital.
 */

import { z } from "npm:zod@4.4.3";

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
import { requireHospitalAdminScope } from "../_shared/hospital-admin-scope.ts";
import { makeLogger } from "../_shared/logger.ts";
import { networkContext, recordSaAudit } from "../_shared/sa-audit.ts";

const log = makeLogger("ha-set-clinician-settings");

const InputSchema = z.object({
  hospital_id: z.string().uuid(),
  clinician_user_id: z.string().uuid(),
  auto_confirm: z.boolean(),
  default_slot_minutes: z.number().int().min(5).max(240),
  buffer_minutes: z.number().int().min(0).max(60),
  allow_virtual: z.boolean(),
  allow_out_of_hours_override: z.boolean(),
  notes: z.string().max(500).nullable().optional(),
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

  const isSuperadmin = await hasRole(caller.id, "superadmin");
  const isSelf = caller.id === input.clinician_user_id;
  if (!isSuperadmin && !isSelf) {
    if (!(await hasRole(caller.id, "hospital_admin", input.hospital_id))) {
      return forbidden(init);
    }
    const scope = await requireHospitalAdminScope(caller.id, input.hospital_id);
    if (!scope.ok) return forbidden(init, scope.reason);
  }
  if (isSelf && !isSuperadmin) {
    if (!(await hasRole(caller.id, "clinician", input.hospital_id))) {
      return forbidden(init, "you are not an active clinician at this hospital");
    }
  }

  const sb = serviceClient();

  // Read the existing row for the audit before/after.
  const { data: existing } = await sb
    .from("clinician_scheduling_settings")
    .select("*")
    .eq("clinician_user_id", input.clinician_user_id)
    .eq("hospital_id", input.hospital_id)
    .maybeSingle();

  const afterRow = {
    clinician_user_id: input.clinician_user_id,
    hospital_id: input.hospital_id,
    auto_confirm: input.auto_confirm,
    default_slot_minutes: input.default_slot_minutes,
    buffer_minutes: input.buffer_minutes,
    allow_virtual: input.allow_virtual,
    allow_out_of_hours_override: input.allow_out_of_hours_override,
    notes: input.notes ?? null,
  };

  const { ipAddress, userAgent } = networkContext(request);
  try {
    await recordSaAudit({
      actorId: caller.id,
      action: "update_clinician_settings",
      targetKind: "clinician_scheduling_settings",
      targetId: `${input.clinician_user_id}:${input.hospital_id}`,
      reason: input.reason,
      requestId,
      ipAddress,
      userAgent,
      beforeData: existing
        ? {
            auto_confirm: existing.auto_confirm,
            default_slot_minutes: existing.default_slot_minutes,
            buffer_minutes: existing.buffer_minutes,
            allow_virtual: existing.allow_virtual,
            allow_out_of_hours_override: existing.allow_out_of_hours_override,
          }
        : null,
      afterData: {
        auto_confirm: afterRow.auto_confirm,
        default_slot_minutes: afterRow.default_slot_minutes,
        buffer_minutes: afterRow.buffer_minutes,
        allow_virtual: afterRow.allow_virtual,
        allow_out_of_hours_override: afterRow.allow_out_of_hours_override,
      },
    });
  } catch (e) {
    log.error("sa_audit failed; aborting", { requestId, reason: String(e) });
    return serverError("audit write failed", init);
  }

  const { error } = await sb.from("clinician_scheduling_settings").upsert(afterRow, {
    onConflict: "clinician_user_id,hospital_id",
  });
  if (error) {
    log.error("upsert failed", { requestId, reason: error.message });
    return serverError("settings update failed", init);
  }

  log.info("settings updated", {
    requestId,
    clinician_user_id: input.clinician_user_id,
    hospital_id: input.hospital_id,
  });
  return ok({ ok: true }, init);
});

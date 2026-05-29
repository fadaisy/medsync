/**
 * ha-submit-handover — nurse submits a shift handover for a ward.
 * Audited; structured notes; patients_of_concern is optional jsonb.
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
import { makeLogger } from "../_shared/logger.ts";
import { networkContext, recordSaAudit } from "../_shared/sa-audit.ts";

const log = makeLogger("ha-submit-handover");

const InputSchema = z.object({
  hospital_id: z.string().uuid(),
  ward_id: z.string().uuid(),
  shift_label: z.enum(["day", "evening", "night", "custom"]),
  summary: z.string().min(8, "Summary ≥ 8 chars required.").max(8000),
  patients_of_concern: z
    .array(
      z.object({
        patient_user_id: z.string().uuid(),
        concern: z.string().max(500),
        action_due: z.string().max(500).optional(),
      }),
    )
    .max(50)
    .optional(),
  reason: z.string().min(8, "Reason ≥ 8 chars required (audited).").default("Shift handover."),
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

  // Verify ward belongs to the hospital.
  const { data: ward, error: wardErr } = await sb
    .from("hospital_wards")
    .select("id, hospital_id")
    .eq("id", input.ward_id)
    .maybeSingle();
  if (wardErr) return serverError(wardErr.message, init);
  if (!ward) return notFound(init, "ward not found");
  if (ward.hospital_id !== input.hospital_id) {
    return badRequest("ward does not belong to the given hospital", init);
  }

  const isSuperadmin = await hasRole(caller.id, "superadmin");
  if (!isSuperadmin) {
    const { data: aff } = await sb
      .from("staff_affiliations")
      .select("id")
      .eq("user_id", caller.id)
      .eq("hospital_id", input.hospital_id)
      .in("state", ["active", "approved"])
      .limit(1)
      .maybeSingle();
    if (!aff) return forbidden(init, "no active affiliation at this hospital");
  }

  const { ipAddress, userAgent } = networkContext(request);
  try {
    await recordSaAudit({
      actorId: caller.id,
      action: "submit_handover",
      targetKind: "shift_handover",
      targetId: input.ward_id,
      reason: input.reason,
      requestId,
      ipAddress,
      userAgent,
      beforeData: null,
      afterData: {
        ward_id: input.ward_id,
        shift_label: input.shift_label,
      },
    });
  } catch (e) {
    log.error("sa_audit failed", { requestId, reason: String(e) });
    return serverError("audit write failed", init);
  }

  const { data: row, error: insertError } = await sb
    .from("shift_handovers")
    .insert({
      hospital_id: input.hospital_id,
      ward_id: input.ward_id,
      submitted_by_user_id: caller.id,
      shift_label: input.shift_label,
      summary: input.summary,
      patients_of_concern: input.patients_of_concern ?? null,
    })
    .select("id")
    .single();
  if (insertError) {
    log.error("handover insert failed", { requestId, reason: insertError.message });
    return serverError("handover insert failed", init);
  }

  log.info("handover submitted", { requestId, handover_id: row.id });
  return ok({ handover_id: row.id }, init);
});

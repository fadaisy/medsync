/**
 * ha-administer-medication — nurse records an administration event.
 *
 * Per the nurse workspace GATE A proposal:
 *   - Nurses NEVER create prescriptions; this consumes existing
 *     orders (prescription_id is TEXT until the prescribing engine
 *     ships; the MAR row carries a self-contained payload snapshot).
 *   - The cadre + grade + cosign policy determine whether a
 *     high-alert administration goes through immediately or files a
 *     clinical_cosign_requests row.
 *   - 'withheld' / 'refused' / 'wasted' require a reason.
 *   - Audited via sa_audit_log + audit_log_changes() trigger.
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
import { makeLogger } from "../_shared/logger.ts";
import { networkContext, recordSaAudit } from "../_shared/sa-audit.ts";

const log = makeLogger("ha-administer-medication");

const InputSchema = z.object({
  hospital_id: z.string().uuid(),
  patient_user_id: z.string().uuid(),
  encounter_id: z.string().uuid().optional(),
  prescription_id: z.string().optional(),
  drug_name: z.string().min(1).max(240),
  dose: z.string().min(1).max(120),
  route: z.enum(["oral", "iv", "im", "sc", "topical", "inhaled", "pr", "other"]),
  is_high_alert: z.boolean().optional().default(false),
  state: z.enum(["administered", "withheld", "refused", "wasted"]),
  withheld_reason: z.string().max(500).optional(),
  scheduled_for: z.string().datetime({ offset: true }).optional(),
  administered_at: z.string().datetime({ offset: true }).optional(),
  notes: z.string().max(2000).optional(),
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

  if (input.state !== "administered" && !input.withheld_reason) {
    return badRequest("withheld_reason required when state ≠ administered", init);
  }

  const caller = await getCaller(request);
  if (!caller) return unauthorized(init);

  const sb = serviceClient();

  // Authorisation: active clinical affiliation at the hospital.
  const isSuperadmin = await hasRole(caller.id, "superadmin");
  if (!isSuperadmin) {
    const { data: aff } = await sb
      .from("staff_affiliations")
      .select("id, cadres!inner(code), cadre_grade_id")
      .eq("user_id", caller.id)
      .eq("hospital_id", input.hospital_id)
      .in("state", ["active", "approved"])
      .limit(1)
      .maybeSingle();
    if (!aff) return forbidden(init, "no active affiliation at this hospital");

    const cadreCode = (aff as unknown as { cadres?: { code?: string } }).cadres?.code ?? null;
    const isNurseCadre =
      cadreCode != null && ["NURSE", "MIDWIFE", "SPECIALIST_NURSE"].includes(cadreCode);

    // High-alert + ENROLLED grade triggers a co-sign request rather
    // than an immediate administer. The cosign request is created
    // here; the actual MAR row will be inserted when the supervisor
    // approves (via a future cosign-approve flow that consumes the
    // queued action_payload). For MVP we file the request and
    // return a soft success — the UI tells the nurse it's been
    // routed to a senior.
    if (isNurseCadre && input.is_high_alert) {
      // Look up the grade label.
      let gradeCode: string | null = null;
      if (aff.cadre_grade_id) {
        const { data: g } = await sb
          .from("cadre_grades")
          .select("code")
          .eq("id", aff.cadre_grade_id)
          .maybeSingle();
        gradeCode = g?.code ?? null;
      }
      if (gradeCode === "ENROLLED") {
        // File a cosign request and stop here.
        const { data: cosignRow, error: cosignError } = await sb
          .from("clinical_cosign_requests")
          .insert({
            hospital_id: input.hospital_id,
            patient_user_id: input.patient_user_id,
            requested_by_user_id: caller.id,
            requested_by_affiliation_id: (aff as unknown as { id: string }).id,
            requested_by_cadre_code: cadreCode,
            action_kind: "high_alert_med_administration",
            action_payload: {
              prescription_id: input.prescription_id ?? null,
              drug_name: input.drug_name,
              dose: input.dose,
              route: input.route,
              state: input.state,
              withheld_reason: input.withheld_reason ?? null,
              scheduled_for: input.scheduled_for ?? null,
              notes: input.notes ?? null,
            },
            state: "pending_review",
          })
          .select("id")
          .single();
        if (cosignError) {
          log.error("cosign insert failed", { requestId, reason: cosignError.message });
          return serverError("cosign request failed", init);
        }
        try {
          await recordSaAudit({
            actorId: caller.id,
            action: "cosign_request",
            targetKind: "clinical_cosign_request",
            targetId: cosignRow.id,
            reason: input.reason,
            requestId,
            ipAddress: networkContext(request).ipAddress,
            userAgent: networkContext(request).userAgent,
            beforeData: null,
            afterData: {
              action_kind: "high_alert_med_administration",
              drug_name: input.drug_name,
            },
          });
        } catch (e) {
          log.warn("sa_audit failed on cosign", { requestId, reason: String(e) });
        }
        return ok({ mar_id: null, cosign_request_id: cosignRow.id, queued_for_review: true }, init);
      }
    }
  }

  const administeredAt = input.administered_at ?? new Date().toISOString();
  const { ipAddress, userAgent } = networkContext(request);

  try {
    await recordSaAudit({
      actorId: caller.id,
      action: input.state === "administered" ? "administer_medication" : "withhold_medication",
      targetKind: "medication_administration_record",
      targetId: input.patient_user_id,
      reason: input.reason,
      requestId,
      ipAddress,
      userAgent,
      beforeData: null,
      afterData: {
        drug_name: input.drug_name,
        dose: input.dose,
        route: input.route,
        state: input.state,
        is_high_alert: input.is_high_alert,
      },
    });
  } catch (e) {
    log.error("sa_audit failed; aborting", { requestId, reason: String(e) });
    return serverError("audit write failed", init);
  }

  const { data: mar, error: insertError } = await sb
    .from("medication_administration_records")
    .insert({
      hospital_id: input.hospital_id,
      patient_user_id: input.patient_user_id,
      encounter_id: input.encounter_id ?? null,
      administered_by_user_id: caller.id,
      prescription_id: input.prescription_id ?? null,
      drug_name: input.drug_name,
      dose: input.dose,
      route: input.route,
      is_high_alert: input.is_high_alert,
      state: input.state,
      withheld_reason: input.withheld_reason ?? null,
      scheduled_for: input.scheduled_for ?? null,
      administered_at: administeredAt,
      notes: input.notes ?? null,
    })
    .select("id")
    .single();
  if (insertError) {
    log.error("mar insert failed", { requestId, reason: insertError.message });
    return serverError("mar insert failed", init);
  }

  log.info("medication administered", {
    requestId,
    mar_id: mar.id,
    state: input.state,
    is_high_alert: input.is_high_alert,
  });
  return ok({ mar_id: mar.id, queued_for_review: false }, init);
});

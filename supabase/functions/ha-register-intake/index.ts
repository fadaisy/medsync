/**
 * ha-register-intake — register a patient entry into the hospital.
 *
 * Per docs/patient-entry-points-gate-a-proposal.md. The front-door
 * audited create path for the patient_intakes table.
 *
 * KEY RULE — EMERGENCY NEVER BLOCKS. When the entry type is an
 * emergency (entry_types.is_emergency = true) we accept the bare
 * minimum (patient_user_id OR patient_unknown_label) and skip any
 * referral / consent / presenting-complaint requirements. Capture
 * fast, complete later.
 *
 * Auth: superadmin OR hospital_admin (scoped) OR any active clinical
 * affiliation at the hospital (nurse / doctor / other clinician).
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
import { requireHospitalAdminScope } from "../_shared/hospital-admin-scope.ts";
import { makeLogger } from "../_shared/logger.ts";
import { networkContext, recordSaAudit } from "../_shared/sa-audit.ts";

const log = makeLogger("ha-register-intake");

const InputSchema = z
  .object({
    hospital_id: z.string().uuid(),
    entry_type_code: z.string().min(1).max(64),
    entry_point: z.string().max(40).optional(),
    receiving_department_id: z.string().uuid().optional(),
    receiving_ward_id: z.string().uuid().optional(),

    patient_user_id: z.string().uuid().optional(),
    patient_unknown_label: z.string().max(240).optional(),

    appointment_id: z.string().uuid().optional(),

    referring_hospital_id: z.string().uuid().optional(),
    referring_facility_other: z.string().max(240).optional(),
    referring_clinician_name: z.string().max(240).optional(),
    referral_reason: z.string().max(2000).optional(),
    referral_document_url: z.string().url().max(2000).optional(),
    referral_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),

    presenting_complaint: z.string().max(2000).optional(),
    brought_by: z.string().max(240).optional(),
    priority_hint_override: z.enum(["routine", "high", "urgent"]).optional(),

    notes: z.string().max(2000).optional(),
    arrived_at: z.string().datetime({ offset: true }).optional(),

    reason: z.string().min(8, "Reason ≥ 8 chars required (audited)."),
  })
  .refine((v) => v.patient_user_id || v.patient_unknown_label, {
    message: "Either patient_user_id or patient_unknown_label is required.",
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

  // Look up entry type — drives priority + the never-block rule.
  const { data: entryType, error: etErr } = await sb
    .from("entry_types")
    .select("code, is_emergency, default_priority_hint, requires_referral, allows_unknown_patient")
    .eq("code", input.entry_type_code)
    .maybeSingle();
  if (etErr) return serverError(etErr.message, init);
  if (!entryType) return badRequest(`Unknown entry_type_code: ${input.entry_type_code}`, init);

  // Non-emergency types: validate the type-specific requirements.
  // Emergency types skip — capture-fast.
  if (!entryType.is_emergency) {
    if (!input.patient_user_id) {
      // Non-emergency must identify the patient.
      if (!entryType.allows_unknown_patient) {
        return badRequest(
          `${entryType.code} requires a known patient — search or register first`,
          init,
        );
      }
    }
    if (entryType.requires_referral) {
      if (!input.referring_hospital_id && !input.referring_facility_other) {
        return badRequest(
          `${entryType.code} requires a referring facility (in-network or 'other')`,
          init,
        );
      }
    }
  }

  // Verify patient exists if supplied.
  if (input.patient_user_id) {
    const { data: patient } = await sb
      .from("patient_profiles")
      .select("id")
      .eq("id", input.patient_user_id)
      .maybeSingle();
    if (!patient) return notFound(init, "patient not found");
  }

  // Verify appointment belongs to this hospital + patient if supplied.
  if (input.appointment_id) {
    const { data: appt } = await sb
      .from("appointments")
      .select("id, hospital_id, patient_user_id, department_id")
      .eq("id", input.appointment_id)
      .maybeSingle();
    if (!appt) return notFound(init, "appointment not found");
    if (appt.hospital_id !== input.hospital_id) {
      return badRequest("appointment is at a different hospital", init);
    }
    if (input.patient_user_id && appt.patient_user_id !== input.patient_user_id) {
      return badRequest("appointment does not belong to this patient", init);
    }
  }

  // Authorisation: any active clinical affiliation OR hospital_admin OR superadmin.
  const isSuperadmin = await hasRole(caller.id, "superadmin");
  if (!isSuperadmin) {
    if (await hasRole(caller.id, "hospital_admin", input.hospital_id)) {
      const scope = await requireHospitalAdminScope(caller.id, input.hospital_id);
      if (!scope.ok) return forbidden(init, scope.reason);
    } else {
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
  }

  const priorityHint = input.priority_hint_override ?? entryType.default_priority_hint ?? "routine";
  const arrivedAt = input.arrived_at ?? new Date().toISOString();

  const { ipAddress, userAgent } = networkContext(request);
  try {
    await recordSaAudit({
      actorId: caller.id,
      action: "register_intake",
      targetKind: "patient_intake",
      targetId: input.patient_user_id ?? input.hospital_id,
      reason: input.reason,
      requestId,
      ipAddress,
      userAgent,
      beforeData: null,
      afterData: {
        entry_type_code: input.entry_type_code,
        is_emergency: entryType.is_emergency,
        priority_hint: priorityHint,
        arrived_at: arrivedAt,
      },
    });
  } catch (e) {
    log.error("sa_audit failed; aborting", { requestId, reason: String(e) });
    return serverError("audit write failed", init);
  }

  const { data: intake, error: insertError } = await sb
    .from("patient_intakes")
    .insert({
      hospital_id: input.hospital_id,
      entry_type_code: input.entry_type_code,
      entry_point: input.entry_point ?? null,
      receiving_department_id: input.receiving_department_id ?? null,
      receiving_ward_id: input.receiving_ward_id ?? null,
      patient_user_id: input.patient_user_id ?? null,
      patient_unknown_label: input.patient_unknown_label ?? null,
      appointment_id: input.appointment_id ?? null,
      referring_hospital_id: input.referring_hospital_id ?? null,
      referring_facility_other: input.referring_facility_other ?? null,
      referring_clinician_name: input.referring_clinician_name ?? null,
      referral_reason: input.referral_reason ?? null,
      referral_document_url: input.referral_document_url ?? null,
      referral_date: input.referral_date ?? null,
      presenting_complaint: input.presenting_complaint ?? null,
      brought_by: input.brought_by ?? null,
      priority_hint: priorityHint,
      status: "awaiting_triage",
      arrived_at: arrivedAt,
      registered_by_user_id: caller.id,
      notes: input.notes ?? null,
    })
    .select("id, priority_hint, status")
    .single();
  if (insertError) {
    log.error("intake insert failed", { requestId, reason: insertError.message });
    return serverError("intake insert failed", init);
  }

  log.info("intake registered", {
    requestId,
    intake_id: intake.id,
    entry_type_code: input.entry_type_code,
    is_emergency: entryType.is_emergency,
    priority_hint: intake.priority_hint,
  });
  return ok(
    {
      intake_id: intake.id,
      priority_hint: intake.priority_hint,
      status: intake.status,
      is_emergency: entryType.is_emergency,
    },
    init,
  );
});

/**
 * ha-assign-patient-to-nurse — ward in-charge (or hospital admin)
 * pairs a patient with a nurse for the current shift.
 *
 * Auth: caller must hold a current ward_in_charge_assignments row at
 * the same hospital, OR be hospital_admin (scoped), OR superadmin.
 * The nurse being assigned must have an active affiliation at the
 * same hospital. The patient must exist.
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

const log = makeLogger("ha-assign-patient-to-nurse");

const InputSchema = z.object({
  hospital_id: z.string().uuid(),
  ward_id: z.string().uuid().nullable().optional(),
  department_id: z.string().uuid(),
  nurse_user_id: z.string().uuid(),
  patient_user_id: z.string().uuid(),
  relationship_kind: z.enum(["primary", "cover"]).optional().default("primary"),
  notes: z.string().max(500).optional(),
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

  // Authorise the caller.
  const isSuperadmin = await hasRole(caller.id, "superadmin");
  if (!isSuperadmin) {
    const isAdmin = await hasRole(caller.id, "hospital_admin", input.hospital_id);
    if (isAdmin) {
      const scope = await requireHospitalAdminScope(caller.id, input.hospital_id);
      if (!scope.ok) return forbidden(init, scope.reason);
    } else {
      // Must hold an active in-charge row at the hospital.
      const { data: wic } = await sb
        .from("ward_in_charge_assignments")
        .select("id, ward_id")
        .eq("nurse_user_id", caller.id)
        .eq("hospital_id", input.hospital_id)
        .is("ends_at", null)
        .limit(1)
        .maybeSingle();
      if (!wic) return forbidden(init, "only the ward in-charge can assign patients");
      // If ward_id supplied, the in-charge must be in-charge of that
      // ward (or any ward — admin handles cross-ward cases).
      if (input.ward_id && wic.ward_id !== input.ward_id) {
        return forbidden(init, "you are in-charge of a different ward");
      }
    }
  }

  // Verify nurse + patient.
  const { data: nurseAff } = await sb
    .from("staff_affiliations")
    .select("id")
    .eq("user_id", input.nurse_user_id)
    .eq("hospital_id", input.hospital_id)
    .in("state", ["active", "approved"])
    .limit(1)
    .maybeSingle();
  if (!nurseAff) return badRequest("nurse has no active affiliation here", init);

  const { data: patient } = await sb
    .from("patient_profiles")
    .select("id")
    .eq("id", input.patient_user_id)
    .maybeSingle();
  if (!patient) return notFound(init, "patient not found");

  // Close any existing active assignment for this (nurse, patient)
  // pair so the unique-active-assignment invariant holds.
  await sb
    .from("nursing_assignments")
    .update({ ends_at: new Date().toISOString() })
    .eq("nurse_user_id", input.nurse_user_id)
    .eq("patient_user_id", input.patient_user_id)
    .is("ends_at", null);

  const { ipAddress, userAgent } = networkContext(request);
  try {
    await recordSaAudit({
      actorId: caller.id,
      action: "assign_patient_to_nurse",
      targetKind: "nursing_assignment",
      targetId: input.patient_user_id,
      reason: input.reason,
      requestId,
      ipAddress,
      userAgent,
      beforeData: null,
      afterData: {
        nurse_user_id: input.nurse_user_id,
        patient_user_id: input.patient_user_id,
        ward_id: input.ward_id ?? null,
        relationship_kind: input.relationship_kind,
      },
    });
  } catch (e) {
    log.error("sa_audit failed", { requestId, reason: String(e) });
    return serverError("audit write failed", init);
  }

  const { data: row, error: insertError } = await sb
    .from("nursing_assignments")
    .insert({
      hospital_id: input.hospital_id,
      ward_id: input.ward_id ?? null,
      department_id: input.department_id,
      nurse_user_id: input.nurse_user_id,
      patient_user_id: input.patient_user_id,
      relationship_kind: input.relationship_kind,
      assigned_by_user_id: caller.id,
      notes: input.notes ?? null,
    })
    .select("id")
    .single();
  if (insertError) {
    log.error("assignment insert failed", { requestId, reason: insertError.message });
    return serverError("assignment insert failed", init);
  }

  log.info("assignment created", {
    requestId,
    assignment_id: row.id,
    nurse_user_id: input.nurse_user_id,
  });
  return ok({ assignment_id: row.id }, init);
});

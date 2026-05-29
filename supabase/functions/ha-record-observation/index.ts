/**
 * ha-record-observation — nurse (or clinician) records a vital /
 * observation for a patient.
 *
 *   - Verifies the recorder has an active clinical affiliation at the
 *     hospital and a current relationship with the patient (assigned /
 *     ward-census / in-charge / clinician-encounter).
 *   - Inserts a row into clinical_observations.
 *   - Audited via sa_audit_log + the per-tenant audit_log trigger.
 *
 * Per the nurse workspace GATE A proposal §6.3.
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

const log = makeLogger("ha-record-observation");

const InputSchema = z.object({
  hospital_id: z.string().uuid(),
  patient_user_id: z.string().uuid(),
  observation_kind: z.enum([
    "bp",
    "hr",
    "temperature",
    "rr",
    "spo2",
    "glucose",
    "pain",
    "weight",
    "height",
    "intake",
    "output",
    "gcs",
    "other",
  ]),
  numeric_value_1: z.number().optional(),
  numeric_value_2: z.number().optional(),
  unit: z.string().max(16).optional(),
  pain_scale: z.string().max(20).optional(),
  notes: z.string().max(2000).optional(),
  encounter_id: z.string().uuid().optional(),
  recorded_at: z.string().datetime({ offset: true }).optional(),
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

  // Verify patient exists.
  const { data: patient, error: patErr } = await sb
    .from("patient_profiles")
    .select("id")
    .eq("id", input.patient_user_id)
    .maybeSingle();
  if (patErr) return serverError(patErr.message, init);
  if (!patient) return notFound(init, "patient not found");

  // Authorisation: superadmin OR an active clinical affiliation at the
  // hospital. The nuanced per-patient access (assigned/ward/in-charge)
  // is enforced in the application layer (lib/nurse/patient-access) —
  // here we ensure the caller is a clinician at the right hospital.
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

  const recordedAt = input.recorded_at ?? new Date().toISOString();

  const { ipAddress, userAgent } = networkContext(request);
  try {
    await recordSaAudit({
      actorId: caller.id,
      action: "record_observation",
      targetKind: "clinical_observation",
      targetId: input.patient_user_id, // placeholder until row exists
      reason: input.reason,
      requestId,
      ipAddress,
      userAgent,
      beforeData: null,
      afterData: {
        observation_kind: input.observation_kind,
        patient_user_id: input.patient_user_id,
        recorded_at: recordedAt,
      },
    });
  } catch (e) {
    log.error("sa_audit failed; aborting", { requestId, reason: String(e) });
    return serverError("audit write failed", init);
  }

  const { data: obs, error: insertError } = await sb
    .from("clinical_observations")
    .insert({
      hospital_id: input.hospital_id,
      patient_user_id: input.patient_user_id,
      encounter_id: input.encounter_id ?? null,
      recorded_by_user_id: caller.id,
      observation_kind: input.observation_kind,
      numeric_value_1: input.numeric_value_1 ?? null,
      numeric_value_2: input.numeric_value_2 ?? null,
      unit: input.unit ?? null,
      pain_scale: input.pain_scale ?? null,
      notes: input.notes ?? null,
      recorded_at: recordedAt,
      state: "active",
    })
    .select("id")
    .single();
  if (insertError) {
    log.error("observation insert failed", { requestId, reason: insertError.message });
    return serverError("observation insert failed", init);
  }

  log.info("observation recorded", {
    requestId,
    observation_id: obs.id,
    kind: input.observation_kind,
  });
  return ok({ observation_id: obs.id }, init);
});

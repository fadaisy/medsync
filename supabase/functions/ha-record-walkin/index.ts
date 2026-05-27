/**
 * ha-record-walkin — reception / nurse / hospital_admin records a
 * walk-in patient into a department's same-day queue.
 *
 * Distinct from ha-mark-arrived in two ways:
 *   - No appointment exists; appointment_id stays null on the queue row.
 *   - The kind is 'walk_in' (or 'urgent_walk_in' when flagged).
 *
 * No status flip on appointments — there is no appointment.
 * sequence_number is computed per (hospital, department, today),
 * mirroring ha-mark-arrived so the queue ordering is consistent across
 * both arrival paths.
 *
 * Callable by:
 *   - reception / nurse / clinician at the hospital
 *   - hospital_admin / superadmin
 *
 * Per the doctor-scheduling rework (GATE A proposal §2 — flagged
 * behaviour addition). The `record_walkin` audit verb was already
 * reserved in migration 0028's sa_audit_log CHECK; this function
 * is the producer.
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

const log = makeLogger("ha-record-walkin");

const InputSchema = z.object({
  hospital_id: z.string().uuid(),
  department_id: z.string().uuid(),
  patient_user_id: z.string().uuid(),
  urgent: z.boolean().optional().default(false),
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

  // Verify the department belongs to the hospital and the patient
  // exists. We deliberately don't require the patient to have any
  // prior relationship with the hospital — walk-ins are by definition
  // first encounters or untracked.
  const { data: dept, error: deptErr } = await sb
    .from("hospital_departments")
    .select("id, hospital_id")
    .eq("id", input.department_id)
    .maybeSingle();
  if (deptErr) return serverError(deptErr.message, init);
  if (!dept) return notFound(init, "department not found");
  if (dept.hospital_id !== input.hospital_id) {
    return badRequest("department does not belong to the given hospital", init);
  }

  const { data: patient, error: patErr } = await sb
    .from("patient_profiles")
    .select("id")
    .eq("id", input.patient_user_id)
    .maybeSingle();
  if (patErr) return serverError(patErr.message, init);
  if (!patient) return notFound(init, "patient not found");

  // Authorisation: superadmin / hospital_admin (scoped) / nurse /
  // clinician at the hospital. (The clinician check is "any clinical
  // role at this hospital" via a staff_affiliations join — cheaper
  // than a per-role check loop.)
  const isSuperadmin = await hasRole(caller.id, "superadmin");
  if (!isSuperadmin) {
    if (await hasRole(caller.id, "hospital_admin", input.hospital_id)) {
      const scope = await requireHospitalAdminScope(caller.id, input.hospital_id);
      if (!scope.ok) return forbidden(init, scope.reason);
    } else if (
      !(await hasRole(caller.id, "nurse", input.hospital_id)) &&
      !(await hasRole(caller.id, "clinician", input.hospital_id))
    ) {
      // Fall through to staff_affiliations check — covers cases
      // where roles aren't yet granted on user_roles but an active
      // affiliation exists. Same fallback as the sign-in routing.
      const { data: aff } = await sb
        .from("staff_affiliations")
        .select("id")
        .eq("user_id", caller.id)
        .eq("hospital_id", input.hospital_id)
        .in("state", ["active", "approved"])
        .limit(1)
        .maybeSingle();
      if (!aff) return forbidden(init);
    }
  }

  // Audit BEFORE the write so a failed write doesn't pretend to have
  // succeeded.
  const { ipAddress, userAgent } = networkContext(request);
  try {
    await recordSaAudit({
      actorId: caller.id,
      action: "record_walkin",
      targetKind: "queue_entry",
      targetId: input.patient_user_id, // placeholder until row exists
      reason: input.reason,
      requestId,
      ipAddress,
      userAgent,
      beforeData: null,
      afterData: {
        hospital_id: input.hospital_id,
        department_id: input.department_id,
        patient_user_id: input.patient_user_id,
        urgent: input.urgent,
      },
    });
  } catch (e) {
    log.error("sa_audit failed; aborting", { requestId, reason: String(e) });
    return serverError("audit write failed", init);
  }

  // Compute sequence_number per (hospital, department, today).
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const { count } = await sb
    .from("queue_entries")
    .select("id", { count: "exact", head: true })
    .eq("hospital_id", input.hospital_id)
    .eq("department_id", input.department_id)
    .gte("arrived_at", startOfDay.toISOString());
  const sequenceNumber = (count ?? 0) + 1;

  const { data: queueRow, error: queueError } = await sb
    .from("queue_entries")
    .insert({
      hospital_id: input.hospital_id,
      department_id: input.department_id,
      appointment_id: null,
      patient_user_id: input.patient_user_id,
      kind: input.urgent ? "urgent_walk_in" : "walk_in",
      state: "waiting",
      sequence_number: sequenceNumber,
      notes: input.notes ?? null,
    })
    .select("id, sequence_number")
    .single();
  if (queueError) {
    log.error("queue insert failed", { requestId, reason: queueError.message });
    return serverError("queue insert failed", init);
  }

  log.info("walk-in recorded", {
    requestId,
    queue_entry_id: queueRow.id,
    department_id: input.department_id,
    urgent: input.urgent,
    sequence_number: queueRow.sequence_number,
  });
  return ok(
    {
      queue_entry_id: queueRow.id,
      sequence_number: queueRow.sequence_number,
    },
    init,
  );
});

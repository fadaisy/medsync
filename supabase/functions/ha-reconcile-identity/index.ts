/**
 * ha-reconcile-identity — the desk says who a provisional booking is for
 * (Gate D, ADR 0089; PRD §2.8: "explicitly confirms or creates. Never
 * automatic. Never silent.").
 *
 * THE ONLY WRITER of `provisional_patients.reconciled_patient_user_id` and of
 * `patient_user_id` on a provisional's appointments and intakes. No trigger,
 * no default, no other function; `tests/identity/gate-d-invariants.test.ts`
 * greps the functions tree for that.
 *
 * Input: { hospital_id, provisional_patient_id, action, patient_user_id?, reason? }
 *   confirm      + patient_user_id — a patient_profiles row the desk matched.
 *                Sets reconciliation_state='confirmed', reconciled_*; then
 *                UPDATE this hospital's appointments AND patient_intakes of the
 *                provisional: patient_user_id = chosen, provisional_patient_id
 *                STAYS (the provenance — the CHECKs are at-least-one).
 *                Refused when the row is already confirmed as someone else
 *                (un-reconcile first) — never overwrite a human's decision.
 *   reject       state='rejected'; nothing else changes. From 'unreconciled' only.
 *   unreconcile  + reason (≥ 20 chars). hospital_admin (or superadmin) only —
 *                a sensitive action (PRD §2.8). Reverses confirm: state back to
 *                'unreconciled', reconciled_* NULL, and patient_user_id back to
 *                NULL on this hospital's appointments/intakes that still name
 *                the reconciled patient. Encounters and queue rows already
 *                written against the patient are NOT touched — that is a
 *                clinical-record correction, flagged for Gate H (four-eyes).
 *
 * Auth: superadmin, hospital_admin of `hospital_id`, or any active staff
 * affiliation at it (reception). The provisional must belong to this
 * hospital — created here, or holding a booking here (a household member).
 *
 * Audit BEFORE the mutation (fail closed): `reconcile_identity` /
 * `unreconcile_identity`, target `provisional_patient`, before/after the
 * row's reconciliation columns. `audit_log_changes()` on the table adds the
 * row-level pair.
 */

import { z } from "npm:zod@4.4.3";

import { getCaller, hasRole, serviceClient } from "../_shared/auth.ts";
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
import { authoriseAtHospital, requireHospitalAdminScope } from "../_shared/hospital-admin-scope.ts";
import { makeLogger } from "../_shared/logger.ts";
import { networkContext, recordSaAudit } from "../_shared/sa-audit.ts";

const log = makeLogger("ha-reconcile-identity");

const InputSchema = z
  .object({
    hospital_id: z.string().uuid(),
    provisional_patient_id: z.string().uuid(),
    action: z.enum(["confirm", "reject", "unreconcile"]),
    patient_user_id: z.string().uuid().optional(),
    reason: z.string().trim().max(500).optional(),
  })
  .refine((i) => i.action !== "confirm" || !!i.patient_user_id, {
    message: "`confirm` needs `patient_user_id`.",
  })
  .refine((i) => i.action !== "unreconcile" || (i.reason ?? "").length >= 20, {
    message: "`unreconcile` needs a reason of at least 20 characters.",
  });

const RECONCILED = ["confirmed", "created"];

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

  if (input.action === "unreconcile") {
    if (!(await hasRole(caller.id, "superadmin"))) {
      if (!(await hasRole(caller.id, "hospital_admin", input.hospital_id))) {
        return forbidden(init, "Only a hospital admin can un-reconcile an identity.");
      }
      const scope = await requireHospitalAdminScope(caller.id, input.hospital_id);
      if (!scope.ok) return forbidden(init, scope.reason);
    }
  } else {
    const authError = await authoriseAtHospital(caller.id, input.hospital_id);
    if (authError) return forbidden(init, authError);
  }

  const sb = serviceClient();

  const { data: prov, error: provError } = await sb
    .from("provisional_patients")
    .select(
      "id, hospital_id, reconciliation_state, reconciled_patient_user_id, reconciled_by_user_id, reconciled_at",
    )
    .eq("id", input.provisional_patient_id)
    .maybeSingle();
  if (provError) return serverError(provError.message, init);
  if (!prov) return notFound(init, "provisional record not found");

  // Tenant boundary: created here, or booked here.
  if (prov.hospital_id !== input.hospital_id) {
    const { count } = await sb
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("provisional_patient_id", prov.id)
      .eq("hospital_id", input.hospital_id);
    if (!count) return notFound(init, "provisional record not found");
  }

  const before = {
    reconciliation_state: prov.reconciliation_state,
    reconciled_patient_user_id: prov.reconciled_patient_user_id,
    reconciled_by_user_id: prov.reconciled_by_user_id,
    reconciled_at: prov.reconciled_at,
  };
  const { ipAddress, userAgent } = networkContext(request);
  const audit = async (
    action: "reconcile_identity" | "unreconcile_identity",
    reason: string,
    after: Record<string, unknown>,
  ) => {
    try {
      await recordSaAudit({
        actorId: caller.id,
        action,
        targetKind: "provisional_patient",
        targetId: prov.id,
        reason,
        requestId,
        ipAddress,
        userAgent,
        beforeData: before,
        afterData: after,
      });
      return null;
    } catch (e) {
      log.error("sa_audit failed; aborting", { requestId, reason: String(e) });
      return serverError("audit write failed", init);
    }
  };

  /* ─── confirm ─────────────────────────────────────────────────── */
  if (input.action === "confirm") {
    const chosen = input.patient_user_id as string;
    if (
      RECONCILED.includes(prov.reconciliation_state) &&
      prov.reconciled_patient_user_id !== chosen
    ) {
      return conflict(
        "This record is already confirmed as another patient. Un-reconcile it first.",
        init,
      );
    }
    const { data: patient, error: patientError } = await sb
      .from("patient_profiles")
      .select("id")
      .eq("id", chosen)
      .maybeSingle();
    if (patientError) return serverError(patientError.message, init);
    if (!patient) return notFound(init, "That person is not a registered patient.");

    const now = new Date().toISOString();
    const after = {
      reconciliation_state: "confirmed",
      reconciled_patient_user_id: chosen,
      reconciled_by_user_id: caller.id,
      reconciled_at: now,
    };
    const auditError = await audit(
      "reconcile_identity",
      `Desk confirmed a provisional booking's identity at hospital ${input.hospital_id}.`,
      after,
    );
    if (auditError) return auditError;

    const { error: rowError } = await sb
      .from("provisional_patients")
      .update(after)
      .eq("id", prov.id);
    if (rowError) return serverError(rowError.message, init);

    // This hospital's bookings and intakes of the provisional, where nobody is
    // named yet. provisional_patient_id stays: it is the provenance.
    const { data: appts, error: apptError } = await sb
      .from("appointments")
      .update({ patient_user_id: chosen })
      .eq("provisional_patient_id", prov.id)
      .eq("hospital_id", input.hospital_id)
      .is("patient_user_id", null)
      .select("id");
    if (apptError) return serverError(apptError.message, init);
    const { data: intakes, error: intakeError } = await sb
      .from("patient_intakes")
      .update({ patient_user_id: chosen })
      .eq("provisional_patient_id", prov.id)
      .eq("hospital_id", input.hospital_id)
      .is("patient_user_id", null)
      .select("id");
    if (intakeError) return serverError(intakeError.message, init);

    log.info("identity confirmed", {
      requestId,
      provisional_patient_id: prov.id,
      appointments: appts?.length ?? 0,
      intakes: intakes?.length ?? 0,
    });
    return ok(
      {
        provisional_patient_id: prov.id,
        reconciliation_state: "confirmed",
        patient_user_id: chosen,
        appointments_linked: appts?.length ?? 0,
        intakes_linked: intakes?.length ?? 0,
      },
      init,
    );
  }

  /* ─── reject ──────────────────────────────────────────────────── */
  if (input.action === "reject") {
    if (prov.reconciliation_state !== "unreconciled") {
      return conflict(
        `This record is '${prov.reconciliation_state}', not awaiting confirmation.`,
        init,
      );
    }
    const after = { ...before, reconciliation_state: "rejected" };
    const auditError = await audit(
      "reconcile_identity",
      input.reason?.trim() ||
        `Desk could not match a provisional booking to a patient at hospital ${input.hospital_id}.`,
      after,
    );
    if (auditError) return auditError;
    const { error: rowError } = await sb
      .from("provisional_patients")
      .update({ reconciliation_state: "rejected" })
      .eq("id", prov.id);
    if (rowError) return serverError(rowError.message, init);
    log.info("identity rejected", { requestId, provisional_patient_id: prov.id });
    return ok({ provisional_patient_id: prov.id, reconciliation_state: "rejected" }, init);
  }

  /* ─── unreconcile ─────────────────────────────────────────────── */
  if (!RECONCILED.includes(prov.reconciliation_state) || !prov.reconciled_patient_user_id) {
    return conflict("This record is not reconciled.", init);
  }
  const previous = prov.reconciled_patient_user_id as string;
  const after = {
    reconciliation_state: "unreconciled",
    reconciled_patient_user_id: null,
    reconciled_by_user_id: null,
    reconciled_at: null,
  };
  const auditError = await audit("unreconcile_identity", input.reason as string, after);
  if (auditError) return auditError;

  const { error: rowError } = await sb.from("provisional_patients").update(after).eq("id", prov.id);
  if (rowError) return serverError(rowError.message, init);

  const { data: appts, error: apptError } = await sb
    .from("appointments")
    .update({ patient_user_id: null })
    .eq("provisional_patient_id", prov.id)
    .eq("hospital_id", input.hospital_id)
    .eq("patient_user_id", previous)
    .select("id");
  if (apptError) return serverError(apptError.message, init);
  const { data: intakes, error: intakeError } = await sb
    .from("patient_intakes")
    .update({ patient_user_id: null })
    .eq("provisional_patient_id", prov.id)
    .eq("hospital_id", input.hospital_id)
    .eq("patient_user_id", previous)
    .select("id");
  if (intakeError) return serverError(intakeError.message, init);

  log.info("identity un-reconciled", {
    requestId,
    provisional_patient_id: prov.id,
    appointments: appts?.length ?? 0,
    intakes: intakes?.length ?? 0,
  });
  return ok(
    {
      provisional_patient_id: prov.id,
      reconciliation_state: "unreconciled",
      patient_user_id: null,
      appointments_unlinked: appts?.length ?? 0,
      intakes_unlinked: intakes?.length ?? 0,
    },
    init,
  );
});

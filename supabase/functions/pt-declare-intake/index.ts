/**
 * pt-declare-intake — patient declares same-day attendance.
 *
 * The "Join today's queue" door of the book-or-queue choice point.
 * Creates a `patient_intakes` row with status='declared' — the patient
 * is saying "I'm coming today" but isn't physically here yet. Reception
 * (or self check-in later) flips it to 'arrived' via ha-check-in-patient.
 *
 * Boundary rules:
 *   - Caller must be the patient themselves (caller.id = patient_user_id).
 *   - hospital_id MUST match the patient's primary_facility_id (same
 *     boundary as pt-request-appointment).
 *   - The chosen department must belong to that hospital.
 *   - The department must be "open for walk-in today" per
 *     departmentSchedulingPolicy (today is in bookableWeekdays AND
 *     current local time is inside the window). If no policy exists,
 *     we treat as closed — see proposal §4.
 *   - 409 if the patient already has a confirmed/in-flight appointment
 *     today at this department — they should check in against that
 *     instead.
 *   - 409 if the patient already has a 'declared' or 'arrived' intake
 *     today at this hospital — one queue ticket per patient per day.
 *   - Emergencies do NOT route here — see kickoff §6. The UI keeps the
 *     in-person emergency-care guidance separate.
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
import { makeLogger } from "../_shared/logger.ts";
import { networkContext, recordSaAudit } from "../_shared/sa-audit.ts";

const log = makeLogger("pt-declare-intake");

const InputSchema = z.object({
  hospital_id: z.string().uuid(),
  receiving_department_id: z.string().uuid(),
  presenting_complaint: z.string().max(500).nullable().optional(),
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

  // 1. Caller IS the patient + hospital matches primary_facility_id.
  const { data: patient, error: patientError } = await sb
    .from("patient_profiles")
    .select("id, primary_facility_id")
    .eq("id", caller.id)
    .maybeSingle();
  if (patientError) return serverError(patientError.message, init);
  if (!patient) {
    return forbidden(init, "only patients can declare an intake through this surface");
  }
  if (patient.primary_facility_id !== input.hospital_id) {
    return forbidden(init, "joining the queue is restricted to your primary hospital");
  }

  // 2. Department belongs to this hospital.
  const { data: dept, error: deptError } = await sb
    .from("hospital_departments")
    .select("id, name, hospital_id")
    .eq("id", input.receiving_department_id)
    .maybeSingle();
  if (deptError) return serverError(deptError.message, init);
  if (!dept || dept.hospital_id !== input.hospital_id) {
    return notFound(init, "department not found at this hospital");
  }

  // 3. "Open for walk-in today?" — reuse departmentSchedulingPolicy
  //    (no separate accepting_walkins flag in this gate; see proposal §4).
  const now = new Date();
  const weekday = now.getDay(); // 0 = Sunday … 6 = Saturday
  const minutesLocal = now.getHours() * 60 + now.getMinutes();
  const { data: policy } = await sb
    .from("department_scheduling_policy")
    .select("bookable_weekdays, bookable_start_minutes_local, bookable_end_minutes_local")
    .eq("department_id", input.receiving_department_id)
    .maybeSingle();
  if (!policy) {
    return conflict(
      "This department isn't accepting same-day visits today — you can book a future appointment instead.",
      init,
    );
  }
  const openToday =
    Array.isArray(policy.bookable_weekdays) &&
    policy.bookable_weekdays.includes(weekday) &&
    minutesLocal >= (policy.bookable_start_minutes_local ?? 0) &&
    minutesLocal < (policy.bookable_end_minutes_local ?? 0);
  if (!openToday) {
    return conflict(
      "This department isn't open for same-day visits right now — you can book a future appointment instead.",
      init,
    );
  }

  // 4. Reconcile against today's bookings (same dept). If the patient
  //    has a live appointment at this dept today, they should check in
  //    against it — don't create a duplicate queue ticket.
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  const { data: existingAppt } = await sb
    .from("appointments")
    .select("id, starts_at, status")
    .eq("patient_user_id", caller.id)
    .eq("department_id", input.receiving_department_id)
    .gte("starts_at", startOfDay.toISOString())
    .lt("starts_at", endOfDay.toISOString())
    .in("status", ["confirmed", "pending_approval", "requested", "arrived", "in_progress"])
    .order("starts_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existingAppt) {
    return conflict(
      "You already have a booking at this department today — check in when you arrive instead.",
      init,
      { existing_appointment_id: existingAppt.id, starts_at: existingAppt.starts_at },
    );
  }

  // 5. One live queue ticket per patient per hospital per day.
  const { data: existingIntake } = await sb
    .from("patient_intakes")
    .select("id, status, receiving_department_id")
    .eq("patient_user_id", caller.id)
    .eq("hospital_id", input.hospital_id)
    .in("status", ["declared", "arrived", "awaiting_triage", "triaged"])
    .gte("arrived_at", startOfDay.toISOString())
    .lt("arrived_at", endOfDay.toISOString())
    .order("arrived_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingIntake) {
    return conflict("You already have a live queue ticket at this hospital today.", init, {
      existing_intake_id: existingIntake.id,
      status: existingIntake.status,
    });
  }

  // 6. INSERT. Reuse 'walk_in' entry type — status='declared' carries
  //    the "haven't shown up yet" semantic. registered_by_user_id is
  //    the patient themselves (their declaration).
  const { data: created, error: insertError } = await sb
    .from("patient_intakes")
    .insert({
      hospital_id: input.hospital_id,
      entry_type_code: "walk_in",
      receiving_department_id: input.receiving_department_id,
      patient_user_id: caller.id,
      presenting_complaint: input.presenting_complaint ?? null,
      priority_hint: "routine",
      status: "declared",
      declared_by_patient: true,
      registered_by_user_id: caller.id,
    })
    .select("id, status, hospital_id, receiving_department_id, arrived_at")
    .single();
  if (insertError || !created) {
    log.error("intake insert failed", { requestId, reason: insertError?.message });
    return serverError("could not create your queue ticket", init);
  }

  // 7. Audit. Best-effort — failure here doesn't roll back the intake
  //    (mirrors pt-request-appointment §8).
  const { ipAddress, userAgent } = networkContext(request);
  try {
    await recordSaAudit({
      actorId: caller.id,
      action: "patient_declare_intake",
      targetKind: "patient_intake",
      targetId: created.id,
      reason: input.presenting_complaint?.trim()
        ? `Patient self-declared (today): ${input.presenting_complaint.slice(0, 200)}`
        : "Patient self-declared (today).",
      requestId,
      ipAddress,
      userAgent,
      beforeData: null,
      afterData: {
        hospital_id: created.hospital_id,
        receiving_department_id: created.receiving_department_id,
        status: created.status,
        entry_type_code: "walk_in",
      },
    });
  } catch (e) {
    log.warn("sa_audit failed (intake already created)", {
      requestId,
      intake_id: created.id,
      reason: String(e),
    });
  }

  log.info("intake declared", {
    requestId,
    intake_id: created.id,
    department_id: created.receiving_department_id,
  });
  return ok({ intake_id: created.id, status: created.status }, init);
});

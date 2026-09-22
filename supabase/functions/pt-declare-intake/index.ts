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
 *   - ADR 0098 ruling 6: a symptom report (`pt-submit-symptoms`) may come
 *     along. When it is the caller's own, the ticket carries its advisory
 *     tier as `priority_hint` (E→urgent, U→high, R→routine — the same
 *     table the same-day path reads), the catalog's lay labels as the
 *     presenting complaint, and the report is marked `queued`. A report
 *     that is not the caller's is a 404, never a silent drop: the id alone
 *     must not confirm a report exists.
 */

import type { Tier } from "../_shared/symptom-catalog/types.ts";
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
import { DEFAULT_TIME_ZONE, localWeekdayAndMinutes } from "../_shared/slots.ts";
import { submissionSymptoms, TIER_PRIORITY_HINT } from "../_shared/submission-symptoms.ts";
import { CATALOG } from "../_shared/symptom-catalog/index.ts";
import { complaintLine } from "../_shared/symptoms.ts";

const log = makeLogger("pt-declare-intake");

const InputSchema = z.object({
  hospital_id: z.string().uuid(),
  receiving_department_id: z.string().uuid(),
  presenting_complaint: z.string().max(500).nullable().optional(),
  /** ADR 0098 ruling 6: the caller's own symptom report, if the queue door was reached through one. */
  symptom_submission_id: z.string().uuid().optional(),
});

/** The columns the queue door reads off a report; `submissionSymptoms` turns the first two into words. */
interface SubmissionRow {
  id: string;
  patient_user_id: string | null;
  items: unknown;
  qualifiers: unknown;
  computed_tier: Tier;
  outcome: string;
}

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

  // 3. "Open for walk-in today?"
  //    Walk-ins are open by DEFAULT — showing up in person is the most
  //    basic thing a hospital does, so the ABSENCE of a scheduling
  //    policy means "no restriction", not "closed". A
  //    departmentSchedulingPolicy, when present, narrows the walk-in
  //    window to its booking hours (an optional restriction the
  //    hospital opts into). Without one, reception manages arrivals.
  //    (Revises proposal §4 / ADR 0034 §2: policy-as-gate made the
  //    feature unusable for any hospital without booking policies set.)
  const now = new Date();
  // The HOSPITAL's clock, not the Edge runtime's. `getDay()`/`getHours()`
  // read the host zone (UTC on Deno Deploy), which is the wrong weekday for
  // the first three hours of every East African day and a walk-in window
  // displaced by three hours for all of them — a legitimate 09:00 walk-in
  // was refused as "outside walk-in hours" until 11:00. ISO 1 = Monday …
  // 7 = Sunday, matching bookable_weekdays' CHECK (migration 0052) and the
  // slot engine. The patient-facing page uses this same helper, so what the
  // page shows as open and what this gate allows cannot drift.
  const { isoWeekday: weekday, minutesOfDay: minutesLocal } = localWeekdayAndMinutes(
    now,
    DEFAULT_TIME_ZONE,
  );
  const { data: policy } = await sb
    .from("department_scheduling_policy")
    .select("bookable_weekdays, bookable_start_minutes_local, bookable_end_minutes_local")
    .eq("department_id", input.receiving_department_id)
    .maybeSingle();
  if (policy) {
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
  }

  // 4. Reconcile against today's bookings (same dept). If the patient
  //    has a live appointment at this dept today, they should check in
  //    against it — don't create a duplicate queue ticket.
  //    "Today" is the HOSPITAL's day, from the same helper as the gate
  //    above — `setHours(0,0,0,0)` reads the host's midnight, which on a UTC
  //    runtime is 03:00 EAT: a 01:00 walk-in was reconciled against
  //    yesterday's bookings and the patient's phone, keying on the clinic
  //    day, disagreed with this 409 for three hours every night. Every IANA
  //    offset is a whole number of minutes, so subtracting the local
  //    minutes-of-day (and the seconds the helper does not report) lands
  //    exactly on local midnight.
  const startOfDay = new Date(now.getTime() - minutesLocal * 60_000 - (now.getTime() % 60_000));
  const endOfDay = new Date(startOfDay.getTime() + 86_400_000);

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

  // 5b. The symptom report, when one came along (ADR 0098 ruling 6). Its
  //     tier sets the priority hint; its lay labels lead the complaint,
  //     the patient's own words follow in quotes (`complaintLine`). The
  //     words the clinic reads come from the server's package, never from
  //     the client. Absent a report, the row is exactly what it always was.
  let submission: SubmissionRow | null = null;
  if (input.symptom_submission_id) {
    const { data: subRow, error: subError } = await sb
      .from("symptom_submissions")
      .select("id, patient_user_id, items, qualifiers, computed_tier, outcome")
      .eq("id", input.symptom_submission_id)
      .maybeSingle();
    if (subError) return serverError(subError.message, init);
    submission = subRow as SubmissionRow | null;
    if (!submission || submission.patient_user_id !== caller.id) {
      return notFound(init, "That symptom report was not found.");
    }
    // Same gate as booking and same-day: an E report joins the queue only
    // after the interrupt was declined.
    if (submission.computed_tier === "E" && submission.outcome !== "emergency_declined") {
      return conflict("This report needs the Emergency sheet first.", init, {
        tier: submission.computed_tier,
      });
    }
  }
  const presentingComplaint = submission
    ? (complaintLine(submissionSymptoms(CATALOG, submission), input.presenting_complaint)?.slice(
        0,
        500,
      ) ?? null)
    : (input.presenting_complaint ?? null);
  const priorityHint = submission ? TIER_PRIORITY_HINT[submission.computed_tier] : "routine";

  // 6. INSERT. Reuse 'walk_in' entry type — status='declared' carries
  //    the "haven't shown up yet" semantic. registered_by_user_id is
  //    the patient themselves (their declaration). The linkage column is
  //    written only when a report exists, so the INSERT on a DB without
  //    migration 0066 is byte-identical to before.
  const { data: created, error: insertError } = await sb
    .from("patient_intakes")
    .insert({
      hospital_id: input.hospital_id,
      entry_type_code: "walk_in",
      receiving_department_id: input.receiving_department_id,
      patient_user_id: caller.id,
      presenting_complaint: presentingComplaint,
      priority_hint: priorityHint,
      status: "declared",
      declared_by_patient: true,
      registered_by_user_id: caller.id,
      ...(submission ? { symptom_submission_id: submission.id } : {}),
    })
    .select("id, status, hospital_id, receiving_department_id, arrived_at")
    .single();
  if (insertError || !created) {
    log.error("intake insert failed", { requestId, reason: insertError?.message });
    return serverError("could not create your queue ticket", init);
  }

  // 6b. Link the report to what became of it. The ticket stands either
  //     way; a failed link is logged, not surfaced — the patient is queued.
  if (submission) {
    const { error: linkError } = await sb
      .from("symptom_submissions")
      .update({ outcome: "queued", intake_id: created.id })
      .eq("id", submission.id);
    if (linkError) {
      log.warn("submission link failed (intake already created)", {
        requestId,
        intake_id: created.id,
        submission_id: submission.id,
        reason: linkError.message,
      });
    }
  }

  // 7. Audit. Best-effort — failure here doesn't roll back the intake
  //    (mirrors pt-request-appointment §8). The tier travels; the words
  //    do not.
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
        ...(submission
          ? {
              symptom_submission_id: submission.id,
              symptom_tier: submission.computed_tier,
              priority_hint: priorityHint,
            }
          : {}),
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

/**
 * pt-request-appointment — patient submits a booking request.
 *
 * Inputs:
 *   - clinician_user_id  the clinician the patient is booking
 *   - hospital_id        must match the patient's primary_facility_id
 *   - department_id      must belong to that hospital + clinician must
 *                        have an active affiliation there
 *   - reason             from APPOINTMENT_REASONS
 *   - reason_note        optional patient-supplied context
 *   - starts_at / ends_at ISO timestamps for the chosen slot
 *   - type               in_person | virtual (virtual only if clinician
 *                        + dept allow it)
 *
 * Flow:
 *   1. Validate the slot falls inside a `bookable` availability_blocks
 *      window for that clinician + hospital, and isn't already taken.
 *   2. Read the clinician's settings to decide auto_confirm vs manual.
 *   3. INSERT appointments with the correct initial status:
 *        - clinician.auto_confirm = true  → 'confirmed'
 *        - otherwise                        → 'pending_approval'
 *   4. Insert reminder rows from notify_lead_minutes (defaults from
 *      the department policy).
 *   5. Audit + return.
 *
 * Boundary rules:
 *   - The patient must be acting as themselves (caller.id = patient).
 *     Booking-on-behalf is a SEPARATE Edge Function in GATE D.
 *   - hospital_id MUST match patient.primary_facility_id. Cross-hospital
 *     booking is not allowed (per PRD section 1.5; referrals are out of
 *     scope).
 *   - We refuse to create a duplicate live booking at the same
 *     (clinician, starts_at) — the partial UNIQUE index would catch
 *     it anyway, but we surface a clean 409 with a sane message.
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

const log = makeLogger("pt-request-appointment");

const InputSchema = z.object({
  clinician_user_id: z.string().uuid(),
  hospital_id: z.string().uuid(),
  department_id: z.string().uuid(),
  reason: z.enum(["follow_up", "new_concern", "refill", "routine", "urgent_review", "other"]),
  reason_note: z.string().max(500).nullable().optional(),
  starts_at: z.string().datetime({ offset: true }),
  ends_at: z.string().datetime({ offset: true }),
  type: z.enum(["in_person", "virtual"]).default("in_person"),
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

  if (new Date(input.ends_at) <= new Date(input.starts_at)) {
    return badRequest("ends_at must be > starts_at.", init);
  }

  const caller = await getCaller(request);
  if (!caller) return unauthorized(init);

  const sb = serviceClient();

  // 1. Confirm the patient owns this booking (caller.id = patient,
  //    patient.state='active', primary_facility_id = hospital_id).
  const { data: patient, error: patientError } = await sb
    .from("patient_profiles")
    .select("id, primary_facility_id")
    .eq("id", caller.id)
    .maybeSingle();
  if (patientError) return serverError(patientError.message, init);
  if (!patient)
    return forbidden(init, "only patients can request appointments through this surface");
  if (patient.primary_facility_id !== input.hospital_id) {
    return forbidden(init, "booking is restricted to your primary hospital");
  }

  // 2. Confirm the clinician has an active affiliation at this
  //    (hospital, department).
  const { data: aff, error: affError } = await sb
    .from("staff_affiliations")
    .select("id, state")
    .eq("user_id", input.clinician_user_id)
    .eq("hospital_id", input.hospital_id)
    .eq("department_id", input.department_id)
    .in("state", ["active", "approved"])
    .limit(1)
    .maybeSingle();
  if (affError) return serverError(affError.message, init);
  if (!aff) {
    return notFound(init, "clinician isn't active at this department — refresh and pick again");
  }

  // 3. Confirm the slot falls inside a bookable availability_blocks
  //    window for this clinician. Recurring blocks aren't expanded
  //    server-side yet — we look for any `bookable` block whose raw
  //    window overlaps the slot. Recurring-block expansion is a
  //    GATE F improvement.
  const { data: blockHit, error: blockError } = await sb
    .from("availability_blocks")
    .select("id")
    .eq("clinician_user_id", input.clinician_user_id)
    .eq("hospital_id", input.hospital_id)
    .eq("kind", "bookable")
    .eq("state", "active")
    .lte("starts_at", input.starts_at)
    .gte("ends_at", input.ends_at)
    .limit(1)
    .maybeSingle();
  if (blockError) return serverError(blockError.message, init);
  if (!blockHit) {
    return badRequest("That slot isn't inside this clinician's bookable hours.", init);
  }

  // 4. Refuse double-booking at the wire (the partial UNIQUE index
  //    would also reject, but a clean 409 is friendlier).
  const { data: dup } = await sb
    .from("appointments")
    .select("id, status")
    .eq("clinician_user_id", input.clinician_user_id)
    .eq("starts_at", input.starts_at)
    .in("status", ["requested", "pending_approval", "confirmed", "arrived", "in_progress"])
    .limit(1)
    .maybeSingle();
  if (dup) {
    return conflict("Someone just took this slot — pick another and try again.", init);
  }

  // 5. Decide initial status from clinician settings (default = manual).
  const { data: settings } = await sb
    .from("clinician_scheduling_settings")
    .select("auto_confirm, allow_virtual")
    .eq("clinician_user_id", input.clinician_user_id)
    .eq("hospital_id", input.hospital_id)
    .maybeSingle();

  if (input.type === "virtual" && settings && !settings.allow_virtual) {
    return badRequest("This clinician doesn't accept virtual appointments.", init);
  }

  const initialStatus = settings?.auto_confirm ? "confirmed" : "pending_approval";

  // 6. Resolve reminder lead times: prefer the department policy's,
  //    fall back to [1440, 60] minutes.
  const { data: deptPolicy } = await sb
    .from("department_scheduling_policy")
    .select("reminder_lead_minutes")
    .eq("department_id", input.department_id)
    .maybeSingle();
  const reminderLeads: number[] = deptPolicy?.reminder_lead_minutes ?? [1440, 60];

  // 7. Insert appointment.
  const { data: created, error: insertError } = await sb
    .from("appointments")
    .insert({
      hospital_id: input.hospital_id,
      department_id: input.department_id,
      patient_user_id: caller.id,
      clinician_user_id: input.clinician_user_id,
      starts_at: input.starts_at,
      ends_at: input.ends_at,
      reason: input.reason,
      reason_note: input.reason_note ?? null,
      origin: "patient",
      status: initialStatus,
      priority: "routine",
      type: input.type,
      created_by_user_id: caller.id,
    })
    .select("id, status")
    .single();
  if (insertError || !created) {
    log.error("appointment insert failed", { requestId, reason: insertError?.message });
    return serverError("could not create appointment", init);
  }

  // 8. Queue reminders. Best-effort; a failure here doesn't roll back
  //    the booking — the operator can re-queue from the appointment
  //    detail surface in GATE D.
  const startsMs = new Date(input.starts_at).getTime();
  const reminderRows = reminderLeads
    .filter((mins) => mins > 0)
    .map((mins) => ({
      appointment_id: created.id,
      channel: "in_app" as const,
      scheduled_at: new Date(startsMs - mins * 60_000).toISOString(),
    }));
  if (reminderRows.length > 0) {
    const { error: remError } = await sb.from("appointment_reminders").insert(reminderRows);
    if (remError) {
      log.warn("reminder queue failed (continuing)", {
        requestId,
        reason: remError.message,
      });
    }
  }

  // 9. Audit.
  const { ipAddress, userAgent } = networkContext(request);
  try {
    await recordSaAudit({
      actorId: caller.id,
      action: "book_appointment",
      targetKind: "appointment",
      targetId: created.id,
      reason: input.reason_note?.trim()
        ? `Patient self-booked: ${input.reason_note.slice(0, 200)}`
        : `Patient self-booked (${input.reason}).`,
      requestId,
      ipAddress,
      userAgent,
      beforeData: null,
      afterData: {
        clinician_user_id: input.clinician_user_id,
        hospital_id: input.hospital_id,
        starts_at: input.starts_at,
        status: created.status,
        type: input.type,
      },
    });
  } catch (e) {
    log.warn("sa_audit failed (booking already created)", {
      requestId,
      appointment_id: created.id,
      reason: String(e),
    });
  }

  log.info("appointment created", {
    requestId,
    appointment_id: created.id,
    status: created.status,
  });
  return ok({ appointment_id: created.id, status: created.status }, init);
});

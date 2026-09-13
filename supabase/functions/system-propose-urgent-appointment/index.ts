/**
 * system-propose-urgent-appointment — the producer-facing interface
 * for urgent appointments triggered by monitoring (or any future
 * automated source).
 *
 * Caller authorisation: this function isn't called by patients or
 * clinicians directly. It's called by:
 *   - a future monitoring/alerts producer (cron, webhook),
 *   - a superadmin manual override.
 *
 * Both routes require the SUPABASE_SERVICE_ROLE_KEY in the
 * Authorization header (or a superadmin JWT — handled the same as
 * other sa_audit_log writers). For a service-role call there's no
 * caller.id; we attribute the action to the system actor (a stable
 * uuid we pick from env, falling back to a sentinel).
 *
 * Widening fallback per PRD §1.4:
 *   1. Find the patient's primary clinician at their hospital (when
 *      that concept lands — today this is just "any active clinician
 *      in the department"). [Phase 1]
 *   2. Fallback: any active clinician at the requested department.
 *   3. Fallback: any active clinician at the hospital.
 *   For each candidate, find the EARLIEST bookable slot today
 *   (then tomorrow, then up to LOOKAHEAD_DAYS).
 *   "Bookable" is `_shared/slots.ts`'s answer, not this file's — the
 *   same engine /patient/book offers slots with and
 *   pt-request-appointment validates them against. Slot LENGTH is the
 *   clinician's (ADR 0029 §2), never the caller's: an alert cannot
 *   lengthen someone's clinic slot, and a 15-minute appointment in a
 *   30-minute grid is off-grid by another route.
 *
 * Output: creates an appointment with origin='system_urgent',
 * priority='urgent', status='confirmed' (urgent skips manual
 * approval — the clinician sees it on their schedule with a red
 * accent dot and can decline/cancel if they need to).
 *
 * triggered_by_alert_id is stored as text — when monitoring lands
 * and an alerts table exists, a follow-up migration upgrades the
 * column to a real FK.
 */

import type {
  AvailabilityBlockRow,
  BookedAppointmentRow,
  ClinicianSchedulingSettingsRow,
  DepartmentSchedulingPolicyRow,
} from "../_shared/slots.ts";
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
import { buildSlots, DEFAULT_TIME_ZONE, LIVE_APPOINTMENT_STATUSES } from "../_shared/slots.ts";
import { isServiceRoleCall, systemActorId } from "../_shared/system-actor.ts";

const log = makeLogger("system-propose-urgent-appointment");

const InputSchema = z.object({
  patient_user_id: z.string().uuid(),
  /** Hospital scope. Must match patient_profiles.primary_facility_id. */
  hospital_id: z.string().uuid(),
  /** Preferred department (e.g. the alert's clinical domain). Used as
   * the first try; the widening fallback expands when no slot exists. */
  preferred_department_id: z.string().uuid().nullable().optional(),
  /** Free text explaining WHY this is urgent — surfaces to clinician
   * + patient. Required ≥ 8 chars (audited). */
  reason_note: z.string().min(8),
  /** Opaque identifier for the upstream alert. Plain text until the
   * alerts table exists (then upgraded to a real FK). */
  alert_id_text: z.string().max(120).nullable().optional(),
});

const LOOKAHEAD_DAYS = 7;

interface Candidate {
  clinicianUserId: string;
  departmentId: string;
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

  // Caller must be a superadmin or a service-role call (the
  // monitoring producer). hasRole('superadmin') returns false for a
  // service-role caller without a JWT, but the role check via getCaller
  // also returns null for service-role calls — so for those, the
  // Authorization header IS the SUPABASE_SERVICE_ROLE_KEY and we
  // gate on that explicitly.
  let callerId: string;

  if (isServiceRoleCall(request)) {
    // System call — attribute to the system actor (a real auth.users row:
    // sa_audit_log.actor_id is a NOT NULL FK, so the old all-zero sentinel
    // could only ever fail the audit insert). Fail closed when it is unset.
    const actor = systemActorId();
    if (!actor) return serverError("MEDSYNC_SYSTEM_ACTOR_UUID is not configured.", init);
    callerId = actor;
  } else {
    const caller = await getCaller(request);
    if (!caller) return unauthorized(init);
    if (!(await hasRole(caller.id, "superadmin"))) {
      return forbidden(init, "service-role or superadmin required");
    }
    callerId = caller.id;
  }

  const sb = serviceClient();

  // Patient sanity check.
  const { data: patient, error: pErr } = await sb
    .from("patient_profiles")
    .select("id, primary_facility_id")
    .eq("id", input.patient_user_id)
    .maybeSingle();
  if (pErr) return serverError(pErr.message, init);
  if (!patient) return notFound(init, "patient not found");
  if (patient.primary_facility_id !== input.hospital_id) {
    return badRequest("patient's primary hospital doesn't match", init);
  }

  // Build widening fallback candidate set.
  // PHASE 1 hook: when patient_care_team or patient.primary_clinician
  // lands, the first slice of `candidates` is that primary clinician.
  // Until then, the fallback is identical for all patients at the
  // hospital.
  const candidates = await findCandidates(
    sb,
    input.hospital_id,
    input.preferred_department_id ?? null,
  );

  if (candidates.length === 0) {
    log.warn("no candidate clinicians", { requestId, hospital_id: input.hospital_id });
    return notFound(init, "no clinicians available at this hospital");
  }

  // For each candidate, try to find the earliest bookable slot in the
  // lookahead window. Stop as soon as one is found.
  const slot = await findEarliestSlot(sb, input.hospital_id, candidates);
  if (!slot) {
    log.warn("no urgent slot found", { requestId, candidates: candidates.length });
    return notFound(
      init,
      "no urgent slot found in the next 7 days — surfacing as a flagged escalation",
    );
  }

  // Insert the urgent appointment. Status = confirmed (urgent skips
  // manual approval per the PRD). The clinician sees it on their
  // schedule with priority='urgent'.
  const { data: created, error: insertError } = await sb
    .from("appointments")
    .insert({
      hospital_id: input.hospital_id,
      department_id: slot.departmentId,
      patient_user_id: input.patient_user_id,
      clinician_user_id: slot.clinicianUserId,
      starts_at: slot.startsAtIso,
      ends_at: slot.endsAtIso,
      reason: "urgent_review",
      reason_note: input.reason_note,
      origin: "system_urgent",
      status: "confirmed",
      priority: "urgent",
      type: "in_person",
      triggered_by_alert_id: input.alert_id_text ?? null,
      created_by_user_id: callerId,
    })
    .select("id")
    .single();
  if (insertError || !created) {
    log.error("urgent appointment insert failed", { requestId, reason: insertError?.message });
    return serverError("could not create urgent appointment", init);
  }

  // Queue immediate-ish reminders: 30 min and 5 min before.
  const startsMs = new Date(slot.startsAtIso).getTime();
  const reminderRows = [30, 5]
    .map((m) => ({
      appointment_id: created.id,
      // See pt-request-appointment: SMS is the only channel with a transport,
      // so queue it rather than leaving the dispatcher to substitute one.
      channel: "sms" as const,
      scheduled_at: new Date(startsMs - m * 60_000).toISOString(),
    }))
    .filter((r) => new Date(r.scheduled_at).getTime() > Date.now());
  if (reminderRows.length > 0) {
    await sb.from("appointment_reminders").insert(reminderRows);
  }

  const { ipAddress, userAgent } = networkContext(request);
  try {
    await recordSaAudit({
      actorId: callerId,
      action: "propose_urgent_appointment",
      targetKind: "appointment",
      targetId: created.id,
      reason: `Urgent (system): ${input.reason_note.slice(0, 200)}`,
      requestId,
      ipAddress,
      userAgent,
      beforeData: null,
      afterData: {
        clinician_user_id: slot.clinicianUserId,
        department_id: slot.departmentId,
        starts_at: slot.startsAtIso,
        alert_id_text: input.alert_id_text ?? null,
      },
    });
  } catch (e) {
    log.warn("sa_audit failed (appointment already created)", {
      requestId,
      appointment_id: created.id,
      reason: String(e),
    });
  }

  log.info("urgent appointment proposed", {
    requestId,
    appointment_id: created.id,
    clinician_user_id: slot.clinicianUserId,
    starts_at: slot.startsAtIso,
  });
  return ok(
    {
      appointment_id: created.id,
      clinician_user_id: slot.clinicianUserId,
      department_id: slot.departmentId,
      starts_at: slot.startsAtIso,
    },
    init,
  );
});

async function findCandidates(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- service-role supabase client; typed `any` until generated Database types land
  sb: any,
  hospitalId: string,
  preferredDepartmentId: string | null,
): Promise<Candidate[]> {
  const { data: rows, error } = await sb
    .from("staff_affiliations")
    // Clinical cadres only. Without this an urgent alert can land a
    // confirmed appointment on a records officer — reception has
    // is_clinical = false (migration 0033) and the same filter gates the
    // patient's clinician list and every clinical RLS policy.
    .select("user_id, department_id, cadres!inner(is_clinical)")
    .eq("hospital_id", hospitalId)
    .in("state", ["active", "approved"])
    .eq("cadres.is_clinical", true);
  if (error || !rows) return [];

  const list: Candidate[] = rows.map((r: { user_id: string; department_id: string }) => ({
    clinicianUserId: r.user_id,
    departmentId: r.department_id,
  }));

  // Widening: preferred department first, then everyone else.
  return list.sort((a, b) => {
    if (preferredDepartmentId) {
      if (a.departmentId === preferredDepartmentId && b.departmentId !== preferredDepartmentId)
        return -1;
      if (b.departmentId === preferredDepartmentId && a.departmentId !== preferredDepartmentId)
        return 1;
    }
    return 0;
  });
}

/**
 * The earliest slot the engine would offer. One `buildSlots` per
 * (clinician, department) pair, because `departmentPolicy` is a single
 * row — pooling a clinician's two departments judges their Outreach
 * blocks against Medicine's opening hours.
 *
 * ponytail: derives every candidate's whole 7-day grid to read
 * `slots[0]`. Ceiling is a hospital-wide widening at Mulago's roster on a
 * path that has no producer yet. Upgrade path: pass a per-candidate
 * `rangeEnd` that walks forward a day at a time and stops at the first
 * hit — no engine change, this loop gains an outer one.
 */
async function findEarliestSlot(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  hospitalId: string,
  candidates: ReadonlyArray<Candidate>,
): Promise<{
  clinicianUserId: string;
  departmentId: string;
  startsAtIso: string;
  endsAtIso: string;
} | null> {
  const now = new Date();
  const until = new Date(now.getTime() + LOOKAHEAD_DAYS * 86_400_000);
  const clinicianIds = Array.from(new Set(candidates.map((c) => c.clinicianUserId)));
  const departmentIds = Array.from(new Set(candidates.map((c) => c.departmentId)));
  if (clinicianIds.length === 0) return null;

  // Aliased to the camelCase the engine reads: an unmapped row is
  // `undefined` there, which it throws on rather than deriving nothing.
  const [blocksRes, apptsRes, settingsRes, policyRes] = await Promise.all([
    sb
      .from("availability_blocks")
      .select(
        "clinicianUserId:clinician_user_id, departmentId:department_id, kind, state, " +
          "startsAt:starts_at, endsAt:ends_at, recurrence, " +
          "recurrenceWeekday:recurrence_weekday, recurrenceUntil:recurrence_until",
      )
      .eq("hospital_id", hospitalId)
      .in("clinician_user_id", clinicianIds)
      // Widest bound that cannot drop a candidate: a one-off block has to
      // overlap the window, a weekly template only has to have begun. Its
      // own starts_at is the template — often months back — so windowing
      // it like a one-off is what hid every weekly clinic from this path.
      .lt("starts_at", until.toISOString())
      .or(`ends_at.gte.${now.toISOString()},recurrence.eq.weekly`),
    sb
      .from("appointments")
      // Not scoped to hospital or department: a clinician booked
      // anywhere is still one person.
      .select("clinicianUserId:clinician_user_id, startsAt:starts_at, endsAt:ends_at")
      .in("clinician_user_id", clinicianIds)
      .in("status", [...LIVE_APPOINTMENT_STATUSES])
      .gte("ends_at", now.toISOString())
      .lt("starts_at", until.toISOString()),
    sb
      .from("clinician_scheduling_settings")
      .select(
        "clinicianUserId:clinician_user_id, defaultSlotMinutes:default_slot_minutes, " +
          "bufferMinutes:buffer_minutes, autoConfirm:auto_confirm, allowVirtual:allow_virtual",
      )
      .eq("hospital_id", hospitalId)
      .in("clinician_user_id", clinicianIds),
    sb
      .from("department_scheduling_policy")
      .select(
        "departmentId:department_id, defaultSlotMinutes:default_slot_minutes, " +
          "defaultBufferMinutes:default_buffer_minutes, " +
          "defaultAutoConfirm:default_auto_confirm, allowVirtual:allow_virtual, " +
          "bookableWeekdays:bookable_weekdays, " +
          "bookableStartMinutesLocal:bookable_start_minutes_local, " +
          "bookableEndMinutesLocal:bookable_end_minutes_local",
      )
      .in("department_id", departmentIds),
  ]);
  // Fail closed: an unread appointment list would propose a time on top
  // of an existing patient. No slot is the documented escalation outcome.
  if (blocksRes.error || apptsRes.error) {
    log.error("urgent slot read failed", {
      reason: blocksRes.error?.message ?? apptsRes.error?.message,
    });
    return null;
  }

  const blocks: Array<
    AvailabilityBlockRow & { clinicianUserId: string; departmentId: string | null }
  > = blocksRes.data ?? [];
  const appts: Array<BookedAppointmentRow & { clinicianUserId: string }> = apptsRes.data ?? [];
  const settings: Array<ClinicianSchedulingSettingsRow & { clinicianUserId: string }> =
    settingsRes.data ?? [];
  const policies: Array<DepartmentSchedulingPolicyRow & { departmentId: string }> =
    policyRes.data ?? [];
  const settingsByClinician = new Map(settings.map((r) => [r.clinicianUserId, r]));
  const policyByDepartment = new Map(policies.map((r) => [r.departmentId, r]));

  // Candidates arrive preferred-department-first and a strict `<` keeps
  // that order as the tie-break — the selection this function already
  // had. Unchanged on purpose; only the derivation moved.
  let best: { cand: Candidate; startsAt: Date; endsAt: Date } | null = null;
  for (const cand of candidates) {
    const slots = buildSlots({
      // A block naming another department belongs to that department's
      // hours; one naming none is this clinician's general bookable time.
      blocks: blocks.filter(
        (b) =>
          b.clinicianUserId === cand.clinicianUserId &&
          (b.departmentId === null || b.departmentId === cand.departmentId),
      ),
      appointments: appts.filter((a) => a.clinicianUserId === cand.clinicianUserId),
      clinicianSettings: settingsByClinician.get(cand.clinicianUserId) ?? null,
      departmentPolicy: policyByDepartment.get(cand.departmentId) ?? null,
      timeZone: DEFAULT_TIME_ZONE,
      now,
      rangeStart: now,
      rangeEnd: until,
    });
    const first = slots[0];
    if (first && (!best || first.startsAt < best.startsAt)) {
      best = { cand, startsAt: first.startsAt, endsAt: first.endsAt };
    }
  }

  if (!best) return null;
  return {
    clinicianUserId: best.cand.clinicianUserId,
    departmentId: best.cand.departmentId,
    startsAtIso: best.startsAt.toISOString(),
    endsAtIso: best.endsAt.toISOString(),
  };
}

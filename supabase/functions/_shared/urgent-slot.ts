/**
 * The urgent-slot search — the earliest slot the engine would offer at a
 * hospital, across a widening set of clinicians. Extracted verbatim from
 * `system-propose-urgent-appointment` (ADR 0098 ruling 6) so the
 * patient-callable same-day path (`pt-request-same-day`) and the monitoring
 * producer share one search; only the window differs — 7 days for the
 * producer, `endOfLocalDay` for "be seen today".
 *
 * "Bookable" is `slots.ts`'s answer, not this file's: the same
 * `buildSlots` /patient/book offers slots with and the booking core
 * validates against. Slot LENGTH is the clinician's (ADR 0029 §2), never
 * the caller's.
 */
import type {
  AvailabilityBlockRow,
  BookedAppointmentRow,
  ClinicianSchedulingSettingsRow,
  DepartmentSchedulingPolicyRow,
} from "./slots.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.106.1";

import { makeLogger } from "./logger.ts";
import { buildSlots, DEFAULT_TIME_ZONE, LIVE_APPOINTMENT_STATUSES } from "./slots.ts";

const log = makeLogger("urgent-slot");

export interface Candidate {
  clinicianUserId: string;
  departmentId: string;
}

export interface UrgentSlot {
  clinicianUserId: string;
  departmentId: string;
  startsAtIso: string;
  endsAtIso: string;
}

/**
 * Widening fallback (PRD §1.4): the preferred department first, then every
 * other active clinical affiliation at the hospital. PHASE 1 hook: when a
 * primary clinician lands, it becomes the first slice.
 */
export async function findCandidates(
  sb: SupabaseClient,
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
 * The earliest slot the engine would offer in `[now, rangeEnd)`. One
 * `buildSlots` per (clinician, department) pair, because `departmentPolicy`
 * is a single row — pooling a clinician's two departments judges their
 * Outreach blocks against Medicine's opening hours.
 *
 * ponytail: derives every candidate's whole grid to read `slots[0]`.
 * Ceiling is a hospital-wide widening at Mulago's roster over 7 days.
 * Upgrade path: walk `rangeEnd` forward a day at a time and stop at the
 * first hit — no engine change, this loop gains an outer one.
 */
export async function findEarliestSlot(
  sb: SupabaseClient,
  hospitalId: string,
  candidates: ReadonlyArray<Candidate>,
  rangeEnd: Date,
  now: Date = new Date(),
): Promise<UrgentSlot | null> {
  const until = rangeEnd;
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

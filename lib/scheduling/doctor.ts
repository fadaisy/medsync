import "server-only";

import { and, asc, desc, eq, gte, inArray, lt } from "drizzle-orm";

import { db } from "@/db";
import { patientProfiles } from "@/db/schema/patient-profiles";
import {
  appointments,
  clinicianSchedulingSettings,
  departmentSchedulingPolicy,
  queueEntries,
} from "@/db/schema/scheduling";

/**
 * Doctor-scheduling read helpers. Pure reads against the existing
 * scheduling tables — no engine behaviour change. Used by the doctor
 * scheduling surface to compose the stat rail, pending-approvals rail,
 * and the day's queue.
 */

/* ─── Stat rail counts ───────────────────────────────────────────── */

export interface SchedulingStats {
  total: number;
  confirmed: number;
  pending: number;
  urgent: number;
  completed: number;
  cancelled: number;
}

export async function fetchSchedulingStats(args: {
  clinicianUserId: string;
  hospitalId: string;
  rangeStart: Date;
  rangeEnd: Date;
}): Promise<SchedulingStats> {
  const rows = await db
    .select({
      status: appointments.status,
      priority: appointments.priority,
    })
    .from(appointments)
    .where(
      and(
        eq(appointments.clinicianUserId, args.clinicianUserId),
        eq(appointments.hospitalId, args.hospitalId),
        gte(appointments.startsAt, args.rangeStart),
        lt(appointments.startsAt, args.rangeEnd),
      ),
    );

  const stats: SchedulingStats = {
    total: rows.length,
    confirmed: 0,
    pending: 0,
    urgent: 0,
    completed: 0,
    cancelled: 0,
  };
  for (const r of rows) {
    if (r.priority === "urgent") stats.urgent++;
    if (r.status === "confirmed" || r.status === "arrived" || r.status === "in_progress") {
      stats.confirmed++;
    } else if (r.status === "requested" || r.status === "pending_approval") {
      stats.pending++;
    } else if (r.status === "completed") {
      stats.completed++;
    } else if (
      r.status === "cancelled" ||
      r.status === "declined" ||
      r.status === "no_show" ||
      r.status === "rescheduled"
    ) {
      stats.cancelled++;
    }
  }
  return stats;
}

/* ─── Pending-approvals rail ─────────────────────────────────────── */

export interface PendingApprovalRow {
  id: string;
  startsAtIso: string;
  endsAtIso: string;
  type: string;
  reason: string;
  reasonNote: string | null;
  patientName: string;
  patientCode: string;
  priority: string;
}

export async function fetchPendingApprovals(args: {
  clinicianUserId: string;
  hospitalId: string;
  limit?: number;
}): Promise<PendingApprovalRow[]> {
  const rows = await db
    .select({
      id: appointments.id,
      startsAt: appointments.startsAt,
      endsAt: appointments.endsAt,
      type: appointments.type,
      reason: appointments.reason,
      reasonNote: appointments.reasonNote,
      priority: appointments.priority,
      patientCode: patientProfiles.patientCode,
    })
    .from(appointments)
    .innerJoin(patientProfiles, eq(patientProfiles.id, appointments.patientUserId))
    .where(
      and(
        eq(appointments.clinicianUserId, args.clinicianUserId),
        eq(appointments.hospitalId, args.hospitalId),
        inArray(appointments.status, ["requested", "pending_approval"]),
      ),
    )
    .orderBy(asc(appointments.startsAt))
    .limit(args.limit ?? 20);

  return rows.map((r) => ({
    id: r.id,
    startsAtIso: r.startsAt.toISOString(),
    endsAtIso: r.endsAt.toISOString(),
    type: r.type,
    reason: r.reason,
    reasonNote: r.reasonNote,
    patientName: r.patientCode, // PHI-safe — patient code on the calendar
    patientCode: r.patientCode,
    priority: r.priority,
  }));
}

/* ─── Day's queue rail ───────────────────────────────────────────── */

export interface DepartmentQueueRow {
  id: string;
  kind: string;
  state: string;
  arrivedAtIso: string;
  calledAtIso: string | null;
  sequenceNumber: number;
  patientUserId: string;
  patientCode: string | null;
  appointmentId: string | null;
  notes: string | null;
}

export async function fetchDepartmentQueueToday(args: {
  departmentId: string;
}): Promise<DepartmentQueueRow[]> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const rows = await db
    .select({
      id: queueEntries.id,
      kind: queueEntries.kind,
      state: queueEntries.state,
      arrivedAt: queueEntries.arrivedAt,
      calledAt: queueEntries.calledAt,
      sequenceNumber: queueEntries.sequenceNumber,
      patientUserId: queueEntries.patientUserId,
      patientCode: patientProfiles.patientCode,
      appointmentId: queueEntries.appointmentId,
      notes: queueEntries.notes,
    })
    .from(queueEntries)
    .leftJoin(patientProfiles, eq(patientProfiles.id, queueEntries.patientUserId))
    .where(
      and(
        eq(queueEntries.departmentId, args.departmentId),
        gte(queueEntries.arrivedAt, start),
        lt(queueEntries.arrivedAt, end),
        inArray(queueEntries.state, ["waiting", "being_seen"]),
      ),
    )
    .orderBy(asc(queueEntries.sequenceNumber));

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    state: r.state,
    arrivedAtIso: r.arrivedAt.toISOString(),
    calledAtIso: r.calledAt?.toISOString() ?? null,
    sequenceNumber: r.sequenceNumber,
    patientUserId: r.patientUserId,
    patientCode: r.patientCode,
    appointmentId: r.appointmentId,
    notes: r.notes,
  }));
}

/* ─── Settings + dept-policy resolver ────────────────────────────── */

export interface EffectiveSchedulingSettings {
  autoConfirm: boolean;
  defaultSlotMinutes: number;
  bufferMinutes: number;
  allowVirtual: boolean;
  allowOutOfHoursOverride: boolean;
  /** true when the value is the dept default, not a clinician override. */
  usingDefaults: {
    autoConfirm: boolean;
    defaultSlotMinutes: boolean;
    bufferMinutes: boolean;
    allowVirtual: boolean;
  };
}

const HARD_DEFAULTS = {
  autoConfirm: false,
  defaultSlotMinutes: 15,
  bufferMinutes: 0,
  allowVirtual: false,
  allowOutOfHoursOverride: true,
};

/**
 * Resolution order: clinician_scheduling_settings → department_scheduling_policy
 * → hard defaults. Per GATE A proposal §4.
 */
export async function fetchEffectiveSchedulingSettings(args: {
  clinicianUserId: string;
  hospitalId: string;
  departmentId: string;
}): Promise<EffectiveSchedulingSettings> {
  const [own] = await db
    .select({
      autoConfirm: clinicianSchedulingSettings.autoConfirm,
      defaultSlotMinutes: clinicianSchedulingSettings.defaultSlotMinutes,
      bufferMinutes: clinicianSchedulingSettings.bufferMinutes,
      allowVirtual: clinicianSchedulingSettings.allowVirtual,
      allowOutOfHoursOverride: clinicianSchedulingSettings.allowOutOfHoursOverride,
    })
    .from(clinicianSchedulingSettings)
    .where(
      and(
        eq(clinicianSchedulingSettings.clinicianUserId, args.clinicianUserId),
        eq(clinicianSchedulingSettings.hospitalId, args.hospitalId),
      ),
    )
    .limit(1);

  const [policy] = await db
    .select({
      defaultAutoConfirm: departmentSchedulingPolicy.defaultAutoConfirm,
      defaultSlotMinutes: departmentSchedulingPolicy.defaultSlotMinutes,
      defaultBufferMinutes: departmentSchedulingPolicy.defaultBufferMinutes,
      allowVirtual: departmentSchedulingPolicy.allowVirtual,
    })
    .from(departmentSchedulingPolicy)
    .where(eq(departmentSchedulingPolicy.departmentId, args.departmentId))
    .limit(1);

  const ac = own?.autoConfirm ?? policy?.defaultAutoConfirm ?? HARD_DEFAULTS.autoConfirm;
  const slot =
    own?.defaultSlotMinutes ?? policy?.defaultSlotMinutes ?? HARD_DEFAULTS.defaultSlotMinutes;
  const buf = own?.bufferMinutes ?? policy?.defaultBufferMinutes ?? HARD_DEFAULTS.bufferMinutes;
  const virt = own?.allowVirtual ?? policy?.allowVirtual ?? HARD_DEFAULTS.allowVirtual;
  const ooh = own?.allowOutOfHoursOverride ?? HARD_DEFAULTS.allowOutOfHoursOverride;

  return {
    autoConfirm: ac,
    defaultSlotMinutes: slot,
    bufferMinutes: buf,
    allowVirtual: virt,
    allowOutOfHoursOverride: ooh,
    usingDefaults: {
      autoConfirm: own?.autoConfirm === undefined || own?.autoConfirm === null,
      defaultSlotMinutes: own?.defaultSlotMinutes === undefined || own?.defaultSlotMinutes === null,
      bufferMinutes: own?.bufferMinutes === undefined || own?.bufferMinutes === null,
      allowVirtual: own?.allowVirtual === undefined || own?.allowVirtual === null,
    },
  };
}

/**
 * Latest patient seen on the day's queue — used to surface "now seeing"
 * on the doctor's calendar header. Cheap; safe noop when empty.
 */
export async function fetchCurrentlyBeingSeen(args: {
  departmentId: string;
}): Promise<{ patientCode: string | null; calledAtIso: string | null } | null> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const [row] = await db
    .select({
      patientCode: patientProfiles.patientCode,
      calledAt: queueEntries.calledAt,
    })
    .from(queueEntries)
    .leftJoin(patientProfiles, eq(patientProfiles.id, queueEntries.patientUserId))
    .where(
      and(
        eq(queueEntries.departmentId, args.departmentId),
        eq(queueEntries.state, "being_seen"),
        gte(queueEntries.arrivedAt, start),
      ),
    )
    .orderBy(desc(queueEntries.calledAt))
    .limit(1);

  if (!row) return null;
  return { patientCode: row.patientCode, calledAtIso: row.calledAt?.toISOString() ?? null };
}

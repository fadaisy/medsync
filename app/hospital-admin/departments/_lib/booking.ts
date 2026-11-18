import "server-only";

import type { BookingRules, SessionLite } from "./model";
import { and, eq, isNotNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { sessionTemplates } from "@/db/schema/clinic-sessions";
import { hospitalDepartments } from "@/db/schema/hospital-departments";
import { departmentSchedulingPolicy } from "@/db/schema/scheduling";

/**
 * Each department's booking rules (moved from the Booking policy page, ADR 0520 phase 2). A left join: a department
 * with no policy row is unrestricted (ADR 0084 §14), a state the panel shows and can replace.
 */
export async function loadBookingRules(hospitalId: string): Promise<Record<string, BookingRules>> {
  const rows = await db
    .select({
      departmentId: hospitalDepartments.id,
      slot: departmentSchedulingPolicy.defaultSlotMinutes,
      buffer: departmentSchedulingPolicy.defaultBufferMinutes,
      auto: departmentSchedulingPolicy.defaultAutoConfirm,
      days: departmentSchedulingPolicy.bookableWeekdays,
      start: departmentSchedulingPolicy.bookableStartMinutesLocal,
      end: departmentSchedulingPolicy.bookableEndMinutesLocal,
      reminders: departmentSchedulingPolicy.reminderLeadMinutes,
      virtual: departmentSchedulingPolicy.allowVirtual,
      notes: departmentSchedulingPolicy.notes,
    })
    .from(hospitalDepartments)
    .innerJoin(
      departmentSchedulingPolicy,
      eq(departmentSchedulingPolicy.departmentId, hospitalDepartments.id),
    )
    .where(eq(hospitalDepartments.hospitalId, hospitalId));
  return Object.fromEntries(
    rows.map((r) => [
      r.departmentId,
      {
        slot: r.slot,
        buffer: r.buffer,
        auto: r.auto,
        days: [...(r.days ?? [])].sort((a, b) => a - b),
        start: r.start,
        end: r.end,
        twoReminders: (r.reminders ?? []).length > 1,
        virtual: r.virtual,
        notes: r.notes,
      },
    ]),
  );
}

/**
 * The published weekly sessions of this hospital's clinics, read as Clinics & schedule reads them (active, not
 * ended; a one-day template is an extra session, not part of the week). Days, hours and slot length live here,
 * so the department's panel shows them instead of asking again (ADR 0526).
 */
export async function loadClinicSessions(hospitalId: string): Promise<SessionLite[]> {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Kampala" });
  const rows = await db
    .select({
      clinicId: sessionTemplates.serviceLineId,
      weekday: sessionTemplates.weekday,
      start: sessionTemplates.startMinutesLocal,
      duration: sessionTemplates.durationMinutes,
      slot: sessionTemplates.slotMinutes,
    })
    .from(sessionTemplates)
    .where(
      and(
        eq(sessionTemplates.hospitalId, hospitalId),
        eq(sessionTemplates.active, true),
        isNotNull(sessionTemplates.serviceLineId),
        sql`(${sessionTemplates.validUntil} IS NULL OR ${sessionTemplates.validUntil} >= ${today})`,
        sql`${sessionTemplates.validFrom} IS DISTINCT FROM ${sessionTemplates.validUntil}`,
      ),
    );
  return rows.map((r) => ({
    clinicId: r.clinicId!,
    weekday: r.weekday,
    start: r.start,
    end: r.start + r.duration,
    slot: r.slot ?? 15,
  }));
}

import "server-only";

import type { BookingRules } from "./model";
import { eq } from "drizzle-orm";

import { db } from "@/db";
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

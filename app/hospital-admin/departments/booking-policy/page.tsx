import type { DepartmentPolicyOption } from "./_components/policy-form";
import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { hospitalDepartments } from "@/db/schema/hospital-departments";
import { departmentSchedulingPolicy } from "@/db/schema/scheduling";
import { requireHospitalAdminScope } from "@/lib/hospital-admin/scope";
import { PolicyPanel } from "./_components/policy-panel";

export const dynamic = "force-dynamic";

/**
 * Department booking policy — moved here from the old Scheduling page at the Clinics & schedule cut-over
 * (docs/clinics-schedule/REPORT.md): it is department-scoped, so it lives with the departments.
 */
export default async function BookingPolicyPage() {
  const scope = await requireHospitalAdminScope();

  // Left join: a department with no policy row is unrestricted (ADR 0084
  // §14), and that is a state the editor must be able to show and replace —
  // an inner join would hide exactly the departments that need configuring.
  const rows = await db
    .select({
      departmentId: hospitalDepartments.id,
      departmentName: hospitalDepartments.name,
      defaultSlotMinutes: departmentSchedulingPolicy.defaultSlotMinutes,
      defaultBufferMinutes: departmentSchedulingPolicy.defaultBufferMinutes,
      defaultAutoConfirm: departmentSchedulingPolicy.defaultAutoConfirm,
      bookableWeekdays: departmentSchedulingPolicy.bookableWeekdays,
      bookableStartMinutesLocal: departmentSchedulingPolicy.bookableStartMinutesLocal,
      bookableEndMinutesLocal: departmentSchedulingPolicy.bookableEndMinutesLocal,
      reminderLeadMinutes: departmentSchedulingPolicy.reminderLeadMinutes,
      allowVirtual: departmentSchedulingPolicy.allowVirtual,
      notes: departmentSchedulingPolicy.notes,
    })
    .from(hospitalDepartments)
    .leftJoin(
      departmentSchedulingPolicy,
      eq(departmentSchedulingPolicy.departmentId, hospitalDepartments.id),
    )
    .where(eq(hospitalDepartments.hospitalId, scope.hospitalId))
    .orderBy(asc(hospitalDepartments.name));

  const departments: DepartmentPolicyOption[] = rows.map((r) => ({
    departmentId: r.departmentId,
    departmentName: r.departmentName,
    // Every policy column is NOT NULL, so one null means the left join found
    // no row at all — not a half-set policy.
    policy:
      r.defaultSlotMinutes === null
        ? null
        : {
            defaultSlotMinutes: r.defaultSlotMinutes,
            defaultBufferMinutes: r.defaultBufferMinutes ?? 0,
            defaultAutoConfirm: r.defaultAutoConfirm ?? false,
            bookableWeekdays: r.bookableWeekdays ?? [],
            bookableStartMinutesLocal: r.bookableStartMinutesLocal ?? 480,
            bookableEndMinutesLocal: r.bookableEndMinutesLocal ?? 1020,
            reminderLeadMinutes: r.reminderLeadMinutes ?? [1440],
            allowVirtual: r.allowVirtual ?? false,
            notes: r.notes,
          },
  }));

  return <PolicyPanel departments={departments} />;
}

import type { DepartmentPolicyOption } from "./_components/policy-form";
import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { hospitalDepartments } from "@/db/schema/hospital-departments";
import { departmentSchedulingPolicy } from "@/db/schema/scheduling";
import { requireHospitalAdminScope } from "@/lib/hospital-admin/scope";
import { PlaceholderSurface } from "../_components/placeholder-surface";
import { SchedulingOverviewCard } from "../_components/scheduling-overview-card";
import { PolicyForm } from "./_components/policy-form";

/**
 * Scheduling — hospital-admin surface.
 *
 * The aggregate tile, then the department booking-policy editor. Per-clinician
 * schedules stay in each clinician's own workspace (/clinician/schedule,
 * /clinician/availability) — admin sees structure and aggregates, not
 * individual encounters.
 *
 * Departments are read directly rather than through a lib/ helper because
 * this is the only surface that wants "every department, with its policy or
 * the absence of one"; a shared query would be an abstraction with one caller.
 */
export default async function SchedulingPage() {
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

  const unset = departments.filter((d) => !d.policy).length;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
      <header className="flex flex-col gap-2">
        <span className="text-muted-foreground inline-flex w-fit items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] uppercase">
          <span aria-hidden className="bg-brand-500 ring-brand-500/20 size-1 rounded-full ring-2" />
          {scope.hospitalName} · Scheduling
        </span>
        <h1 className="font-display text-foreground sm:text-heading-l text-[24px] leading-[1.15] font-medium tracking-[-0.015em]">
          Scheduling
        </h1>
        <p className="text-muted-foreground max-w-2xl text-[13.5px] leading-relaxed">
          Aggregate operational view and department booking policy. Per-clinician availability and
          booked sessions live in each clinician&apos;s own workspace.
        </p>
        <div className="bg-brand-500/60 dark:bg-brand-400/50 h-px w-10" aria-hidden />
      </header>

      <SchedulingOverviewCard hospitalId={scope.hospitalId} variant="panel" />

      {unset > 0 && departments.length > 0 ? (
        <p className="border-border bg-muted/50 text-muted-foreground text-body-s rounded-md border p-3 leading-relaxed">
          <span className="text-foreground font-medium">
            {unset} of {departments.length}{" "}
            {departments.length === 1 ? "department has" : "departments have"} no booking policy.
          </span>{" "}
          Those departments are unrestricted — they accept same-day arrivals at any hour, and
          booking follows each clinician&apos;s own availability alone. That is a working default,
          not an error; set a policy only where you want to narrow it.
        </p>
      ) : null}

      <PolicyForm departments={departments} />

      <PlaceholderSurface
        title="Utilisation analytics"
        description="The policy editor above is live. The operational numbers that tell you whether it is working — utilisation, no-show patterns, and the declared → arrived conversion per department that ADR 0084 names as the measure of the same-day door — land in their own prompt."
        upcoming={[
          "Slot utilisation by clinician + department",
          "Declared → arrived conversion per department",
          "No-show pattern surfacing (operational signal, never patient-punitive)",
          "Stale-pending-approval signal for clinicians sitting on requests",
        ]}
      />
    </div>
  );
}

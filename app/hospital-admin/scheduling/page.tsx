import { requireHospitalAdminScope } from "@/lib/hospital-admin/scope";
import { PlaceholderSurface } from "../_components/placeholder-surface";
import { SchedulingOverviewCard } from "../_components/scheduling-overview-card";

/**
 * Scheduling — hospital-admin surface.
 *
 * The full department-policy editor + utilisation analytics land in a
 * follow-up prompt. For now we surface the aggregate SchedulingOverviewCard
 * (live numbers from the scheduling feature) + a placeholder that names
 * what's coming next.
 *
 * Per-clinician schedules live in each clinician's workspace
 * (/clinician/schedule + /clinician/availability) and aren't surfaced
 * here individually — that respects the boundary "admin sees structure
 * + aggregates, not individual encounters."
 */
export default async function SchedulingPage() {
  const scope = await requireHospitalAdminScope();
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
      <header className="flex flex-col gap-2">
        <span className="text-muted-foreground inline-flex w-fit items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] uppercase">
          <span aria-hidden className="size-1 rounded-full bg-teal-500 ring-2 ring-teal-500/20" />
          {scope.hospitalName} · Scheduling
        </span>
        <h1 className="font-display text-foreground text-[24px] leading-[1.15] font-medium tracking-[-0.015em] sm:text-[28px]">
          Scheduling
        </h1>
        <p className="text-muted-foreground max-w-2xl text-[13.5px] leading-relaxed">
          Aggregate operational view. Per-clinician availability + booked sessions live in each
          clinician&apos;s workspace; this is the rollup + the place department policy will sit.
        </p>
        <div className="h-px w-10 bg-teal-500/60 dark:bg-teal-400/50" aria-hidden />
      </header>

      <SchedulingOverviewCard hospitalId={scope.hospitalId} variant="panel" />

      <PlaceholderSurface
        title="Department policy + utilisation analytics"
        description="The department scheduling policy editor (slot length, buffers, default auto-confirm, bookable hours, reminder lead times) and the utilisation / no-show / urgent-volume analytics land in the next scheduling prompt. The tile above is the first piece in place."
        upcoming={[
          "Per-department policy editor (slot length, buffers, bookable weekdays + hours)",
          "Reminder lead-time defaults per department",
          "Slot utilisation by clinician + department",
          "No-show pattern surfacing (operational signal, never patient-punitive)",
          "Stale-pending-approval signal for clinicians sitting on requests",
        ]}
      />
    </div>
  );
}

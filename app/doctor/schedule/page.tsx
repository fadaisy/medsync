import type { Metadata } from "next";

import { requireDoctorScope } from "@/lib/doctor/scope";
import { fetchClinicianCalendarEvents } from "@/lib/scheduling/calendar";
import {
  fetchClinicianAvailabilityBlocks,
  fetchCurrentlyBeingSeen,
  fetchDepartmentQueueToday,
  fetchEffectiveSchedulingSettings,
  fetchPendingApprovals,
  fetchSchedulingStats,
} from "@/lib/scheduling/doctor";
import { AvailabilitySheetButton } from "./_components/availability-sheet";
import { DoctorCalendar } from "./_components/doctor-calendar";
import { PendingApprovalsRail } from "./_components/pending-rail";
import { QueueRail } from "./_components/queue-rail";
import { SchedulingSettingsSheet } from "./_components/settings-sheet";
import { StatRail } from "./_components/stat-rail";

export const metadata: Metadata = { title: "Schedule · Doctor · MedSync" };
export const dynamic = "force-dynamic";

/** `rangeEnd` is exclusive everywhere below, so the label names the last day actually fetched. */
function formatWindowDate(d: Date, exclusiveEnd = false): string {
  const shown = exclusiveEnd ? new Date(d.getTime() - 86_400_000) : d;
  return shown.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export default async function DoctorSchedulePage() {
  const scope = await requireDoctorScope();

  const rangeStart = new Date();
  rangeStart.setDate(rangeStart.getDate() - 7);
  rangeStart.setHours(0, 0, 0, 0);
  const rangeEnd = new Date();
  rangeEnd.setDate(rangeEnd.getDate() + 14);
  rangeEnd.setHours(0, 0, 0, 0);

  const [events, stats, pending, queue, settings, beingSeen, availabilityBlocks] =
    await Promise.all([
      fetchClinicianCalendarEvents({
        clinicianUserId: scope.userId,
        hospitalId: scope.hospitalId,
        rangeStart,
        rangeEnd,
      }),
      fetchSchedulingStats({
        clinicianUserId: scope.userId,
        hospitalId: scope.hospitalId,
        rangeStart,
        rangeEnd,
      }),
      fetchPendingApprovals({
        clinicianUserId: scope.userId,
        hospitalId: scope.hospitalId,
        limit: 20,
      }),
      fetchDepartmentQueueToday({ departmentId: scope.departmentId }),
      fetchEffectiveSchedulingSettings({
        clinicianUserId: scope.userId,
        hospitalId: scope.hospitalId,
        departmentId: scope.departmentId,
      }),
      fetchCurrentlyBeingSeen({ departmentId: scope.departmentId }),
      fetchClinicianAvailabilityBlocks({
        clinicianUserId: scope.userId,
        hospitalId: scope.hospitalId,
        limit: 50,
      }),
    ]);

  return (
    <div className="stagger-children mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 lg:px-6 lg:py-9">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-muted-foreground text-overline inline-flex items-center gap-1.5 font-mono uppercase">
            <span
              aria-hidden
              className="bg-brand-500 ring-brand-500/20 size-1 rounded-full ring-2"
            />
            {scope.hospitalName} · {scope.departmentName} · Schedule
          </span>
          <div className="flex items-center gap-1.5">
            <AvailabilitySheetButton blocks={availabilityBlocks} />
            <SchedulingSettingsSheet
              defaults={{
                autoConfirm: settings.autoConfirm,
                defaultSlotMinutes: settings.defaultSlotMinutes,
                bufferMinutes: settings.bufferMinutes,
                allowVirtual: settings.allowVirtual,
                allowOutOfHoursOverride: settings.allowOutOfHoursOverride,
                usingDefaults: settings.usingDefaults,
              }}
            />
          </div>
        </div>
        <h1 className="font-display text-foreground text-heading-l leading-[1.15] font-medium tracking-[-0.015em]">
          Your week
        </h1>
        <p className="text-muted-foreground text-body-s max-w-[60ch] leading-relaxed">
          Appointments + availability blocks. Click an appointment for the detail panel.{" "}
          {settings.autoConfirm
            ? "Auto-confirm is on — patient requests confirm immediately."
            : "Manual approval is on — patient requests land in the rail on the right."}{" "}
          Open <span className="font-mono">Availability</span> to declare bookable hours, or to mark
          leave — leave is what takes time back off the bookable grid.
        </p>
        {beingSeen?.patientCode ? (
          <p className="text-muted-foreground text-body-s">
            <span className="font-mono">{scope.departmentName}</span> now seeing:{" "}
            <span className="text-foreground font-medium">{beingSeen.patientCode}</span>
            {beingSeen.calledAtIso ? (
              <span className="text-muted-foreground/80">
                {" "}
                · called{" "}
                {new Date(beingSeen.calledAtIso).toLocaleTimeString(undefined, {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
            ) : null}
          </p>
        ) : null}
      </header>

      <StatRail stats={stats} />

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <DoctorCalendar
          events={events}
          windowLabel={`${formatWindowDate(rangeStart)} – ${formatWindowDate(rangeEnd, true)}`}
        />
        <div className="flex flex-col gap-4 lg:max-w-[300px]">
          {!settings.autoConfirm ? <PendingApprovalsRail rows={pending} /> : null}
          <QueueRail entries={queue} />
        </div>
      </div>
    </div>
  );
}

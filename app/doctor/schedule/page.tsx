import type { Metadata } from "next";
import Link from "next/link";

import { requireDoctorScope } from "@/lib/doctor/scope";
import { fetchClinicianCalendarEvents } from "@/lib/scheduling/calendar";
import {
  fetchCurrentlyBeingSeen,
  fetchDepartmentQueueToday,
  fetchEffectiveSchedulingSettings,
  fetchPendingApprovals,
  fetchSchedulingStats,
} from "@/lib/scheduling/doctor";
import { DoctorCalendar } from "./_components/doctor-calendar";
import { PendingApprovalsRail } from "./_components/pending-rail";
import { QueueRail } from "./_components/queue-rail";
import { SchedulingSettingsSheet } from "./_components/settings-sheet";
import { StatRail } from "./_components/stat-rail";

export const metadata: Metadata = { title: "Schedule · Doctor · MedSync" };
export const dynamic = "force-dynamic";

export default async function DoctorSchedulePage() {
  const scope = await requireDoctorScope();

  const rangeStart = new Date();
  rangeStart.setDate(rangeStart.getDate() - 7);
  rangeStart.setHours(0, 0, 0, 0);
  const rangeEnd = new Date();
  rangeEnd.setDate(rangeEnd.getDate() + 14);
  rangeEnd.setHours(0, 0, 0, 0);

  const [events, stats, pending, queue, settings, beingSeen] = await Promise.all([
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
  ]);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 lg:px-6 lg:py-9">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-muted-foreground inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] uppercase">
            <span aria-hidden className="size-1 rounded-full bg-teal-500 ring-2 ring-teal-500/20" />
            {scope.hospitalName} · {scope.departmentName} · Schedule
          </span>
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
        <h1 className="font-display text-foreground text-[28px] leading-[1.15] font-medium tracking-[-0.015em]">
          Your week
        </h1>
        <p className="text-muted-foreground max-w-[60ch] text-[12.5px] leading-relaxed">
          Appointments + availability blocks. Click an appointment for the detail panel.{" "}
          {settings.autoConfirm
            ? "Auto-confirm is on — patient requests confirm immediately."
            : "Manual approval is on — patient requests land in the rail on the right."}{" "}
          Editing availability blocks lives under{" "}
          <Link href="/clinician/availability" className="underline-offset-2 hover:underline">
            /clinician/availability
          </Link>
          .
        </p>
        {beingSeen?.patientCode ? (
          <p className="text-muted-foreground text-[12px]">
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
        <DoctorCalendar events={events} />
        <div className="flex flex-col gap-4 lg:max-w-[300px]">
          {!settings.autoConfirm ? <PendingApprovalsRail rows={pending} /> : null}
          <QueueRail entries={queue} />
        </div>
      </div>
    </div>
  );
}

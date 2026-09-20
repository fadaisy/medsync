import type { Metadata } from "next";

import { SectionRule } from "@/components/medsync/panel";
import { Pill } from "@/components/ui/data-table";
import { requireDoctorScope } from "@/lib/doctor/scope";
import { fetchClinicianCalendarEvents } from "@/lib/scheduling/calendar";
import {
  fetchClinicianAvailabilityBlocks,
  fetchDepartmentQueueToday,
  fetchEffectiveSchedulingSettings,
  fetchPendingApprovals,
  fetchSchedulingStats,
} from "@/lib/scheduling/doctor";
import { DEFAULT_TIME_ZONE, startOfLocalDay } from "@/supabase/functions/_shared/slots";
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

  // Hospital-local midnights (not the host's), a week back and a fortnight on.
  const now = new Date().getTime();
  const rangeStart = startOfLocalDay(new Date(now - 7 * 86_400_000), DEFAULT_TIME_ZONE);
  const rangeEnd = startOfLocalDay(new Date(now + 14 * 86_400_000), DEFAULT_TIME_ZONE);

  const [events, stats, pending, queue, settings, availabilityBlocks] = await Promise.all([
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
    fetchClinicianAvailabilityBlocks({
      clinicianUserId: scope.userId,
      hospitalId: scope.hospitalId,
      limit: 50,
    }),
  ]);

  const windowLabel = `${formatWindowDate(rangeStart)} – ${formatWindowDate(rangeEnd, true)}`;

  return (
    // At xl the page is the viewport: title, the strip, then the week beside
    // its two rails, each scrolling inside itself. Below xl it flows.
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 xl:grid xl:h-[calc(100svh-3.25rem)] xl:grid-rows-[auto_auto_minmax(0,1fr)]">
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] uppercase">
            <span
              aria-hidden
              className="bg-brand-500 ring-brand-500/20 size-1 rounded-full ring-2"
            />
            {scope.hospitalName} · {scope.departmentName}
          </span>
          {/* The one setting that changes what the page does, said in a word. */}
          <Pill tone={settings.autoConfirm ? "stable" : "neutral"}>
            {settings.autoConfirm ? "Auto-confirm on" : "Manual approval"}
          </Pill>
        </div>
        <SectionRule
          title="Your week"
          action={
            <div className="flex items-center gap-2">
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
          }
        />
      </header>

      <StatRail stats={stats} windowLabel={windowLabel} />

      <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <DoctorCalendar events={events} windowLabel={windowLabel} />
        <div className="grid min-h-0 gap-4 xl:grid-rows-[auto_minmax(0,1fr)]">
          {!settings.autoConfirm ? <PendingApprovalsRail rows={pending} /> : null}
          <QueueRail entries={queue} />
        </div>
      </div>
    </div>
  );
}

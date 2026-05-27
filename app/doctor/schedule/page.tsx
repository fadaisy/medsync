import type { Metadata } from "next";
import Link from "next/link";

import { requireDoctorScope } from "@/lib/doctor/scope";
import { fetchClinicianCalendarEvents } from "@/lib/scheduling/calendar";
import { DoctorCalendar } from "./_components/doctor-calendar";

export const metadata: Metadata = { title: "Schedule · Doctor · MedSync" };
export const dynamic = "force-dynamic";

export default async function DoctorSchedulePage() {
  const scope = await requireDoctorScope();

  // 3-week window centred on today — enough for week-view navigation
  // around the current week without a refetch on every prev/next.
  // Longer jumps trigger a full page reload (onRangeChange is a
  // polish addition).
  const rangeStart = new Date();
  rangeStart.setDate(rangeStart.getDate() - 7);
  rangeStart.setHours(0, 0, 0, 0);

  const rangeEnd = new Date();
  rangeEnd.setDate(rangeEnd.getDate() + 14);
  rangeEnd.setHours(0, 0, 0, 0);

  const events = await fetchClinicianCalendarEvents({
    clinicianUserId: scope.userId,
    hospitalId: scope.hospitalId,
    rangeStart,
    rangeEnd,
  });

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 lg:px-6 lg:py-9">
      <header className="flex flex-col gap-2">
        <span className="text-muted-foreground inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] uppercase">
          <span aria-hidden className="size-1 rounded-full bg-teal-500 ring-2 ring-teal-500/20" />
          {scope.hospitalName} · {scope.departmentName} · Schedule
        </span>
        <h1 className="font-display text-foreground text-[28px] leading-[1.15] font-medium tracking-[-0.015em]">
          Your week
        </h1>
        <p className="text-muted-foreground max-w-[60ch] text-[12.5px] leading-relaxed">
          Appointments + availability blocks. Click an appointment for the detail panel. Editing
          availability lives under{" "}
          <Link href="/clinician/availability" className="underline-offset-2 hover:underline">
            /clinician/availability
          </Link>
          .
        </p>
      </header>

      <DoctorCalendar events={events} />
    </div>
  );
}

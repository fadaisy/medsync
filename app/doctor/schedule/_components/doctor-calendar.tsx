"use client";

import type { ScheduleAppointmentRow } from "@/app/clinician/schedule/_components/schedule-list";
import type { CalendarEvent } from "@/components/scheduling/calendar/types";
import { useState } from "react";

import { AppointmentDetailSheet } from "@/app/clinician/schedule/_components/appointment-detail-sheet";
import { MedSyncCalendar } from "@/components/scheduling/calendar/calendar";

/**
 * Doctor calendar wrapper — client-side glue between the reusable
 * MedSyncCalendar and the existing AppointmentDetailSheet from the
 * clinician schedule. Reuses the sheet's action wiring (confirm /
 * decline / cancel / no-show) without rebuilding it.
 *
 * The calendar's `onEventClick` fires only for clickable appointment
 * blocks (availability blocks are passive background); we map the
 * CalendarAppointment shape to ScheduleAppointmentRow and open the
 * sheet.
 *
 * `windowLabel` names the range the server actually fetched. The
 * calendar navigates freely but the events array does not follow, so
 * without it a week outside the window renders as a confidently empty
 * diary — a claim the database has not made. It is a page-load window,
 * not a booking horizon: nothing here caps how far ahead a clinician
 * may be booked (ADR 0084 §8 caps patient-held bookings only).
 *
 * ponytail: a label instead of a refetch. Ceiling is a doctor who works
 * a month out and has to reload to see it; upgrade path is wiring
 * MedSyncCalendar's `onRangeChange` to a `?from=` search param the page
 * already has the query to serve.
 */
export function DoctorCalendar({
  events,
  windowLabel,
}: {
  events: ReadonlyArray<CalendarEvent>;
  windowLabel: string;
}) {
  const [selected, setSelected] = useState<ScheduleAppointmentRow | null>(null);

  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-1.5">
      <MedSyncCalendar
        events={events}
        defaultView="week"
        className="min-h-[480px] flex-1 xl:min-h-0"
        onEventClick={(ev) => {
          if (ev.kind !== "appointment") return;
          setSelected({
            id: ev.id.replace(/^a-/, ""),
            status: ev.status,
            priority: ev.priority,
            type: ev.type,
            reason: ev.reason,
            reasonNote: ev.reasonNote,
            startsAtIso: ev.startsAtIso,
            endsAtIso: ev.endsAtIso,
            patientName: ev.patientName,
            patientCode: ev.patientCode,
          });
        }}
      />
      <p className="text-muted-foreground text-caption">
        Showing {windowLabel}; dates outside it draw empty until a reload.
      </p>
      <AppointmentDetailSheet item={selected} onOpenChange={(open) => !open && setSelected(null)} />
    </div>
  );
}

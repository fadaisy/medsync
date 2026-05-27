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
 */
export function DoctorCalendar({ events }: { events: ReadonlyArray<CalendarEvent> }) {
  const [selected, setSelected] = useState<ScheduleAppointmentRow | null>(null);

  return (
    <>
      <MedSyncCalendar
        events={events}
        defaultView="week"
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
      <AppointmentDetailSheet item={selected} onOpenChange={(open) => !open && setSelected(null)} />
    </>
  );
}

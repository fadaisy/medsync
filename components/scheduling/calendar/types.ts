/**
 * Calendar event shape — the unified surface that month / week / day
 * views all render. Appointments + availability blocks are both
 * represented here; the `kind` discriminator decides rendering.
 */

export type CalendarEventKind = "appointment" | "availability";

export interface CalendarEventBase {
  id: string;
  kind: CalendarEventKind;
  startsAtIso: string;
  endsAtIso: string;
}

export interface CalendarAppointment extends CalendarEventBase {
  kind: "appointment";
  status: string; // requested / confirmed / arrived / ...
  priority: "routine" | "urgent";
  type: "in_person" | "virtual";
  reason: string;
  reasonNote: string | null;
  patientName: string; // pre-formatted (display only)
  patientCode: string | null;
  clinicianName: string | null;
  departmentName: string | null;
}

export interface CalendarAvailability extends CalendarEventBase {
  kind: "availability";
  availabilityKind: string; // bookable / teaching / ward_round / admin / leave / unavailable
  recurrence: string;
  location: string | null;
}

export type CalendarEvent = CalendarAppointment | CalendarAvailability;

/**
 * Click handler — the calendar passes the raw event back; the caller
 * decides what to do (typically open AppointmentDetailSheet).
 */
export type OnEventClick = (event: CalendarEvent) => void;

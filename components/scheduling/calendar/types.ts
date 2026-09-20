/**
 * Calendar event shape — the unified surface that month / week / day
 * views all render. Appointments, availability blocks and clinic days
 * (sessions) are all represented here; the `kind` discriminator decides
 * rendering.
 */

export type CalendarEventKind = "appointment" | "availability" | "session";

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
  /**
   * Session mode: the clinic day this booking holds a position in. Such a
   * row carries the session's own starts_at/ends_at, so on a timeline it
   * would sit exactly under its clinic-day card — the grids let the card
   * stand for it and the agenda lists it.
   */
  sessionId?: string | null;
}

export interface CalendarAvailability extends CalendarEventBase {
  kind: "availability";
  availabilityKind: string; // bookable / teaching / ward_round / admin / leave / unavailable
  recurrence: string;
  location: string | null;
}

/** One dated clinic day — the hospital admin's weekly rule, materialised. */
export interface CalendarSession extends CalendarEventBase {
  kind: "session";
  serviceLineName: string;
  venue: string | null;
  bookedCount: number;
  /** ceil(capacity_booked × overbooking_factor) — the places the allocator will hand out. */
  capacity: number;
  status: string; // published / closed / cancelled
  delayMinutes: number;
}

export type CalendarEvent = CalendarAppointment | CalendarAvailability | CalendarSession;

/**
 * Click handler — the calendar passes the raw event back; the caller
 * decides what to do (typically open AppointmentDetailSheet).
 */
export type OnEventClick = (event: CalendarEvent) => void;

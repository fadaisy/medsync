import "server-only";

import type { PillTone } from "@/components/ui/data-table";
import { and, asc, desc, eq, gte, inArray, lt } from "drizzle-orm";

import { db } from "@/db";
import { hospitalDepartments } from "@/db/schema/hospital-departments";
import { hospitals } from "@/db/schema/hospitals";
import { appointments } from "@/db/schema/scheduling";
import { users } from "@/db/schema/users";
import { DEFAULT_TIME_ZONE, localWeekdayAndMinutes } from "@/supabase/functions/_shared/slots";

/**
 * Patient-facing appointment reads + the status vocabulary that goes
 * with them. Home and the visits list rendered byte-identical copies
 * of the tone map, the label map and `formatWhen`, and two queries
 * that differed only in filter and limit — so a status renamed on one
 * screen silently disagreed with the other.
 *
 * `server-only`: the Drizzle/postgres driver must not reach the
 * browser bundle. `PillTone` is a type-only import, so it is erased
 * and never pulls the client `data-table` module in at runtime. If a
 * client component ever needs the label/tone maps, split them into a
 * `-constants.ts` sibling the way `self-tracking-constants.ts` does.
 */

/** "Thu 18 Sep" in the clinic's zone — the same label the reschedule picker speaks. */
const DAY_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: DEFAULT_TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
});

/** Statuses whose appointment is still going to happen. */
const LIVE_STATUSES = [
  "requested",
  "pending_approval",
  "confirmed",
  "arrived",
  "in_progress",
] as const;

export const STATUS_TONES: Record<string, PillTone> = {
  requested: "pending",
  pending_approval: "pending",
  confirmed: "stable",
  arrived: "admitted",
  in_progress: "admitted",
  completed: "discharged",
  cancelled: "neutral",
  no_show: "caution",
  rescheduled: "neutral",
  // Amber, not critical. A clinic declining a request is a scheduling
  // outcome; red on a MedSync surface means a clinician has declared a life
  // threat, and spending it here is how a patient learns to ignore it where
  // it matters. Same tone as `no_show`, which is the same class of event.
  declined: "caution",
};

export const STATUS_LABEL: Record<string, string> = {
  requested: "Requested",
  pending_approval: "Awaiting approval",
  confirmed: "Confirmed",
  arrived: "You've arrived",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "Missed",
  rescheduled: "Rescheduled",
  declined: "Declined",
};

/** Statuses a patient may still cancel themselves. */
export const CANCELLABLE: ReadonlySet<string> = new Set([
  "requested",
  "pending_approval",
  "confirmed",
  "arrived",
]);

export interface AppointmentRow {
  id: string;
  startsAtIso: string;
  status: string;
  type: string;
  reasonNote: string | null;
  /** `users.fullName` is nullable; falls back to "Your clinician". */
  clinicianName: string;
  departmentName: string;
  hospitalName: string;
  /** Six characters the patient shows at the desk (ADR 0088); null on rows that predate Gate C. */
  bookingCode: string | null;
  /** Set together with `positionNumber` and the window: this is a place in a clinic day, not a time. */
  sessionId: string | null;
  positionNumber: number | null;
  arrivalWindowStartIso: string | null;
  arrivalWindowEndIso: string | null;
}

/**
 * - `upcoming` — everything from `now` forward, whatever its status.
 *   The visits list needs this: a cancelled or declined future visit
 *   is still something the patient must be able to see.
 * - `upcoming-active` — only the statuses that are still going to
 *   happen. Home's "Upcoming" glance, which must not offer a
 *   cancelled visit as the next thing you are doing.
 * - `past` — everything before `now`, newest first.
 */
export type AppointmentListKind = "upcoming" | "upcoming-active" | "past";

/**
 * `now` is a parameter, not a local `new Date()`, so a caller
 * fetching upcoming and past together can partition both halves on
 * one instant. Two independent clocks leave a sliver in which an
 * appointment belongs to neither list.
 */
export async function fetchAppointments(
  patientUserId: string,
  kind: AppointmentListKind,
  limit = 30,
  now: Date = new Date(),
): Promise<AppointmentRow[]> {
  const isPast = kind === "past";

  const rows = await db
    .select({
      id: appointments.id,
      startsAt: appointments.startsAt,
      status: appointments.status,
      type: appointments.type,
      reasonNote: appointments.reasonNote,
      clinicianName: users.fullName,
      departmentName: hospitalDepartments.name,
      hospitalName: hospitals.name,
      bookingCode: appointments.bookingCode,
      sessionId: appointments.sessionId,
      positionNumber: appointments.positionNumber,
      arrivalWindowStart: appointments.arrivalWindowStart,
      arrivalWindowEnd: appointments.arrivalWindowEnd,
    })
    .from(appointments)
    .innerJoin(users, eq(users.id, appointments.clinicianUserId))
    .innerJoin(hospitalDepartments, eq(hospitalDepartments.id, appointments.departmentId))
    .innerJoin(hospitals, eq(hospitals.id, appointments.hospitalId))
    .where(
      and(
        eq(appointments.patientUserId, patientUserId),
        isPast ? lt(appointments.startsAt, now) : gte(appointments.startsAt, now),
        kind === "upcoming-active" ? inArray(appointments.status, [...LIVE_STATUSES]) : undefined,
      ),
    )
    .orderBy(isPast ? desc(appointments.startsAt) : asc(appointments.startsAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    startsAtIso: r.startsAt.toISOString(),
    status: r.status,
    type: r.type,
    reasonNote: r.reasonNote,
    clinicianName: r.clinicianName ?? "Your clinician",
    departmentName: r.departmentName,
    hospitalName: r.hospitalName,
    bookingCode: r.bookingCode,
    sessionId: r.sessionId,
    positionNumber: r.positionNumber,
    arrivalWindowStartIso: r.arrivalWindowStart?.toISOString() ?? null,
    arrivalWindowEndIso: r.arrivalWindowEnd?.toISOString() ?? null,
  }));
}

/**
 * "Thu 18 Sep · Morning session" — a day and a day-part, never a clock
 * numeral (ADR 0084 §10). Luganda and Swahili run a dawn-anchored clock in
 * which _ssawa bbiri_ is literally "two" and denotes 8:00am, so the numeral
 * itself is offset by six and an English AM/PM word does not fix that: it
 * disambiguates a distinction that was never the failure mode and leaves
 * "14:00" to be re-read against the local convention. §10 extends the rule
 * past the two entry screens to the appointments list by name, and home
 * renders the same string — this is the one function both read it from.
 *
 * Pinned to the clinic's zone, never the host's. The 24-hour version read
 * `toLocaleTimeString(undefined, …)` with no `timeZone`, which on a UTC host
 * is three hours behind Kampala: a 09:00 EAT visit printed "06:00", and one
 * before 03:00 EAT printed the previous day.
 */
export function formatWhen(iso: string): string {
  const at = new Date(iso);
  const { minutesOfDay } = localWeekdayAndMinutes(at, DEFAULT_TIME_ZONE);
  // Local noon, the same boundary /patient/book and the reschedule picker
  // split on, so the three screens cannot name the same visit differently.
  return `${DAY_FMT.format(at)} · ${minutesOfDay < 12 * 60 ? "Morning" : "Afternoon"} session`;
}

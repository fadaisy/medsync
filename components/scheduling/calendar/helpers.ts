import type { CalendarEvent } from "./types";
import type { PillTone } from "@/components/ui/pill";

import {
  DEFAULT_TIME_ZONE,
  localDateKey,
  localWeekdayAndMinutes,
} from "@/supabase/functions/_shared/slots";

/**
 * Calendar date math + status helpers. Native Date + Intl only —
 * deliberately no date-fns / luxon so the bundle stays light and the
 * timezone semantics are explicit (EAT for display; UTC stored).
 *
 * "Day starts at 00:00 local" semantics: we use Date methods that
 * respect the user's locale + tz for *grid placement* (which day a
 * 22:30 EAT slot belongs to). Storage is UTC; rendering is local.
 */

export type CalendarView = "month" | "week" | "day" | "agenda";

/** Inclusive start, exclusive end. */
export interface DateRange {
  start: Date;
  end: Date;
}

/** Status semantic colour tone — feeds the calendar event card. */
export type StatusTone =
  | "pending"
  | "confirmed"
  | "arrived"
  | "completed"
  | "cancelled"
  | "no_show";

export const STATUS_TONES: Record<string, StatusTone> = {
  requested: "pending",
  pending_approval: "pending",
  confirmed: "confirmed",
  arrived: "arrived",
  in_progress: "arrived",
  completed: "completed",
  cancelled: "cancelled",
  declined: "cancelled",
  no_show: "no_show",
  rescheduled: "cancelled",
};

export const STATUS_LABEL: Record<string, string> = {
  requested: "Requested",
  pending_approval: "Awaiting approval",
  confirmed: "Confirmed",
  arrived: "Arrived",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
  declined: "Declined",
  no_show: "Missed",
  rescheduled: "Rescheduled",
};

export const SESSION_STATUS_LABEL: Record<string, string> = {
  published: "Published",
  closed: "Closed",
  cancelled: "Cancelled",
};

export const AVAILABILITY_KIND_LABEL: Record<string, string> = {
  bookable: "Bookable",
  teaching: "Teaching",
  ward_round: "Ward round",
  admin: "Admin",
  leave: "Leave",
  unavailable: "Unavailable",
  custom: "Custom",
};

/**
 * Card fill + border per tone (DESIGN-medsync.md status pairs and brand
 * tints). No left-edge bars — state is the tint plus the label pill's word.
 * A missed appointment is muted, not red: red is for genuine emergencies,
 * and the urgent ring is the one place the calendar spends it.
 */
export const CARD_TONE_CLASSES: Record<StatusTone, string> = {
  pending: "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900",
  // brand-* and gray-* are role-inverted by `.dark` in globals.css — no `dark:` override.
  confirmed: "bg-brand-50 border-brand-200",
  arrived: "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-900",
  completed: "bg-muted border-border text-muted-foreground",
  cancelled: "bg-muted/60 border-border text-muted-foreground",
  no_show: "bg-muted border-border text-muted-foreground",
};

export const SESSION_CARD_CLASSES = "bg-brand-100 border-brand-300";
export const MUTED_CARD_CLASSES = "bg-muted/50 border-border/70 text-muted-foreground";

/**
 * Pill tone per availability kind — the one map every list, sheet and
 * legend reads (ADR 0095). `leave` and `unavailable` used to share "caution";
 * the owner asked to tell every kind apart at a glance, so each has its own
 * tint — and the word still carries the state, never the colour alone.
 * Nothing here is "critical": red is for genuine emergencies, and a
 * doctor's day off is not one.
 */
export const AVAILABILITY_KIND_TONES: Record<string, PillTone> = {
  bookable: "admitted",
  teaching: "info",
  ward_round: "discharged",
  admin: "neutral",
  leave: "caution",
  unavailable: "notice",
  custom: "stable",
};

/**
 * Card fill + border per kind, matching the pill tones above. Bookable used
 * to be the only tinted block with the rest receding into the muted grey;
 * ADR 0095 gives each its own tint for the same reason as the tones.
 */
export const AVAILABILITY_CARD_CLASSES: Record<string, string> = {
  bookable: "bg-brand-50 border-brand-200",
  teaching: "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-900",
  ward_round: "bg-status-discharged-bg border-violet-200 dark:border-violet-900",
  admin: "bg-gray-100 border-gray-300",
  leave: "bg-status-caution-bg border-amber-300 dark:border-amber-800",
  unavailable: "bg-orange-50 border-orange-300 dark:bg-orange-950/30 dark:border-orange-800",
  custom: "bg-status-stable-bg border-green-300 dark:border-green-800",
};

/** What a card says and how it is tinted — one description shared by every view and the search. */
export interface EventDescription {
  /** The kind, as a word: "Appointment", "Clinic day", "Leave", … Carries "Urgent" for an urgent appointment. */
  kindLabel: string;
  pillTone: PillTone;
  /** The status word beside the pill, when the kind has a status. */
  statusWord: string | null;
  title: string;
  subtitle: string | null;
  /** Monogram chip text: patient initials, or a clinic day's booked count. */
  monogram: string | null;
  cardClasses: string;
  urgent: boolean;
  /** Cancelled / missed / completed — the title is struck through. */
  struck: boolean;
  clickable: boolean;
}

export function describeEvent(ev: CalendarEvent): EventDescription {
  if (ev.kind === "appointment") {
    const tone = STATUS_TONES[ev.status] ?? "pending";
    const urgent = ev.priority === "urgent";
    const kind = ev.type === "virtual" ? "Video visit" : "Appointment";
    return {
      kindLabel: urgent ? `Urgent ${kind.toLowerCase()}` : kind,
      pillTone: urgent ? "critical" : APPOINTMENT_PILL_TONE[tone],
      statusWord: STATUS_LABEL[ev.status] ?? ev.status,
      title: ev.patientName,
      subtitle: ev.reason.replace(/_/g, " "),
      monogram: initials(ev.patientName),
      cardClasses: CARD_TONE_CLASSES[tone],
      urgent,
      struck: tone === "cancelled" || tone === "no_show",
      clickable: true,
    };
  }
  if (ev.kind === "session") {
    const live = ev.status === "published";
    return {
      kindLabel: "Clinic day",
      pillTone: live ? "admitted" : "neutral",
      statusWord: live ? null : (SESSION_STATUS_LABEL[ev.status] ?? ev.status),
      title: ev.serviceLineName,
      subtitle: `${ev.bookedCount} of ${ev.capacity} places`,
      monogram: String(ev.bookedCount),
      cardClasses: live ? SESSION_CARD_CLASSES : MUTED_CARD_CLASSES,
      urgent: false,
      struck: ev.status === "cancelled",
      clickable: true,
    };
  }
  // A custom block IS its label; the pill still says "Custom" so the kind is named.
  const kindLabel = AVAILABILITY_KIND_LABEL[ev.availabilityKind] ?? ev.availabilityKind;
  return {
    kindLabel,
    pillTone: AVAILABILITY_KIND_TONES[ev.availabilityKind] ?? "neutral",
    statusWord: null,
    title: ev.availabilityKind === "custom" ? (ev.label ?? "Custom") : kindLabel,
    subtitle: ev.location,
    monogram: null,
    cardClasses: AVAILABILITY_CARD_CLASSES[ev.availabilityKind] ?? MUTED_CARD_CLASSES,
    urgent: false,
    struck: false,
    clickable: false,
  };
}

const APPOINTMENT_PILL_TONE: Record<StatusTone, PillTone> = {
  pending: "caution",
  confirmed: "admitted",
  arrived: "stable",
  completed: "neutral",
  cancelled: "neutral",
  no_show: "neutral",
};

/**
 * "Amina Okello" → "AO". A bare code ("MRN-2026-00012", or "MS-…") is not a
 * name: its LAST four characters are what a desk reads out, so the chip
 * shows those rather than a meaningless "MR".
 */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0]![0]! + words[1]![0]!).toUpperCase();
  const one = name.trim();
  return /[-\d]/.test(one) ? one.slice(-4).toUpperCase() : one.slice(0, 2).toUpperCase();
}

/**
 * Which rows a timeline card has room for, by its pixel height. The title
 * always shows; everything else earns its line. At 64 px/hour a 30-minute
 * appointment (32 px) reads as pill + title, an hour as pill + title +
 * time, a two-hour clinic as the whole card with its footer.
 */
export function cardRows(heightPx: number): {
  pill: boolean;
  title: true;
  time: boolean;
  subtitle: boolean;
  footer: boolean;
} {
  return {
    pill: heightPx >= 28,
    title: true,
    time: heightPx >= 56,
    subtitle: heightPx >= 80,
    footer: heightPx >= 112,
  };
}

/** Case-insensitive match on the words a card shows: title, patient name and code. */
export function eventMatches(ev: CalendarEvent, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [describeEvent(ev).title];
  if (ev.kind === "appointment") hay.push(ev.patientName, ev.patientCode ?? "");
  return hay.some((h) => h.toLowerCase().includes(q));
}

/* ─── Date math ─────────────────────────────────────────────────── */

export function startOfDay(d: Date): Date {
  const next = new Date(d);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function endOfDay(d: Date): Date {
  const next = new Date(d);
  next.setHours(23, 59, 59, 999);
  return next;
}

/** Week starts on Monday — matches Ugandan + European conventions. */
export function startOfWeek(d: Date): Date {
  const day = d.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const diff = (day + 6) % 7; // distance back to Monday
  const next = startOfDay(d);
  next.setDate(next.getDate() - diff);
  return next;
}

export function endOfWeek(d: Date): Date {
  const start = startOfWeek(d);
  const next = new Date(start);
  next.setDate(next.getDate() + 7);
  return next;
}

export function startOfMonth(d: Date): Date {
  return startOfDay(new Date(d.getFullYear(), d.getMonth(), 1));
}

export function endOfMonth(d: Date): Date {
  return startOfDay(new Date(d.getFullYear(), d.getMonth() + 1, 1));
}

/** Inclusive grid covering a month: starts on Monday of the first week, ends Sunday of the last week. */
export function monthGridRange(d: Date): DateRange {
  return { start: startOfWeek(startOfMonth(d)), end: endOfWeek(endOfMonth(d)) };
}

export function addDays(d: Date, n: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
}

export function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * A day cell's key — the browser-local calendar date the `days` array was
 * built from. Events are bucketed by `eventDayKey` (the hospital's date), so
 * the two agree on "Mon 14" whatever zone the laptop is set to.
 */
export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** The hospital's date for an instant — where an event belongs. */
export function eventDayKey(instant: Date): string {
  return localDateKey(instant, DEFAULT_TIME_ZONE);
}

/** The hospital's date today. */
export function todayKey(): string {
  return localDateKey(new Date(), DEFAULT_TIME_ZONE);
}

export function isToday(d: Date): boolean {
  return dayKey(d) === todayKey();
}

export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

/** Days in [start, end). */
export function daysBetween(range: DateRange): Date[] {
  const out: Date[] = [];
  let cursor = startOfDay(range.start);
  const end = startOfDay(range.end);
  while (cursor < end) {
    out.push(new Date(cursor));
    cursor = addDays(cursor, 1);
  }
  return out;
}

/* ─── Formatters ────────────────────────────────────────────────── */

export function formatMonthYear(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function formatWeekRange(weekStart: Date): string {
  const end = addDays(weekStart, 6);
  const sameMonth = weekStart.getMonth() === end.getMonth();
  const startLabel = weekStart.toLocaleDateString(undefined, {
    month: sameMonth ? "short" : "short",
    day: "numeric",
  });
  const endLabel = sameMonth
    ? end.toLocaleDateString(undefined, { day: "numeric" })
    : end.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${startLabel} – ${endLabel}, ${weekStart.getFullYear()}`;
}

export function formatDay(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** 24-hour, on the hospital's clock (DESIGN "Clinical data display"). */
const TIME_FMT = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: DEFAULT_TIME_ZONE,
});

export function formatTime(d: Date): string {
  return TIME_FMT.format(d);
}

export function formatTimeRange(start: Date, end: Date): string {
  return `${formatTime(start)} – ${formatTime(end)}`;
}

export function formatHourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

/** Minutes since midnight on the HOSPITAL's clock — where a card sits on the grid. */
export function minutesSinceMidnight(d: Date): number {
  return localWeekdayAndMinutes(d, DEFAULT_TIME_ZONE).minutesOfDay;
}

export const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

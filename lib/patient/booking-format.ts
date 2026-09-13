import { DEFAULT_TIME_ZONE, localDateKey } from "@/supabase/functions/_shared/slots";

/**
 * How a booking is spoken on the patient web surfaces — the wizard, its
 * confirmation and the visits list. No `server-only`: the wizard is a Client
 * Component and reads these too, and a date that prints one way on the
 * check step and another under Visits is the kind of drift a patient reads
 * as a different visit.
 *
 * Everything is pinned to the hospital's zone, never the host's: a UTC
 * server is three hours behind Kampala.
 *
 * ADR 0085 §3 reintroduced clock numerals (`9:30 AM`); PRD §6.3 wants dates
 * in full ("Tuesday 22 September", never "in 9 days") beside them.
 */

const FULL_DATE = new Intl.DateTimeFormat("en-GB", {
  timeZone: DEFAULT_TIME_ZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
});

const SHORT_DATE = new Intl.DateTimeFormat("en-GB", {
  timeZone: DEFAULT_TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
});

const TIME = new Intl.DateTimeFormat("en-US", {
  timeZone: DEFAULT_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** "Tuesday 22 September" */
export function formatFullDate(iso: string): string {
  return FULL_DATE.format(new Date(iso));
}

/** "Tue 22 Sep" */
export function formatShortDate(iso: string): string {
  return SHORT_DATE.format(new Date(iso));
}

/**
 * "9:30 AM" — the way the receipt SMS says it. Newer ICU builds put a narrow
 * no-break space before "AM"; a plain space keeps the server's string and
 * the browser's identical, and the text selectable as one token.
 */
export function formatTime(iso: string): string {
  return TIME.format(new Date(iso)).replace(/\u202f/g, " ");
}

/**
 * "9:30 AM and 11:00 AM" — the arrival window as the two instants it is,
 * ready to sit after "Arrive between". A range with a stated basis (ADR
 * 0088 C10), never a point estimate, so the two ends are always both shown.
 */
export function formatArrivalWindow(startIso: string, endIso: string): string {
  return `${formatTime(startIso)} and ${formatTime(endIso)}`;
}

/**
 * "3:40 PM today" / "9:00 AM tomorrow" / "9:00 AM on Tuesday 22 September" —
 * when a waitlist offer closes, in full words (Gate E verifier: the expiry
 * is stated, never "in 2h"). Judged on the clinic's calendar.
 */
export function formatOfferExpiry(iso: string, now: Date): string {
  const at = new Date(iso);
  const day = localDateKey(at, DEFAULT_TIME_ZONE);
  const today = localDateKey(now, DEFAULT_TIME_ZONE);
  const tomorrow = localDateKey(new Date(now.getTime() + 86_400_000), DEFAULT_TIME_ZONE);
  const when =
    day === today ? "today" : day === tomorrow ? "tomorrow" : `on ${formatFullDate(iso)}`;
  return `${formatTime(iso)} ${when}`;
}

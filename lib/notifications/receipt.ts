import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";

/**
 * The durable booking receipt — the one text a patient shows at the desk
 * (PRD §3.3.2, ADR 0088). Composed HERE and nowhere else; the dispatcher
 * calls it for every `appointment_reminders` row of kind 'receipt'.
 *
 * Copy (CSO-provisional, GSM-7, ASCII only, one SMS part):
 *
 *   slot:    MedSync: {hospital}. {line}. {Tue 22 Sep, 9:30 AM}. Code {ABC123}.
 *            Show this at the desk.
 *   session: MedSync: {hospital}. {line}. {Tue 22 Sep}, position {23},
 *            arrive {9:30-11:00 AM}. Code {ABC123}. Show this at the desk.
 *
 * Names are truncated to fit 160 characters; the code, the date and the
 * position never are. No patient name, no reason, no clinician: the handset
 * may be shared (see composeReminderSms for the same rule).
 *
 * Pure — no clock, no DB — so `tests/notifications/receipt.test.ts` can pin
 * every branch.
 */

/** One GSM-7 part. Duplicated from sink.ts on purpose: this file imports nothing from it. */
const MAX_CHARS = 160;
const PREFIX = "MedSync: ";
const SUFFIX = " Show this at the desk.";

export interface ReceiptArgs {
  hospitalName: string;
  /** The service line's name, or the department's when the booking has no line. */
  serviceName: string;
  startsAtIso: string;
  bookingCode: string;
  /** Session mode only. Both or neither. */
  positionNumber?: number | null;
  arrivalWindowStartIso?: string | null;
  arrivalWindowEndIso?: string | null;
}

export function composeReceiptSms(args: ReceiptArgs): string {
  const code = `Code ${args.bookingCode.trim().toUpperCase()}.`;
  const isSession =
    args.positionNumber != null && !!args.arrivalWindowStartIso && !!args.arrivalWindowEndIso;

  const when = isSession
    ? `${formatDay(args.startsAtIso)}, position ${args.positionNumber}, arrive ${formatRange(
        args.arrivalWindowStartIso as string,
        args.arrivalWindowEndIso as string,
      )}.`
    : `${formatDay(args.startsAtIso)}, ${formatClock(args.startsAtIso)}.`;

  // Everything that is never cut, so the names get exactly what is left.
  const fixed = `${PREFIX}. . ${when} ${code}${SUFFIX}`;
  let hospital = ascii(args.hospitalName);
  let line = ascii(args.serviceName);
  // ponytail: shave one char off the longer name until it fits. Bounded by
  // the names' length; a facility name is never long enough to matter.
  while (fixed.length + hospital.length + line.length > MAX_CHARS && (hospital || line)) {
    if (hospital.length >= line.length) hospital = hospital.slice(0, -1).trimEnd();
    else line = line.slice(0, -1).trimEnd();
  }
  return `${PREFIX}${hospital}. ${line}. ${when} ${code}${SUFFIX}`;
}

/** "Tue 22 Sep" — East Africa Time, the only zone served. */
function formatDay(iso: string): string {
  const p = parts(iso, { weekday: "short", day: "numeric", month: "short" });
  return `${p.weekday} ${p.day} ${p.month}`;
}

/** "9:30 AM" */
function formatClock(iso: string): string {
  const p = parts(iso, { hour: "numeric", minute: "2-digit", hour12: true });
  return `${p.hour}:${p.minute} ${p.dayPeriod}`;
}

/** "9:30-11:00 AM", or "11:30 AM-1:00 PM" when the window crosses noon. */
function formatRange(startIso: string, endIso: string): string {
  const a = parts(startIso, { hour: "numeric", minute: "2-digit", hour12: true });
  const b = parts(endIso, { hour: "numeric", minute: "2-digit", hour12: true });
  return a.dayPeriod === b.dayPeriod
    ? `${a.hour}:${a.minute}-${b.hour}:${b.minute} ${b.dayPeriod}`
    : `${a.hour}:${a.minute} ${a.dayPeriod}-${b.hour}:${b.minute} ${b.dayPeriod}`;
}

function parts(iso: string, options: Intl.DateTimeFormatOptions): Record<string, string> {
  const bag: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat("en-US", {
    timeZone: DEFAULT_TIME_ZONE,
    ...options,
  }).formatToParts(new Date(iso))) {
    bag[part.type] = part.value;
  }
  // ICU spells the period "AM"/"PM" in en-US; anything else is normalised so
  // the message stays inside GSM-7 whatever the host's ICU build.
  if (bag.dayPeriod) bag.dayPeriod = /p/i.test(bag.dayPeriod) ? "PM" : "AM";
  return bag;
}

/** Strips anything that would flip the message to UCS-2 and triple the bill. */
function ascii(value: string): string {
  return value
    .replace(/[‘’]/g, "'")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

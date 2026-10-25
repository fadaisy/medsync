export { daysBetween, inDays } from "@patient-core/visits-calendar";

export {
  addDays,
  clockOf,
  countdownOf,
  dayKeyOf,
  dayNumberOf,
  keyInstant,
  longDayOf,
  monthGrid,
  monthShortOf,
  monthTitleOf,
  partOf,
  shiftMonth,
  shortDayOf,
  weekdayOf,
} from "@patient-core/book-days";

export type { Fee, PayLook } from "@patient-core/fees";
export { feeFor, feeText, payLook } from "@patient-core/fees";

/**
 * The arithmetic behind the booking screens (Gate 4), kept pure so it is
 * tested without a network: the "ahead of you" rule, fees, the ticket's
 * payment look, the calendar grid and the words for a clinic day. Nothing
 * here reads a clock on its own; callers pass `now`.
 */

/* ─── where the patient stands (ADR 0084 §6, ADR 0342 §5) ───────── */

/** Present at the hospital: the only statuses where a count ahead is a true sentence. */
const PRESENT = new Set(["arrived", "awaiting_triage"]);

/**
 * "N ahead of you", or null when nothing honest can be said. Only once the
 * patient is present (a declared row is not a place in the line), only from
 * `patient_intake_ahead` (null on any error or before migration 0170), and
 * never an ordinal, a total or a wait.
 */
export function aheadWords(status: string | null, ahead: number | null): string | null {
  if (!status || !PRESENT.has(status)) return null;
  if (ahead === null || !Number.isInteger(ahead) || ahead < 0) return null;
  return ahead === 0 ? "No one is ahead of you." : `${ahead} ahead of you`;
}

/** Said beside a count, so it is never read as a promise (the web's own words). */
export const AHEAD_NOTE = "Sicker people are seen first, so this number can go up as well as down.";

/* ─── days, in the hospital's zone ───────────────────────────────── */

/**
 * "Open in Maps" for a hospital: directions to its pin when its admin set one,
 * else the phone's map app searching its name (the app's own answer, not ours).
 * Apple Maps on iPhone, Google Maps elsewhere; both need no key.
 */
export function mapsUrl(
  os: "ios" | "android" | string,
  name: string,
  pin: { lat: number; lng: number } | null,
): string {
  const place = encodeURIComponent(`${name}, Uganda`);
  if (os === "ios")
    return pin
      ? `https://maps.apple.com/?daddr=${pin.lat},${pin.lng}&q=${encodeURIComponent(name)}`
      : `https://maps.apple.com/?q=${place}`;
  return pin
    ? `https://www.google.com/maps/dir/?api=1&destination=${pin.lat}%2C${pin.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${place}`;
}

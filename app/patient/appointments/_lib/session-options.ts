import type { Slot } from "@/supabase/functions/_shared/slots";

import { DEFAULT_TIME_ZONE, localWeekdayAndMinutes } from "@/supabase/functions/_shared/slots";

/**
 * Engine slots → the day-and-session choices a patient is offered when moving
 * a visit. Pure, and route-private: nothing outside `/patient/appointments`
 * asks this question yet.
 *
 * No `server-only` and no React here on purpose — this is the one piece of
 * arithmetic on the surface that can silently be right on a developer's laptop
 * and wrong on a UTC host, so it has to be reachable from a test.
 */

/** "2026-09-15" in the clinic's zone — the key days are bucketed by. */
const DATE_KEY = new Intl.DateTimeFormat("en-CA", {
  timeZone: DEFAULT_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "Thu 18 Sep" — a date, never a clock numeral (ADR 0084 §10). */
const DAY_LABEL = new Intl.DateTimeFormat("en-GB", {
  timeZone: DEFAULT_TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
});

const DAY_MS = 86_400_000;

/**
 * One day-and-session a visit can move into.
 *
 * ADR 0084 §10 is why this is a session and not a time. Luganda and Swahili
 * run a dawn-anchored clock — _ssawa bbiri_ is literally "two" and denotes
 * 8:00am — so the numeral itself is offset by six, and an English day-part
 * word next to it does not fix that: it disambiguates AM from PM, which was
 * never the failure mode.
 */
export interface SessionOption {
  /** "<startsAtIso>|<endsAtIso>" — the earliest free slot in this session. */
  value: string;
  /** "Today" · "Tomorrow" · "Thu 18 Sep" — never a clock numeral. */
  dayLabel: string;
  /** "Morning session" | "Afternoon session". */
  sessionLabel: string;
}

/**
 * One option per (clinic-local day, session), holding the EARLIEST free slot
 * in it. `buildSlots` returns ascending, so the first slot seen for a bucket
 * is its earliest and no sort is needed.
 *
 * Everything about the day and the session is read in `DEFAULT_TIME_ZONE`,
 * never off the server clock: a UTC host is three hours behind Kampala, so
 * every East African slot before 03:00 EAT would bucket into the previous day
 * — and a patient told "Tomorrow" for a visit that is today loses the visit.
 */
export function toSessionOptions(slots: ReadonlyArray<Slot>, now: Date): SessionOption[] {
  const todayKey = DATE_KEY.format(now);
  const tomorrowKey = DATE_KEY.format(new Date(now.getTime() + DAY_MS));
  const seen = new Set<string>();
  const options: SessionOption[] = [];

  for (const slot of slots) {
    const dayKey = DATE_KEY.format(slot.startsAt);
    const { minutesOfDay } = localWeekdayAndMinutes(slot.startsAt, DEFAULT_TIME_ZONE);
    const sessionLabel = minutesOfDay < 12 * 60 ? "Morning session" : "Afternoon session";

    const bucket = `${dayKey}:${sessionLabel}`;
    if (seen.has(bucket)) continue;
    seen.add(bucket);

    options.push({
      value: `${slot.startsAt.toISOString()}|${slot.endsAt.toISOString()}`,
      dayLabel:
        dayKey === todayKey
          ? "Today"
          : dayKey === tomorrowKey
            ? "Tomorrow"
            : DAY_LABEL.format(slot.startsAt),
      sessionLabel,
    });
  }

  return options;
}

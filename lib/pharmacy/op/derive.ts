import type { CheckInStatus } from "@/db/schema/pharmacy-rework-patients";

import { RULES } from "@/content/pharmacy-rework-patients";
import { DAY, day0 } from "@/lib/pharmacy/wards/derive";

/** Outpatient refills and antibiotic courses (prototype outpatients.js), logic for logic. Pure. */
const days = (a: number, b: number) => Math.round((b - a) / DAY);

/** One hand-over of the medicine, and the pills brought back at that visit (null: none counted). */
export interface Refill {
  at: number;
  qty: number;
  back: number | null;
}

/** Run-out date, status, pill-count adherence per interval and the possession ratio over the history. */
export function opRefill(hist: readonly Refill[], daily: number, now: number) {
  const t0 = day0(now);
  const last = hist[hist.length - 1]!;
  const supply = Math.floor(last.qty / daily),
    runOut = day0(last.at) + supply * DAY;
  const left = Math.max(0, days(t0, runOut));
  const counts = hist.slice(1).flatMap((x, i) => {
    if (x.back == null) return [];
    const prev = hist[i]!,
      gap = days(prev.at, x.at),
      should = Math.min(prev.qty, gap * daily),
      taken = prev.qty - x.back;
    return [
      {
        at: x.at,
        back: x.back,
        should,
        taken,
        pct: should ? Math.max(0, Math.min(100, Math.round((taken / should) * 100))) : null,
        gap,
        late: Math.max(0, gap - Math.floor(prev.qty / daily)),
      },
    ];
  });
  const span = Math.max(1, days(day0(hist[0]!.at), Math.max(t0, day0(last.at))));
  const supplied =
    hist.slice(0, -1).reduce((a, x) => a + x.qty / daily, 0) +
    Math.min(supply, days(day0(last.at), t0));
  const mpr = Math.min(100, Math.round((supplied / span) * 100));
  const until = days(t0, runOut);
  const k = until < 0 ? "overdue" : until <= RULES.refillDueDays ? "due" : "ok";
  return {
    last,
    runOut,
    supply,
    left,
    counts,
    mpr,
    k,
    late: -until,
    lastPct: counts.at(-1)?.pct ?? null,
  };
}

/** Pill count at the window: doses taken since the last refill against what should have been taken. */
export function pillCount(last: Refill, daily: number, back: number | null, now: number) {
  const since = Math.max(0, days(day0(last.at), day0(now)));
  const expectLeft = Math.max(0, last.qty - since * daily);
  const should = Math.min(last.qty, since * daily);
  const taken = back == null ? null : last.qty - back;
  const pct =
    taken == null || !should
      ? null
      : Math.max(0, Math.min(100, Math.round((taken / should) * 100)));
  return { since, expectLeft, should, taken, pct };
}

export interface CheckIn {
  at: number;
  status: CheckInStatus;
  missed: number;
}

/** Day n of N, whether a check-in is due (every 2 days), missed doses and a flag when not taking as prescribed. */
export function opCourse(
  start: number,
  courseDays: number,
  checks: readonly CheckIn[],
  now: number,
) {
  const t0 = day0(now),
    end = day0(start) + courseDays * DAY;
  const dayN = Math.min(courseDays, days(day0(start), t0) + 1);
  const lastC = checks.at(-1) ?? null,
    done = t0 >= end;
  const needCheck = !done && (!lastC || days(day0(lastC.at), t0) >= RULES.checkInEveryDays);
  const missed = checks.reduce((a, c) => a + c.missed, 0);
  return { end, dayN, lastC, done, needCheck, missed, flag: !!lastC && lastC.status !== "taking" };
}

/**
 * Scales and ticks for the monitoring graphs (ADR 0189, MONITORING-CHARTS.md §4). Pure.
 *
 * The y axis has three or four "nice" ticks; the x axis is always clock time in the chart's time
 * zone, on whole hours.
 */
import { CHART_TIME_ZONE } from "./fluids";

export interface LinearScale {
  (value: number): number;
  domain: readonly [number, number];
  range: readonly [number, number];
}

/** Maps the domain onto the range; a zero-width domain maps everything to the range's middle. */
export function linearScale(
  domain: readonly [number, number],
  range: readonly [number, number],
): LinearScale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0;
  const f = ((v: number) =>
    span === 0 ? (r0 + r1) / 2 : r0 + ((v - d0) / span) * (r1 - r0)) as LinearScale;
  f.domain = [d0, d1];
  f.range = [r0, r1];
  return f;
}

const MANTISSAS = [1, 2, 2.5, 5] as const;

/** Rounds away floating-point dust (0.30000000000000004 → 0.3). */
const clean = (n: number) => Number(n.toFixed(10));

/**
 * Three or four evenly spaced round ticks that cover [min, max]: the smallest step from 1, 2, 2.5
 * or 5 × 10ⁿ that needs no more than `maxTicks`. A flat series (min = max) is widened by one unit
 * each way so it still has an axis.
 */
export function niceTicks(min: number, max: number, maxTicks = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  let lo = Math.min(min, max);
  let hi = Math.max(min, max);
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const rough = (hi - lo) / Math.max(1, maxTicks - 1);
  let exp = Math.floor(Math.log10(rough)) - 1;
  for (let guard = 0; guard < 8; guard++, exp++) {
    for (const m of MANTISSAS) {
      const step = m * 10 ** exp;
      const first = Math.floor(clean(lo / step)) * step;
      const last = Math.ceil(clean(hi / step)) * step;
      const count = Math.round((last - first) / step) + 1;
      if (count > maxTicks) continue;
      const ticks = Array.from({ length: count }, (_, i) => clean(first + i * step));
      // A range that fits one step still gets a third tick, so the axis reads as a scale.
      if (ticks.length < 3) ticks.push(clean(last + step));
      return ticks;
    }
  }
  return [clean(lo), clean(hi)];
}

/* ─── Clock time ─────────────────────────────────────────────────── */

const formatters = new Map<string, Intl.DateTimeFormat>();
function clockFormat(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

function localHourMinute(at: Date, timeZone: string): { hour: number; minute: number } {
  const parts = clockFormat(timeZone).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { hour: get("hour"), minute: get("minute") };
}

/** "HH:MM", 24-hour, in the chart's time zone (Africa/Kampala unless told otherwise). */
export function formatClock(at: Date | string, timeZone = CHART_TIME_ZONE): string {
  const d = typeof at === "string" ? new Date(at) : at;
  const { hour, minute } = localHourMinute(d, timeZone);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** "14:00 to 15:00": the hour (or 4-hour block) a row stands for. */
export function formatHourSpan(
  start: Date | string,
  stepHours: number,
  timeZone = CHART_TIME_ZONE,
): string {
  const s = typeof start === "string" ? new Date(start) : start;
  return `${formatClock(s, timeZone)} to ${formatClock(new Date(s.getTime() + stepHours * 3600000), timeZone)}`;
}

const HOUR = 3600000;
const CLOCK_STEPS = [1, 2, 3, 4, 6, 12, 24] as const;

/**
 * Whole-hour ticks between `start` and `end` (both inclusive), on local hours that are a multiple
 * of the step (00:00, 04:00, 08:00 …), with the smallest step that gives at most `maxTicks`.
 */
export function clockTicks(
  start: Date,
  end: Date,
  opts: { maxTicks?: number; timeZone?: string } = {},
): Date[] {
  const maxTicks = opts.maxTicks ?? 7;
  const timeZone = opts.timeZone ?? CHART_TIME_ZONE;
  const from = start.getTime();
  const to = end.getTime();
  if (!(to >= from)) return [];
  // The first whole local hour at or after `start`.
  const { minute } = localHourMinute(start, timeZone);
  let first = from - (from % 60000) + ((60 - minute) % 60) * 60000;
  if (first < from) first += HOUR;
  for (const step of CLOCK_STEPS) {
    let t = first;
    for (let i = 0; i < 24 && localHourMinute(new Date(t), timeZone).hour % step !== 0; i++)
      t += HOUR;
    const ticks: Date[] = [];
    for (; t <= to; t += step * HOUR) ticks.push(new Date(t));
    if (ticks.length <= maxTicks) return ticks;
  }
  return [];
}

/**
 * The x domain of an observation graph: from the earliest of the first point and `from`, to the
 * later of the last point and `now`, on whole hours, at least `minHours` wide (widened backwards).
 */
export function timeDomain(
  points: readonly (Date | string)[],
  opts: { from: Date; now: Date; minHours?: number },
): [Date, Date] {
  const times = points.map((p) => (typeof p === "string" ? new Date(p) : p).getTime());
  const lo = Math.min(opts.from.getTime(), ...times);
  const hi = Math.max(opts.now.getTime(), ...times);
  const start = Math.floor(lo / HOUR) * HOUR;
  const end = Math.ceil(hi / HOUR) * HOUR;
  const min = (opts.minHours ?? 4) * HOUR;
  return [new Date(Math.min(start, end - min)), new Date(Math.max(end, start + HOUR))];
}

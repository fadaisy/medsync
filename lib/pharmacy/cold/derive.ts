import { RULES } from "@/content/pharmacy-rework-patients";
import { DAY, day0, HOUR, MIN } from "@/lib/pharmacy/wards/derive";

/**
 * Cold chain (prototype cold.js), logic for logic, over recorded readings instead of a simulated sensor: status,
 * excursions (outside 2–8 °C for 30 minutes or more), a day's max/min and alarms, the WHO monthly chart grid and the
 * share of time in range. Pure; readings sorted by time.
 */
const { low: LOW, high: HIGH, freeze: FREEZE } = RULES.cold;

export interface Reading {
  at: number;
  v: number;
}

export type ColdState = "ok" | "high" | "low" | "freeze";
export const coldStatus = (v: number): ColdState =>
  v > HIGH ? "high" : v < LOW ? (v < FREEZE ? "freeze" : "low") : "ok";

export interface Excursion {
  start: number;
  end: number;
  peak: number;
  kind: "high" | "low";
  mins: number;
  frozen: boolean;
}

/** Runs of readings outside 2–8 °C lasting at least `excursionMin`. A run still open at the end counts. */
export function excursions(rs: readonly Reading[]): Excursion[] {
  const out: Excursion[] = [];
  let cur: Omit<Excursion, "mins" | "frozen"> | null = null;
  const close = (endAt: number) => {
    if (cur && endAt - cur.start >= RULES.cold.excursionMin * MIN)
      out.push({
        ...cur,
        end: endAt,
        mins: Math.round((endAt - cur.start) / MIN),
        frozen: cur.peak < FREEZE,
      });
    cur = null;
  };
  for (const x of rs) {
    const outside = x.v > HIGH || x.v < LOW;
    if (outside && !cur)
      cur = { start: x.at, end: x.at, peak: x.v, kind: x.v > HIGH ? "high" : "low" };
    else if (outside && cur) {
      cur.end = x.at;
      cur.peak = cur.kind === "high" ? Math.max(cur.peak, x.v) : Math.min(cur.peak, x.v);
    } else if (!outside && cur) close(x.at);
  }
  if (cur) close((cur as { end: number }).end);
  return out;
}

/** One day as the device reports it: max, min and the first high/low alarm (10 h above +8, 60 min below −0.5). */
export function dayStats(rs: readonly Reading[]) {
  if (!rs.length) return null;
  let max = -99,
    min = 99,
    hiFrom: number | null = null,
    loFrom: number | null = null,
    hiAlarm: number | null = null,
    loAlarm: number | null = null;
  for (const x of rs) {
    max = Math.max(max, x.v);
    min = Math.min(min, x.v);
    hiFrom = x.v > HIGH ? (hiFrom ?? x.at) : null;
    loFrom = x.v < FREEZE ? (loFrom ?? x.at) : null;
    if (!hiAlarm && hiFrom != null && x.at - hiFrom >= RULES.cold.highAlarmMin * MIN)
      hiAlarm = x.at;
    if (!loAlarm && loFrom != null && x.at - loFrom >= RULES.cold.lowAlarmMin * MIN) loAlarm = x.at;
  }
  return { max, min, hiAlarm, loAlarm };
}

/** Percent of the time in 2–8 °C, weighting each reading by the time until the next. */
export function pctInRange(rs: readonly Reading[]) {
  let inside = 0,
    total = 0;
  for (let i = 0; i < rs.length - 1; i++) {
    const w = rs[i + 1]!.at - rs[i]!.at;
    total += w;
    if (coldStatus(rs[i]!.v) === "ok") inside += w;
  }
  return total ? Math.round((inside / total) * 100) : null;
}

export interface ChartReading {
  day: number;
  slot: "am" | "pm";
  v: number;
  initials: string;
  fi: "ok" | "x" | null;
}

/**
 * The WHO monthly chart: rows +16 to −5 °C, one am and pm column per day, the FI row, and per day the device's max,
 * min and alarms. `chart` are the paper readings of the month (the latest per day and slot wins).
 */
export function monthGrid(input: {
  monthStart: number;
  days: number;
  chart: readonly ChartReading[];
  sensor: readonly Reading[];
  now: number;
}) {
  const rows = Array.from({ length: 22 }, (_, i) => 16 - i);
  const cell = new Map<string, ChartReading>();
  for (const r of input.chart) cell.set(`${r.day}:${r.slot}`, r);
  const today = Math.floor((day0(input.now) - input.monthStart) / DAY) + 1;
  const days = Array.from({ length: input.days }, (_, i) => {
    const d = i + 1,
      from = input.monthStart + i * DAY;
    const am = cell.get(`${d}:am`) ?? null,
      pm = cell.get(`${d}:pm`) ?? null;
    const sensor =
      d < today ? dayStats(input.sensor.filter((x) => x.at >= from && x.at < from + DAY)) : null;
    return {
      d,
      am,
      pm,
      amRow: am ? Math.max(-5, Math.min(16, Math.round(am.v))) : null,
      pmRow: pm ? Math.max(-5, Math.min(16, Math.round(pm.v))) : null,
      fi: pm?.fi ?? am?.fi ?? null,
      sensor,
      today: d === today,
    };
  });
  return { rows, days };
}

/** Readings older than this are not "live". */
export const isLive = (last: Reading | undefined, now: number) =>
  !!last && now - last.at <= RULES.cold.liveMin * MIN;

export const HOURS_OF = { "24h": 24 * HOUR, "7d": 7 * DAY, "30d": 30 * DAY } as const;

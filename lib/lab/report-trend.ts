import type { IndicatorInput, IndicatorValue } from "./indicators";
import type { LabReport, ReportRow, TileId } from "./report-store";

import { computeIndicators } from "./indicators";
import { addDays, dayOf, endOfDay } from "./stock";

/**
 * Lab Workspace v2, Reports (prompt 5.9): the indicators over time, read from the existing indicators engine.
 * Pure. Each month's figure is the engine's own figure for that month (the read model asks the engine once per
 * month, `report-trend-read.ts`); the weekly median turnaround is the engine's `tat_p50` per hospital-local week.
 * "No data" stays null, never 0 (Law 7).
 */

/** The `n` months ending with `month`, oldest first ("2026-05" … "2026-10"). */
export function lastMonths(month: string, n = 6): string[] {
  const out = [month];
  while (out.length < n) out.unshift(addDays(`${out[0]}-01`, -1).slice(0, 7));
  return out;
}

export const figure = (v: IndicatorValue): number | null => (v.kind === "value" ? v.value : null);

/** Per tile, one figure per month (null = no data), in the months' order. */
export function trendSeries(
  months: readonly { month: string; report: LabReport }[],
): Record<TileId, (number | null)[]> {
  const out = {} as Record<TileId, (number | null)[]>;
  for (const { report } of months)
    for (const [t, v] of Object.entries(report.tiles) as [TileId, IndicatorValue][])
      (out[t] ??= []).push(figure(v));
  return out;
}

/** The Monday (hospital-local date key) of the week an instant falls in. */
export function weekOf(at: Date, timeZone: string): string {
  const day = dayOf(at, timeZone);
  const wd = new Date(`${day}T00:00:00Z`).getUTCDay();
  return addDays(day, -((wd + 6) % 7));
}

const EMPTY: Omit<IndicatorInput, "hospitalId" | "from" | "to" | "now" | "timeZone" | "released"> =
  {
    specimens: [],
    identityChecks: [],
    criticalAlerts: [],
    qcRuns: [],
    inHouseTests: [],
    testsWithIqc: [],
    eqaRounds: [],
    eqaCoverage: [],
    stockItems: [],
    stockTxs: [],
    devices: [],
    breakdowns: [],
  };

export interface WeekPoint {
  /** Monday, "YYYY-MM-DD". */
  week: string;
  /** Median minutes from receipt to release; null when nothing was released with a receipt time. */
  median: number | null;
  n: number;
}

/**
 * The median turnaround, receipt to release, per week from the week of `from` to the week of `to`, from released
 * rows (already filtered as the page is). Each week is the engine's `tat_p50` over that week's rows.
 */
export function weeklyMedianTat(
  rows: readonly ReportRow[],
  o: {
    hospitalId: string;
    now: Date;
    timeZone: string;
    from: Date;
    to: Date;
    targets: Record<string, number>;
  },
): WeekPoint[] {
  const byWeek = new Map<string, ReportRow[]>();
  for (const r of rows)
    if (r.kind === "released" && r.at) {
      const w = weekOf(r.at, o.timeZone);
      if (!byWeek.has(w)) byWeek.set(w, []);
      byWeek.get(w)!.push(r);
    }
  const last = weekOf(new Date(Math.min(o.to.getTime(), o.now.getTime()) - 1), o.timeZone);
  const out: WeekPoint[] = [];
  for (let w = weekOf(o.from, o.timeZone); w <= last; w = addDays(w, 7)) {
    const from = endOfDay(addDays(w, -1), o.timeZone);
    const to = endOfDay(addDays(w, 6), o.timeZone);
    const v = computeIndicators({
      ...EMPTY,
      hospitalId: o.hospitalId,
      from,
      to,
      now: o.now,
      timeZone: o.timeZone,
      released: (byWeek.get(w) ?? []).map((r) => ({
        hospitalId: o.hospitalId,
        releasedAt: r.at!,
        receivedAt: r.receivedAt,
        targetMinutes: (r.testCode && o.targets[r.testCode]) || null,
        amended: r.flag,
      })),
    }).values.tat_p50;
    out.push({ week: w, median: figure(v), n: v.kind === "value" ? (v.denominator ?? 0) : 0 });
  }
  return out;
}

/** The stated times of the released tests counted (minutes, ascending): one value draws a reference line. */
export function statedTimes(rows: readonly ReportRow[], targets: Record<string, number>): number[] {
  return [
    ...new Set(
      rows.flatMap(
        (r) => (r.kind === "released" && r.receivedAt && r.testCode && targets[r.testCode]) || [],
      ),
    ),
  ].sort((a, b) => a - b);
}

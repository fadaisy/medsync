/**
 * Fluid arithmetic for the plan and the fluid balance chart (ADR 0189,
 * docs/emr/clerking-v2/plan/MONITORING-CHARTS.md §3). Pure; arithmetic only, never advice.
 *
 * Blank is not zero: an hour with no entry is `null` (not recorded), urine "not measured" is stated,
 * and the running balance sums recorded entries only. It is never estimated.
 */

export type GivingSet = 20 | 60;
export type FluidKind = "iv_in" | "oral_in" | "urine_out" | "other_out";

export interface Duration {
  value: number;
  unit: "min" | "h";
}

const minutesOf = (d: Duration) => (d.unit === "h" ? d.value * 60 : d.value);

/** Planned rate in mL/h (volume ÷ time), to one decimal. Null when either is not a positive number. */
export function mlPerHour(volumeMl: number, over: Duration): number | null {
  const min = minutesOf(over);
  if (!(volumeMl > 0) || !(min > 0)) return null;
  return Math.round((volumeMl / (min / 60)) * 10) / 10;
}

/** Drops per minute on a gravity set of 20 or 60 drops per mL, to the nearest whole drop. */
export function dropsPerMinute(rateMlPerHour: number, set: GivingSet): number | null {
  if (!(rateMlPerHour > 0)) return null;
  return Math.round((rateMlPerHour * set) / 60);
}

/**
 * The urine-output reference line: mL/kg/h × the vitals weight (e.g. 0.5 × 58 = 29 mL/h). A draft
 * reference ("KDIGO oliguria threshold, to verify"): drawn, never flagged. No weight, no line.
 */
export const URINE_REFERENCE_ML_PER_KG_PER_H = 0.5;
export function urineReferenceMlPerHour(
  weightKg: number | null,
  mlPerKgPerHour = URINE_REFERENCE_ML_PER_KG_PER_H,
): number | null {
  if (weightKg == null || !(weightKg > 0)) return null;
  return Math.round(weightKg * mlPerKgPerHour * 10) / 10;
}

/* ─── The chart day ──────────────────────────────────────────────── */

export const CHART_TIME_ZONE = "Africa/Kampala";

/** Minutes the chart time zone is ahead of UTC at `at`. */
function zoneOffsetMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const local = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return Math.round((local - Math.floor(at.getTime() / 60000) * 60000) / 60000);
}

/** The chart day containing `at` starts at local midnight (ADR 0189 §3, until a setting exists). */
export function chartDayStart(at: Date, timeZone = CHART_TIME_ZONE): Date {
  const off = zoneOffsetMinutes(at, timeZone) * 60000;
  const local = at.getTime() + off;
  const midnight = local - (((local % 86400000) + 86400000) % 86400000);
  return new Date(midnight - off);
}

/* ─── Entries → hours ────────────────────────────────────────────── */

export interface FluidEntry {
  id: string;
  kind: FluidKind;
  volumeMl: number | null;
  measured: boolean;
  effectiveAt: Date;
  prescriptionId?: string | null;
  state?: "recorded" | "entered_in_error";
  replacesId?: string | null;
}

/** The entries that stand: not replaced by a later correction, not entered in error. */
export function currentFluidEntries<T extends FluidEntry>(rows: readonly T[]): T[] {
  const replaced = new Set(rows.map((r) => r.replacesId).filter((x): x is string => !!x));
  return rows.filter((r) => r.state !== "entered_in_error" && !replaced.has(r.id));
}

export interface FluidHour {
  start: Date;
  /** Per IV prescription (or "other" for IV in without one), mL. */
  ivIn: Record<string, number>;
  ivInTotal: number | null;
  oralIn: number | null;
  urineOut: number | null;
  /** Urine was recorded as not measured in this hour (and nothing measured). */
  urineNotMeasured: boolean;
  otherOut: number | null;
  totalIn: number | null;
  totalOut: number | null;
  /** Running balance to the end of this hour, recorded entries only; null in a gap. */
  running: number | null;
  /** No entry at all in this hour: the balance line shows a gap marker. */
  gap: boolean;
}

const add = (a: number | null, b: number) => (a ?? 0) + b;

/**
 * Buckets entries into hourly (or 4-hourly) rows from `dayStart` up to `until` (exclusive of
 * later hours). Entries outside the window are ignored.
 */
export function fluidHours(
  entries: readonly FluidEntry[],
  opts: { dayStart: Date; until: Date; stepHours?: 1 | 4 },
): FluidHour[] {
  const step = (opts.stepHours ?? 1) * 3600000;
  const start = opts.dayStart.getTime();
  const end = Math.min(opts.until.getTime(), start + 86400000);
  const rows: FluidHour[] = [];
  for (let t = start; t < end; t += step) {
    rows.push({
      start: new Date(t),
      ivIn: {},
      ivInTotal: null,
      oralIn: null,
      urineOut: null,
      urineNotMeasured: false,
      otherOut: null,
      totalIn: null,
      totalOut: null,
      running: null,
      gap: true,
    });
  }
  for (const e of currentFluidEntries(entries)) {
    const i = Math.floor((e.effectiveAt.getTime() - start) / step);
    const row = rows[i];
    if (!row) continue;
    row.gap = false;
    if (!e.measured || e.volumeMl == null) {
      if (e.kind === "urine_out") row.urineNotMeasured = true;
      continue;
    }
    const v = e.volumeMl;
    if (e.kind === "iv_in") {
      const key = e.prescriptionId ?? "other";
      row.ivIn[key] = (row.ivIn[key] ?? 0) + v;
      row.ivInTotal = add(row.ivInTotal, v);
      row.totalIn = add(row.totalIn, v);
    } else if (e.kind === "oral_in") {
      row.oralIn = add(row.oralIn, v);
      row.totalIn = add(row.totalIn, v);
    } else if (e.kind === "urine_out") {
      row.urineOut = add(row.urineOut, v);
      row.totalOut = add(row.totalOut, v);
    } else {
      row.otherOut = add(row.otherOut, v);
      row.totalOut = add(row.totalOut, v);
    }
  }
  let running = 0;
  let any = false;
  for (const row of rows) {
    if (row.urineOut != null) row.urineNotMeasured = false;
    if (row.gap) continue;
    running += (row.totalIn ?? 0) - (row.totalOut ?? 0);
    any = true;
    row.running = running;
  }
  if (!any) for (const row of rows) row.running = null;
  return rows;
}

export interface FluidSummary {
  totalIn: number;
  totalOut: number;
  net: number;
  /** Hours with measured urine below the reference line (per hour); null without a reference. */
  hoursBelowReference: number | null;
  hoursRecorded: number;
}

/** The 24-hour summary row: recorded entries only. Shown on the chart; never added to a note unasked. */
export function fluidSummary(
  hours: readonly FluidHour[],
  urineReference: number | null,
  stepHours: 1 | 4 = 1,
): FluidSummary {
  let totalIn = 0;
  let totalOut = 0;
  let below = 0;
  let recorded = 0;
  for (const h of hours) {
    if (h.gap) continue;
    recorded++;
    totalIn += h.totalIn ?? 0;
    totalOut += h.totalOut ?? 0;
    if (urineReference != null && h.urineOut != null && h.urineOut / stepHours < urineReference)
      below += stepHours;
  }
  return {
    totalIn,
    totalOut,
    net: totalIn - totalOut,
    hoursBelowReference: urineReference == null ? null : below,
    hoursRecorded: recorded,
  };
}

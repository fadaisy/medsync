import type { SavedReading } from "@/data/readings";
import type { ReadingInput, SugarContext } from "@/lib/readings";
import rules from "@clinical-rules/patient-thresholds.v0.json";

import { dayKey } from "@/data/health-log";
import { checkReading, readingValueText, SUGAR_CONTEXT_WORDS, UNITS } from "@/lib/readings";

/**
 * Health trends (Care hub tiles and Health trends), computed from the
 * patient's own readings (`data/readings.ts`). Targets and every in-range
 * judgement come from the thresholds file through `checkReading` (law L7),
 * never from numbers written here. A day with no reading is a gap, never a
 * guess.
 */
export type Metric = "bp" | "sugar" | "weight" | "pulse";

export interface MetricInfo {
  key: Metric;
  /** The tab word. */
  name: string;
  label: string;
  unit: string;
  /** The chart's usual value range; real values outside it widen it. */
  lo: number;
  hi: number;
  l1: string;
  l2?: string;
}

export const METRICS: Record<Metric, MetricInfo> = {
  bp: {
    key: "bp",
    name: "Pressure",
    label: "Blood pressure",
    unit: UNITS.bp,
    lo: 70,
    hi: 160,
    l1: "Top number",
    l2: "Bottom number",
  },
  sugar: {
    key: "sugar",
    name: "Sugar",
    label: "Blood sugar",
    unit: UNITS.sugar,
    lo: 3,
    hi: 13,
    l1: "Sugar",
  },
  weight: {
    key: "weight",
    name: "Weight",
    label: "Weight",
    unit: UNITS.weight,
    lo: 0,
    hi: 0,
    l1: "Weight",
  },
  pulse: { key: "pulse", name: "Pulse", label: "Pulse", unit: "bpm", lo: 40, hi: 110, l1: "Pulse" },
};

/** The sugar chart's "When was it measured?" chips. */
export const SUGAR_CHIPS: { ctx: SugarContext; name: string }[] = (
  Object.keys(SUGAR_CONTEXT_WORDS) as SugarContext[]
).map((ctx) => ({
  ctx,
  name: SUGAR_CONTEXT_WORDS[ctx][0].toUpperCase() + SUGAR_CONTEXT_WORDS[ctx].slice(1),
}));

const matches = (r: SavedReading, metric: Metric, ctx: SugarContext) =>
  r.input.kind === metric && (r.input.kind !== "sugar" || r.input.context === ctx);

/** The readings of one metric (sugar: one time of day) within the days, newest first. */
export function readingsIn(
  readings: SavedReading[],
  metric: Metric,
  ctx: SugarContext,
  days: Date[],
): SavedReading[] {
  const keys = new Set(days.map(dayKey));
  return readings.filter((r) => matches(r, metric, ctx) && keys.has(dayKey(new Date(r.at))));
}

export interface WeekSeries {
  /** One per day, oldest first; null where nothing was logged. Blood pressure's top numbers. */
  a: (number | null)[];
  /** Blood pressure's bottom numbers. */
  b?: (number | null)[];
  inputs: (ReadingInput | null)[];
}

/** Each day's latest reading of the metric. */
export function weekSeries(
  readings: SavedReading[],
  metric: Metric,
  ctx: SugarContext,
  days: Date[],
): WeekSeries {
  const inputs = days.map((d) => {
    const k = dayKey(d);
    return (
      readings.find((r) => matches(r, metric, ctx) && dayKey(new Date(r.at)) === k)?.input ?? null
    );
  });
  const first = (i: ReadingInput | null) => (!i ? null : i.kind === "bp" ? i.top : i.value);
  return {
    a: inputs.map(first),
    b: metric === "bp" ? inputs.map((i) => (i?.kind === "bp" ? i.bottom : null)) : undefined,
    inputs,
  };
}

/** The chart's range: the usual one, widened to fit the values and the target band. */
export function chartRange(
  m: MetricInfo,
  values: (number | null)[],
  band: { lo: number; hi: number } | null,
): { lo: number; hi: number; grid: number[] } {
  const xs = values.filter((v): v is number => v !== null);
  if (band) xs.push(band.lo, band.hi);
  let lo = m.lo;
  let hi = m.hi;
  if (m.key === "weight") {
    lo = xs.length ? Math.floor(Math.min(...xs) - 1) : 50;
    hi = xs.length ? Math.ceil(Math.max(...xs) + 1) : 100;
  } else if (xs.length) {
    lo = Math.min(lo, Math.floor(Math.min(...xs)));
    hi = Math.max(hi, Math.ceil(Math.max(...xs)));
  }
  const step = (hi - lo) / 4;
  const round = (v: number) => (hi - lo > 20 ? Math.round(v) : Math.round(v * 10) / 10);
  return { lo, hi, grid: [round(lo + step), round(lo + 2 * step), round(lo + 3 * step)] };
}

/**
 * The target band drawn on the chart, from the thresholds file. Weight has
 * no threshold in v0 (it is a trend, never judged), so it has no band.
 */
export function targetBand(metric: Metric, ctx: SugarContext): { lo: number; hi: number } | null {
  switch (metric) {
    case "bp":
      return { lo: rules.bp.lowTopBelow, hi: rules.bp.aboveTopAtLeast };
    case "sugar":
      return { lo: rules.sugar.dangerLowBelow, hi: rules.sugar.targetMaxByContext[ctx] };
    case "pulse":
      return { lo: rules.pulse.unusualBelow, hi: rules.pulse.unusualAbove };
    case "weight":
      return null;
  }
}

export type Judgement = { tone: "stable" | "caution" | "critical" | "pending"; word: string };

/**
 * One reading's word pill: "In range", "Above target", a danger word, or
 * "No target" for weight. Always a word with the colour (law L4).
 */
export function judge(input: ReadingInput): Judgement {
  if (input.kind === "weight") return { tone: "pending", word: "No target" };
  const check = checkReading(input);
  if (check.level === "danger") return { tone: "critical", word: check.text };
  if (check.level === "watch") {
    const above =
      input.kind === "bp"
        ? check.text.startsWith("Above")
        : input.kind === "sugar" || (input.value ?? 0) > rules.pulse.unusualAbove;
    return { tone: "caution", word: above ? "Above target" : "Low" };
  }
  return { tone: "stable", word: "In range" };
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const fmt1 = (n: number) => String(Math.round(n * 10) / 10);

/** The first and last logged values of a series, with the day of the first. */
function ends(series: WeekSeries, days: Date[]) {
  const idx = series.a.flatMap((v, i) => (v === null ? [] : [i]));
  if (idx.length < 2) return null;
  const i0 = idx[0];
  const i1 = idx[idx.length - 1];
  return {
    from: series.a[i0] as number,
    to: series.a[i1] as number,
    day: DAY_NAMES[days[i0].getDay()],
  };
}

/** "k of n" readings the thresholds call in range. */
function inRange(inputs: (ReadingInput | null)[]): { k: number; n: number } {
  const real = inputs.filter((i): i is ReadingInput => i !== null);
  return { k: real.filter((i) => checkReading(i).level === "ok").length, n: real.length };
}

/** The one plain sentence under the chart, from the week's own readings. */
export function insight(metric: Metric, series: WeekSeries, days: Date[]): string {
  if (metric === "sugar" || metric === "pulse") {
    const { k, n } = inRange(series.inputs);
    if (!n) return "No readings at this time this week.";
    const where = metric === "sugar" ? "in your target" : "in the usual range";
    return `${k} of ${n} ${n === 1 ? "reading" : "readings"} ${where} this week.`;
  }
  const e = ends(series, days);
  if (!e) return "Log on a few days to see your trend.";
  const diff = e.to - e.from;
  if (metric === "weight") {
    if (Math.abs(diff) < 0.05) return `The same as on ${e.day}.`;
    return `${diff < 0 ? "Down" : "Up"} ${fmt1(Math.abs(diff))} kg since ${e.day}.`;
  }
  if (diff === 0) return `Your top number is the same as on ${e.day}.`;
  return `Your top number went ${diff < 0 ? "down" : "up"} ${Math.abs(diff)} since ${e.day}.`;
}

/* ─── The sugar diary ─────────────────────────────────────────────────── */

export const DIARY_SLOTS: { head: string; ctx: SugarContext; words: string }[] = [
  { head: "Before bfast", ctx: "fasting", words: "before breakfast" },
  { head: "After bfast", ctx: "after", words: "after breakfast" },
  { head: "Before lunch", ctx: "lunch", words: "before lunch" },
  { head: "After lunch", ctx: "after", words: "after lunch" },
  { head: "Before supper", ctx: "supper", words: "before supper" },
  { head: "Bed-time", ctx: "bedtime", words: "bedtime" },
];

/**
 * The diary column a sugar reading belongs in. "After a meal" is one choice
 * on the form, so the clock splits it: before noon is after breakfast, later
 * is after lunch. "Another time" has no column.
 */
export function diaryColumn(context: SugarContext, at: Date): number | null {
  switch (context) {
    case "fasting":
      return 0;
    case "after":
      return at.getHours() < 12 ? 1 : 3;
    case "lunch":
      return 2;
    case "supper":
      return 4;
    case "bedtime":
      return 5;
    case "random":
      return null;
  }
}

/** Days × six slots, oldest day first; each cell the latest reading there, null if none. */
export function sugarDiary(readings: SavedReading[], days: Date[]): (number | null)[][] {
  const grid = days.map(() => DIARY_SLOTS.map((): number | null => null));
  const row = new Map(days.map((d, i) => [dayKey(d), i]));
  // Newest first, so the first value written into a cell is that cell's latest.
  for (const r of readings) {
    if (r.input.kind !== "sugar") continue;
    const at = new Date(r.at);
    const i = row.get(dayKey(at));
    const j = diaryColumn(r.input.context, at);
    if (i === undefined || j === null || grid[i][j] !== null) continue;
    grid[i][j] = r.input.value;
  }
  return grid;
}

export type DiaryClass = "none" | "in" | "high" | "low" | "veryHigh";

export const DIARY_WORDS: Record<DiaryClass, string> = {
  in: "In target",
  high: "High",
  low: "Too low",
  veryHigh: "Very high",
  none: "Not measured",
};

/** One diary cell against its time-of-day target, through `checkReading`. */
export function diaryClass(value: number | null, ctx: SugarContext): DiaryClass {
  const check = checkReading({ kind: "sugar", value, context: ctx });
  if (check.level === "empty") return "none";
  if (check.level === "ok") return "in";
  if (check.level === "watch") return "high";
  return check.selfCare ? "low" : "veryHigh";
}

/* ─── Care hub tiles ──────────────────────────────────────────────────── */

export interface TrendTile {
  metric: Metric;
  name: string;
  value: string;
  unit: string;
  dir: "down" | "up" | "flat";
  /** `good` and `watch` tint the arrow (beside its words); `neutral` has no judgement. */
  tone: "good" | "watch" | "neutral";
  trend: string;
}

/** One tile per metric from the patient's readings; an empty tile says so. */
export function trendTiles(readings: SavedReading[], days: Date[]): TrendTile[] {
  const keys = new Set(days.map(dayKey));
  const week = readings.filter((r) => keys.has(dayKey(new Date(r.at))));
  return (["bp", "sugar", "weight", "pulse"] as const).map((metric) => {
    const info = METRICS[metric];
    const latest = readings.find((r) => r.input.kind === metric);
    const name = metric === "sugar" ? "Blood sugar" : info.label;
    const unit = metric === "pulse" ? "bpm" : info.unit;
    if (!latest)
      return {
        metric,
        name,
        value: "–",
        unit,
        dir: "flat",
        tone: "neutral",
        trend: "No readings yet",
      };
    const value =
      latest.input.kind === "bp"
        ? `${latest.input.top}/${latest.input.bottom}`
        : readingValueText(latest.input).split(" ")[0];
    const mine = week.filter((r) => r.input.kind === metric);
    if (metric === "sugar" || metric === "pulse") {
      const { k, n } = inRange(mine.map((r) => r.input));
      if (!n)
        return { metric, name, value, unit, dir: "flat", tone: "neutral", trend: "None this week" };
      return {
        metric,
        name,
        value,
        unit,
        dir: "flat",
        tone: k === n ? "good" : "watch",
        trend: `${k} of ${n} in range this week`,
      };
    }
    const vals = mine.map((r) =>
      r.input.kind === "bp" ? r.input.top : "value" in r.input ? r.input.value : null,
    );
    const to = vals[0];
    const from = vals[vals.length - 1];
    if (mine.length < 2 || to === null || from === null || to === undefined || from === undefined)
      return {
        metric,
        name,
        value,
        unit,
        dir: "flat",
        tone: "neutral",
        trend: "Log more to see a trend",
      };
    const diff = to - from;
    const dir = Math.abs(diff) < 0.05 ? "flat" : diff < 0 ? "down" : "up";
    const amount = metric === "weight" ? `${fmt1(Math.abs(diff))} kg` : String(Math.abs(diff));
    return {
      metric,
      name,
      value,
      unit,
      dir,
      // Weight has no target in v0, so its arrow is never judged.
      tone: metric === "weight" || dir === "flat" ? "neutral" : dir === "down" ? "good" : "watch",
      trend:
        dir === "flat"
          ? "Steady this week"
          : `${dir === "down" ? "Down" : "Up"} ${amount} this week`,
    };
  });
}

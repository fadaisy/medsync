import type { ReadingInput, SugarContext } from "@/lib/readings";
import rules from "@clinical-rules/patient-thresholds.v0.json";

import { checkReading, UNITS } from "@/lib/readings";

/**
 * Health trends (Care hub tiles and Health trends). Demo data until Gate CG
 * (law L2): a fixed week of example readings, Sunday to today. Targets and
 * every in-range judgement come from the thresholds file through
 * `checkReading` (law L7), never from numbers written here.
 */
export type Metric = "bp" | "sugar" | "weight" | "pulse";

export interface MetricSeries {
  key: Metric;
  /** The tab word. */
  name: string;
  label: string;
  unit: string;
  /** Seven days, oldest first. Blood pressure's top numbers. */
  a: number[];
  /** Blood pressure's bottom numbers. */
  b?: number[];
  /** The chart's value range and grid lines. */
  lo: number;
  hi: number;
  grid: number[];
  l1: string;
  l2?: string;
  insight: string;
}

export const METRICS: Record<Metric, MetricSeries> = {
  bp: {
    key: "bp",
    name: "Pressure",
    label: "Blood pressure",
    unit: UNITS.bp,
    a: [148, 142, 139, 145, 136, 138, 134],
    b: [92, 88, 86, 90, 84, 86, 82],
    lo: 70,
    hi: 160,
    grid: [80, 120, 160],
    l1: "Top number",
    l2: "Bottom number",
    insight: "Your top number came down 14 points since last Sunday.",
  },
  sugar: {
    key: "sugar",
    name: "Sugar",
    label: "Blood sugar",
    unit: UNITS.sugar,
    a: [8.4, 7.9, 8.8, 7.2, 7.6, 6.9, 7.1],
    lo: 3,
    hi: 13,
    grid: [4, 8, 12],
    l1: "Before breakfast",
    insight: "3 of 7 mornings in target this week, up from 1.",
  },
  weight: {
    key: "weight",
    name: "Weight",
    label: "Weight",
    unit: UNITS.weight,
    a: [86.4, 86.2, 86.3, 85.9, 85.8, 85.6, 85.5],
    lo: 84,
    hi: 87.5,
    grid: [84, 86, 87.5],
    l1: "Morning weight",
    insight: "Down 0.9 kg this week. Slow and steady is right.",
  },
  pulse: {
    key: "pulse",
    name: "Pulse",
    label: "Pulse",
    unit: "bpm",
    a: [78, 76, 80, 75, 77, 73, 74],
    lo: 40,
    hi: 110,
    grid: [60, 80, 100],
    l1: "Resting pulse",
    insight: "Steady and in range all week.",
  },
};

/** The sugar chart's "When was it measured?" chips. */
export const SUGAR_SERIES: { ctx: SugarContext; name: string; a: number[]; insight: string }[] = [
  {
    ctx: "fasting",
    name: "Before breakfast",
    a: [8.4, 7.9, 8.8, 7.2, 7.6, 6.9, 7.1],
    insight: "3 of 7 mornings in target this week, up from 1.",
  },
  {
    ctx: "lunch",
    name: "Before lunch or supper",
    a: [7.8, 8.1, 7.4, 6.8, 7.0, 6.6, 7.2],
    insight: "Before-meal readings are settling into your target.",
  },
  {
    ctx: "after",
    name: "2 hours after a meal",
    a: [11.6, 10.8, 12.4, 9.6, 10.2, 9.1, 9.4],
    insight: "After-meal sugar is highest after lunch. Your dietitian may adjust lunch.",
  },
  {
    ctx: "bedtime",
    name: "Bedtime",
    a: [8.9, 8.2, 9.4, 7.9, 8.1, 7.6, 7.8],
    insight: "Bedtime readings came down 1.1 this week.",
  },
  {
    ctx: "random",
    name: "Any other time",
    a: [9.2, 8.4, 3.8, 8.0, 7.7, 8.6, 7.9],
    insight: "One low reading on Tuesday (3.8). Tell your team if you felt shaky.",
  },
];

/** Morning reading times for the list, oldest first. */
export const READING_TIMES = ["07:40", "07:37", "07:34", "07:31", "07:28", "07:25", "07:22"];

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

export function seriesInput(m: MetricSeries, i: number, ctx: SugarContext): ReadingInput {
  if (m.key === "bp") return { kind: "bp", top: m.a[i], bottom: m.b?.[i] ?? null };
  if (m.key === "sugar") return { kind: "sugar", value: m.a[i], context: ctx };
  return { kind: m.key, value: m.a[i] };
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

/* ─── The sugar diary ─────────────────────────────────────────────────── */

export const DIARY_SLOTS: { head: string; ctx: SugarContext; words: string }[] = [
  { head: "Before bfast", ctx: "fasting", words: "before breakfast" },
  { head: "After bfast", ctx: "after", words: "after breakfast" },
  { head: "Before lunch", ctx: "lunch", words: "before lunch" },
  { head: "After lunch", ctx: "after", words: "after lunch" },
  { head: "Before supper", ctx: "supper", words: "before supper" },
  { head: "Bed-time", ctx: "bedtime", words: "bedtime" },
];

/** Seven days × six slots, oldest first; null is not measured. */
export const DIARY: (number | null)[][] = [
  [8.4, 11.2, null, 11.6, 7.8, 8.9],
  [7.9, null, 8.1, 10.8, null, 8.2],
  [8.8, 10.6, 3.8, 12.4, 7.4, 9.4],
  [7.2, null, 6.8, 9.6, null, 7.9],
  [7.6, 9.8, 7.0, 10.2, 7.1, 8.1],
  [6.9, null, 6.6, 9.1, null, 7.6],
  [7.1, 9.4, null, null, null, null],
];

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
  /** Whether the direction is the good one; drives the arrow's tint, beside its words. */
  good: boolean;
  trend: string;
}

const last = (xs: number[]) => xs[xs.length - 1];

export const TREND_TILES: TrendTile[] = [
  {
    metric: "bp",
    name: "Blood pressure",
    value: `${last(METRICS.bp.a)}/${last(METRICS.bp.b ?? [])}`,
    unit: "mmHg",
    dir: "down",
    good: true,
    trend: "Down 14 this week",
  },
  {
    metric: "sugar",
    name: "Sugar · before breakfast",
    value: String(last(METRICS.sugar.a)),
    unit: "mmol/L",
    dir: "down",
    good: true,
    trend: "3 of 7 mornings in target",
  },
  {
    metric: "weight",
    name: "Weight",
    value: last(METRICS.weight.a).toFixed(1),
    unit: "kg",
    dir: "down",
    good: true,
    trend: "0.9 kg down",
  },
  {
    metric: "pulse",
    name: "Pulse",
    value: String(last(METRICS.pulse.a)),
    unit: "bpm",
    dir: "flat",
    good: true,
    trend: "Steady",
  },
];

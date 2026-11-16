/**
 * The readings cards on Today and the Readings page (patient app v2 §5.7, M7): the change over a week, how many
 * of the last ten days were in target, and the plausibility check on Add a reading. Targets come from the signed
 * thresholds file through `targetBand` (MR10); nothing here holds a clinical number of its own.
 */
import type { Metric } from "./care-trends";
import type { SugarContext } from "./readings";

import rules from "../clinical-rules/patient-thresholds.v0.json";
import { targetBand } from "./care-trends";

export type WeekDirection = "toward" | "away" | "flat";

export interface WeekChange {
  delta: number;
  direction: WeekDirection;
  /** "↓ 0.6 in a week". The arrow is the number's direction; the colour (good or amber) is the direction. */
  text: string;
  tone: "good" | "caution" | "neutral";
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** How far a value sits outside the band (0 inside). */
function distance(v: number, band: { lo: number; hi: number }): number {
  return v < band.lo ? band.lo - v : v > band.hi ? v - band.hi : 0;
}

/**
 * The change from the value a week ago to now. Toward target (green) or away (amber); inside the band both ways
 * is flat. Weight has no band in v0, so a weight change is neutral unless the plan gives a goal below.
 */
export function weekChange(
  metric: Metric,
  ctx: SugarContext,
  weekAgo: number | null,
  now: number | null,
  weightGoal: number | null = null,
): WeekChange | null {
  if (weekAgo === null || now === null) return null;
  const delta = round1(now - weekAgo);
  const arrow = delta < 0 ? "↓" : delta > 0 ? "↑" : "→";
  const text = `${arrow} ${Math.abs(delta)} in a week`;
  const band =
    metric === "weight"
      ? weightGoal === null
        ? null
        : { lo: 0, hi: weightGoal }
      : targetBand(metric, ctx);
  if (!band || delta === 0) return { delta, direction: "flat", text, tone: "neutral" };
  const before = distance(weekAgo, band);
  const after = distance(now, band);
  if (after < before) return { delta, direction: "toward", text, tone: "good" };
  if (after > before) return { delta, direction: "away", text, tone: "caution" };
  return { delta, direction: "flat", text, tone: "neutral" };
}

/** "7 of 10 in target": days with a reading inside the band, out of the days shown. */
export function inTargetCount(
  metric: Metric,
  ctx: SugarContext,
  values: (number | null)[],
): { inTarget: number; days: number; text: string } | null {
  const band = targetBand(metric, ctx);
  if (!band) return null;
  const inTarget = values.filter(
    (v): v is number => v !== null && v >= band.lo && v <= band.hi,
  ).length;
  return { inTarget, days: values.length, text: `${inTarget} of ${values.length} in target` };
}

/** Numbers a person could not have measured: a typing slip, not a reading. */
export function plausible(
  input:
    | { kind: "bp"; top: number; bottom: number }
    | { kind: "sugar" | "pulse" | "weight"; value: number },
): { ok: true } | { ok: false; why: string } {
  switch (input.kind) {
    case "bp":
      if (input.top < 50 || input.top > 300 || input.bottom < 30 || input.bottom > 200)
        return {
          ok: false,
          why: "Check the numbers. Blood pressure is usually between 50 and 300 on top.",
        };
      if (input.bottom >= input.top)
        return { ok: false, why: "The top number is usually bigger. Check the order." };
      return { ok: true };
    case "sugar":
      return input.value >= 1 && input.value <= 35
        ? { ok: true }
        : { ok: false, why: "Check the number. Sugar is usually between 1 and 35 mmol/L." };
    case "pulse":
      return input.value >= 25 && input.value <= 250
        ? { ok: true }
        : { ok: false, why: "Check the number. A pulse is usually between 25 and 250." };
    case "weight":
      return input.value >= 2 && input.value <= 350
        ? { ok: true }
        : { ok: false, why: "Check the number. Weight is in kilograms." };
  }
}

/**
 * What the reading card draws as its target (§5.7): a shaded band for sugar, two lines for blood pressure (top
 * and bottom), nothing for weight unless the plan sets a next step. From the thresholds file only (MR10).
 */
export function targetMarks(
  metric: Metric,
  ctx: SugarContext,
  weightNextStep: number | null = null,
): {
  band: { lo: number; hi: number } | null;
  lines: { value: number; label: string; dashed: boolean }[];
} {
  if (metric === "bp")
    return {
      band: null,
      lines: [
        {
          value: rules.bp.aboveTopAtLeast,
          label: `Top below ${rules.bp.aboveTopAtLeast}`,
          dashed: false,
        },
        {
          value: rules.bp.aboveBottomAtLeast,
          label: `Bottom below ${rules.bp.aboveBottomAtLeast}`,
          dashed: false,
        },
      ],
    };
  if (metric === "weight")
    return {
      band: null,
      lines:
        weightNextStep === null
          ? []
          : [{ value: weightNextStep, label: "Next step", dashed: true }],
    };
  const band = targetBand(metric, ctx);
  return { band, lines: [] };
}

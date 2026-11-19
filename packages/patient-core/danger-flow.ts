/**
 * The danger flows (patient app v2 §5.8; MR10, S19, S23), as one pure state machine for the phone and the web.
 * Thresholds come from the one rules file (`packages/clinical-rules/patient-thresholds.v0.json`, the BP rule
 * signed 0.2.0, the rest pending CSO) through the server's own `dangerOf`, so the screen and the alert agree.
 *
 *   Low sugar:      eat or drink something sweet → sit → recheck after 15 minutes (a real timer) →
 *                   better (done) or still low (Help).
 *   Very high BP:   rest and measure again → a second reading at or above the rule → call the nurse today;
 *                   below → better. Any warning sign at any step → Help.
 *
 * Works offline: nothing here needs the network. Each reading the flow takes is saved the usual way, which
 * tells the care team when online (S19). The words live in content and are drafts until the CSO signs.
 */
import type { DangerInput, DangerKind } from "../../supabase/functions/_shared/reading-danger";

import { dangerOf } from "../../supabase/functions/_shared/reading-danger";
import rules from "../clinical-rules/patient-thresholds.v0.json";

export type { DangerKind } from "../../supabase/functions/_shared/reading-danger";

/** The sugar recheck wait the prompt sets (§5.8). */
export const SUGAR_RECHECK_MINUTES = 15;

const THRESHOLDS = {
  version: rules.version,
  bp: {
    dangerTopAtLeast: rules.bp.dangerTopAtLeast,
    dangerBottomAtLeast: rules.bp.dangerBottomAtLeast,
    dangerLowTopBelow: rules.bp.dangerLowTopBelow,
    implausibleTopBelow: rules.bp.implausibleTopBelow,
    implausibleBottomBelow: rules.bp.implausibleBottomBelow,
  },
  sugar: {
    dangerLowBelow: rules.sugar.dangerLowBelow,
    dangerHighAtLeast: rules.sugar.dangerHighAtLeast,
  },
  pulse: { dangerBelow: rules.pulse.dangerBelow, dangerAbove: rules.pulse.dangerAbove },
};

/**
 * The danger a reading is in, from the one rules file; the same answer the server alerts on.
 *
 * A blood pressure that is too low (thresholds 0.3.0, pending CSO) is `low_bp`: it has no step-by-step flow
 * of its own, so `startFlow` sends it to Help now, as it does a pulse. The server raises the alert once the
 * updated `pt-care-reading` is deployed (it carries the same rule, `_shared/reading-danger.ts`).
 */
export function dangerFor(input: DangerInput): DangerKind | null {
  return dangerOf(input, THRESHOLDS);
}

export type FlowStep =
  | { flow: "low_sugar"; step: "sweet" }
  | { flow: "low_sugar"; step: "sit" }
  | { flow: "low_sugar"; step: "wait"; untilIso: string }
  | { flow: "low_sugar"; step: "recheck" }
  | { flow: "very_high_bp"; step: "rest" }
  | { flow: "very_high_bp"; step: "second" }
  | { flow: "very_high_bp"; step: "call_nurse" }
  | { flow: "other"; step: "help_now" }
  | { flow: "low_sugar" | "very_high_bp"; step: "better" }
  | { flow: "low_sugar" | "very_high_bp" | "other"; step: "help" };

export type FlowEvent =
  | { type: "next"; now: Date }
  | { type: "reading"; input: DangerInput }
  | { type: "warning_sign" };

/** Where a danger reading starts. High sugar and pulse go straight to Help (no home steps in §5.8). */
export function startFlow(kind: DangerKind): FlowStep {
  if (kind === "low_sugar") return { flow: "low_sugar", step: "sweet" };
  if (kind === "very_high_bp") return { flow: "very_high_bp", step: "rest" };
  return { flow: "other", step: "help_now" };
}

/** One step on. A warning sign is Help from anywhere; the recheck reading decides better or not. */
export function nextStep(s: FlowStep, e: FlowEvent): FlowStep {
  if (e.type === "warning_sign") return { flow: s.flow, step: "help" } as FlowStep;
  if (s.flow === "low_sugar") {
    if (s.step === "sweet" && e.type === "next") return { flow: "low_sugar", step: "sit" };
    if (s.step === "sit" && e.type === "next")
      return {
        flow: "low_sugar",
        step: "wait",
        untilIso: new Date(e.now.getTime() + SUGAR_RECHECK_MINUTES * 60_000).toISOString(),
      };
    if (s.step === "wait" && e.type === "next" && e.now.getTime() >= new Date(s.untilIso).getTime())
      return { flow: "low_sugar", step: "recheck" };
    if (
      s.step === "recheck" &&
      e.type === "reading" &&
      e.input.kind === "sugar" &&
      e.input.value !== null
    )
      return dangerFor(e.input) === "low_sugar"
        ? { flow: "low_sugar", step: "help" }
        : { flow: "low_sugar", step: "better" };
    return s;
  }
  if (s.flow === "very_high_bp") {
    if (s.step === "rest" && e.type === "next") return { flow: "very_high_bp", step: "second" };
    if (s.step === "second" && e.type === "reading" && e.input.kind === "bp") {
      if (e.input.top === null || e.input.bottom === null) return s;
      return dangerFor(e.input) === "very_high_bp"
        ? { flow: "very_high_bp", step: "call_nurse" }
        : { flow: "very_high_bp", step: "better" };
    }
    return s;
  }
  return s;
}

/** Whole minutes and seconds left on the recheck timer, "14:59"; "0:00" when it is time. */
export function timerText(untilIso: string, now: Date): string {
  const left = Math.max(0, Math.ceil((new Date(untilIso).getTime() - now.getTime()) / 1000));
  return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
}

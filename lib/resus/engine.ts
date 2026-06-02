import type { AbcdeLetter, ResusEventKind } from "@/lib/resus/types";

import { getStepCatalog } from "@/lib/resus/reference/abcde-catalog";
import { ABCDE_LETTERS } from "@/lib/resus/types";

/**
 * The ABCDE engine (GATE C) — PURE sequence + life-threat discipline.
 *
 * It encodes the four governing principles of the ABCDE approach so the
 * UX can enforce them: strict sequence, treat-before-proceeding,
 * reassess-after-intervention, and the open-life-threats tracker. It does
 * NO I/O — it operates on StepProgress derived from the timeline. It
 * never makes a clinical decision; it tracks what the team has done and
 * surfaces the guideline-correct next prompt.
 */

export type StepStatus = "pending" | "clear" | "open" | "addressed";

export interface StepProgress {
  step: AbcdeLetter;
  /** The team has assessed this step at all. */
  assessed: boolean;
  /** A danger sign is present at this step. */
  dangerFlagged: boolean;
  /** At least one action has been logged for this step. */
  actionTaken: boolean;
}

/** The action-class kinds that count as "an intervention for this step". */
const ACTION_KINDS: ReadonlySet<ResusEventKind> = new Set(["action", "drug", "fluid", "procedure"]);

export function stepStatus(p: StepProgress): StepStatus {
  if (!p.assessed) return "pending";
  if (!p.dangerFlagged) return "clear";
  return p.actionTaken ? "addressed" : "open";
}

/** The letters with an OPEN (flagged, unaddressed) life-threat. */
export function openLifeThreats(progress: readonly StepProgress[]): AbcdeLetter[] {
  return progress.filter((p) => stepStatus(p) === "open").map((p) => p.step);
}

/**
 * Treat-before-proceeding: the recommended next step is the first letter
 * (A→E) that is still pending OR has an OPEN life-threat. Null when the
 * whole primary survey is clear/addressed (cycle / continue monitoring).
 */
export function recommendedNextStep(progress: readonly StepProgress[]): AbcdeLetter | null {
  for (const letter of ABCDE_LETTERS) {
    const p = progress.find((x) => x.step === letter);
    const status = p ? stepStatus(p) : "pending";
    if (status === "pending" || status === "open") return letter;
  }
  return null;
}

/**
 * Can the team safely move PAST `from` to a later letter? Only when
 * `from` carries no OPEN life-threat. Returns a warning otherwise — the
 * UX surfaces it (it informs, it does not hard-block; a resus is
 * non-linear and the clinician may need to act out of order).
 */
export function proceedGuard(
  progress: readonly StepProgress[],
  from: AbcdeLetter,
): { ok: boolean; warning?: string } {
  const p = progress.find((x) => x.step === from);
  if (p && stepStatus(p) === "open") {
    return {
      ok: false,
      warning: `${from} has an unaddressed life-threat — treat it before proceeding (return to ${from}).`,
    };
  }
  return { ok: true };
}

/** The reassess prompt for a step (from the catalog). */
export function reassessPromptFor(step: AbcdeLetter): string {
  return getStepCatalog(step).reassess;
}

/** A minimal event shape for deriving progress (kind + step + payload). */
export interface ProgressEvent {
  kind: ResusEventKind;
  step: AbcdeLetter | "pre" | "arrest" | null;
  payload?: Record<string, unknown>;
}

/**
 * Reduce timeline events into per-step progress. An assessment/vital
 * event marks the step assessed; an assessment event with
 * `payload.danger === true` flags a life-threat; any action-class event
 * marks the step acted-on. Events with no ABCDE letter (pre/arrest/notes)
 * are ignored. Pure.
 */
export function deriveProgress(events: readonly ProgressEvent[]): StepProgress[] {
  const base: Record<AbcdeLetter, StepProgress> = Object.fromEntries(
    ABCDE_LETTERS.map((step) => [
      step,
      { step, assessed: false, dangerFlagged: false, actionTaken: false },
    ]),
  ) as Record<AbcdeLetter, StepProgress>;

  for (const e of events) {
    if (e.step === null || e.step === "pre" || e.step === "arrest") continue;
    const p = base[e.step];
    if (e.kind === "assessment" || e.kind === "vital" || e.kind === "reassessment") {
      p.assessed = true;
      if (e.kind === "assessment" && e.payload?.danger === true) p.dangerFlagged = true;
    }
    if (ACTION_KINDS.has(e.kind)) {
      p.assessed = true;
      p.actionTaken = true;
    }
  }

  return ABCDE_LETTERS.map((step) => base[step]);
}

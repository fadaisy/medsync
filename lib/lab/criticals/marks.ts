/**
 * Critical marks and the release plan (Lab Phase 1, §6.4, rules CM-1 to CM-5 and CA-1; ADR 0242). Pure.
 *
 * A mark is committed only with the release that makes the report final (CM-2): the release action
 * calls `planRelease` and writes the alert, the marks and the release in one transaction. An
 * auto-flagged value cannot be released without its check, and its mark cannot be removed (CM-3, CM-4):
 * the only way out is to correct the value. These are the slice's only hard stops (Law 13).
 */
import type { CriticalEvaluation } from "@/lib/lab/flags";

import { isDecimal } from "@/lib/lab/catalogue";

export type CheckKind = "repeated" | "checked_not_repeated" | "could_not_check";
export type CouldNotCheckReason = "not_enough_sample" | "analyser_down" | "no_reagent" | "other";

export type MarkCheck =
  | { kind: "repeated"; repeatValue: string }
  | { kind: "checked_not_repeated" }
  | { kind: "could_not_check"; reason: CouldNotCheckReason; text?: string | null };

/** What the technologist submits for one component. `source` comes from the evaluation, never the client. */
export interface MarkInput {
  conceptId: string;
  check: MarkCheck;
  sampleChecked: boolean;
  secondCheckerId?: string | null;
  soloReason?: string | null;
}

/** A mark as written to `critical_marks` (0102). */
export interface PlannedMark extends MarkInput {
  source: "manual" | "auto";
  limitId: string | null;
  limitVersion: number | null;
  direction: "low" | "high" | null;
  actorId: string;
}

export interface ReleaseComponent {
  conceptId: string;
  evaluation: CriticalEvaluation | null;
}

export interface ReleaseContext {
  actorId: string;
  /** The hospital's second-check setting (CM-5, `lab_settings.second_check`). */
  secondCheck: boolean;
  /** May this user release results here? (CM-5: the second checker must.) */
  mayRelease: (userId: string) => boolean;
}

export type ReleasePlan =
  | { ok: true; marks: PlannedMark[]; createsAlert: boolean }
  | { ok: false; errors: string[] };

/** CM-3, CM-5: what is wrong with one mark's check. */
export function markErrors(m: MarkInput, ctx: ReleaseContext): string[] {
  const errors: string[] = [];
  const c = m.check;
  if (c.kind === "repeated" && !isDecimal(c.repeatValue))
    errors.push(`repeat_value:${m.conceptId}`);
  if (
    c.kind === "could_not_check" &&
    c.reason === "other" &&
    !(c.text && c.text.trim().length >= 3)
  )
    errors.push(`could_not_check_text:${m.conceptId}`);
  if (ctx.secondCheck) {
    const second = m.secondCheckerId ?? null;
    const solo = (m.soloReason ?? "").trim();
    if (second === null && solo.length < 3) errors.push(`second_check:${m.conceptId}`);
    if (second !== null && (second === ctx.actorId || !ctx.mayRelease(second)))
      errors.push(`second_checker:${m.conceptId}`);
  }
  return errors;
}

/**
 * CM-1 to CM-4 and CA-1: the marks a release writes, and whether it creates an alert. Every component
 * the signed limits flag needs a mark with a check (auto); any other component may be marked by hand.
 * One report, at most one alert, however many components are marked.
 */
export function planRelease(
  components: readonly ReleaseComponent[],
  submitted: readonly MarkInput[],
  ctx: ReleaseContext,
): ReleasePlan {
  const errors: string[] = [];
  const known = new Set(components.map((c) => c.conceptId));
  const byConcept = new Map<string, MarkInput>();
  for (const m of submitted) {
    if (!known.has(m.conceptId)) errors.push(`unknown_component:${m.conceptId}`);
    else if (byConcept.has(m.conceptId)) errors.push(`duplicate_mark:${m.conceptId}`);
    else byConcept.set(m.conceptId, m);
  }
  const marks: PlannedMark[] = [];
  for (const c of components) {
    const m = byConcept.get(c.conceptId);
    const auto = c.evaluation?.kind === "critical" ? c.evaluation : null;
    if (auto && !m) {
      errors.push(`check_required:${c.conceptId}`); // CM-3, CM-4
      continue;
    }
    if (!m) continue;
    errors.push(...markErrors(m, ctx));
    marks.push({
      ...m,
      source: auto ? "auto" : "manual",
      limitId: auto?.limitId ?? null,
      limitVersion: auto?.version ?? null,
      direction: auto?.direction ?? null,
      actorId: ctx.actorId,
    });
  }
  return errors.length > 0
    ? { ok: false, errors }
    : { ok: true, marks, createsAlert: marks.length > 0 };
}

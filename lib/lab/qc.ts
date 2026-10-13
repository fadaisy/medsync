/**
 * Quantitative QC: plans, targets, status and the release hold (Lab Phase 3 §6.6 QQ-1..QQ-3, QH-1..QH-6;
 * GATE A §3.1 `qc_plan`/`qc_policy`, §5.2; D-LAB3-01, -02, -04). Pure.
 *
 * Nothing here holds a target, SD, level count or minimum: they come from the signed plan and policy. The cached
 * status row (`lab_qc_status`) is written from `qcStatusFor`; `no_plan` and `not_run_in_window` are computed.
 */
import type { RuleId, RunDecision } from "@/lib/lab/qc-rules";

import { dayOf } from "@/lib/lab/stock";

/** QQ-1: a level's target for one control lot, as signed on the plan version. */
export interface QcTarget {
  level: number;
  controlLotId: string;
  mean: number;
  sd: number;
  source: "maker_provisional" | "lab";
}

/** QQ-2: the `qc_plan` payload, as far as the engine reads it. */
export interface QcPlan {
  version: number;
  levels: { level: number; label: string; controlItemId: string }[];
  frequency: { kind: "each_day_before_patients" | "per_run" | "per_n_samples"; n?: number };
  rejectRules: RuleId[];
  warnRules: RuleId[];
  tenXAcrossLevels: boolean;
  holdWhenNotRun: boolean;
  targets: QcTarget[];
}

/** QQ-1: the target in force for a level and control lot, or null (no target: the run cannot be scored). */
export const targetFor = (plan: QcPlan, level: number, controlLotId: string) =>
  plan.targets.find((t) => t.level === level && t.controlLotId === controlLotId) ?? null;

/** QQ-2: a plan the lead can sign has levels, at least one reject rule and a target per level. */
export function planErrors(plan: QcPlan): string[] {
  const e: string[] = [];
  if (plan.levels.length === 0) e.push("no_levels");
  if (plan.rejectRules.length === 0) e.push("no_reject_rules");
  if (plan.rejectRules.some((r) => plan.warnRules.includes(r))) e.push("rule_both_reject_and_warn");
  if (plan.frequency.kind === "per_n_samples" && !(plan.frequency.n && plan.frequency.n > 0))
    e.push("frequency_needs_n");
  for (const l of plan.levels)
    if (!plan.targets.some((t) => t.level === l.level && t.sd > 0)) e.push(`no_target:${l.level}`);
  return e;
}

/**
 * QQ-3: the lab's own target for a control lot level, from accepted runs only, once the signed minimum of runs
 * over the signed minimum of distinct hospital-local days is reached. Mean and sample SD. Nothing recalculates
 * on its own: the result feeds "Set this lab's target", which writes a new plan version.
 */
export function labTarget(
  runs: readonly { decision: RunDecision; runAt: Date; value: number }[],
  policy: { minRunsForTarget: number; minDaysForTarget: number },
  timeZone: string,
):
  | { kind: "not_enough"; runs: number; days: number }
  | { kind: "ready"; mean: number; sd: number; runs: number; from: Date; to: Date } {
  const ok = runs
    .filter((r) => r.decision !== "rejected")
    .sort((a, b) => a.runAt.getTime() - b.runAt.getTime());
  const days = new Set(ok.map((r) => dayOf(r.runAt, timeZone))).size;
  if (ok.length < policy.minRunsForTarget || days < policy.minDaysForTarget || ok.length < 2)
    return { kind: "not_enough", runs: ok.length, days };
  const mean = ok.reduce((s, r) => s + r.value, 0) / ok.length;
  const sd = Math.sqrt(ok.reduce((s, r) => s + (r.value - mean) ** 2, 0) / (ok.length - 1));
  return { kind: "ready", mean, sd, runs: ok.length, from: ok[0]!.runAt, to: ok.at(-1)!.runAt };
}

export type QcStatus =
  | "passed"
  | "warning"
  | "failed"
  | "not_run_in_window"
  | "no_plan"
  | "provisional_target";

/**
 * QH-1: the status of a component on an analyser at `at`. The latest run decides; a rejected run stays `failed`
 * until a later run is accepted (the window never clears a failure). An accepted run outside the plan's window
 * is `not_run_in_window`. `per_run` reads as the hospital-local day (analyser runs are not modelled).
 */
export function qcStatusFor(input: {
  plan: QcPlan | null;
  latestRun: { id: string; decision: RunDecision; runAt: Date } | null;
  at: Date;
  timeZone: string;
  /** per_n_samples: patient samples run since the latest run. */
  samplesSinceRun?: number;
}): { status: QcStatus; runId: string | null } {
  const { plan, latestRun: run } = input;
  if (!plan) return { status: "no_plan", runId: null };
  if (!run) return { status: "not_run_in_window", runId: null };
  if (run.decision === "rejected") return { status: "failed", runId: run.id };
  const inWindow =
    plan.frequency.kind === "per_n_samples"
      ? (input.samplesSinceRun ?? 0) < (plan.frequency.n ?? 0)
      : dayOf(run.runAt, input.timeZone) === dayOf(input.at, input.timeZone);
  if (!inWindow) return { status: "not_run_in_window", runId: run.id };
  if (run.decision === "warning") return { status: "warning", runId: run.id };
  const provisional = plan.targets.some((t) => t.source === "maker_provisional");
  return { status: provisional ? "provisional_target" : "passed", runId: run.id };
}

/** QH-6: what the result records about QC at release (Law 4). */
export interface QcSnapshot {
  status: QcStatus;
  runId: string | null;
  override?: { by: string; reason: string };
}

export interface ComponentQc {
  conceptId: string;
  status: QcStatus;
  runId: string | null;
  /** Set by a rejected run; cleared only by the lead's "Authorise resumption" (NC-3). */
  held: boolean;
  holdWhenNotRun: boolean;
}

export type QcReleasePlan =
  | {
      ok: true;
      /** Released now, each with its snapshot (QH-6). */
      release: { conceptId: string; qc: QcSnapshot; lookBack: boolean; notice: string | null }[];
      /** QH-2: "to follow: held for quality control"; stays preliminary in the report (E-LAB3-08). */
      held: string[];
    }
  | { ok: false; error: "override_not_permitted" | "override_reason_required" };

/**
 * QH-2..QH-4, QH-6: which components of a report release now. With `labQcHold` off nothing is held and the
 * status is recorded. With it on, a held or failed component is held (QH-2), and `not_run_in_window` holds only
 * when the plan says (QH-3; otherwise it releases with "QC not run today"). An override by a holder of
 * `lab.qc.override` with a reason releases the held components with the signed line and adds them to the
 * look-back (QH-4). The server refuses what this refuses.
 */
export function qcReleasePlan(input: {
  holdOn: boolean;
  components: readonly ComponentQc[];
  override?: { by: string; permitted: boolean; reason: string };
}): QcReleasePlan {
  const blocked = (c: ComponentQc) =>
    input.holdOn &&
    (c.held || c.status === "failed" || (c.status === "not_run_in_window" && c.holdWhenNotRun));
  const o = input.override;
  if (o && input.components.some(blocked)) {
    if (!o.permitted) return { ok: false, error: "override_not_permitted" };
    if (o.reason.trim().length < 3) return { ok: false, error: "override_reason_required" };
  }
  const release: Extract<QcReleasePlan, { ok: true }>["release"] = [];
  const held: string[] = [];
  for (const c of input.components) {
    const qc: QcSnapshot = { status: c.status, runId: c.runId };
    const notice = c.status === "not_run_in_window" ? "qc_not_run_today" : null;
    if (!blocked(c)) {
      release.push({ conceptId: c.conceptId, qc, lookBack: false, notice });
    } else if (o) {
      release.push({
        conceptId: c.conceptId,
        qc: { ...qc, override: { by: o.by, reason: o.reason.trim() } },
        lookBack: true,
        notice: "released_while_qc_failed",
      });
    } else held.push(c.conceptId);
  }
  return { ok: true, release, held };
}

/**
 * QH-5: other in-service analysers whose latest run for the component was accepted, for "Run on another
 * analyser" on an Immediate order.
 */
export function otherAnalysers(
  statuses: readonly {
    hospitalId: string;
    deviceId: string;
    conceptId: string;
    status: QcStatus;
    held: boolean;
    inService: boolean;
  }[],
  q: { hospitalId: string; conceptId: string; deviceId: string },
): string[] {
  return statuses
    .filter(
      (s) =>
        s.hospitalId === q.hospitalId &&
        s.conceptId === q.conceptId &&
        s.deviceId !== q.deviceId &&
        s.inService &&
        !s.held &&
        (s.status === "passed" || s.status === "warning" || s.status === "provisional_target"),
    )
    .map((s) => s.deviceId);
}

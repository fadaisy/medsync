/**
 * The Westgard rule library and evaluator (Lab Phase 3 §6.6 QR-1..QR-4; GATE A §6; D-LAB3-03, E-LAB3-03). Pure.
 *
 * Everything works on `z = (value − target) ÷ SD` per level. "Beyond +2s" is `z > 2` strictly (a point at exactly
 * 2.00 breaks nothing); "one side of the mean" is `z > 0` or `z < 0` (a point at exactly 0 ends a run). Every
 * configured rule is applied directly; 1-2s is never a gate (Westgard). Only breaks that include the run being
 * evaluated are reported. The rule definitions are structure (westgard.com); which rules reject and which warn
 * is the signed plan's.
 */

export const RULE_IDS = [
  "1-2s",
  "1-3s",
  "2-2s",
  "R-4s",
  "4-1s",
  "10-x",
  "2of3-2s",
  "3-1s",
  "6-x",
  "8-x",
  "9-x",
  "12-x",
] as const;
export type RuleId = (typeof RULE_IDS)[number];

/** QR-2: consecutive points on one side of the mean, per "n-x" rule. */
const MEAN_RUNS: Partial<Record<RuleId, number>> = {
  "6-x": 6,
  "8-x": 8,
  "9-x": 9,
  "10-x": 10,
  "12-x": 12,
};

export interface QcValue {
  level: number;
  /** The control lot measured at this level (QR-3). */
  lotId: string;
  z: number;
}

export interface QcRunPoints {
  id: string;
  planVersion: number;
  values: QcValue[];
}

export interface RulePlan {
  rejectRules: RuleId[];
  warnRules: RuleId[];
  /** 10-x also counts across levels (the plan says). */
  tenXAcrossLevels: boolean;
}

export type RuleScope = "point" | "within_run" | "across_runs" | "across_levels_and_runs";

export interface RuleBreak {
  rule: RuleId;
  kind: "reject" | "warning";
  scope: RuleScope;
  points: { runId: string; level: number; z: number }[];
}

type Point = RuleBreak["points"][number];

const SIDES = [1, -1] as const;
const beyond = (p: Point, side: 1 | -1, limit: number) => p.z * side > limit;

/**
 * QR-3: the runs that share the current run's history at a level: newest first, stopping at the first run on
 * another plan version or another control lot at that level (a lot change starts a new history).
 */
function levelHistory(run: QcRunPoints, history: readonly QcRunPoints[], level: number): Point[] {
  const lotId = run.values.find((v) => v.level === level)?.lotId;
  const out: Point[] = [];
  for (const h of [...history].reverse()) {
    if (h.planVersion !== run.planVersion) break;
    const v = h.values.find((x) => x.level === level);
    if (!v) continue;
    if (v.lotId !== lotId) break;
    out.unshift({ runId: h.id, level, z: v.z });
  }
  return out;
}

/** QR-3 across levels: whole runs, newest first, while every level's lot and the plan version match. */
function runHistory(run: QcRunPoints, history: readonly QcRunPoints[]): Point[] {
  const lots = new Map(run.values.map((v) => [v.level, v.lotId]));
  const out: Point[] = [];
  for (const h of [...history].reverse()) {
    if (h.planVersion !== run.planVersion) break;
    if (h.values.some((v) => lots.has(v.level) && lots.get(v.level) !== v.lotId)) break;
    out.unshift(...pointsOf(h));
  }
  return out;
}

const pointsOf = (r: QcRunPoints): Point[] =>
  [...r.values]
    .sort((a, b) => a.level - b.level)
    .map((v) => ({ runId: r.id, level: v.level, z: v.z }));

/** The last `n` points, when all of them are beyond `limit` on one side. */
function tail(seq: readonly Point[], n: number, limit: number): Point[] | null {
  if (seq.length < n) return null;
  const last = seq.slice(-n);
  return SIDES.some((s) => last.every((p) => beyond(p, s, limit))) ? last : null;
}

/**
 * QR-1: every configured rule the run breaks, with its scope and the points that break it. `history` is the
 * device × component's earlier runs, oldest first; QR-3 trims it to the same control lot and plan version.
 */
export function evaluateRules(
  plan: RulePlan,
  run: QcRunPoints,
  history: readonly QcRunPoints[],
): RuleBreak[] {
  const out: RuleBreak[] = [];
  const add = (rule: RuleId, scope: RuleScope, points: Point[]) => {
    const kind = plan.rejectRules.includes(rule)
      ? "reject"
      : plan.warnRules.includes(rule)
        ? "warning"
        : null;
    if (kind) out.push({ rule, kind, scope, points });
  };
  const now = pointsOf(run);

  // One point.
  for (const p of now) {
    if (Math.abs(p.z) > 2) add("1-2s", "point", [p]);
    if (Math.abs(p.z) > 3) add("1-3s", "point", [p]);
  }

  // Within the run, across levels.
  for (const s of SIDES) {
    const hit2 = now.filter((p) => beyond(p, s, 2));
    if (hit2.length >= 2) add("2-2s", "within_run", hit2);
    if (now.length >= 3 && hit2.length >= 2) add("2of3-2s", "within_run", hit2);
    if (now.length >= 3 && now.every((p) => beyond(p, s, 1))) add("3-1s", "within_run", now);
  }
  const high = now.find((p) => p.z > 2);
  const low = now.find((p) => p.z < -2);
  if (high && low) add("R-4s", "within_run", [high, low]); // never across runs (QR-2)

  // Across runs, within a level.
  for (const p of now) {
    const seq = [...levelHistory(run, history, p.level), p];
    const two = tail(seq, 2, 2);
    if (two) add("2-2s", "across_runs", two);
    const four = tail(seq, 4, 1);
    if (four) add("4-1s", "across_runs", four);
    const three = tail(seq, 3, 1);
    if (three) add("3-1s", "across_runs", three);
    for (const [rule, n] of Object.entries(MEAN_RUNS) as [RuleId, number][]) {
      const t = tail(seq, n, 0);
      if (t) add(rule, "across_runs", t);
    }
  }

  // 10-x across levels and runs, when the plan says (and not already broken within a level).
  if (plan.tenXAcrossLevels && !out.some((b) => b.rule === "10-x")) {
    const t = tail([...runHistory(run, history), ...now], 10, 0);
    if (t && t.some((p) => p.runId === run.id)) add("10-x", "across_levels_and_runs", t);
  }
  return out;
}

export type RunDecision = "accepted" | "warning" | "rejected";

/** GATE A §5.2 steps 3–5: any reject rule rejects; a warn rule alone accepts with the warning recorded. */
export const runDecision = (breaks: readonly RuleBreak[]): RunDecision =>
  breaks.some((b) => b.kind === "reject") ? "rejected" : breaks.length > 0 ? "warning" : "accepted";

/** z = (value − target) ÷ SD, from the plan version's target for that control lot (GATE A §5.2 step 1). */
export const zScore = (value: number, target: { mean: number; sd: number }) =>
  (value - target.mean) / target.sd;

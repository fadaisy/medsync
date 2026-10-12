import type { LineChecks } from "./checks";

import { answeredChecks } from "./checks";

/**
 * Review lanes (Pharmacy Phase 1; LN-1..LN-8, gate-a-proposal §4). Pure: the caller brings the active
 * lines of one prescription as stored, the hospital's signed lane rule and its signed high-risk list.
 * Every reason reads a fact stored at prescribing (LN-3); no prescribing check is re-run. Stock and
 * payment are not inputs, so they cannot move a prescription between lanes (LN-6). The snapshot on the
 * first review or supply event (LN-7) is the caller's write; a changed prescription is simply passed
 * in again as it now stands (LN-8).
 */

export type LaneReasonCode =
  | "overridden_stop"
  | "controlled"
  | "child_check"
  | "renal_check"
  | "high_risk"
  | "preset_dose_changed"
  | "typed_dose";

export type PrescriptionLane = "pharmacist_first" | "standard";

/** Most serious first: the order reasons are listed in. */
export const LANE_REASON_ORDER: readonly LaneReasonCode[] = [
  "overridden_stop",
  "controlled",
  "high_risk",
  "child_check",
  "renal_check",
  "preset_dose_changed",
  "typed_dose",
];

/** One hospital's signed, versioned rule (LN-1); null when none is signed and in force (LN-4). */
export type LaneRule = {
  version: number;
  reasons: readonly { code: LaneReasonCode; on: boolean }[];
} | null;

/** The stored facts of one active line. */
export interface LaneLine extends LineChecks {
  id: string;
  controlled: boolean;
  regimenId: string | null;
  /** The changes made to the regimen's dose (`prescriptions.edits`). */
  edits: readonly unknown[];
  /** Plan rows only: the line's problem. */
  conditionId: string | null;
  kind: "drug" | "fluid";
  drugId: string;
}

export interface LaneResult {
  lane: PrescriptionLane;
  reasons: LaneReasonCode[];
  perLine: Map<string, LaneReasonCode[]>;
  ruleVersion: number | null;
}

/** The stored fact each reason reads (gate-a-proposal §4's table). */
const FACT: Record<
  LaneReasonCode,
  (line: LaneLine, highRisk: ReadonlySet<string> | null) => boolean
> = {
  overridden_stop: (l) => answeredChecks(l).some((c) => c.level === "stop"),
  controlled: (l) => l.controlled,
  high_risk: (l, list) => list?.has(l.drugId) ?? false,
  child_check: (l) =>
    answeredChecks(l).some((c) => c.code === "child" || c.code === "paediatric_routing"),
  renal_check: (l) => answeredChecks(l).some((c) => c.code === "kidney"),
  preset_dose_changed: (l) => l.regimenId !== null && l.edits.length > 0,
  typed_dose: (l) => l.conditionId !== null && l.kind === "drug" && l.regimenId === null,
};

export function laneFor(
  lines: readonly LaneLine[],
  rule: LaneRule,
  highRiskIds: ReadonlySet<string> | null,
): LaneResult {
  if (!rule)
    return { lane: "pharmacist_first", reasons: [], perLine: new Map(), ruleVersion: null };
  const on = new Set(rule.reasons.filter((r) => r.on).map((r) => r.code));
  on.add("controlled"); // LN-5: whatever the rule says
  const active = LANE_REASON_ORDER.filter((code) => on.has(code));
  const perLine = new Map(
    lines.map((l) => [l.id, active.filter((code) => FACT[code](l, highRiskIds))]),
  );
  const fired = new Set([...perLine.values()].flat());
  const reasons = LANE_REASON_ORDER.filter((code) => fired.has(code));
  return {
    lane: reasons.length ? "pharmacist_first" : "standard",
    reasons,
    perLine,
    ruleVersion: rule.version,
  };
}

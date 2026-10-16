/**
 * Lot acceptance (Lab Phase 3 §6.2, LA-1..LA-6; GATE A §3.1 `acceptance_plan`, §5.1). Pure.
 *
 * The plan is signed data (the lead's); this file holds no criterion, sample count or trigger of its own.
 * The "is this lot selectable" check is `lotRefusal` in `lib/lab/stock.ts` (LA-4), shared with issue, lots in
 * use and the bedside form.
 */
import type { LotState } from "@/lib/lab/stock";

export type AcceptanceTrigger = "new_lot" | "new_shipment" | "new_formulation";

/** LA-1, LA-2: the `acceptance_plan` payload, as far as the engine reads it. */
export interface AcceptancePlan {
  method: "qc_pass" | "lot_comparison" | "certificate" | "none";
  triggers: AcceptanceTrigger[];
  comparison?: {
    samples: number;
    criterion: { absolute?: number; percent?: number; combine: "larger" | "both" };
    qcAlso: boolean;
  };
  certificateAllowed: boolean;
}

/** LA-2: does this arrival need acceptance under the plan? */
export const acceptanceNeeded = (plan: AcceptancePlan, arrival: AcceptanceTrigger) =>
  plan.method !== "none" && plan.triggers.includes(arrival);

/** LA-5: a comparison pair, recorded by result id; never a patient identity. */
export interface ComparisonPair {
  observationId: string;
  level: string;
  current: number;
  candidate: number;
}

export interface PairVerdict {
  /** LA-5: shown as "Sample n" with its level. */
  label: string;
  level: string;
  observationId: string;
  difference: number;
  percent: number | null;
  within: boolean;
}

// Differences of decimals in binary floating point land a hair off (4.2 − 4.0 = 0.2000000000000002); a pair
// exactly at the criterion is within it.
const EPS = 1e-9;

/**
 * LA-3: every pair against the signed criterion. Absolute and percent may be given alone or together; together
 * they combine as "whichever is larger" (the larger allowance) or "both" (each must hold). At the boundary a pair
 * is within. Fewer pairs than the plan asks for is `incomplete`.
 */
export function evaluateLotComparison(
  plan: AcceptancePlan,
  pairs: readonly ComparisonPair[],
): { outcome: "within" | "outside" | "incomplete"; pairs: PairVerdict[] } {
  const c = plan.comparison;
  if (!c) throw new Error("plan has no comparison");
  const { absolute, percent, combine } = c.criterion;
  const verdicts = pairs.map((p, i) => {
    const difference = Math.abs(p.candidate - p.current);
    const pct = p.current === 0 ? null : (difference / Math.abs(p.current)) * 100;
    const absOk = absolute === undefined ? null : difference <= absolute + EPS;
    const pctOk = percent === undefined ? null : pct !== null && pct <= percent + EPS;
    const within =
      absOk === null
        ? pctOk === true
        : pctOk === null
          ? absOk
          : combine === "both"
            ? absOk && pctOk
            : absOk || pctOk;
    return {
      label: `Sample ${i + 1}`,
      level: p.level,
      observationId: p.observationId,
      difference,
      percent: pct,
      within,
    };
  });
  const outcome = verdicts.some((v) => !v.within)
    ? "outside"
    : verdicts.length < c.samples
      ? "incomplete"
      : "within";
  return { outcome, pairs: verdicts };
}

export type AcceptanceOutcome =
  | { kind: "accepted"; basis: "plan" | "qc" | "certificate" | "none" }
  | { kind: "rejected" | "quarantined"; reason: string }
  | { kind: "pending" };

/**
 * LA-1, KQ-4, §5.1: what the evidence so far means for the lot. `qcPassed` is the lot's QC (kit controls or
 * quantitative QC on the new lot): undefined = not run yet. A failed control quarantines (KQ-3); a comparison
 * outside the criterion rejects.
 */
export function acceptanceOutcome(
  plan: AcceptancePlan,
  evidence: {
    comparison?: "within" | "outside" | "incomplete";
    qcPassed?: boolean;
    certificateAccepted?: boolean;
  },
): AcceptanceOutcome {
  switch (plan.method) {
    case "none":
      return { kind: "accepted", basis: "none" };
    case "certificate":
      return plan.certificateAllowed && evidence.certificateAccepted
        ? { kind: "accepted", basis: "certificate" }
        : { kind: "pending" };
    case "qc_pass":
      if (evidence.qcPassed === undefined) return { kind: "pending" };
      return evidence.qcPassed
        ? { kind: "accepted", basis: "qc" }
        : { kind: "quarantined", reason: "control_failed" };
    case "lot_comparison":
      if (evidence.comparison === "outside")
        return { kind: "rejected", reason: "outside_criterion" };
      if (evidence.comparison !== "within") return { kind: "pending" };
      if (!plan.comparison?.qcAlso) return { kind: "accepted", basis: "plan" };
      if (evidence.qcPassed === false) return { kind: "rejected", reason: "qc_failed_on_new_lot" };
      return evidence.qcPassed ? { kind: "accepted", basis: "plan" } : { kind: "pending" };
  }
}

/** LA-6: a lot on hand when `labStock` is switched on, accepted on the lead's written statement. */
export function grandfatherLot(
  statement: string,
): { state: LotState; acceptedBasis: "before_medsync"; statement: string } | null {
  const s = statement.trim();
  return s ? { state: "accepted", acceptedBasis: "before_medsync", statement: s } : null;
}

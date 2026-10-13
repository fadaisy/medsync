/**
 * QC for kits, stains and qualitative tests (Lab Phase 3 §6.5, KQ-1..KQ-6; GATE A §3.1 `kit_qc_rule`, P6). Pure.
 *
 * The rule, its controls, expected answers and stain pass criteria are signed data (the lead's); none lives here.
 * KQ-6 (HIV kit IQC in HMIS 105 10.3) is counted by `count105` in `lib/lab/hmis105.ts`.
 */
import type { LotState } from "@/lib/lab/stock";

import { addDays, dayOf } from "@/lib/lab/stock";

export type KitTrigger =
  | { kind: "each_day_of_use" }
  | { kind: "new_lot" }
  | { kind: "new_shipment" }
  | { kind: "new_operator" }
  /** ISO weekday, 1 = Monday. */
  | { kind: "schedule"; weekday: number }
  | { kind: "after_maintenance" };

export type KitControl =
  | { name: string; expected: { code: string } }
  /** KQ-5: a stain control passes when every signed criterion is ticked. */
  | { name: string; expected: { passCriteria: string[] } };

/** KQ-1: the `kit_qc_rule` payload, as far as the engine reads it. */
export interface KitQcRule {
  triggers: KitTrigger[];
  controls: KitControl[];
  requiredBeforeUse: boolean;
  hmisIqc: boolean;
}

/** A `lab_control_checks` row (subject kit or stain). */
export interface ControlCheck {
  hospitalId: string;
  itemId: string;
  lotId: string;
  operatorId: string;
  outcome: "pass" | "fail";
  at: Date;
}

const isoWeekday = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay() || 7;

/**
 * KQ-2: the triggers still outstanding for using this lot today, by this operator. A trigger is met by a passing
 * check after the event that raised it: today (each day of use; the scheduled weekday's most recent occurrence),
 * ever on this lot (new lot), since this lot's latest receipt (new shipment), ever by this operator on this item
 * (new operator), since the last maintenance (after maintenance).
 */
export function kitQcDue(input: {
  rule: KitQcRule;
  hospitalId: string;
  itemId: string;
  lot: { id: string; lastReceivedAt: Date };
  operatorId: string;
  at: Date;
  timeZone: string;
  checks: readonly ControlCheck[];
  lastMaintenanceAt: Date | null;
}): KitTrigger["kind"][] {
  const tz = input.timeZone;
  const today = dayOf(input.at, tz);
  const passes = input.checks.filter(
    (c) =>
      c.hospitalId === input.hospitalId &&
      c.itemId === input.itemId &&
      c.outcome === "pass" &&
      c.at <= input.at,
  );
  const onLot = passes.filter((c) => c.lotId === input.lot.id);
  const sinceDay = (day: string) => passes.some((c) => dayOf(c.at, tz) >= day);
  const met = (t: KitTrigger): boolean => {
    switch (t.kind) {
      case "each_day_of_use":
        return sinceDay(today);
      case "new_lot":
        return onLot.length > 0;
      case "new_shipment":
        return onLot.some((c) => c.at >= input.lot.lastReceivedAt);
      case "new_operator":
        return passes.some((c) => c.operatorId === input.operatorId);
      case "schedule":
        return sinceDay(addDays(today, -((isoWeekday(today) - t.weekday + 7) % 7)));
      case "after_maintenance":
        return !input.lastMaintenanceAt || passes.some((c) => c.at > input.lastMaintenanceAt!);
    }
  };
  return input.rule.triggers.filter((t) => !met(t)).map((t) => t.kind);
}

/** KQ-1: outstanding QC blocks selection only when the rule says "required before use". */
export const kitQcBlocks = (rule: KitQcRule, due: readonly string[]) =>
  rule.requiredBeforeUse && due.length > 0;

export type ObservedControl = { name: string; code: string } | { name: string; met: string[] };

/**
 * KQ-3..KQ-5: score a check against the rule's controls. A failed control quarantines the lot at once and opens a
 * nonconformity (KQ-3); a pass on a lot in acceptance under a `qc_pass` plan accepts it (KQ-4). A control with
 * no observation fails.
 */
export function evaluateKitCheck(input: {
  rule: KitQcRule;
  observed: readonly ObservedControl[];
  lotState: LotState;
  acceptanceMethod: string | null;
}): {
  outcome: "pass" | "fail";
  controls: { name: string; pass: boolean }[];
  lotTo: LotState | null;
  openNonconformity: "kit_qc_fail" | null;
} {
  const controls = input.rule.controls.map((c) => {
    const o = input.observed.find((x) => x.name === c.name);
    const pass =
      !!o &&
      ("code" in c.expected
        ? "code" in o && o.code === c.expected.code
        : "met" in o && c.expected.passCriteria.every((k) => o.met.includes(k)));
    return { name: c.name, pass };
  });
  const outcome = controls.length > 0 && controls.every((c) => c.pass) ? "pass" : "fail";
  if (outcome === "fail")
    return {
      outcome,
      controls,
      lotTo: input.lotState === "quarantined" ? null : "quarantined",
      openNonconformity: "kit_qc_fail",
    };
  const accepts =
    input.acceptanceMethod === "qc_pass" &&
    (input.lotState === "received" || input.lotState === "in_acceptance");
  return { outcome, controls, lotTo: accepts ? "accepted" : null, openNonconformity: null };
}

/** KQ-3: release from quarantine needs the laboratory lead and a passing rerun after the quarantine. */
export function quarantineReleaseErrors(input: {
  actorIsLead: boolean;
  quarantinedAt: Date;
  checks: readonly Pick<ControlCheck, "lotId" | "outcome" | "at">[];
  lotId: string;
}): ("not_lead" | "no_passing_rerun")[] {
  const e: ("not_lead" | "no_passing_rerun")[] = [];
  if (!input.actorIsLead) e.push("not_lead");
  if (
    !input.checks.some(
      (c) => c.lotId === input.lotId && c.outcome === "pass" && c.at > input.quarantinedAt,
    )
  )
    e.push("no_passing_rerun");
  return e;
}

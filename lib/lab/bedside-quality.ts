/**
 * Bedside quality: device control checks and operator competency (Lab Phase 3 §6.9, BQ-1..BQ-5; GATE A P9, P14,
 * §3.1 `device_qc_rule`/`competency_validity`, §3.2 0116; D-LAB3-15, -16). Pure.
 *
 * Control ranges come from the strip lot (`insert_ranges`, entered by the lab from the vial), never from the
 * operator. Validity periods and grace periods are the lead's operational settings.
 */
import { addDays, dayOf } from "@/lib/lab/stock";

export type DeviceTrigger =
  | "each_day_of_use"
  | "new_strip_lot"
  | "new_control_vial"
  | "after_incident";

/** BQ-1: the `device_qc_rule` payload, as far as the engine reads it. */
export interface DeviceQcRule {
  triggers: DeviceTrigger[];
  levels: string[];
  requiredBeforeUse: boolean;
}

/** A `lab_control_checks` row with subject `device`. */
export interface DeviceCheck {
  hospitalId: string;
  deviceId: string;
  stripLotId: string;
  controlVialLotId: string | null;
  outcome: "pass" | "fail";
  at: Date;
}

/**
 * BQ-1: the triggers outstanding for the device now: no pass today; none on this strip lot; none on this control
 * vial; none since the last drop or error message the operator recorded.
 */
export function deviceCheckDue(input: {
  rule: DeviceQcRule;
  hospitalId: string;
  deviceId: string;
  stripLotId: string;
  controlVialLotId: string | null;
  lastIncidentAt: Date | null;
  checks: readonly DeviceCheck[];
  at: Date;
  timeZone: string;
}): DeviceTrigger[] {
  const passes = input.checks.filter(
    (c) =>
      c.hospitalId === input.hospitalId &&
      c.deviceId === input.deviceId &&
      c.outcome === "pass" &&
      c.at <= input.at,
  );
  const today = dayOf(input.at, input.timeZone);
  const met: Record<DeviceTrigger, boolean> = {
    each_day_of_use: passes.some((c) => dayOf(c.at, input.timeZone) === today),
    new_strip_lot: passes.some((c) => c.stripLotId === input.stripLotId),
    new_control_vial:
      input.controlVialLotId === null ||
      passes.some((c) => c.controlVialLotId === input.controlVialLotId),
    after_incident: !input.lastIncidentAt || passes.some((c) => c.at > input.lastIncidentAt!),
  };
  return input.rule.triggers.filter((t) => !met[t]);
}

/**
 * BQ-1, BQ-2: score a device check against the strip lot's ranges. A level with no range on the lot cannot be
 * scored (`no_range_for_lot`). A fail blocks the device; a pass unblocks it.
 */
export function evaluateDeviceCheck(input: {
  rule: DeviceQcRule;
  lotRanges: Readonly<Record<string, { low: number; high: number }>> | null;
  observed: Readonly<Record<string, number>>;
}):
  | {
      ok: true;
      outcome: "pass" | "fail";
      levels: { level: string; pass: boolean }[];
      deviceState: "in_use" | "blocked";
    }
  | { ok: false; error: "no_range_for_lot" } {
  const levels: { level: string; pass: boolean }[] = [];
  for (const level of input.rule.levels) {
    const r = input.lotRanges?.[level];
    if (!r) return { ok: false, error: "no_range_for_lot" };
    const v = input.observed[level];
    levels.push({ level, pass: v !== undefined && v >= r.low && v <= r.high });
  }
  const outcome = levels.every((l) => l.pass) ? "pass" : "fail";
  return { ok: true, outcome, levels, deviceState: outcome === "pass" ? "in_use" : "blocked" };
}

/** A `lab_competencies` row (append-only; a reassessment is a new row). */
export interface Competency {
  hospitalId: string;
  userId: string;
  testCode: string;
  assessedOn: string;
  validTo: string;
  grandfathered: boolean;
  revokedAt: Date | null;
}

export type CompetencyStatus = "valid" | "grace" | "lapsed" | "revoked" | "none";

/** BQ-4: valid to = assessed on + the signed validity (operational). */
export const competencyValidTo = (assessedOn: string, validDays: number) =>
  addDays(assessedOn, validDays);

/**
 * BQ-4: the operator's competency for a bedside test at `at` (the newest assessment counts). A grandfathered row
 * reads `grace` until its valid-to. Lapsed, revoked and none are refused on the server.
 */
export function competencyStatus(
  rows: readonly Competency[],
  q: { hospitalId: string; userId: string; testCode: string; at: Date; timeZone: string },
): CompetencyStatus {
  const row = rows
    .filter(
      (r) => r.hospitalId === q.hospitalId && r.userId === q.userId && r.testCode === q.testCode,
    )
    .sort((a, b) => b.assessedOn.localeCompare(a.assessedOn))[0];
  if (!row) return "none";
  if (row.revokedAt && row.revokedAt <= q.at) return "revoked";
  if (dayOf(q.at, q.timeZone) > row.validTo) return "lapsed";
  return row.grandfathered ? "grace" : "valid";
}

export type BedsideQualityError =
  | "device_blocked"
  | "control_check_required"
  | "competency_not_valid";

/**
 * BQ-2..BQ-5: what the bedside form refuses, what it shows, and what the result records. A blocked device and a
 * competency that is not valid refuse (Law 6). A check not done today shows "Control check not done today" and
 * refuses only when the rule says "required before use" (D-LAB3-15). The event triggers (a new strip lot, a new
 * control vial, a drop or an error message) always need the check before the next patient result (S35): the
 * strip lot's ranges, the vial or the meter changed, so yesterday's pass says nothing about them.
 */
export function bedsideQuality(input: {
  deviceState: string;
  rule: DeviceQcRule | null;
  due: readonly DeviceTrigger[];
  competency: CompetencyStatus;
}): {
  errors: BedsideQualityError[];
  notice: "control_check_not_done_today" | null;
  snapshot: {
    deviceCheck: "passed" | "not_done" | "blocked" | "no_rule";
    competency: CompetencyStatus;
  };
} {
  const errors: BedsideQualityError[] = [];
  const blocked = input.deviceState === "blocked";
  const notDone = input.due.length > 0;
  const event = input.due.some((t) => t !== "each_day_of_use");
  if (blocked) errors.push("device_blocked");
  else if (event || (notDone && input.rule?.requiredBeforeUse))
    errors.push("control_check_required");
  if (input.competency !== "valid" && input.competency !== "grace")
    errors.push("competency_not_valid");
  return {
    errors,
    notice:
      !blocked && input.due.includes("each_day_of_use") ? "control_check_not_done_today" : null,
    snapshot: {
      deviceCheck: blocked ? "blocked" : !input.rule ? "no_rule" : notDone ? "not_done" : "passed",
      competency: input.competency,
    },
  };
}

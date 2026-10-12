/**
 * Bedside tests and the HIV testing algorithm (Lab Phase 2 §6.13 PC-*, §6.1 AL-*; D-LAB2-09..-13, D-LAB2-27;
 * ADR 0259). Pure.
 *
 * A bedside result needs a registered device in use here, a current lot, a granted operator and a measured
 * time that is not in the future; anything older than the window needs a reason. The meter's HI and LO are
 * answers, never numbers, and HI prompts the operator to consider a critical mark (never automatic: FL-7).
 * The HIV outcome is derived from the signed algorithm version's own rule table; nothing is remembered here.
 */
import type { Payload } from "@/lib/lab/signed-config";

export type BedsideError =
  | "device_not_registered"
  | "device_not_in_use"
  | "device_other_ward"
  | "device_other_test"
  | "lot_not_for_device"
  | "lot_expired"
  | "not_an_operator"
  | "measured_in_future"
  | "late_needs_reason";

/** PC-4: older entries need a reason (an operational window, not a clinical number). */
export const LATE_ENTRY_MS = 24 * 3_600_000;

export function bedsideErrors(i: {
  device: { state: string; wardId: string | null; testCode: string | null } | null;
  lot: { deviceMatches: boolean; useBy: string } | null;
  operatorGranted: boolean;
  wardId: string | null;
  testCode: string;
  measuredAt: Date;
  now: Date;
  lateReason: string | null;
}): BedsideError[] {
  const e: BedsideError[] = [];
  if (!i.device) e.push("device_not_registered");
  else {
    if (i.device.state !== "in_use") e.push("device_not_in_use"); // PC-10
    if (i.device.wardId && i.device.wardId !== i.wardId) e.push("device_other_ward");
    if (i.device.testCode && i.device.testCode !== i.testCode) e.push("device_other_test");
  }
  if (!i.lot || !i.lot.deviceMatches) e.push("lot_not_for_device");
  // PC-3: past its use-by date at the time measured (the date itself is still usable).
  else if (i.measuredAt.toISOString().slice(0, 10) > i.lot.useBy) e.push("lot_expired");
  if (!i.operatorGranted) e.push("not_an_operator");
  if (i.measuredAt.getTime() > i.now.getTime()) e.push("measured_in_future");
  else if (i.now.getTime() - i.measuredAt.getTime() > LATE_ENTRY_MS && !i.lateReason?.trim())
    e.push("late_needs_reason");
  return e;
}

/** PC-7, CC-3: the fasting answer chooses the concept. */
export const glucoseConcept = (fasting: boolean) =>
  fasting ? "obs.glucose_fasting" : "obs.glucose";

/** PC-6: the meter's own range codes. */
export const METER_RANGE = ["above_range", "below_range"] as const;
export type MeterRange = (typeof METER_RANGE)[number];
/** PC-6, D-LAB2-13: HI prompts a critical mark; it never flags by itself. */
export const promptCritical = (code: MeterRange | null) => code === "above_range";

/* ─── AL: the HIV testing algorithm ──────────────────────────────────── */

export type Reactivity = "reactive" | "non_reactive";
export type HivOutcome = Payload<"hiv_algorithm">["rules"][number]["outcome"];

/**
 * AL-2: the outcome the signed version's table gives for these assay results, or null when the table has no
 * row (the next assay is needed). A test not done is null.
 */
export function deriveHivOutcome(
  version: Payload<"hiv_algorithm">,
  t1: Reactivity,
  t2: Reactivity | null,
  t3: Reactivity | null,
): HivOutcome | null {
  return version.rules.find((r) => r.t1 === t1 && r.t2 === t2 && r.t3 === t3)?.outcome ?? null;
}

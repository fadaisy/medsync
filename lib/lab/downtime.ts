/**
 * Downtime (Lab Phase 1, §6.8, rules DT-1 to DT-8; ADR 0248). Pure.
 *
 * A downtime period is a record, not a mode (DT-1): nothing here is read by any other engine to change
 * behaviour. A paper result keeps the form's collection and result times; the server's entry time is
 * kept beside them, and everything clinical is evaluated as at the form's collection time (Law 9, DT-5).
 */

export interface DowntimePeriod {
  startsAt: Date;
  endsAt: Date;
}

export type DowntimeReason = "network" | "power" | "system" | "other";

/** DT-1: what a period record needs. */
export function periodErrors(p: {
  startsAt: Date;
  endsAt: Date;
  reason: string;
  now: Date;
}): string[] {
  const errors: string[] = [];
  if (!(p.startsAt < p.endsAt)) errors.push("order");
  if (p.endsAt > p.now) errors.push("future");
  if (!["network", "power", "system", "other"].includes(p.reason)) errors.push("reason");
  return errors;
}

// ─── DT-2: form numbers ──────────────────────────────────────────────────

export type FormNumberState = "unused" | "entered" | "voided";

/** The next run of numbers to reserve, after the highest ever reserved at this hospital. */
export function nextFormNumbers(highestReserved: number | null, count: number): number[] {
  if (!Number.isInteger(count) || count < 1 || count > 200)
    throw new Error("reserve 1–200 numbers at a time");
  const from = (highestReserved ?? 0) + 1;
  return Array.from({ length: count }, (_, i) => from + i);
}

/** A number is entered or voided once, from unused (0105 enforces the same). */
export function formNumberMove(
  state: FormNumberState | null,
): { ok: true } | { ok: false; reason: "not_reserved" | "already_entered" | "already_voided" } {
  if (state === null) return { ok: false, reason: "not_reserved" };
  if (state === "entered") return { ok: false, reason: "already_entered" };
  if (state === "voided") return { ok: false, reason: "already_voided" };
  return { ok: true };
}

// ─── DT-4: the form's times ──────────────────────────────────────────────

export interface FormTimes {
  collectedAt: Date;
  resultedAt: Date;
}

export type FormTimeCheck =
  | { ok: true; insidePeriod: boolean }
  | { ok: false; errors: ("future" | "result_before_collection" | "outside_period_reason")[] };

/** No time in the future; result not before collection; both inside a recorded period, or a reason. */
export function checkFormTimes(
  t: FormTimes,
  input: { now: Date; periods: readonly DowntimePeriod[]; outsidePeriodReason: string | null },
): FormTimeCheck {
  const errors: ("future" | "result_before_collection" | "outside_period_reason")[] = [];
  if (t.collectedAt > input.now || t.resultedAt > input.now) errors.push("future");
  if (t.resultedAt < t.collectedAt) errors.push("result_before_collection");
  const inside = input.periods.some((p) => p.startsAt <= t.collectedAt && t.resultedAt <= p.endsAt);
  if (!inside && (input.outsidePeriodReason ?? "").trim().length < 3)
    errors.push("outside_period_reason");
  return errors.length > 0 ? { ok: false, errors } : { ok: true, insidePeriod: inside };
}

// ─── DT-5, DT-6, DT-7 ────────────────────────────────────────────────────

/** DT-5: age, ranges and limits are taken as at the form's collection time. */
export const evaluationTime = (t: FormTimes) => t.collectedAt;

/**
 * DT-6: a critical on the form. With a call to a clinician who may acknowledge, and read-back, the alert
 * is created already acknowledged by phone. Otherwise a live alert opens at save.
 */
export function downtimeAlertStart(input: {
  critical: boolean;
  paperCall: { to: string; at: Date; readBack: boolean; toMayAcknowledge: boolean } | null;
}): { kind: "none" } | { kind: "acknowledged_by_phone"; by: string; at: Date } | { kind: "live" } {
  if (!input.critical) return { kind: "none" };
  const c = input.paperCall;
  if (c && c.readBack && c.toMayAcknowledge)
    return { kind: "acknowledged_by_phone", by: c.to, at: c.at };
  return { kind: "live" };
}

/** DT-7: turnaround uses the form's times; the review lanes see the result as new when it was entered. */
export function downtimeTimes(t: FormTimes & { enteredAt: Date }) {
  return {
    turnaroundMinutes: Math.round((t.resultedAt.getTime() - t.collectedAt.getTime()) / 60_000),
    releasedOn: t.resultedAt,
    newForReviewAt: t.enteredAt,
  };
}

/**
 * Downtime, workspace-neutral (DT-1 "never two"; D-PH1-46, ADR 0271; Lab Phase 1 ADR 0248). Pure.
 *
 * One module for the lab and the pharmacy: the shared outage record (`downtime_periods`), one number
 * space per hospital (`downtime_form_numbers`), the moves 0128's guard allows each workspace, and the
 * drill record. The lab's behaviour is exactly 0105's; the lab module re-exports what it used to own.
 *
 * - DT-1 / lab DT-1: a period is a record, not a mode; `periodErrors`, `withinAPeriod`.
 * - DT-2: `nextSheetNumbers` reserves a run after the highest number ever reserved; `sheetLabel` prints
 *   it (lab DT-00031, pharmacy DS-00031); `sheetMove` mirrors 0128's `downtime_number_guard`.
 * - DT-11 / lab DT-8: a drill writes a drill record and nothing else (`DrillRecord` has no patient,
 *   stock or prescription field; nothing here does I/O).
 */

export interface DowntimePeriod {
  startsAt: Date;
  endsAt: Date;
}

export type DowntimeReason = "network" | "power" | "system" | "other";
export const DOWNTIME_REASONS: readonly DowntimeReason[] = ["network", "power", "system", "other"];

/** What a period record needs: in order, not in the future, a known reason. */
export function periodErrors(p: {
  startsAt: Date;
  endsAt: Date;
  reason: string;
  now: Date;
}): string[] {
  const errors: string[] = [];
  if (!(p.startsAt < p.endsAt)) errors.push("order");
  if (p.endsAt > p.now) errors.push("future");
  if (!(DOWNTIME_REASONS as readonly string[]).includes(p.reason)) errors.push("reason");
  return errors;
}

/** From `from` to `to` (inclusive) lies inside one recorded period. A single instant: `to` = `from`. */
export const withinAPeriod = (
  periods: readonly DowntimePeriod[],
  from: Date,
  to: Date = from,
): boolean => periods.some((p) => p.startsAt <= from && to <= p.endsAt);

// ─── DT-2: sheet numbers ─────────────────────────────────────────────────

export type Workspace = "lab" | "pharmacy";
export type LabSheetState = "unused" | "entered" | "voided";
export type PharmacySheetState = "unused" | "to_enter" | "complete" | "voided";
export type SheetState = LabSheetState | PharmacySheetState;

/** The next run of numbers to reserve, after the highest ever reserved at this hospital (any workspace). */
export function nextSheetNumbers(highestReserved: number | null, count: number): number[] {
  if (!Number.isInteger(count) || count < 1 || count > 200)
    throw new Error("reserve 1–200 numbers at a time");
  const from = (highestReserved ?? 0) + 1;
  return Array.from({ length: count }, (_, i) => from + i);
}

const PREFIX: Record<Workspace, string> = { lab: "DT", pharmacy: "DS" };

/** The printed number: DT-00031 on a lab form, DS-00031 on a pharmacy sheet (D-PH1-46). */
export const sheetLabel = (n: number, workspace: Workspace): string =>
  `${PREFIX[workspace]}-${String(n).padStart(5, "0")}`;

const MOVES: Record<Workspace, readonly (readonly [SheetState, SheetState])[]> = {
  // 0105, unchanged: a number moves only from unused, once.
  lab: [
    ["unused", "entered"],
    ["unused", "voided"],
  ],
  // 0128: unused → to_enter | voided; to_enter → complete.
  pharmacy: [
    ["unused", "to_enter"],
    ["unused", "voided"],
    ["to_enter", "complete"],
  ],
};

/** 0128 `downtime_number_guard`, mirrored: the only moves a sheet number may make. */
export const sheetMove = (from: SheetState, to: SheetState, workspace: Workspace): boolean =>
  MOVES[workspace].some(([f, t]) => f === from && t === to);

// ─── DT-11: drills ───────────────────────────────────────────────────────

/** `downtime_drills`, the whole of what a drill writes. No patient, stock or prescription field. */
export interface DrillRecord {
  workspace: Workspace;
  heldOn: string;
  participants: string;
  whatWasDone: string;
  problems: string | null;
  /** Pharmacy drills only (0128 `ddr_workspace`). */
  dispensingPointId: string | null;
}

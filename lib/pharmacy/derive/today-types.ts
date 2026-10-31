/**
 * One work item on Today (rework PRD §6.1, prototype today.js). Every area's loader returns these; `todayItems` ranks
 * them for the role. Pure types; no imports.
 */
export type TodayRole = "pharmacist" | "storekeeper" | "incharge";

export type TodayKind =
  | "emerg"
  | "rxq"
  | "cold"
  | "handover"
  | "case"
  | "cd"
  | "mar"
  | "rx"
  | "op"
  | "owed"
  | "recall"
  | "countdue"
  | "countrun"
  | "req"
  | "due"
  | "transit"
  | "exp"
  | "out"
  | "delivery"
  | "approve"
  | "paper"
  | "sheet"
  | "vax";

export interface TodayItem {
  kind: TodayKind;
  /** Stable React key, e.g. `case:<id>`. */
  key: string;
  title: string;
  meta: string;
  /** The one button's words. */
  action: string;
  /** The exact screen where the item is resolved. */
  href: string;
  /** Amber: late, held or overdue only. */
  late?: boolean;
}

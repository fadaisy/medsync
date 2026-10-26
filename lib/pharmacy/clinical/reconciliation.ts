import type { Rule } from "./content";

/**
 * Pharmacy Phase 3, Step 9: reconciliation at discharge (MR-2 to MR-5). Pure over what the caller read. Rows are the
 * union of medicines before admission, on the ward and for home; discrepancies are only the signed-on rules; the
 * engine never resolves one (Law 5) and never compares doses as numbers.
 */

export type HomeDecision =
  | "continue"
  | "restart"
  | "changed"
  | "stay_stopped"
  | "paused"
  | "ends_on_ward"
  | "new_for_home";

export interface Before {
  /** Catalogue id, or null when typed as text (its own row, MR-2). */
  medicineId: string | null;
  statementId: string;
  text: string;
  /** The admission decision (0088). */
  admission: "continued" | "stopped" | "changed" | "held" | null;
  informant: string | null;
}
export interface WardLine {
  medicineId: string;
  state: string;
  lastDose: Date | null;
}
export interface HomeLine {
  medicineId: string;
  prescriptionId: string;
  directions: string | null;
}
export interface Decision {
  rowKey: string;
  decision: HomeDecision;
  reason: string | null;
  at: Date;
}
export interface Facts {
  before: readonly Before[];
  ward: readonly WardLine[];
  home: readonly HomeLine[];
  decisions: readonly Decision[];
  allergyMedicineIds: readonly string[];
  openQueries: number;
  explained: readonly { discrepancy: string; at: Date }[];
  confirmedAt: Date | null;
  now: Date;
}

export interface Row {
  key: string;
  medicineId: string | null;
  text: string | null;
  before: Before | null;
  ward: WardLine | null;
  home: HomeLine[];
  decision: Decision | null;
}

export interface Discrepancy {
  /** Stable id: rule, plus the row it is about. */
  id: string;
  rule: Rule;
  rowKey: string | null;
}

const keyOf = (b: Before) => b.medicineId ?? `u:${b.statementId}`;

/** MR-2: one row per medicine, matched by catalogue id; uncoded medicines before admission stand alone. */
export function rowsOf(f: Pick<Facts, "before" | "ward" | "home" | "decisions">): Row[] {
  const keys = [
    ...new Set([
      ...f.before.map(keyOf),
      ...f.ward.map((w) => w.medicineId),
      ...f.home.map((h) => h.medicineId),
    ]),
  ];
  const latest = new Map<string, Decision>();
  for (const d of [...f.decisions].sort((a, b) => a.at.getTime() - b.at.getTime()))
    latest.set(d.rowKey, d);
  return keys.map((key) => {
    const before = f.before.find((b) => keyOf(b) === key) ?? null;
    return {
      key,
      medicineId: key.startsWith("u:") ? null : key,
      text: before?.text ?? null,
      before,
      ward: f.ward.find((w) => w.medicineId === key) ?? null,
      home: f.home.filter((h) => h.medicineId === key),
      decision: latest.get(key) ?? null,
    };
  });
}

/** The rules MedSync can check from the record today; the rest are listed as not checked (honest gap). */
export const CHECKED: readonly Rule[] = [
  "R1",
  "R2",
  "R3",
  "R4",
  "R5",
  "R6",
  "R8",
  "R10",
  "R11",
  "R12",
  "R13",
  "R14",
];

const DAY = 86_400_000;

/** MR-3: the signed-on rules that fire, each with its id. Explained ones stay listed with their explanation. */
export function discrepancies(f: Facts, on: readonly Rule[]): Discrepancy[] {
  const rows = rowsOf(f);
  const out: Discrepancy[] = [];
  const add = (rule: Rule, rowKey: string | null) =>
    on.includes(rule) && out.push({ id: `${rule}:${rowKey ?? "-"}`, rule, rowKey });
  const stopRecorded = (r: Row) =>
    r.decision?.decision === "stay_stopped" || r.decision?.decision === "ends_on_ward";
  for (const r of rows) {
    const a = r.before?.admission ?? null;
    const onHome = r.home.length > 0;
    if (a === "continued" && !onHome && !stopRecorded(r)) add("R1", r.key);
    if (a === "stopped" && onHome) add("R2", r.key);
    if (a === "held" && !r.decision) add("R3", r.key);
    if (
      r.ward?.lastDose &&
      f.now.getTime() - r.ward.lastDose.getTime() <= DAY &&
      !onHome &&
      !stopRecorded(r)
    )
      add("R4", r.key);
    if (r.ward?.state === "cancelled" && onHome) add("R5", r.key);
    if (onHome && !r.before && !r.ward) add("R6", r.key);
    if (r.home.length > 1) add("R8", r.key);
    if (r.home.some((h) => !h.directions?.trim())) add("R10", r.key);
    if (onHome && r.medicineId && f.allergyMedicineIds.includes(r.medicineId)) add("R11", r.key);
    if (r.before && !r.before.informant) add("R12", r.key);
    if (!r.medicineId) add("R14", r.key);
  }
  if (f.openQueries > 0) add("R13", null);
  return out;
}

/** A discrepancy is settled by a prescriber's decision on its row after it opened, or a pharmacist's explanation. */
export function unsettled(f: Facts, on: readonly Rule[]) {
  const rows = rowsOf(f);
  return discrepancies(f, on).filter((d) => {
    if (f.explained.some((e) => e.discrepancy === d.id)) return false;
    const row = rows.find((r) => r.key === d.rowKey);
    // R3 (no decision) and R1/R4 (no stop) are settled by any decision; the others need the pharmacist's word.
    return !(row?.decision && ["R1", "R3", "R4"].includes(d.rule));
  });
}

/** MR-4: why "Confirm the list" is off, in words; empty when it may be confirmed. */
export function blockers(f: Facts, on: readonly Rule[], label: (row: Row) => string): string[] {
  const rows = rowsOf(f);
  return [
    ...rows.filter((r) => !r.decision).map((r) => `${label(r)} has no decision for home`),
    ...unsettled(f, on).map((d) => {
      const row = rows.find((r) => r.key === d.rowKey);
      return `${d.rule}${row ? ` on ${label(row)}` : ""} is not resolved or explained`;
    }),
  ];
}

/**
 * MR-5: after a confirmation, a decision recorded later reopens that row. Returns the rows changed since, so the
 * pharmacist is told; the confirmed list stays as it was in its event.
 */
export function changedSince(f: Facts) {
  if (!f.confirmedAt) return [];
  return f.decisions.filter((d) => d.at > f.confirmedAt!).map((d) => d.rowKey);
}

/** MR-7: the patient's sheet, one line per medicine, from the confirmed list only. */
export type SheetLine = {
  name: string;
  doing: "carry_on" | "new" | "do_not_restart" | "paused" | "changed";
};
export function sheetOf(rows: readonly Row[], label: (row: Row) => string): SheetLine[] {
  const map: Partial<Record<HomeDecision, SheetLine["doing"]>> = {
    continue: "carry_on",
    restart: "carry_on",
    changed: "changed",
    new_for_home: "new",
    stay_stopped: "do_not_restart",
    paused: "paused",
  };
  return rows.flatMap((r) => {
    const doing = r.decision ? map[r.decision.decision] : undefined;
    return doing ? [{ name: label(r), doing }] : [];
  });
}

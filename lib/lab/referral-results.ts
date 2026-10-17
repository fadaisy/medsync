/**
 * Results back (Lab Phase 4 §6.3, RB-1..RB-10; gate-a-proposal §3.3; D-LAB4-08..11, A19, A20). Pure.
 *
 * A returned result files on the referral's original order and specimen (RB-1). Its value, unit, range and flag
 * are the reference lab's, as printed or sent: this hospital's ranges are never an input here (D-LAB4-09). A
 * conversion to this hospital's unit happens only through the unit registry (D-LAB4-10), and the critical check
 * runs on that converted value or not at all (RB-5, A20).
 */
import type { ComparisonRow } from "@/lib/exchange/types";

import { fill, LAB4 } from "@/content/lab-phase-4";
import { compare, normaliseDate, normaliseId, normaliseName } from "@/lib/exchange/normalise";
import { parseComparator } from "@/lib/units/conversions";

/* ─── RB-2: the identity on the paper against the referral ───────────── */

export interface PaperIdentity {
  theirNumber: string;
  name: string;
  birthDate: string;
}
export interface ReferralIdentity {
  theirNumbers: readonly string[];
  name: string | null;
  birthDate: string | null;
}

/**
 * RB-2: the report's form number, name and date of birth, typed from the paper, against the referral. Exact
 * after normalisation. Any check that differs or cannot be compared refuses entry and opens a reconciliation
 * item (the MA-6 path).
 */
export function compareIdentity(
  paper: PaperIdentity,
  referral: ReferralIdentity,
): { rows: ComparisonRow[]; agrees: boolean; next: "enter" | "open_reconciliation" } {
  const theirs = referral.theirNumbers.map(normaliseId);
  const typed = normaliseId(paper.theirNumber);
  const rows: ComparisonRow[] = [
    {
      check: "their_number",
      outcome:
        typed === null || theirs.length === 0
          ? "cannot_compare"
          : theirs.includes(typed)
            ? "same"
            : "differs",
    },
    { check: "name", outcome: compare(normaliseName(paper.name), normaliseName(referral.name)) },
    {
      check: "birth_date",
      outcome: compare(normaliseDate(paper.birthDate), normaliseDate(referral.birthDate)),
    },
  ];
  const agrees = rows.every((r) => r.outcome === "same");
  return { rows, agrees, next: agrees ? "enter" : "open_reconciliation" };
}

/* ─── RB-3: value, unit, range and flag as printed ───────────────────── */

export interface PrintedRange {
  text: string;
  low?: number;
  high?: number;
  /** One-sided ranges ("< 5" means normal below 5). */
  bound?: "<" | "<=" | ">" | ">=";
}

const NUM = String.raw`[+-]?(?:\d+\.?\d*|\.\d+)`;
const BETWEEN = new RegExp(`^\\s*(${NUM})\\s*(?:-|–|—|to)\\s*(${NUM})\\s*$`, "i");

/** RB-3: parse a printed range where it parses ("0.4 – 4.0", "0.4-4.0", "< 5", "≥ 10"); otherwise text only. */
export function parsePrintedRange(text: string | null | undefined): PrintedRange | null {
  const t = text?.trim();
  if (!t) return null;
  const m = BETWEEN.exec(t);
  if (m) {
    const [low, high] = [Number(m[1]), Number(m[2])];
    return low <= high ? { text: t, low, high } : { text: t };
  }
  const c = parseComparator(t);
  if (!("error" in c) && c.comparator) {
    const bound = c.comparator;
    return bound === "<" || bound === "<="
      ? { text: t, high: c.value, bound }
      : { text: t, low: c.value, bound };
  }
  return { text: t };
}

export type PrintedFlag = "low" | "high" | "normal" | "abnormal" | null;

/**
 * RB-3, D-LAB4-09: the flag is computed only from the printed range. No printed range → no flag. A numeric value
 * against a numeric range: low, high or normal (a reported "<0.5" keeps its direction). A coded result against a
 * text range: normal when it reads the same, else abnormal. Anything else: no flag.
 */
export function flagAgainstPrinted(value: string, range: PrintedRange | null): PrintedFlag {
  if (!range) return null;
  const numeric = range.low !== undefined || range.high !== undefined;
  const v = parseComparator(value);
  if (numeric) {
    if ("error" in v) return null;
    const x = v.value;
    if (range.bound === "<") return x < range.high! ? "normal" : "high";
    if (range.bound === "<=") return x <= range.high! ? "normal" : "high";
    if (range.bound === ">") return x > range.low! ? "normal" : "low";
    if (range.bound === ">=") return x >= range.low! ? "normal" : "low";
    // A value reported below a bound cannot be read as low when the bound sits inside the range, so keep it plain.
    if (v.comparator === "<" || v.comparator === "<=") return x <= range.low! ? "low" : null;
    if (v.comparator === ">" || v.comparator === ">=") return x >= range.high! ? "high" : null;
    return x < range.low! ? "low" : x > range.high! ? "high" : "normal";
  }
  if (!("error" in v)) return null; // a number against a text range: nothing to compare
  return normaliseName(value) === normaliseName(range.text) ? "normal" : "abnormal";
}

/** What the server knows of the unit registry for one component (Phase 1 UN-*); built from lib/units. */
export interface UnitRegistry {
  knows(unit: string): boolean;
  /** The value in this hospital's unit through the registry, or null when the registry has no conversion. */
  toHospital(value: number, unit: string): number | null;
  hospitalUnit: string;
}

export interface ComponentEntry {
  value: string;
  unit: string;
  unitKnown: boolean;
  range: PrintedRange | null;
  flag: PrintedFlag;
  /** "same_unit", the converted value, or null when it cannot be converted. */
  converted: { value: number; unit: string } | "same_unit" | null;
  /** Words shown beside the row (no range printed, unknown unit, cannot convert). */
  notes: string[];
  /** Release is refused while this holds anything (RB-3: an unknown unit). */
  blocks: string[];
}

/** RB-3: one component as typed from the paper (or read from a partner's message). */
export function componentEntry(o: {
  value: string;
  unitAsPrinted: string;
  rangeAsPrinted: string | null;
  registry: UnitRegistry;
}): ComponentEntry {
  const unit = o.unitAsPrinted.trim();
  const range = parsePrintedRange(o.rangeAsPrinted);
  const notes: string[] = [];
  const blocks: string[] = [];
  const unitKnown = unit.length > 0 && o.registry.knows(unit);
  if (!unitKnown) blocks.push(fill(LAB4.unknownUnit, { Unit: unit || "This unit" }));
  if (!range) notes.push(LAB4.noRangePrinted);
  let converted: ComponentEntry["converted"] = null;
  const n = parseComparator(o.value);
  if (unitKnown && !("error" in n)) {
    if (unit === o.registry.hospitalUnit) converted = "same_unit";
    else {
      const v = o.registry.toHospital(n.value, unit);
      converted = v === null ? null : { value: v, unit: o.registry.hospitalUnit };
    }
  }
  return {
    value: o.value.trim(),
    unit,
    unitKnown,
    range,
    flag: flagAgainstPrinted(o.value, range),
    converted,
    notes,
    blocks,
  };
}

/**
 * RB-5, A20: Phase 1's critical limits apply in this hospital's unit, so the check needs the converted value. When
 * it cannot be converted the check does not run and the lab is told in words; the result still releases (Law 11).
 */
export function criticalCheckInput(
  entry: ComponentEntry,
): { run: true; value: number; unit: string } | { run: false; note: string | null } {
  if (entry.converted === "same_unit") {
    const n = parseComparator(entry.value);
    return "error" in n
      ? { run: false, note: null }
      : { run: true, value: n.value, unit: entry.unit };
  }
  if (entry.converted) return { run: true, ...entry.converted };
  return entry.unitKnown && !("error" in parseComparator(entry.value))
    ? { run: false, note: fill(LAB4.unitNotConvertible, { Unit: entry.unit }) }
    : { run: false, note: null };
}

/* ─── RB-6, RB-7: the scan and the second person ─────────────────────── */

/** RB-6, RB-3: a scan is required before release, and no component may carry a block. */
export function releaseErrors(o: {
  scanAttached: boolean;
  entries: readonly ComponentEntry[];
}): string[] {
  const e: string[] = [];
  if (!o.scanAttached) e.push("scan_required");
  if (o.entries.length === 0) e.push("no_components");
  if (o.entries.some((x) => x.blocks.length > 0)) e.push("unknown_unit");
  return e;
}

/**
 * RB-7, A19, P13: when another user with result entry has been active in this lab within the presence window
 * (operational), the release needs their check, and a check counts only when they confirmed the scan shows the
 * report. Alone on duty, the result releases marked "Entered by one person" and a check task opens.
 */
export function secondPersonRule(o: {
  enteredBy: string;
  checkedBy: string | null;
  scanConfirmed: boolean;
  activeOthers: readonly { userId: string; lastActiveAt: Date }[];
  presenceMinutes: number;
  now: Date;
}): "checked" | "needs_checker" | "one_person" {
  if (o.checkedBy && o.checkedBy !== o.enteredBy && o.scanConfirmed) return "checked";
  const since = o.now.getTime() - o.presenceMinutes * 60_000;
  const someone = o.activeOthers.some(
    (a) => a.userId !== o.enteredBy && a.lastActiveAt.getTime() >= since,
  );
  return someone ? "needs_checker" : "one_person";
}

/* ─── RB-8..RB-10: provenance, corrections, electronic results ───────── */

export interface Provenance {
  partner: string;
  theirReport: string | null;
  reportedAt: string | null;
  authorisedBy: string | null;
  enteredBy: string | null;
  checkedBy: string | null;
  checkTaskId: string | null;
  oneEntrant: boolean;
  messageId: string | null;
  cancelledAfterSending: boolean;
  filedAfterMismatch: { method: string; by: string; second: string } | null;
}

/** RB-8: the provenance a referred report carries (`diagnostic_reports.provenance`). */
export function provenance(p: Partial<Provenance> & { partner: string }): Provenance {
  return {
    theirReport: null,
    reportedAt: null,
    authorisedBy: null,
    enteredBy: null,
    checkedBy: null,
    checkTaskId: null,
    oneEntrant: false,
    messageId: null,
    cancelledAfterSending: false,
    filedAfterMismatch: null,
    ...p,
  };
}

/** RB-8: the lines the doctor reads under a referred result, in Appendix A's words. Names are resolved by the caller. */
export function provenanceLines(
  p: Provenance,
  names: { enteredBy?: string; checkedBy?: string; filedBy?: string; reportedAt?: string },
): string[] {
  const lines: string[] = [];
  if (p.messageId)
    lines.push(
      fill(LAB4.provenanceElectronic, {
        partner: p.partner,
        id: p.messageId,
        user: names.filedBy ?? "the lab",
      }),
    );
  else
    lines.push(
      fill(LAB4.provenancePaper, {
        partner: p.partner,
        number: p.theirReport ?? "—",
        time: names.reportedAt ?? p.reportedAt ?? "—",
        name: p.authorisedBy ?? "—",
        enteredBy: names.enteredBy ?? "—",
        checkedBy: names.checkedBy ?? "—",
      }),
    );
  if (p.oneEntrant) lines.push(LAB4.provenanceOnePerson);
  if (p.filedAfterMismatch)
    lines.push(
      fill(LAB4.filedAfterMismatch, { partner: p.partner, method: p.filedAfterMismatch.method }),
    );
  if (p.cancelledAfterSending) lines.push(LAB4.cancelledAfterSending);
  return lines;
}

/** RB-4: what each value's snapshot keeps (Law 8): whose range, and what was printed. */
export function snapshotFields(e: ComponentEntry): {
  range_source: "performing_lab";
  printed: {
    value: string;
    unit: string;
    range: string | null;
    flagText: string | null;
    converted: ComponentEntry["converted"];
  };
} {
  return {
    range_source: "performing_lab",
    printed: {
      value: e.value,
      unit: e.unit,
      range: e.range?.text ?? null,
      flagText: e.flag,
      converted: e.converted,
    },
  };
}

/** RB-9: a corrected report follows Phase 1's amendment path; the old values and the old scan are kept. */
export const correctedReport = () => ({
  path: "amendment" as const,
  keepOldValues: true,
  keepOldScan: true,
});

/** RB-10, D-LAB4-11: a result from a partner's system lands as "back, to file"; a lab user files it. */
export const electronicLanding = () => ({
  state: "back_to_file" as const,
  releasedWithoutPerson: false,
});

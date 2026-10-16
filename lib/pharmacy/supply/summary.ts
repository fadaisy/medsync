import type { LineEventKind, OpenOutcome } from "@/lib/pharmacy/lines";

import { REVIEW } from "@/content/pharmacy-review";
import { SUPPLY } from "@/content/pharmacy-supply";

/**
 * "When you record it" (5.6) and each line's outcome after recording. Pure and client-safe: the hand-over
 * screen calls it with the plan as it stands, so the numbers are the ones the server will write.
 */

export interface SummaryLine {
  medicine: string;
  unit: string;
  rows: readonly { batchNumber: string; quantity: number }[];
  /** SU-7: what happens to the rest; null when this hand-over supplies all that is left. */
  rest: { outcome: OpenOutcome; notSupplied: number | null } | null;
}

const batchList = (rows: SummaryLine["rows"]) =>
  rows.length === 1
    ? rows[0]!.batchNumber
    : rows.map((r) => `${r.batchNumber} (${r.quantity})`).join(" and ");

/** One plain sentence per fact, with real numbers. */
export function whenYouRecord(lines: readonly SummaryLine[]): string[] {
  const S = SUPPLY.summary;
  const out: string[] = [];
  for (const l of lines) {
    const n = l.rows.reduce((s, r) => s + r.quantity, 0);
    if (n > 0) out.push(S.leaves(n, l.unit, l.medicine, batchList(l.rows)));
    out.push(
      l.rest
        ? S.stays(
            l.medicine,
            REVIEW.outcome[l.rest.outcome].toLowerCase(),
            l.rest.notSupplied,
            l.unit,
          )
        : S.closes(l.medicine),
    );
  }
  return out;
}

/** After recording (5.6): the line's outcome in words, never a bare "Done". */
export function outcomeWords(kind: LineEventKind): string {
  const O = SUPPLY.handover.outcome;
  return kind in O ? O[kind as keyof typeof O] : kind;
}

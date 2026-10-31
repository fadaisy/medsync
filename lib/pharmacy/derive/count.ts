/**
 * The count sheet (rework PRD §6.4 Count, prototype store.js). Blind: packs and loose units counted, never the
 * recorded balance until the sheet is sent. Pure.
 */
export const FEWER = ["damaged", "expired", "broken_in_transit", "given_not_recorded", "miscounted_last_time", "other"] as const;
export const MORE = ["found_other_shelf", "received_not_recorded", "miscounted_last_time", "other"] as const;
export type CountReason = (typeof FEWER)[number] | (typeof MORE)[number];

export interface SheetLine {
  batchId: string;
  packSize: number;
  countedPacks: number | null;
  countedUnits: number | null;
  reason: string | null;
}

/** Units counted, or null while the line is untouched. */
export const countedOf = (l: SheetLine): number | null =>
  l.countedPacks === null && l.countedUnits === null
    ? null
    : (l.countedPacks ?? 0) * l.packSize + (l.countedUnits ?? 0);

export interface Diff {
  batchId: string;
  counted: number;
  recorded: number;
  diff: number;
  reason: string | null;
}

/** Lines whose count differs from the ledger; uncounted lines are not differences, they block sending. */
export function countDiffs(lines: readonly SheetLine[], recorded: ReadonlyMap<string, number>): Diff[] {
  return lines.flatMap((l) => {
    const counted = countedOf(l);
    const rec = recorded.get(l.batchId) ?? 0;
    return counted === null || counted === rec
      ? []
      : [{ batchId: l.batchId, counted, recorded: rec, diff: counted - rec, reason: l.reason }];
  });
}

export const reasonFits = (d: Diff): boolean =>
  !!d.reason && (d.diff < 0 ? (FEWER as readonly string[]) : (MORE as readonly string[])).includes(d.reason);

/** Why the sheet cannot be sent yet: lines left, or differences without a fitting reason. */
export function countBlockers(lines: readonly SheetLine[], recorded: ReadonlyMap<string, number>) {
  return {
    uncounted: lines.filter((l) => countedOf(l) === null).length,
    unexplained: countDiffs(lines, recorded).filter((d) => !reasonFits(d)).length,
  };
}

export const countProgress = (lines: readonly SheetLine[]) => ({
  done: lines.filter((l) => countedOf(l) !== null).length,
  total: lines.length,
});

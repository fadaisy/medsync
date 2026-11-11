/**
 * Set-up read models (board Setup): the packs summary and a point's state. Pure; the page passes `packRows` and
 * the viewer's points.
 */
export type PackState = "signed" | "draft" | "none";

/** A pack's state from its row: in force, a draft waiting, or nothing written. */
export const packState = (r: { signed: unknown; draft: unknown }): PackState =>
  r.signed !== null ? "signed" : r.draft !== null ? "draft" : "none";

/** "{signed} of {total} signed". */
export function packSummary(rows: readonly { signed: unknown; draft: unknown }[]) {
  return { signed: rows.filter((r) => packState(r) === "signed").length, total: rows.length };
}

export type PointState =
  | { state: "live"; at: Date }
  | { state: "off"; at: Date }
  | { state: "notLive" };

/** A point's state, the same rule as `pointIsLive` (live = went live and not switched off). */
export function pointState(p: { liveAt: Date | null; switchedOffAt: Date | null }): PointState {
  if (p.switchedOffAt) return { state: "off", at: p.switchedOffAt };
  if (p.liveAt) return { state: "live", at: p.liveAt };
  return { state: "notLive" };
}

/** The Set-up view a request asks for, or the viewer's first; null when they have none. */
export function setupView(asked: string | undefined, available: readonly string[]): string | null {
  return asked && available.includes(asked) ? asked : (available[0] ?? null);
}

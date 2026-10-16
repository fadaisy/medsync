/**
 * Lots in use (Lab Phase 3 §6.3, LU-1..LU-3; GATE A §3.2 `lab_lots_in_use`). Pure.
 *
 * The table is append-only: the current lot of a kind at a place is the newest row at or before the time asked.
 * LU-2 (a lot set in use must be `accepted` or `in_use` and not expired) is `lotRefusal` in `lib/lab/stock.ts`.
 */
export type InUseKind = "reagent" | "calibrator" | "control" | "strip" | "kit";

export interface LotInUseRow {
  hospitalId: string;
  deviceId: string | null;
  sectionId: string | null;
  conceptId: string | null;
  kind: InUseKind;
  lotId: string;
  fromAt: Date;
}

export interface Place {
  hospitalId: string;
  deviceId?: string;
  sectionId?: string;
  conceptId?: string;
}

/**
 * LU-1: the lots in use at a place at `at`, one per (concept, kind). A row with no concept (a bedside strip lot,
 * a whole-analyser reagent) applies to every concept at the place.
 */
export function lotsInUse(rows: readonly LotInUseRow[], place: Place, at: Date): LotInUseRow[] {
  const current = new Map<string, LotInUseRow>();
  for (const r of rows) {
    if (r.hospitalId !== place.hospitalId || r.fromAt > at) continue;
    if (place.deviceId !== undefined && r.deviceId !== place.deviceId) continue;
    if (place.sectionId !== undefined && r.sectionId !== place.sectionId) continue;
    if (place.conceptId !== undefined && r.conceptId !== null && r.conceptId !== place.conceptId)
      continue;
    const key = `${r.deviceId}|${r.sectionId}|${r.conceptId}|${r.kind}`;
    const seen = current.get(key);
    if (!seen || seen.fromAt < r.fromAt) current.set(key, r);
  }
  return [...current.values()];
}

export type LotSnapshot = "not_recorded" | Partial<Record<InUseKind, string>>;

/**
 * LU-3: the lots a released result was made with, at its result time. A back-entered downtime result with no
 * recorded result time, or a place with no lot recorded, snapshots "lot not recorded".
 */
export function lotSnapshot(
  rows: readonly LotInUseRow[],
  place: Place,
  resultAt: Date | null,
): LotSnapshot {
  if (!resultAt) return "not_recorded";
  const found = lotsInUse(rows, place, resultAt);
  if (found.length === 0) return "not_recorded";
  // A lot recorded for this concept wins over one recorded for the whole place.
  found.sort((a, b) => Number(a.conceptId !== null) - Number(b.conceptId !== null));
  return Object.fromEntries(found.map((r) => [r.kind, r.lotId]));
}

import type { RecordedDx } from "./board";
import type { DxCatalogue } from "./catalogue";

import { normaliseTyped } from "./board";

/**
 * The visit's diagnoses as the board reads them (D-SI-19, D-SI-22): each matched to its profile by
 * its term's uuid, or, for a term not yet seeded and added as typed words (D-SI-26), by its name.
 * Shared by the desk and by signing (D-SI-06 on the server). Pure.
 */

export interface DxIndex {
  cat: DxCatalogue;
  /** Term uuid → profile id. */
  termIds: Readonly<Record<string, string>>;
  names: Readonly<Record<string, { display: string }>>;
}

export interface VisitDiagnosis {
  /** The current version's row id. */
  id: string;
  logicalId: string;
  termId: string | null;
  display: string;
  code: string | null;
  rank: string | null;
  verification: string;
  restricted: boolean;
  onProblemList: boolean;
  cosignPending: boolean;
  addedHere?: boolean;
  refinedFrom?: { display: string; termId: string | null; decided: string[] } | null;
}

const NAMES = new WeakMap<DxIndex, ReadonlyMap<string, string>>();
function profileByName(dx: DxIndex): ReadonlyMap<string, string> {
  let m = NAMES.get(dx);
  if (!m) {
    m = new Map(
      Object.values(dx.termIds).flatMap((id) => {
        const n = dx.names[id]?.display;
        return n ? [[normaliseTyped(n), id] as const] : [];
      }),
    );
    NAMES.set(dx, m);
  }
  return m;
}

export function toRecorded(rows: readonly VisitDiagnosis[], dx: DxIndex | null): RecordedDx[] {
  return rows.map((d) => {
    const dxId = !dx
      ? null
      : d.termId
        ? (dx.termIds[d.termId] ?? null)
        : (profileByName(dx).get(normaliseTyped(d.display)) ?? null);
    const cls = dxId ? (dx!.cat.profile(dxId)?.restricted_class ?? null) : null;
    return {
      logicalId: d.logicalId,
      versionId: d.id,
      termId: d.termId,
      dxId,
      display: d.display,
      code: d.code,
      typed: !d.termId,
      rank: d.rank === "primary" ? "primary" : "secondary",
      verification: d.verification,
      restrictedClass: cls,
      restricted: d.restricted || !!cls,
      onProblemList: d.onProblemList,
      cosignPending: d.cosignPending,
      addedHere: !!d.addedHere,
      refinedFrom: d.refinedFrom
        ? {
            display: d.refinedFrom.display,
            decided: d.refinedFrom.decided,
            dxId: !dx
              ? null
              : d.refinedFrom.termId
                ? (dx.termIds[d.refinedFrom.termId] ?? null)
                : (profileByName(dx).get(normaliseTyped(d.refinedFrom.display)) ?? null),
          }
        : null,
    };
  });
}

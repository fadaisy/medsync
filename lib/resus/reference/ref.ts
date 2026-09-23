/**
 * Resus v2 reference entries (Law 3 — no remembered numbers).
 *
 * Every clinical number the v2 desk shows comes from one of these entries,
 * transcribed from a CSO-signed catalog (docs/clinical/resus-*-clinical-catalog.md)
 * with its source URL and verified date. The UI reads numbers only through
 * `refValue`, which withholds the number for any entry that is not signed.
 */

export type RefStatus = "signed" | "pending_cso";
export type RefConfidence = "verified-web" | "reference-doc-only" | "design";

export interface RefEntry {
  /** Rule ID, e.g. "ALS-ADR-01" — the same ID the engine and its tests use. */
  id: string;
  /** The rule / display text. */
  text: string;
  /** The number, when the rule carries one (as displayed). */
  value?: string;
  unit?: string;
  /** Source code from the catalog's source key, e.g. "RCUK-ALS25". */
  source: string;
  url: string;
  /** ISO date the value was last verified against the source. */
  verifiedOn: string;
  confidence: RefConfidence;
  status: RefStatus;
}

export const PENDING_CSO = "pending CSO sign-off" as const;

/** The displayable value of an entry, or the pending marker. */
export function refValue(e: RefEntry): string {
  if (e.status !== "signed") return PENDING_CSO;
  return e.value ?? e.text;
}

/** Index entries by ID (throws on a duplicate — IDs are the coverage key). */
export function indexRefs(entries: readonly RefEntry[]): Record<string, RefEntry> {
  const out: Record<string, RefEntry> = {};
  for (const e of entries) {
    if (out[e.id]) throw new Error(`duplicate reference id ${e.id}`);
    out[e.id] = e;
  }
  return out;
}

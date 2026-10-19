import type { LabPlaceId, LabTabDef } from "./places";

/**
 * Scan or search (Lab Workspace v2 prompt 5.4, 6.3; ADR 0347): the pure parts. What a query looks like, the
 * static registry of actions and pages, and the order of the groups. The read (search-actions.ts) runs the
 * database lookups; nothing here touches PHI.
 */

export type SearchKind = "label" | "manifest" | "mrn" | "name" | "none";

/** SR-1: a lab number (Code 128 label) or a manifest number first, then a hospital number, then a name (≥ 3). */
export function classify(q: string): SearchKind {
  const t = q.trim();
  if (!t) return "none";
  if (/^MF-\d{4}-\d+$/i.test(t)) return "manifest";
  if (/^MS-\d{4}-\d+$/i.test(t)) return "mrn";
  if (/^[A-Z]{0,3}-?\d{4,}$/i.test(t) || /^L-?\d+$/i.test(t)) return "label";
  if (t.length >= 3 && /[a-z]/i.test(t)) return "name";
  return "none";
}

/** A full label scanned (the scanner ends with Enter) opens its specimen at once: one exact, unvoided hit. */
export function scannedOpens<T extends { voided: boolean }>(
  kind: SearchKind,
  specimens: readonly T[],
): T | null {
  const live = specimens.filter((s) => !s.voided);
  return kind === "label" && live.length === 1 ? live[0]! : null;
}

export interface GoEntry {
  label: string;
  place: LabPlaceId;
  href: string;
}

/** Go to: every visible tab in every visible place, matched on its words. */
export function goEntries(
  tabs: Record<LabPlaceId, LabTabDef[]>,
  words: (t: LabTabDef) => string,
  placeWord: (p: LabPlaceId) => string,
  q: string,
  cap = 8,
): GoEntry[] {
  const t = q.trim().toLowerCase();
  const all: GoEntry[] = [];
  for (const [place, list] of Object.entries(tabs) as [LabPlaceId, LabTabDef[]][])
    for (const tab of list)
      all.push({ label: `${placeWord(place)} · ${words(tab)}`, place, href: tab.href });
  return (t ? all.filter((e) => e.label.toLowerCase().includes(t)) : all).slice(0, cap);
}

export const SEARCH_CAP = 8;

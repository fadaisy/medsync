import type { SiView } from "../si-model";
import type { DxData } from "../use-catalogue";
import type { DxTerm } from "@/components/emr/desk/search";
import type { AskRow } from "@/lib/clerking/impression/ask";
import type { BoardRow } from "@/lib/clerking/impression/board";
import type { Column, Matrix } from "@/lib/clerking/impression/evidence";
import type { Finding, FindingRef } from "@/lib/clerking/impression/facts";
import type { Suggestion } from "@/lib/clerking/impression/suggest";

import { basisLine } from "@/lib/clerking/impression/basis";
import { onBoard, signBlocks } from "@/lib/clerking/impression/board";
import { counts, matrix, unexplained } from "@/lib/clerking/impression/evidence";
import { recordedFindings } from "@/lib/clerking/impression/facts";
import { suggestions } from "@/lib/clerking/impression/suggest";

/**
 * Step 09's pure view model (§5.3–5.4): the board with its evidence columns, the suggestions with
 * their display names, "not yet explained", the basis lines and what blocks signing. No React.
 */

export interface NamedSuggestion extends Suggestion {
  display: string;
  /** In the database's term index (seeded); otherwise it is added as typed, not coded. */
  coded: boolean;
  restricted: boolean;
}

export interface ImpressionView {
  cols: Column[];
  col: (logicalId: string) => Column | undefined;
  matrix: Matrix;
  matrixAll: Matrix;
  findings: ReadonlyMap<FindingRef, Finding>;
  /** One chip per wording: a symptom and the same words as a red flag read as one finding. */
  unexplained: Finding[];
  /** Every unexplained ref that reads the same as this one (a chip links them all). */
  sameAs: (ref: FindingRef) => FindingRef[];
  suggestions: NamedSuggestion[];
  basis: (row: BoardRow) => string;
  counts: (row: BoardRow) => { for: number; against: number };
  asksFor: (logicalId: string) => AskRow[];
  /** Must-not-miss diagnoses marked unlikely without a reason (the leading meta line). */
  missingReasons: number;
  signBlocks: string[];
}

export interface ImpressionExtras {
  /** Test ids already ordered for this diagnosis at this visit ("In plan"). */
  inPlan: (logicalId: string) => ReadonlySet<string>;
}

export function deriveImpression(
  si: SiView,
  dx: DxData | null,
  extras: ImpressionExtras,
): ImpressionView {
  const ctx = { x: si.x, board: si.board, draft: si.impression, live: si.live, viewer: si.viewer };
  const cols = dx ? si.cols : [];
  const byId = new Map(cols.map((c) => [c.row.dx.logicalId, c]));
  const m = matrix(ctx, false, cols);
  // Every recorded finding, and the synthetic ones a mark names (always among the rows shown).
  const findings = new Map<FindingRef, Finding>(recordedFindings(si.x).map((f) => [f.ref, f]));
  for (const f of m.rows) if (!findings.has(f.ref)) findings.set(f.ref, f);
  let all: Matrix | null = null;
  const sugg: NamedSuggestion[] = dx
    ? suggestions({ x: si.x, dx: dx.cat, live: si.live, viewer: si.viewer, board: si.board }).map(
        (g) => {
          const n = dx.names[g.dxId];
          return {
            ...g,
            display: n?.display ?? g.dxId,
            coded: !!n?.coded,
            restricted: !!n?.restricted,
          };
        },
      )
    : [];
  const loose = dx ? unexplained(ctx) : [];
  const byText = new Map<string, FindingRef[]>();
  for (const f of loose) {
    const k = f.text.toLowerCase();
    byText.set(k, [...(byText.get(k) ?? []), f.ref]);
  }
  const textOf = new Map(loose.map((f) => [f.ref, f.text.toLowerCase()]));
  return {
    cols,
    col: (id) => byId.get(id),
    matrix: m,
    // Built only when "Show all recorded findings" or Details asks for it.
    get matrixAll() {
      return (all ??= matrix(ctx, true, cols));
    },
    findings,
    unexplained: loose.filter((f) => byText.get(f.text.toLowerCase())![0] === f.ref),
    sameAs: (ref) => byText.get(textOf.get(ref) ?? "") ?? [ref],
    suggestions: sugg,
    basis: (row) =>
      basisLine({
        row,
        column: byId.get(row.dx.logicalId),
        draft: si.impression,
        findings,
        asks: si.asks,
        tests: {
          name: (id) => dx?.tests[id] ?? null,
          inPlan: extras.inPlan(row.dx.logicalId),
        },
      }),
    counts: (row) => {
      const c = byId.get(row.dx.logicalId);
      return c ? counts(c) : { for: 0, against: 0 };
    },
    asksFor: (id) => si.asks.filter((a) => a.forIds.includes(id)),
    missingReasons: si.board.differential.filter((r) => r.reasonMissing).length,
    signBlocks: signBlocks(si.board),
  };
}

export const rowsOf = (si: SiView) => onBoard(si.board);

/* ─── "Show all" diagnoses ──────────────────────────────────────── */

export interface DxBrowseGroup {
  id: string;
  label: string;
  terms: DxTerm[];
}

/** "Mental health and substance use (restricted)" → "Mental health and substance use": the lock on
 *  each row says restricted, and the catalogue's notes in brackets are not headings. */
const heading = (label: string) => label.replace(/\s*\([^)]*\)\s*$/, "");

/**
 * Every term in the index, grouped by its profile's category in the signed diagnosis catalogue, in
 * the catalogue's category order (symptom-level first), A to Z within a group. A term with no
 * profile goes under "Other diagnoses", last. Without the catalogue, one A-to-Z group.
 */
export function dxBrowseGroups(terms: readonly DxTerm[], dx: DxData | null): DxBrowseGroup[] {
  const az = (a: DxTerm, b: DxTerm) => a.display.localeCompare(b.display, "en");
  if (!dx)
    return terms.length ? [{ id: "all", label: "All diagnoses", terms: [...terms].sort(az) }] : [];
  const categories = dx.cat.data.categories;
  const by = new Map<string, DxTerm[]>();
  for (const t of terms) {
    const profile = dx.cat.profile(dx.termIds[t.id] ?? "");
    const key = profile && categories[profile.category] ? profile.category : "other";
    const list = by.get(key);
    if (list) list.push(t);
    else by.set(key, [t]);
  }
  return [...Object.keys(categories), "other"].flatMap((id) => {
    const list = by.get(id);
    if (!list) return [];
    const label = id === "other" ? "Other diagnoses" : heading(categories[id]!);
    return [{ id, label, terms: list.sort(az) }];
  });
}

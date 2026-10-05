import type { ExamContext } from "../exam/context";
import type { AcceptedMark, Board, BoardRow, ImpressionDraft } from "./board";
import type { Cond, DxLive, DxProfile } from "./catalogue";
import type { Finding, FindingRef, Viewer } from "./facts";

import { evalCond } from "../exam/context";
import { derivedReader } from "../exam/flags";
import { onBoard } from "./board";
import { refsOf } from "./catalogue";
import { atomRef, canSee, gate, recordedFindings, syntheticFinding } from "./facts";

/**
 * Evidence (§5.4, SI3): suggested marks come from the profile's `suggest_for` / `suggest_against`
 * atoms true for this encounter, computed at read time and never stored; accepted marks are the
 * clinician's, stored in the draft. Only accepted marks are counted, written or used for "not yet
 * explained". Pure.
 */

export type CellState = "blank" | "suggested_for" | "suggested_against" | "for" | "against";

export interface EvidenceInput {
  x: ExamContext;
  board: Board;
  draft: ImpressionDraft;
  live: DxLive;
  viewer: Viewer;
}

/** An atom as this encounter and viewer read it: unsigned references and restricted facts the
 *  viewer cannot see never fire (SI9, SI10). */
export function atomTrue(c: Cond, i: Pick<EvidenceInput, "x" | "live" | "viewer">): boolean {
  if (refsOf(c).some((r) => !i.live.ref(r))) return false;
  // Derived facts (IWGDF loss of protective sensation, PAD) as the examination reads them (EC-7).
  return evalCond(gate(c, i.x, i.viewer), i.x, derivedReader(i.x));
}

/** The suggested marks of one profile: finding ref → sign. "For" wins where both would mark. */
export function suggestedFor(
  p: DxProfile,
  i0: Pick<EvidenceInput, "x" | "live" | "viewer">,
): Map<FindingRef, "for" | "against"> {
  const m = new Map<FindingRef, "for" | "against">();
  if (p.requires && !atomTrue(p.requires, i0)) return m;
  // EC-5: results offered as evidence on a pregnancy diagnosis come from this pregnancy only.
  const since = i0.x.patient.pregnancySince;
  const i =
    p.requires && "pregnancy" in p.requires
      ? { ...i0, x: { ...i0.x, facts: i0.x.facts?.filter((f) => !!since && f.at >= since) } }
      : i0;
  for (const e of p.suggest_against)
    if (atomTrue(e.atom, i)) {
      const r = atomRef(e.atom);
      if (r) m.set(r, "against");
    }
  for (const e of p.suggest_for)
    if (atomTrue(e.atom, i)) {
      const r = atomRef(e.atom);
      if (r) m.set(r, "for");
    }
  return m;
}

export interface Column {
  row: BoardRow;
  suggested: Map<FindingRef, "for" | "against">;
  accepted: Record<FindingRef, AcceptedMark>;
}

export function columns(i: EvidenceInput): Column[] {
  return onBoard(i.board).map((row) => ({
    row,
    suggested: row.profile ? suggestedFor(row.profile, i) : new Map(),
    accepted: i.draft.evidence[row.dx.logicalId] ?? {},
  }));
}

export function cellState(col: Column, ref: FindingRef): CellState {
  const a = col.accepted[ref];
  if (a) return a.w;
  const s = col.suggested.get(ref);
  return s === "for" ? "suggested_for" : s === "against" ? "suggested_against" : "blank";
}

/** A tap cycles: blank or suggested → For → Against → blank (§5.4). */
export const nextState = (s: CellState): "for" | "against" | "blank" =>
  s === "for" ? "against" : s === "against" ? "blank" : "for";

export function withMark(
  d: ImpressionDraft,
  logicalId: string,
  ref: FindingRef,
  to: "for" | "against" | "blank",
  by: { by: string; at: string },
): ImpressionDraft {
  const col = { ...(d.evidence[logicalId] ?? {}) };
  if (to === "blank") delete col[ref];
  else col[ref] = { w: to, ...by };
  return { ...d, evidence: { ...d.evidence, [logicalId]: col } };
}

/** "Accept suggested": every suggested cell in the column, with its suggested sign. */
export function acceptColumn(
  d: ImpressionDraft,
  col: Column,
  by: { by: string; at: string },
): ImpressionDraft {
  const acc = { ...(d.evidence[col.row.dx.logicalId] ?? {}) };
  for (const [ref, w] of col.suggested) if (!acc[ref]) acc[ref] = { w, ...by };
  return { ...d, evidence: { ...d.evidence, [col.row.dx.logicalId]: acc } };
}

export const pendingSuggestions = (col: Column) =>
  [...col.suggested.keys()].filter((r) => !col.accepted[r]).length;

export function counts(col: Column): { for: number; against: number } {
  const v = Object.values(col.accepted);
  return {
    for: v.filter((a) => a.w === "for").length,
    against: v.filter((a) => a.w === "against").length,
  };
}

/* ─── Rows ──────────────────────────────────────────────────────── */

export const MATRIX_ROWS = 30;

/** Findings that can need a diagnosis: presenting symptoms, their red flags, examination
 *  findings and vital signs outside the NEWS2 zero band (background is context, not a finding). */
export const presenting = (f: Finding) =>
  f.positive &&
  ["complaint", "symptom", "red_flag", "exam", "vital"].includes(f.kind) &&
  f.ref !== "vs:news2";

export interface Matrix {
  rows: Finding[];
  /** Rows beyond the default list ("Show all recorded findings"). */
  more: number;
  cols: Column[];
}

/**
 * The matrix rows (§5.4): recorded positive findings in history, examination, vital-sign order (up
 * to 30), plus any finding a live atom marks; then pertinent negatives a profile on the board
 * references; restricted rows only for viewers with the class. `all` lists everything recorded.
 */
export function matrix(i: EvidenceInput, all = false, cols: Column[] = columns(i)): Matrix {
  const recorded = recordedFindings(i.x).filter((f) => canSee(i.viewer, f.cls));
  const byRef = new Map(recorded.map((f) => [f.ref, f]));
  const marked = new Set<FindingRef>();
  const referenced = new Set<FindingRef>();
  for (const c of cols) {
    for (const r of c.suggested.keys()) marked.add(r);
    for (const r of Object.keys(c.accepted)) marked.add(r);
    for (const e of [
      ...(c.row.profile?.suggest_for ?? []),
      ...(c.row.profile?.suggest_against ?? []),
    ]) {
      const r = atomRef(e.atom);
      if (r) referenced.add(r);
    }
  }
  const extra = [...marked]
    .filter((r) => !byRef.has(r))
    .map((r) => syntheticFinding(r, i.x))
    .filter((f): f is Finding => !!f);
  const positives = [...recorded.filter((f) => f.positive), ...extra];
  const negatives = recorded.filter(
    (f) => !f.positive && (referenced.has(f.ref) || marked.has(f.ref)),
  );
  const keep = positives.filter((f, n) => n < MATRIX_ROWS || marked.has(f.ref));
  const rows = all
    ? [...positives, ...recorded.filter((f) => !f.positive)]
    : [...keep, ...negatives];
  const total = positives.length + recorded.filter((f) => !f.positive).length;
  return { rows, more: all ? 0 : Math.max(0, total - rows.length), cols };
}

/**
 * "Not yet explained by any diagnosis": presenting findings not marked For (accepted) under the
 * leading diagnosis or a diagnosis in Also this visit. Differentials explain nothing.
 */
export function unexplained(i: EvidenceInput): Finding[] {
  const explaining = [i.board.leading, ...i.board.also].filter((r): r is BoardRow => !!r);
  const explained = new Set<FindingRef>();
  for (const r of explaining)
    for (const [ref, a] of Object.entries(i.draft.evidence[r.dx.logicalId] ?? {}))
      if (a.w === "for") explained.add(ref);
  return recordedFindings(i.x).filter(
    (f) => presenting(f) && canSee(i.viewer, f.cls) && !explained.has(f.ref),
  );
}

/** Link an unexplained finding to the leading diagnosis (one tap on its chip). */
export function explainWithLeading(
  d: ImpressionDraft,
  board: Board,
  ref: FindingRef,
  by: { by: string; at: string },
): ImpressionDraft {
  return board.leading ? withMark(d, board.leading.dx.logicalId, ref, "for", by) : d;
}

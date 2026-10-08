import type { DxCatalogue, DxLive, DxProfile, OnsetId, RestrictedClass } from "./catalogue";
import type { FindingRef, Viewer } from "./facts";

import { canSee } from "./facts";

/**
 * The Impression board (PROMPT-CLERKING-SUMMARY-IMPRESSION §5.3): the leading diagnosis (the
 * visit's primary), the differential (the clinician's order and likelihood, must-not-miss pinned
 * until reasoned) and also this visit. The diagnoses themselves are `conditions` rows (SI4, SI6);
 * order, likelihood, reasons, accepted evidence and meta live in the note draft (§8). Pure.
 */

export type Likelihood = "likely" | "possible" | "unlikely";
export type Slot = "leading" | "differential" | "also";

/** One current condition version on this visit, as the desk reads it. */
export interface RecordedDx {
  logicalId: string;
  versionId: string;
  termId: string | null;
  /** The REF-DX-TERMS id (`dx.*`) of the term, when the term has one (the profile key). */
  dxId: string | null;
  display: string;
  /** ICD-11 code, only when verified on the term. */
  code: string | null;
  typed: boolean;
  rank: "primary" | "secondary";
  verification: string;
  restrictedClass: RestrictedClass | null;
  restricted: boolean;
  onProblemList: boolean;
  /** A `confirm_diagnosis` co-signature request is open for it (D-SI-09). */
  cosignPending: boolean;
  /** First recorded at this visit by the viewer (ADR 0217). */
  addedHere?: boolean;
}

export interface AcceptedMark {
  w: "for" | "against";
  by: string;
  at: string;
}

export interface DxMeta {
  onset?: OnsetId;
  severity?: string;
  reasoning?: string;
  /** Associated diagnoses (dx ids) linked to this one at this visit: "with" in the note. */
  with?: string[];
}

/** The draft's `impression` section (§8). Keys are condition logical ids. */
export interface ImpressionDraft {
  order: string[];
  likelihood: Record<string, Likelihood>;
  reasons: Record<string, string>;
  evidence: Record<string, Record<FindingRef, AcceptedMark>>;
  meta: Record<string, DxMeta>;
  catalogueVersion: string;
}

export const EMPTY_IMPRESSION: ImpressionDraft = {
  order: [],
  likelihood: {},
  reasons: {},
  evidence: {},
  meta: {},
  catalogueVersion: "",
};

export interface BoardRow {
  dx: RecordedDx;
  slot: Slot;
  /** The catalogue profile, only when signed (SI10): unsigned reasoning is inert. */
  profile: DxProfile | null;
  /** A profile exists but is not signed: "Reasoning aids awaiting sign-off". */
  awaitingSignoff: boolean;
  mustNotMiss: boolean;
  timeCritical: boolean;
  pinned: boolean;
  likelihood: Likelihood | null;
  reason: string;
  /** A must-not-miss marked Unlikely without a reason of at least three words (D-DX-06). */
  reasonMissing: boolean;
  /** 1-based position in the differential; 0 elsewhere. */
  position: number;
}

export interface Board {
  leading: BoardRow | null;
  differential: BoardRow[];
  also: BoardRow[];
  deferred: { reason: string } | null;
  /** Restricted diagnoses this viewer cannot see (never shown, never counted). */
  hidden: number;
}

export const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
export const REASON_MIN_WORDS = 3;

/** The draft key that holds a likelihood chosen before the condition existed (a suggestion added
 *  as Possible, §5.3). */
export const pendingKey = (d: Pick<RecordedDx, "termId" | "display">) =>
  d.termId ? `term:${d.termId}` : `typed:${normaliseTyped(d.display)}`;

export const slotOf = (d: Pick<RecordedDx, "rank" | "verification">): Slot =>
  d.rank === "primary" ? "leading" : d.verification === "differential" ? "differential" : "also";

export interface BoardInput {
  diagnoses: readonly RecordedDx[];
  draft: ImpressionDraft;
  dx: DxCatalogue | null;
  live: DxLive;
  viewer: Viewer;
  deferred: { reason: string } | null;
}

export function buildBoard(i: BoardInput): Board {
  let hidden = 0;
  const visible = i.diagnoses.filter((d) => {
    const ok =
      canSee(i.viewer, d.restrictedClass) &&
      (!d.restricted || d.restrictedClass || i.viewer.classes.size > 0);
    if (!ok) hidden++;
    return ok;
  });
  const row = (d: RecordedDx): BoardRow => {
    const p = d.dxId ? (i.dx?.profile(d.dxId) ?? null) : null;
    const signed = !!p && i.live.profile(p.id);
    const profile = signed ? p : null;
    const likelihood = i.draft.likelihood[d.logicalId] ?? i.draft.likelihood[pendingKey(d)] ?? null;
    const reason = i.draft.reasons[d.logicalId] ?? "";
    const mnm = !!profile?.must_not_miss;
    const slot = slotOf(d);
    // SI5: it leaves the top only when marked Unlikely with a reason (D-DX-06).
    const reasonMissing =
      slot === "differential" &&
      mnm &&
      likelihood === "unlikely" &&
      words(reason) < REASON_MIN_WORDS;
    return {
      dx: d,
      slot,
      profile,
      awaitingSignoff: !!p && !signed,
      mustNotMiss: mnm,
      timeCritical: !!profile?.time_critical,
      pinned: slot === "differential" && mnm && (likelihood !== "unlikely" || reasonMissing),
      likelihood,
      reason,
      reasonMissing,
      position: 0,
    };
  };
  const rows = visible.map(row);
  const leads = rows.filter((r) => r.slot === "leading");
  const diff = orderDifferential(
    rows.filter((r) => r.slot === "differential"),
    i.draft.order,
  ).map((r, n) => ({ ...r, position: n + 1 }));
  return {
    // One primary per visit is a server invariant; a second (older data) shows under Also.
    leading: leads[0] ?? null,
    differential: diff,
    also: [
      ...leads.slice(1).map((r) => ({ ...r, slot: "also" as const })),
      ...rows.filter((r) => r.slot === "also"),
    ],
    deferred: leads.length ? null : i.deferred,
    hidden,
  };
}

/** The displayed order: the draft's order (new rows appended in record order), then pinned rows
 *  above unpinned ones, each keeping that order (§5.3 "Order"). */
export function orderDifferential(rows: readonly BoardRow[], order: readonly string[]): BoardRow[] {
  const at = new Map(order.map((id, n) => [id, n]));
  const sorted = rows
    .map((r, n) => ({ r, k: at.get(r.dx.logicalId) ?? order.length + n }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.r);
  return [...sorted.filter((r) => r.pinned), ...sorted.filter((r) => !r.pinned)];
}

/** Move a differential row up or down. Pinned rows never go below unpinned ones, nor unpinned
 *  above pinned; null when the move is not allowed (the button is disabled). */
export function move(board: Board, logicalId: string, dir: -1 | 1): string[] | null {
  const list = board.differential;
  const n = list.findIndex((r) => r.dx.logicalId === logicalId);
  const m = n + dir;
  if (n < 0 || m < 0 || m >= list.length) return null;
  if (list[n]!.pinned !== list[m]!.pinned) return null;
  const ids = list.map((r) => r.dx.logicalId);
  [ids[n], ids[m]] = [ids[m]!, ids[n]!];
  return ids;
}

export const canMove = (board: Board, logicalId: string, dir: -1 | 1) =>
  move(board, logicalId, dir) !== null;

/** Tapping the selected likelihood clears it (§5.3). */
export function withLikelihood(d: ImpressionDraft, id: string, v: Likelihood): ImpressionDraft {
  const likelihood = { ...d.likelihood };
  if (likelihood[id] === v) delete likelihood[id];
  else likelihood[id] = v;
  return { ...d, likelihood };
}

/** A diagnosis leaves the board (entered in error): its reasoning leaves the draft with it. */
export function withoutDx(d: ImpressionDraft, id: string): ImpressionDraft {
  const drop = <T>(r: Record<string, T>) => {
    const c = { ...r };
    delete c[id];
    return c;
  };
  return {
    ...d,
    order: d.order.filter((x) => x !== id),
    likelihood: drop(d.likelihood),
    reasons: drop(d.reasons),
    evidence: drop(d.evidence),
    meta: drop(d.meta),
  };
}

/** A condition's new version keeps its logical id, so its reasoning carries over untouched; a
 *  swap moves the old leading diagnosis to the top of the differential as Likely (§5.3). */
export function afterSwap(
  d: ImpressionDraft,
  oldLeading: string | null,
  newLeading: string,
): ImpressionDraft {
  const order = d.order.filter((x) => x !== newLeading && x !== oldLeading);
  const likelihood = { ...d.likelihood };
  delete likelihood[newLeading];
  if (oldLeading) likelihood[oldLeading] = "likely";
  return { ...d, order: oldLeading ? [oldLeading, ...order] : order, likelihood };
}

/* ─── Duplicates (S-3) ──────────────────────────────────────────── */

export const normaliseTyped = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

export type DxPickKey = { termId: string } | { typed: string };

/** The diagnosis already on this visit that a pick would duplicate, if any (the picker disables
 *  it; the server enforces the same rule). */
export function duplicateOf(diagnoses: readonly RecordedDx[], pick: DxPickKey): RecordedDx | null {
  if ("termId" in pick) return diagnoses.find((d) => d.termId === pick.termId) ?? null;
  const t = normaliseTyped(pick.typed);
  return diagnoses.find((d) => d.typed && normaliseTyped(d.display) === t) ?? null;
}

/* ─── Invariants and signing ────────────────────────────────────── */

export function invariants(diagnoses: readonly RecordedDx[]): string[] {
  const problems: string[] = [];
  if (diagnoses.filter((d) => d.rank === "primary").length > 1) problems.push("two primaries");
  const keys = diagnoses.map((d) =>
    d.termId ? `t:${d.termId}` : `x:${normaliseTyped(d.display)}`,
  );
  if (new Set(keys).size !== keys.length) problems.push("duplicate diagnosis");
  return problems;
}

/** What blocks signing on this step (D-SI-06): each must-not-miss marked Unlikely without a
 *  reason, by name. */
export function signBlocks(board: Board): string[] {
  return board.differential
    .filter((r) => r.reasonMissing)
    .map((r) => `${r.dx.display}: a must-not-miss marked unlikely needs a reason`);
}

export const onBoard = (board: Board) =>
  [board.leading, ...board.differential, ...board.also].filter((r): r is BoardRow => !!r);

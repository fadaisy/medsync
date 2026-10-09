import type { Board, BoardRow, ImpressionDraft } from "./board";
import type { Catalogued, DueLabel } from "./relations-catalogue";

import ASSOCIATIONS from "@/data/clerking/dx-associations.v1.json";
import { cataloguedRelation, listedReversed } from "./relations-catalogue";

/**
 * The board's places with relations (dx-relations-design §2, ADR 0220, GATE A 2026-10-09): which
 * diagnosis is leading, co-existing or linked under another, where each relation is shown (once,
 * on the higher-placed end, §2.3), the Background row, what a drop means (§4.1–4.2) and what holds
 * signing ("Cause removed: review", DXV-13). Relations are the record's (payload.relations); a
 * viewer's hidden rows are simply absent, and their relations drop out with them (D-REL-09). Pure.
 */

/** A relation as the board reads it (DeskRelation is one). */
export interface Edge {
  id: string;
  logicalId: string;
  conditionId: string;
  relatedConditionId: string;
  relationType: "due_to" | "associated_with" | "risk_factor_for" | "episode_of";
  label: DueLabel | null;
  position: number;
  qualifiers: string[];
  restricted: boolean;
  origin?: string;
}

/** A problem-list condition on the Background row (DeskBackground is one). */
export interface Known {
  id: string;
  logicalId: string;
  termId: string | null;
  display: string;
  code: string | null;
  restricted: boolean;
  since: string;
  /** An earlier visit's diagnosis (Gate B look-back), not the problem list: "treated 3 October". */
  earlier?: { words: string };
}

/** A known end in words: "known type 1 diabetes", or an earlier visit's "malaria (treated 3 October)". */
export const knownWords = (k: Pick<Known, "display" | "earlier">, lower: (s: string) => string) =>
  k.earlier ? `${lower(k.display)} (${k.earlier.words})` : `known ${lower(k.display)}`;

export interface CauseRemovedItem {
  logicalId: string;
  conditionId: string;
  causeDisplay?: string;
}

export const LABEL_WORDS: Record<DueLabel, string> = {
  secondary: "secondary to",
  complication: "complication of",
  precipitated_by: "precipitated by",
};

/** The relation's words read from the condition's side: "secondary to", "with". A record row
 *  (`relationType`) or a catalogue entry (`type`). */
export const relWord = (e: { relationType?: string; type?: string; label: DueLabel | null }) =>
  (e.relationType ?? e.type) === "associated_with"
    ? "with"
    : e.label
      ? LABEL_WORDS[e.label]
      : "related to";

/** A relation shown on a card as a clause: the other end lower on the board, or a known condition. */
export interface Clause {
  edge: Edge;
  otherId: string;
  other: string;
  /** The other end is a known condition (the problem list). */
  known: boolean;
  /** This card is the condition (the effect): "secondary to …"; else it is the cause. */
  fromCondition: boolean;
}

export interface Card {
  row: BoardRow;
  /** The relation that hangs it under its parent (null: leading or co-existing). */
  via: Edge | null;
  parentId: string | null;
  clauses: Clause[];
  children: Card[];
  depth: number;
  /** Active this visit: the known condition it is an episode of (R5). */
  episodeOf: Known | null;
}

export interface Places {
  leading: Card | null;
  coexisting: Card[];
  /** Every card, by logical id (leading, co-existing and linked). */
  cardOf: ReadonlyMap<string, Card>;
  background: { item: Known; active: boolean; named: boolean }[];
}

const CAUSAL = new Set(["due_to", "associated_with"]);
const byPosition = (a: Edge, b: Edge) => a.position - b.position;

export function places(
  board: Pick<Board, "leading" | "also">,
  edges: readonly Edge[],
  known: readonly Known[],
  /** For the note's audience: rows, known conditions and relations it may read. */
  show: {
    row?: (r: BoardRow) => boolean;
    known?: (k: Known) => boolean;
    edge?: (e: Edge) => boolean;
  } = {},
): Places {
  const rows = [board.leading, ...board.also].filter(
    (r): r is BoardRow => !!r && (show.row?.(r) ?? true),
  );
  const node = new Map(rows.map((r) => [r.dx.logicalId, r]));
  const kn = new Map(known.filter((k) => show.known?.(k) ?? true).map((k) => [k.logicalId, k]));
  const on = (id: string) => node.has(id) || kn.has(id);
  const ok = edges.filter(
    (e) => (show.edge?.(e) ?? true) && on(e.conditionId) && on(e.relatedConditionId),
  );
  const live = ok
    .filter(
      (e) =>
        CAUSAL.has(e.relationType) && (node.has(e.conditionId) || node.has(e.relatedConditionId)),
    )
    .sort(byPosition);
  const episode = new Map(
    ok
      .filter((e) => e.relationType === "episode_of" && kn.has(e.relatedConditionId))
      .map((e) => [e.conditionId, kn.get(e.relatedConditionId)!]),
  );
  const shown = new Set<string>();
  const visited = new Set<string>();
  const cardOf = new Map<string, Card>();
  const visit = (row: BoardRow, via: Edge | null, parentId: string | null, depth: number): Card => {
    const id = row.dx.logicalId;
    visited.add(id);
    const card: Card = {
      row,
      via,
      parentId,
      clauses: [],
      children: [],
      depth,
      episodeOf: episode.get(id) ?? null,
    };
    cardOf.set(id, card);
    const kids: [Edge, BoardRow][] = [];
    for (const e of live) {
      if (shown.has(e.id) || (e.conditionId !== id && e.relatedConditionId !== id)) continue;
      shown.add(e.id);
      const fromCondition = e.conditionId === id;
      const otherId = fromCondition ? e.relatedConditionId : e.conditionId;
      const other = node.get(otherId);
      // The other end hangs under this one when this is its cause (or they are associated).
      if (
        other &&
        !visited.has(otherId) &&
        (!fromCondition || e.relationType === "associated_with")
      ) {
        visited.add(otherId);
        kids.push([e, other]);
      } else
        card.clauses.push({
          edge: e,
          otherId,
          other: other?.dx.display ?? kn.get(otherId)!.display,
          known: !other,
          fromCondition,
        });
    }
    card.children = kids.map(([e, r]) => visit(r, e, id, depth + 1));
    return card;
  };
  const leading =
    board.leading && node.has(board.leading.dx.logicalId)
      ? visit(board.leading, null, null, 0)
      : null;
  const coexisting: Card[] = [];
  for (;;) {
    const free = rows.filter((r) => !visited.has(r.dx.logicalId));
    if (!free.length) break;
    const freeIds = new Set(free.map((r) => r.dx.logicalId));
    // A root is not the effect of another free diagnosis: the cause comes first, the effect under it.
    const root =
      free.find(
        (r) =>
          !live.some(
            (e) =>
              !shown.has(e.id) &&
              e.relationType === "due_to" &&
              e.conditionId === r.dx.logicalId &&
              freeIds.has(e.relatedConditionId),
          ),
      ) ?? free[0]!;
    coexisting.push(visit(root, null, null, 0));
  }
  const named = new Set(
    [...shown].flatMap((id) => {
      const e = live.find((x) => x.id === id)!;
      return [e.conditionId, e.relatedConditionId];
    }),
  );
  const activeKnown = new Set([...episode.values()].map((k) => k.logicalId));
  return {
    leading,
    coexisting,
    cardOf,
    background: [...kn.values()].map((item) => ({
      item,
      active: activeKnown.has(item.logicalId),
      named: activeKnown.has(item.logicalId) || named.has(item.logicalId),
    })),
  };
}

/** Every card under a parent, depth first (the "Add findings to" switch, the note). */
export const descendants = (c: Card): Card[] => c.children.flatMap((k) => [k, ...descendants(k)]);

/* ─── What a drop means (design §4.1, §4.2, §4.4) ───────────────── */

export type DragSource = { kind: "dx"; id: string } | { kind: "known"; id: string };
export type DropTarget =
  | { kind: "dx"; id: string }
  | { kind: "known"; id: string }
  | { kind: "coexisting" }
  | { kind: "leading" };

export type DropOutcome =
  | { kind: "refuse"; message: string }
  | { kind: "none" }
  | { kind: "unlink"; edge: Edge }
  | { kind: "reorder"; order: Edge[] }
  | { kind: "active"; known: Known; rank: "primary" | "secondary" }
  | {
      kind: "relate";
      conditionId: string;
      relatedConditionId: string;
      /** Catalogued and unambiguous: applied at once (D-REL-06). */
      apply: Catalogued | null;
      /** The catalogue lists the other direction: "Did you mean …?" first. */
      reversed: Catalogued | null;
      /** Catalogued but direction-ambiguous: offered, never preselected. */
      hint: Catalogued | null;
    };

export interface DropContext {
  places: Places;
  board: Pick<Board, "leading" | "differential">;
  edges: readonly Edge[];
  known: readonly Known[];
  /** A known condition's catalogue id (`dx.*`), from its term. */
  knownDx: (k: Known) => string | null;
}

/** Certificate lines a to d (design §1.2). */
const MAX_DEPTH = 4;

/** Causes above a condition (its due_to chain upward), with their depth. */
function chainUp(
  edges: readonly Edge[],
  id: string,
  d = 0,
  seen = new Set<string>(),
): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of edges)
    if (e.relationType === "due_to" && e.conditionId === id && !seen.has(e.relatedConditionId)) {
      seen.add(e.relatedConditionId);
      out.set(e.relatedConditionId, d + 1);
      for (const [k, v] of chainUp(edges, e.relatedConditionId, d + 1, seen)) out.set(k, v);
    }
  return out;
}
function chainDown(edges: readonly Edge[], id: string, seen = new Set<string>()): number {
  let max = 0;
  for (const e of edges)
    if (e.relationType === "due_to" && e.relatedConditionId === id && !seen.has(e.conditionId)) {
      seen.add(e.conditionId);
      max = Math.max(max, 1 + chainDown(edges, e.conditionId, seen));
    }
  return max;
}

/** Why a link from `a` (the condition) to `b` (the related one) is refused, or null. */
export function refusal(
  c: DropContext,
  a: string,
  b: string,
  names: (id: string) => string,
): string | null {
  if (a === b) return "Drop refused: a diagnosis cannot be linked to itself.";
  const diff = c.board.differential.find((r) => r.dx.logicalId === b || r.dx.logicalId === a);
  if (diff) return `Drop refused: ${diff.dx.display} is a differential. Promote it first.`;
  if (
    c.edges.some(
      (e) =>
        CAUSAL.has(e.relationType) &&
        ((e.conditionId === a && e.relatedConditionId === b) ||
          (e.conditionId === b && e.relatedConditionId === a)),
    )
  )
    return `Drop refused: ${names(a)} and ${names(b)} are already linked.`;
  if (chainUp(c.edges, b).has(a)) return `Link to ${names(b)} refused: it would make a loop.`;
  // Counted as the 0096 guard counts: the cause and those above it, this one, those below it.
  const above = 1 + Math.max(0, ...chainUp(c.edges, b).values());
  if (above + 1 + chainDown(c.edges, a) > MAX_DEPTH)
    return `Link to ${names(b)} refused: a chain of causes is limited to ${MAX_DEPTH} levels.`;
  return null;
}

export function dropOutcome(c: DropContext, src: DragSource, tgt: DropTarget): DropOutcome {
  const kn = (id: string) => c.known.find((k) => k.logicalId === id);
  const dxOf = (id: string) =>
    c.places.cardOf.get(id)?.row.dx.dxId ?? (kn(id) ? c.knownDx(kn(id)!) : null);
  const names = (id: string) =>
    c.places.cardOf.get(id)?.row.dx.display ??
    c.board.differential.find((r) => r.dx.logicalId === id)?.dx.display ??
    kn(id)?.display ??
    "it";
  if (src.kind === "known") {
    const k = kn(src.id);
    if (!k || tgt.kind === "known") return { kind: "none" };
    if (c.places.background.find((b) => b.item.logicalId === k.logicalId)?.active)
      return { kind: "refuse", message: `${k.display} is already active this visit.` };
    if (tgt.kind === "dx" && c.board.differential.some((r) => r.dx.logicalId === tgt.id))
      return {
        kind: "refuse",
        message: `Drop refused: ${names(tgt.id)} is a differential. Promote it first.`,
      };
    return {
      kind: "active",
      known: k,
      rank: tgt.kind === "leading" && !c.board.leading ? "primary" : "secondary",
    };
  }
  const card = c.places.cardOf.get(src.id);
  if (!card) return { kind: "none" };
  if (tgt.kind === "leading") return { kind: "none" };
  if (tgt.kind === "coexisting")
    return card.via ? { kind: "unlink", edge: card.via } : { kind: "none" };
  const peer = tgt.kind === "dx" ? c.places.cardOf.get(tgt.id) : undefined;
  if (peer && card.via && peer.via && peer.parentId === card.parentId && peer !== card) {
    const sibs = c.places.cardOf.get(card.parentId!)!.children.map((k) => k.via!);
    const from = sibs.indexOf(card.via);
    const to = sibs.indexOf(peer.via);
    const order = sibs.filter((e) => e !== card.via);
    order.splice(to, 0, card.via);
    return from === to ? { kind: "none" } : { kind: "reorder", order };
  }
  const why = refusal(c, src.id, tgt.id, names);
  if (why) return { kind: "refuse", message: why };
  const a = dxOf(src.id);
  const b = dxOf(tgt.id);
  const cat = a && b ? cataloguedRelation(a, b) : null;
  const rev = a && b && listedReversed(a, b) ? cataloguedRelation(b, a) : null;
  return {
    kind: "relate",
    conditionId: src.id,
    relatedConditionId: tgt.id,
    apply: cat && !cat.ambiguous ? cat : null,
    reversed: rev,
    hint: cat?.ambiguous ? cat : null,
  };
}

/* ─── Signing: "Cause removed: review" (DXV-13) ─────────────────── */

export function causeRemovedBlocks(
  items: readonly CauseRemovedItem[],
  draft: Pick<ImpressionDraft, "reviewed">,
  nameOf: (logicalId: string) => string | null,
): string[] {
  const done = new Set(draft.reviewed ?? []);
  return items
    .filter((i) => !done.has(i.logicalId))
    .map(
      (i) =>
        `${nameOf(i.conditionId) ?? "A diagnosis"}: its cause${i.causeDisplay ? ` (${i.causeDisplay})` : ""} was removed; review it`,
    );
}

/* ─── Flag (design §5.2: a property of the linked diagnosis) ─────── */

/** Flagged: its own meta, or (an earlier draft) its parent's `flagged` list. */
export const isFlagged = (d: ImpressionDraft, row: BoardRow) =>
  d.meta[row.dx.logicalId]?.flag ??
  (!!row.dx.dxId && Object.values(d.meta).some((m) => m?.flagged?.includes(row.dx.dxId!)));

export function withFlagOn(d: ImpressionDraft, row: BoardRow): ImpressionDraft {
  const m = d.meta[row.dx.logicalId] ?? {};
  return { ...d, meta: { ...d.meta, [row.dx.logicalId]: { ...m, flag: !isFlagged(d, row) } } };
}

/* ─── D-REL-17: today's note-level links, proposed as relations ──── */

type Assoc = { complications?: string[]; goes_with?: string[] };
const DATA = ASSOCIATIONS as {
  id: string;
  version: string;
  status: string;
  associations: Record<string, Assoc>;
};

export interface VisitDx {
  logicalId: string;
  /** The `dx.*` id of its term, when it has one. */
  dxId: string | null;
  verification: string;
}

export type Proposal =
  | {
      kind: "due_to" | "associated_with";
      conditionId: string;
      relatedConditionId: string;
      label: "complication" | null;
      catalogueRef: string;
    }
  | { kind: "ask"; parentLogicalId: string; childDxId: string };

/** The proposals for one draft's Impression (scripts/emr/backfill-relations.ts reports them). */
export function proposeRelations(
  meta: Record<string, { with?: string[] } | undefined>,
  visit: readonly VisitDx[],
  related: ReadonlySet<string> = new Set(),
  data = DATA,
): Proposal[] {
  if (!data.status.startsWith("signed")) return [];
  const byLogical = new Map(visit.map((d) => [d.logicalId, d]));
  const byDx = new Map(visit.flatMap((d) => (d.dxId ? [[d.dxId, d] as const] : [])));
  const live = (d?: VisitDx) =>
    !!d && d.verification !== "differential" && d.verification !== "refuted";
  const out: Proposal[] = [];
  for (const [parentId, m] of Object.entries(meta)) {
    const parent = byLogical.get(parentId);
    for (const childDx of m?.with ?? []) {
      const child = byDx.get(childDx);
      const entry = parent?.dxId ? data.associations[parent.dxId] : undefined;
      const ref = `${data.id}@${data.version}:${parent?.dxId}>${childDx}`;
      const ask = { kind: "ask", parentLogicalId: parentId, childDxId: childDx } as const;
      if (!live(parent) || !live(child) || child!.logicalId === parentId) {
        out.push(ask);
      } else if (entry?.complications?.includes(childDx)) {
        if (!related.has(`due_to|${child!.logicalId}|${parentId}`))
          out.push({
            kind: "due_to",
            conditionId: child!.logicalId,
            relatedConditionId: parentId,
            label: "complication",
            catalogueRef: ref,
          });
      } else if (entry?.goes_with?.includes(childDx)) {
        const [a, b] = [child!.logicalId, parentId].sort() as [string, string];
        if (!related.has(`associated_with|${a}|${b}`))
          out.push({
            kind: "associated_with",
            conditionId: a,
            relatedConditionId: b,
            label: null,
            catalogueRef: ref,
          });
      } else out.push(ask);
    }
  }
  return out;
}

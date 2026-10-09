import type { Board, BoardRow, ImpressionDraft } from "./board";
import type { Finding, FindingRef } from "./facts";
import type { Card, Clause, Edge, Known } from "./relations";

import { lc, list } from "../compose";
import { isFlagged, places, relWord } from "./relations";
import { precipitantName } from "./relations-catalogue";

/**
 * The note's Impression block (`composer.impression`, gate-a-proposal §5.2), in the order of
 * dx-relations-design §2.3: the leading diagnosis with its status and qualifiers, its relation
 * clauses and its linked diagnoses indented under it; each co-existing diagnosis the same way; the
 * differential; "Ruled out"; then "Known conditions" not already named. Only accepted evidence is
 * written; suggestions never are (SI3). Restricted diagnoses, findings and the relations that touch
 * them are left out of patient-facing text with no placeholder (SI9, D-REL-09). Deterministic,
 * en-GB. Pure.
 */

export interface ImpressionComposeInput {
  board: Board;
  draft: ImpressionDraft;
  /** Finding text by ref (the recorded findings, plus synthetic ones the matrix showed). */
  findings: ReadonlyMap<FindingRef, Finding>;
  unexplained: readonly Finding[];
  audience: "clinical" | "patient";
  /** The record's relations among the board and the background (0096). */
  relations?: readonly Edge[];
  /** The problem list (the Background row). */
  background?: readonly Known[];
  /** This visit's diagnoses ruled out, with the reason. */
  ruledOut?: readonly { display: string; reason: string | null; restricted: boolean }[];
}

const ONSET: Record<string, string> = {
  acute: "acute",
  subacute: "subacute",
  chronic: "chronic",
  acute_on_chronic: "acute on chronic",
  recurrent: "recurrent",
};

function status(r: BoardRow): string {
  if (r.dx.cosignPending) return "final, awaiting senior co-signature";
  return r.dx.verification === "confirmed" ? "final" : "working";
}

/** This card's clauses as the condition, one phrase per wording ("secondary to A and to B"); a
 *  linked card's own link to its parent comes first. Precipitants join "precipitated by". */
function clauseText(card: Card, parent: string | null): string {
  const groups = new Map<string, string[]>();
  const add = (word: string, what: string) => groups.set(word, [...(groups.get(word) ?? []), what]);
  const self = card.row.dx.logicalId;
  if (card.via && parent && card.via.relationType === "due_to") add(relWord(card.via), lc(parent));
  for (const c of card.clauses)
    if (c.fromCondition) add(relWord(c.edge), `${c.known ? "known " : ""}${lc(c.other)}`);
  for (const e of [card.via, ...card.clauses.map((c) => c.edge)])
    if (e?.relationType === "due_to" && e.conditionId === self)
      for (const q of e.qualifiers) add("precipitated by", lc(precipitantName(q)));
  return [...groups]
    .map(
      ([word, what]) =>
        `${word} ${list(what, word === "with" ? "and" : `and ${word.split(" ").pop()}`)}`,
    )
    .join("; ");
}

/** A relation this card shows as the cause (the effect placed above it): its own sentence. */
const causeSide = (card: Card, c: Clause) =>
  `${c.known ? `Known ${lc(c.other)}` : c.other}, ${relWord(c.edge)} ${lc(card.row.dx.display)}.`;

export function composeImpression(i: ImpressionComposeInput): string {
  const patient = i.audience === "patient";
  const hide = (r: BoardRow) => patient && (r.dx.restricted || !!r.dx.restrictedClass);
  const hideF = (f: Finding) => patient && !!f.cls;
  const marks = (r: BoardRow, w: "for" | "against") =>
    Object.entries(i.draft.evidence[r.dx.logicalId] ?? {})
      .filter(([, a]) => a.w === w)
      .map(([ref]) => i.findings.get(ref))
      .filter((f): f is Finding => !!f && !hideF(f))
      .map((f) => lc(f.text));
  const p = places(i.board, i.relations ?? [], i.background ?? [], {
    row: (r) => !hide(r),
    known: (k) => !(patient && k.restricted),
    edge: (e) => !(patient && e.restricted),
  });
  const out: string[] = [];

  const since = (k: Known) => `on record since ${k.since.slice(0, 4)}`;
  /** "Name (code) (bits), clauses" for one card. */
  const head = (card: Card, bits: string[], parent: string | null = null) => {
    const r = card.row;
    const ep = card.episodeOf ? [`known condition, ${since(card.episodeOf)}`] : [];
    const clauses = clauseText(card, parent);
    return `${r.dx.display}${r.dx.code ? ` (${r.dx.code})` : ""} (${[...bits, ...ep].join("; ")})${
      clauses ? `, ${clauses}` : ""
    }`;
  };
  const tail = (card: Card) =>
    card.clauses.filter((c) => !c.fromCondition).map((c) => causeSide(card, c));
  /** Linked diagnoses, indented under their parent, in the clinician's order. */
  const children = (card: Card, depth = 1): string[] =>
    card.children.flatMap((k) => {
      const pad = "  ".repeat(depth);
      const bits = [status(k.row), ...(k.row.dx.onProblemList ? ["on problem list"] : [])];
      const flag = isFlagged(i.draft, k.row) ? " (flagged)" : "";
      const line =
        k.via?.relationType === "associated_with"
          ? `${pad}With: ${lc(head(k, bits))}${flag}.`
          : `${pad}${head(k, bits, card.row.dx.display)}${flag}.`;
      return [line, ...tail(k).map((t) => `${pad}${t}`), ...children(k, depth + 1)];
    });

  const lead = p.leading;
  if (lead) {
    const m = i.draft.meta[lead.row.dx.logicalId] ?? {};
    const bits = [
      "primary",
      status(lead.row),
      ...(m.onset ? [ONSET[m.onset] ?? m.onset] : []),
      ...(m.severity ? [`${m.severity} (your grading)`] : []),
    ];
    const f = marks(lead.row, "for");
    const a = marks(lead.row, "against");
    out.push(
      [
        `${head(lead, bits)}.`,
        ...tail(lead),
        f.length ? `For: ${list(f)}.` : "",
        a.length ? `Against: ${list(a)}.` : "",
        m.reasoning?.trim() ?? "",
      ]
        .filter(Boolean)
        .join(" "),
      ...children(lead),
    );
  } else if (i.board.deferred) out.push(`Diagnosis deferred: ${i.board.deferred.reason.trim()}.`);

  for (const c of p.coexisting) {
    const bits = [status(c.row), ...(c.row.dx.onProblemList ? ["on problem list"] : [])];
    out.push(
      [`Also this visit, co-existing: ${head(c, bits)}.`, ...tail(c)].join(" "),
      ...children(c),
    );
  }

  const diff = i.board.differential.filter((r) => !hide(r));
  if (diff.length)
    out.push(
      `Differential: ${diff
        .map((r, n) => {
          const f = marks(r, "for").length;
          const a = marks(r, "against").length;
          const reason =
            r.mustNotMiss && r.likelihood === "unlikely" && r.reason.trim()
              ? ` (${r.reason.trim()})`
              : "";
          return `${n + 1}. ${r.dx.display}${r.mustNotMiss ? " (must not miss)" : ""}${
            r.likelihood ? `, ${r.likelihood}` : ""
          }${reason}${f || a ? ` [${f} for, ${a} against]` : ""}.`;
        })
        .join(" ")}`,
    );

  const ruled = (i.ruledOut ?? []).filter((r) => !(patient && r.restricted));
  if (ruled.length)
    out.push(
      `Ruled out: ${ruled
        .map((r) => `${lc(r.display)}${r.reason?.trim() ? ` (${r.reason.trim()})` : ""}`)
        .join("; ")}.`,
    );

  // Known conditions not already named above: not active this visit, not in a relation, and not
  // the same term as one of this visit's diagnoses.
  const visitTerms = new Set([...p.cardOf.values()].map((c) => c.row.dx.termId).filter(Boolean));
  const known = p.background.filter(
    (b) => !b.named && !(b.item.termId && visitTerms.has(b.item.termId)),
  );
  if (known.length)
    out.push(
      `Known conditions: ${known.map((b) => `${lc(b.item.display)} (${since(b.item)})`).join("; ")}.`,
    );

  const left = [...new Set(i.unexplained.filter((f) => !hideF(f)).map((f) => lc(f.text)))];
  if ((lead || p.coexisting.length) && left.length) out.push(`Not yet explained: ${list(left)}.`);
  return out.join("\n");
}

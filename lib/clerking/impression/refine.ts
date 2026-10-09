import type { BoardRow } from "./board";
import type { Card, Edge, Known, Places } from "./relations";
import type { RiskLine, RiskOnRecord } from "./risk-line";

import { lc, list } from "../compose";
import { refinesFrom, subtypesOf } from "./relations-catalogue";
import { outcomeOf, riskLine } from "./risk-line";

/**
 * Refinement as the board and the note read it (R3, D-REL-05, D-REL-15, D-REL-04; ADR 0220): the
 * name a diagnosis is written under (the subtype file's `note_before` while a broad diagnosis is
 * unrefined, `note_after` once it is), the one-action offer that folds a placeholder into what
 * explains it, and the derived risk-factor line of each top-level diagnosis. Offers only: nothing
 * here writes, and nothing is ever applied without the clinician. Pure.
 */

/** A symptom-level placeholder ("Anaemia, cause not yet known", D-REL-15). */
export const isPlaceholder = (dx: string | null) => !!dx && /_(unexplained|unconfirmed)$/.test(dx);

/** A parent and those it was refined from in the catalogue (NSTE-ACS → ACS). */
function ancestors(dx: string): string[] {
  const out = [dx];
  for (let d = refinesFrom(dx); d && !out.includes(d); d = refinesFrom(d)) out.push(d);
  return out;
}

/** Fill a subtype-file template; a slot with no value leaves out its bracket or clause. */
function fill(t: string, v: Record<string, string | null | undefined>): string {
  return t
    .replace(/ after \{deciding\}/, v.deciding ? " after {deciding}" : "")
    .replace(/\{(\w+)\}/g, (m, k: string) => (v[k] ? m : "\0"))
    .replace(/\s*\([^()]*\0[^()]*\)/g, "")
    .replace(/,[^,{]*\0[^,]*/g, "")
    .replace(/\s*\0/g, "")
    .replace(/[\s,]+$/, "")
    .replace(/\{(\w+)\}/g, (_, k: string) => v[k]!);
}

/**
 * The diagnosis's name in the note. `stage` is the stage's words when it is known; `stageUsed`
 * says the template already wrote it ("Pneumonia (CURB-65 1)"). A broad diagnosis with a cause
 * linked is not "being investigated", so `note_before` is for an unexplained one only.
 */
export function noteName(
  dx: Pick<BoardRow["dx"], "dxId" | "display" | "refinedFrom">,
  o: { stage: string | null; caused: boolean },
): { name: string; stageUsed: boolean } {
  const plain = { name: dx.display, stageUsed: false };
  const from = dx.refinedFrom;
  // A placeholder refined is simply what explained it (D-REL-15: no "cause not yet known").
  if (from && isPlaceholder(from.dxId)) return plain;
  if (from) {
    // The catalogue's wording, where the refinement followed it (its parent or an ancestor).
    const parent = dx.dxId ? refinesFrom(dx.dxId) : null;
    const tpl =
      parent && from.dxId && ancestors(parent).includes(from.dxId)
        ? subtypesOf(parent)?.note_after
        : undefined;
    const deciding = from.decided.length ? list(from.decided.map(lc)) : null;
    if (!tpl)
      return {
        name: `${dx.display} (refined from ${lc(from.display)}${deciding ? ` after ${deciding}` : ""})`,
        stageUsed: false,
      };
    return {
      name: fill(tpl, { subtype: dx.display, deciding, stage: o.stage }),
      stageUsed: !!o.stage && tpl.includes("{stage}"),
    };
  }
  const tpl = dx.dxId && !o.caused ? subtypesOf(dx.dxId)?.note_before : undefined;
  return tpl
    ? { name: fill(tpl, { stage: o.stage }), stageUsed: !!o.stage && tpl.includes("{stage}") }
    : plain;
}

/** This card is the effect of a recorded cause (its own link up, or a clause). */
export const hasCause = (c: Card) =>
  (c.via?.relationType === "due_to" && c.via.conditionId === c.row.dx.logicalId) ||
  c.clauses.some((x) => x.fromCondition && x.edge.relationType === "due_to");

/* ─── D-REL-15: a placeholder folded into what explains it ──────── */

export interface PlaceholderOffer {
  row: BoardRow;
  into: { dxId: string; display: string };
  /** The subtype is already its own diagnosis on this visit: the placeholder comes off as
   *  explained by it (a duplicate), since a refinement would make two of the same. */
  explainedBy: BoardRow | null;
}

/**
 * For each placeholder on the board (not declined): a subtype of it also on the board, or, once a
 * cause is linked to it, its plain subtype ("Anaemia, cause not yet known" → "Anaemia").
 */
export function placeholderOffers(
  pl: Pick<Places, "cardOf">,
  names: (dxId: string) => string,
  kept: (logicalId: string) => boolean,
): PlaceholderOffer[] {
  const out: PlaceholderOffer[] = [];
  const cards = [...pl.cardOf.values()];
  for (const c of cards) {
    const p = c.row.dx.dxId;
    const subs = isPlaceholder(p) ? subtypesOf(p!)?.subtypes : undefined;
    if (!subs || kept(c.row.dx.logicalId)) continue;
    const ids = new Set(subs.map((s) => s.id));
    const on = cards.find((k) => k !== c && !!k.row.dx.dxId && ids.has(k.row.dx.dxId));
    if (on) {
      out.push({
        row: c.row,
        into: { dxId: on.row.dx.dxId!, display: on.row.dx.display },
        explainedBy: on.row,
      });
      continue;
    }
    const plain = subs.find((s) => c.row.dx.display.startsWith(`${names(s.id)},`));
    if (plain && hasCause(c))
      out.push({
        row: c.row,
        into: { dxId: plain.id, display: names(plain.id) },
        explainedBy: null,
      });
  }
  return out;
}

/* ─── D-REL-04: the derived risk-factor line ─────────────────────── */

/**
 * The risk-factor line of the leading and each co-existing diagnosis, by logical id: factors from
 * the problem list and this visit's other diagnoses, exposures from the social history, less what
 * is already linked as its cause. A line naming a class the viewer lacks is left out whole.
 */
export function riskLinesOf(i: {
  pl: Pick<Places, "leading" | "coexisting" | "cardOf">;
  edges: readonly Edge[];
  known: readonly Known[];
  knownDx: (k: Known) => string | null;
  exposures: ReadonlySet<string>;
  /** A diagnosis's restricted class, by its dx id. */
  classOf: (dxId: string) => string | null;
  canSee: (cls: string) => boolean;
}): Map<string, RiskLine> {
  const cards = [...i.pl.cardOf.values()];
  const onRecord: RiskOnRecord[] = [
    ...i.known.flatMap((k) => {
      const d = k.earlier ? null : i.knownDx(k);
      return d
        ? [{ dxId: d, logicalId: k.logicalId, display: k.display, restrictedClass: i.classOf(d) }]
        : [];
    }),
    ...cards.flatMap(({ row: r }) =>
      r.dx.dxId
        ? [
            {
              dxId: r.dx.dxId,
              logicalId: r.dx.logicalId,
              display: r.dx.display,
              restrictedClass: r.dx.restrictedClass,
            },
          ]
        : [],
    ),
  ];
  const dxOfId = (id: string) =>
    i.pl.cardOf.get(id)?.row.dx.dxId ??
    (() => {
      const k = i.known.find((x) => x.logicalId === id);
      return k ? i.knownDx(k) : null;
    })();
  const out = new Map<string, RiskLine>();
  for (const c of [i.pl.leading, ...i.pl.coexisting]) {
    const dx = c?.row.dx;
    if (!dx?.dxId) continue;
    const causes = new Set(
      i.edges
        .filter((e) => e.relationType === "due_to" && e.conditionId === dx.logicalId)
        .flatMap((e) => dxOfId(e.relatedConditionId) ?? []),
    );
    const line = riskLine(outcomeOf(dx.dxId), {
      // Once each (a known condition active this visit is on record twice), never the outcome.
      onRecord: onRecord.filter(
        (r, n, a) => r.dxId !== dx.dxId && a.findIndex((x) => x.dxId === r.dxId) === n,
      ),
      linkedCauses: causes,
      exposuresPresent: i.exposures,
      outcomeClass: dx.restrictedClass,
    });
    if (line && line.restrictedClasses.every(i.canSee)) out.set(dx.logicalId, line);
  }
  return out;
}

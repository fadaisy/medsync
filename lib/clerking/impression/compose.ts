import type { Board, BoardRow, ImpressionDraft } from "./board";
import type { Finding, FindingRef } from "./facts";

import { lc, list } from "../compose";

/**
 * The note's Impression block (`composer.impression`, gate-a-proposal §5.2). Only accepted
 * evidence is written; suggestions never are (SI3). Restricted diagnoses and findings are left out
 * of patient-facing text (SI9). Deterministic, en-GB. Pure.
 */

export interface ImpressionComposeInput {
  board: Board;
  draft: ImpressionDraft;
  /** Finding text by ref (the recorded findings, plus synthetic ones the matrix showed). */
  findings: ReadonlyMap<FindingRef, Finding>;
  unexplained: readonly Finding[];
  audience: "clinical" | "patient";
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

export function composeImpression(i: ImpressionComposeInput): string {
  const hide = (r: BoardRow) =>
    i.audience === "patient" && (r.dx.restricted || !!r.dx.restrictedClass);
  const hideF = (f: Finding) => i.audience === "patient" && !!f.cls;
  const marks = (r: BoardRow, w: "for" | "against") =>
    Object.entries(i.draft.evidence[r.dx.logicalId] ?? {})
      .filter(([, a]) => a.w === w)
      .map(([ref]) => i.findings.get(ref))
      .filter((f): f is Finding => !!f && !hideF(f))
      .map((f) => lc(f.text));
  const out: string[] = [];
  // Associations linked at this visit (meta.with): the parent's line names them, each says its parent.
  const rows = [i.board.leading, ...i.board.differential, ...i.board.also].filter(
    (r): r is BoardRow => !!r && !hide(r),
  );
  // In the order the clinician arranged them; a flagged one says so.
  const childrenOf = (r: BoardRow) => {
    const m = i.draft.meta[r.dx.logicalId];
    return (m?.with ?? [])
      .map((id) => rows.find((c) => c.dx.dxId === id && c !== r))
      .filter((c): c is BoardRow => !!c)
      .map((c) => `${lc(c.dx.display)}${m?.flagged?.includes(c.dx.dxId!) ? " (flagged)" : ""}`);
  };
  const parentOf = (r: BoardRow) =>
    rows.find(
      (p) => p !== r && !!r.dx.dxId && i.draft.meta[p.dx.logicalId]?.with?.includes(r.dx.dxId),
    );

  const lead = i.board.leading;
  if (lead && !hide(lead)) {
    const m = i.draft.meta[lead.dx.logicalId] ?? {};
    const bits = [
      "primary",
      status(lead),
      ...(m.onset ? [ONSET[m.onset] ?? m.onset] : []),
      ...(m.severity ? [`${m.severity} (your grading)`] : []),
    ];
    const f = marks(lead, "for");
    const a = marks(lead, "against");
    out.push(
      [
        `${lead.dx.display} (${bits.join("; ")}).`,
        f.length ? `For: ${list(f)}.` : "",
        a.length ? `Against: ${list(a)}.` : "",
        childrenOf(lead).length ? `With: ${list(childrenOf(lead))}.` : "",
        m.reasoning?.trim() ?? "",
      ]
        .filter(Boolean)
        .join(" "),
    );
  } else if (i.board.deferred) out.push(`Diagnosis deferred: ${i.board.deferred.reason.trim()}.`);

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

  const also = i.board.also.filter((r) => !hide(r));
  if (also.length)
    out.push(
      `Also this visit: ${also
        .map(
          (r) =>
            `${r.dx.display}${r.dx.code ? ` (${r.dx.code})` : ""}, ${status(r)}${
              r.dx.onProblemList ? ", on problem list" : ""
            }${parentOf(r) ? `, with ${lc(parentOf(r)!.dx.display)}` : ""}`,
        )
        .join("; ")}.`,
    );

  const left = [...new Set(i.unexplained.filter((f) => !hideF(f)).map((f) => lc(f.text)))];
  if ((lead || also.length) && left.length) out.push(`Not yet explained: ${list(left)}.`);
  return out.join("\n");
}

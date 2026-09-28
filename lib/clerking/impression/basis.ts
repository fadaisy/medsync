import type { AskRow } from "./ask";
import type { BoardRow, ImpressionDraft } from "./board";
import type { Column } from "./evidence";
import type { Finding, FindingRef } from "./facts";

import { lc, list } from "../compose";
import { pendingSuggestions } from "./evidence";

/**
 * The basis line under a differential row (§5.3): "For: … . Against: … . Not asked: … . To decide:
 * … (in plan)." Before anything is accepted: "Suggested: n for, m against. Open the matrix to
 * accept." Accepted evidence only (SI3). Pure.
 */

export interface BasisInput {
  row: BoardRow;
  column: Column | undefined;
  draft: ImpressionDraft;
  findings: ReadonlyMap<FindingRef, Finding>;
  asks: readonly AskRow[];
  /** Test id → display, and the tests already in the plan (draft orders for this diagnosis). */
  tests: { name(id: string): string | null; inPlan: ReadonlySet<string> };
}

export function basisLine(i: BasisInput): string {
  const acc = Object.entries(i.draft.evidence[i.row.dx.logicalId] ?? {});
  const named = (w: "for" | "against") =>
    acc
      .filter(([, a]) => a.w === w)
      .map(([ref]) => i.findings.get(ref)?.text)
      .filter((t): t is string => !!t)
      .map(lc);
  const f = named("for");
  const a = named("against");
  const parts: string[] = [];
  if (!acc.length && i.column) {
    const sf = [...i.column.suggested.values()].filter((w) => w === "for").length;
    const sa = [...i.column.suggested.values()].filter((w) => w === "against").length;
    if (sf || sa) parts.push(`Suggested: ${sf} for, ${sa} against. Open the matrix to accept.`);
  } else {
    if (f.length) parts.push(`For: ${list(f)}.`);
    if (a.length) parts.push(`Against: ${list(a)}.`);
    if (i.column && pendingSuggestions(i.column))
      parts.push(`${pendingSuggestions(i.column)} more suggested.`);
  }
  const notAsked = i.asks
    .filter((q) => q.forIds.includes(i.row.dx.logicalId))
    .map((q) => lc(q.label));
  if (notAsked.length)
    parts.push(
      `Not asked: ${list(notAsked.slice(0, 4))}${notAsked.length > 4 ? ` and ${notAsked.length - 4} more` : ""}.`,
    );
  const tests = (i.row.profile?.tests_to_decide ?? [])
    .map((id) => ({ id, name: i.tests.name(id) }))
    .filter((t): t is { id: string; name: string } => !!t.name);
  if (tests.length)
    parts.push(
      `To decide: ${list(tests.slice(0, 3).map((t) => `${t.name}${i.tests.inPlan.has(t.id) ? " (in plan)" : ""}`))}.`,
    );
  return parts.join(" ");
}

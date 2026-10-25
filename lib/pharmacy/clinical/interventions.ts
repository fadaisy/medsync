/**
 * Pharmacy Phase 3: intervention review (IV-1 to IV-5). Pure projections over Phase 1's queries and their events;
 * nothing is re-entered and no patient identifier is returned.
 */

export type Outcome = "changed" | "stopped" | "kept" | "clarified" | "withdrawn" | "open";

export interface QueryFact {
  id: string;
  typeCode: string;
  ward: string | null;
  intent: "asks_question" | "proposes_change";
  sentAt: Date;
  /** The answering or withdrawing event, if any (Phase 1 query events). */
  closed:
    | { kind: "answered"; answer: "keep" | "changed" | "stopped"; at: Date }
    | { kind: "withdrawn"; at: Date }
    | null;
}

/** IV-2, IV-2a. */
export function outcomeOf(q: QueryFact): Outcome {
  if (!q.closed) return "open";
  if (q.closed.kind === "withdrawn") return "withdrawn";
  if (q.closed.answer === "keep") return q.intent === "asks_question" ? "clarified" : "kept";
  return q.closed.answer;
}

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

export interface Row {
  sent: number;
  answered: number;
  changed: number;
  stopped: number;
  kept: number;
  clarified: number;
  withdrawn: number;
  open: number;
  /** Minutes from sent to answered; null with no answers. */
  medianMinutes: number | null;
}

function rowOf(qs: readonly QueryFact[]): Row {
  const out = qs.map(outcomeOf);
  const n = (o: Outcome) => out.filter((x) => x === o).length;
  const minutes = qs
    .filter((q) => q.closed?.kind === "answered")
    .map((q) => (q.closed!.at.getTime() - q.sentAt.getTime()) / 60_000);
  return {
    sent: qs.length,
    answered: n("changed") + n("stopped") + n("kept") + n("clarified"),
    changed: n("changed"),
    stopped: n("stopped"),
    kept: n("kept"),
    clarified: n("clarified"),
    withdrawn: n("withdrawn"),
    open: n("open"),
    medianMinutes: median(minutes),
  };
}

const groupBy = <K extends string>(qs: readonly QueryFact[], key: (q: QueryFact) => K) => {
  const m = new Map<K, QueryFact[]>();
  for (const q of qs) m.set(key(q), [...(m.get(key(q)) ?? []), q]);
  return [...m.entries()].map(([k, v]) => ({ key: k, ...rowOf(v) }));
};

/** IV-4: counts by type, ward and outcome for a period; no identifiers. */
export function interventionReport(qs: readonly QueryFact[], from: Date, to: Date) {
  const inPeriod = qs.filter((q) => q.sentAt >= from && q.sentAt < to);
  return {
    total: rowOf(inPeriod),
    byType: groupBy(inPeriod, (q) => q.typeCode).sort((a, b) => b.sent - a.sent),
    byWard: groupBy(inPeriod, (q) => q.ward ?? "none").sort((a, b) => b.sent - a.sent),
    waiting: inPeriod
      .filter((q) => !q.closed)
      .sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime())
      .map((q) => q.id),
  };
}

/** IV-5: types whose changed + stopped count meets the signed minimum; nothing while unsigned. */
export function checksWorthSigning(
  byType: readonly ({ key: string } & Row)[],
  minimum: number | null,
): { key: string; actedOn: number }[] {
  if (minimum === null) return [];
  return byType
    .map((r) => ({ key: r.key, actedOn: r.changed + r.stopped }))
    .filter((r) => r.actedOn >= minimum)
    .sort((a, b) => b.actedOn - a.actedOn);
}

/** IV-3: PCNE acceptance proposed from the outcome; a person confirms it. */
export const proposedAcceptance = (o: Outcome): "accepted" | "not_accepted" | null =>
  o === "changed" || o === "stopped" ? "accepted" : o === "kept" ? "not_accepted" : null;

/** S27: the CSV of counts by type, ward and month; no patient identifiers. */
export function countsCsv(qs: readonly QueryFact[]): string {
  const rows = new Map<string, Row>();
  const keyOf = (q: QueryFact) =>
    [q.typeCode, q.ward ?? "none", q.sentAt.toISOString().slice(0, 7)].join("\u0001");
  const groups = new Map<string, QueryFact[]>();
  for (const q of qs) groups.set(keyOf(q), [...(groups.get(keyOf(q)) ?? []), q]);
  for (const [k, v] of groups) rows.set(k, rowOf(v));
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return [
    "type,ward,month,sent,answered,changed,stopped,kept,clarified,withdrawn,open",
    ...[...rows.entries()].map(([k, r]) =>
      [
        ...k.split("\u0001").map(esc),
        r.sent,
        r.answered,
        r.changed,
        r.stopped,
        r.kept,
        r.clarified,
        r.withdrawn,
        r.open,
      ].join(","),
    ),
  ].join("\n");
}

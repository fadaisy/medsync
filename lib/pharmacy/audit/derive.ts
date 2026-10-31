/**
 * The audit trail (rework PRD §6.6, prototype audit.js `audit`, `canFix`, the "who did what" table), ported logic for
 * logic. One timeline from the ledger and from the other areas' event tables (read as jsonb rows, so a table another
 * area has not shipped yet simply adds nothing). Pure.
 */
export type AuditCat = "rx" | "stock" | "cd" | "check" | "ho" | "case" | "corr" | "cold" | "loss";
export const AUDIT_CATS: readonly AuditCat[] = [
  "rx",
  "stock",
  "cd",
  "check",
  "ho",
  "case",
  "corr",
  "cold",
  "loss",
];
export type AuditTag =
  | "late"
  | "no_witness"
  | "paper_witness"
  | "corrected"
  | "not_matching"
  | "escalated";
/** Tags that count as "flagged" and show in amber. */
export const FLAG_TAGS: readonly AuditTag[] = [
  "late",
  "no_witness",
  "paper_witness",
  "corrected",
  "not_matching",
  "escalated",
];

/** One ledger line as the audit reads it. */
export interface AuditMovement {
  id: string;
  kind: string;
  quantity: number;
  effectiveAt: string;
  recordedAt: string;
  late: boolean;
  downtime: boolean;
  paperWitness: string | null;
  reasonCode: string | null;
  reasonNote: string | null;
  reversesId: string | null;
  correctionOfId: string | null;
  actorId: string;
  who: string | null;
  witness: string | null;
  batchId: string;
  batchNumber: string;
  productId: string;
  product: string;
  unit: string;
  controlled: boolean;
  placeId: string | null;
  place: string | null;
  /** The batch's balance now (a reversal of stock that came in needs it there). */
  batchBalance: number;
  /** The reversal of this line, when it was corrected. */
  correctedAt: string | null;
  correctedBy: string | null;
  correctedWhy: string | null;
}

export interface AuditEvent {
  key: string;
  at: string;
  happened: string | null;
  who: string | null;
  cat: AuditCat;
  /** A word key: a movement kind (`kind:<kind>`) or a source action (`src:<table>`), mapped to words by the page. */
  action: string;
  detail: string;
  place: string | null;
  witness: string | null;
  reason: string | null;
  tags: AuditTag[];
  move: AuditMovement | null;
}

/** Kinds a person may correct (PRD §6.6: hand over, administer, receive, wastage, returned). Paired kinds are not. */
export const CORRECTABLE = [
  "supplied",
  "received",
  "ward_used",
  "cart_used",
  "written_off",
  "returned_in",
] as const;
const NO_WITNESS_EXEMPT = new Set(["count_correction", "adjusted", "quarantined_out", "reversed"]);

export function movementEvent(m: AuditMovement): AuditEvent {
  const tags: AuditTag[] = [];
  if (m.late && !m.correctionOfId) tags.push("late");
  if (
    m.controlled &&
    m.quantity < 0 &&
    !NO_WITNESS_EXEMPT.has(m.kind) &&
    !m.witness &&
    !m.paperWitness
  )
    tags.push("no_witness");
  if (m.paperWitness) tags.push("paper_witness");
  if (m.correctedAt) tags.push("corrected");
  const corr = !!m.reversesId || !!m.correctionOfId;
  return {
    key: `m:${m.id}`,
    at: m.recordedAt,
    happened: m.effectiveAt !== m.recordedAt ? m.effectiveAt : null,
    who: m.who,
    cat: corr ? "corr" : m.controlled ? "cd" : "stock",
    action: m.reversesId ? "kind:reversal" : `kind:${m.kind}`,
    detail: `${m.product} · ${Math.abs(m.quantity)} ${m.unit} · ${m.batchNumber}${m.place ? ` · ${m.place}` : ""}`,
    place: m.place,
    witness: m.witness ?? m.paperWitness,
    reason: m.reasonCode,
    tags,
    move: m,
  };
}

/** A row of another area's table, read as jsonb. Keys differ per table, so each is read with fallbacks. */
export interface SourceRow {
  src: string;
  j: Record<string, unknown>;
  who: string | null;
}

/** Where each source sits in the timeline. Add a table here (one line) when its area ships it. */
export const AUDIT_SOURCES: Record<string, AuditCat> = {
  pharmacy_counts: "check",
  pharmacy_cd_checks: "check",
  pharmacy_shift_handovers: "ho",
  pharmacy_case_events: "case",
  pharmacy_excursion_acks: "cold",
  pharmacy_risk_actions: "loss",
  pharmacy_rx_checks: "rx",
};

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
const iso = (s: string | null) => (s ? new Date(s).toISOString() : null);
export const atOf = (j: Record<string, unknown>) =>
  iso(str(j.created_at) ?? str(j.counted_at) ?? str(j.acted_at) ?? str(j.at) ?? str(j.recorded_at));

export function sourceEvent(r: SourceRow): AuditEvent | null {
  const at = atOf(r.j);
  const cat = AUDIT_SOURCES[r.src];
  if (!at || !cat) return null;
  const sub = str(r.j.kind) ?? str(r.j.action);
  const tags: AuditTag[] = [];
  if (r.j.late === true) tags.push("late");
  if (sub === "escalated") tags.push("escalated");
  return {
    key: `${r.src}:${str(r.j.id) ?? at}`,
    at,
    happened: iso(str(r.j.happened_at) ?? str(r.j.slot_at)),
    who: r.who,
    cat,
    action: sub ? `src:${r.src}:${sub}` : `src:${r.src}`,
    detail:
      [str(r.j.what), str(r.j.code), str(r.j.answer), str(r.j.shake_test), str(r.j.batch_number)]
        .filter(Boolean)
        .join(" · ") || "",
    place: null,
    witness: null,
    reason: str(r.j.note) ?? str(r.j.reason) ?? str(r.j.notes),
    tags,
    move: null,
  };
}

/** Newest first. */
export const timeline = (
  moves: readonly AuditMovement[],
  rows: readonly SourceRow[],
): AuditEvent[] =>
  [...moves.map(movementEvent), ...rows.flatMap((r) => sourceEvent(r) ?? [])].sort((a, b) =>
    a.at < b.at ? 1 : a.at > b.at ? -1 : 0,
  );

/** Correct is offered on own entries (in-charge: any), on a correctable kind, once, and only where the stock allows. */
export function canCorrect(m: AuditMovement, me: { userId: string; inCharge: boolean }): boolean {
  return (
    (CORRECTABLE as readonly string[]).includes(m.kind) &&
    !m.reversesId &&
    !m.correctionOfId &&
    !m.correctedAt &&
    (m.quantity < 0 || m.batchBalance >= m.quantity) &&
    (me.inCharge || m.actorId === me.userId)
  );
}

export interface AuditFilter {
  cat: AuditCat | "all";
  who: string | null;
  flagged: boolean;
}

export const filterEvents = (events: readonly AuditEvent[], f: AuditFilter) =>
  events.filter(
    (e) =>
      (f.cat === "all" || e.cat === f.cat) &&
      (!f.who || e.who === f.who) &&
      (!f.flagged || e.tags.length > 0),
  );

export interface PersonSum {
  who: string;
  n: number;
  late: number;
  noWitness: number;
  corrections: number;
}

const sum = (who: string, es: readonly AuditEvent[]): PersonSum => ({
  who,
  n: es.length,
  late: es.filter((e) => e.tags.includes("late")).length,
  noWitness: es.filter((e) => e.tags.includes("no_witness")).length,
  corrections: es.filter((e) => e.cat === "corr").length,
});

/** "Who did what": the busiest eight, and one person's figures with a breakdown by kind of action. */
export function whoDidWhat(events: readonly AuditEvent[], top = 8): PersonSum[] {
  const people = [...new Set(events.map((e) => e.who).filter((w): w is string => !!w))];
  return people
    .map((p) =>
      sum(
        p,
        events.filter((e) => e.who === p),
      ),
    )
    .sort((a, b) => b.n - a.n)
    .slice(0, top);
}

export function personView(events: readonly AuditEvent[], who: string) {
  const mine = events.filter((e) => e.who === who);
  return {
    ...sum(who, mine),
    byCat: AUDIT_CATS.map((k) => ({ k, v: mine.filter((e) => e.cat === k).length })).filter(
      (x) => x.v > 0,
    ),
  };
}

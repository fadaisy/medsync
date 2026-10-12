import type { PrescriptionLane } from "./lanes";

import { DEFAULT_TIME_ZONE, startOfLocalDay } from "@/supabase/functions/_shared/slots";

/**
 * Line stages and outcomes (Pharmacy Phase 1; LO-1..LO-9, gate-a-proposal §3, H1). Pure: a line's
 * status is a fold of `applyMove` over its append-only record (the line's entry and co-sign, its
 * pharmacy_line_events, the queries that cover it and the prescriber's state change), in the order
 * recorded. `MOVES` is LO-4's table as data and the only source of moves: anything outside it is
 * refused and never applied. No function here reads a clock (LO-5).
 *
 * A version is a prescription row (STOP 0). H1: a row the prescriber did not continue at visit close
 * (`completed`) takes `cancelled_by_prescriber`; a `cancelled` row whose cancellation names a
 * replacement is `replaced`.
 */

export type Stage = "awaiting_cosign" | "to_review" | "queried" | "ready";
export type OpenOutcome = "owed" | "buying_outside";
export type ClosedOutcome =
  | "supplied"
  | "cancelled_by_prescriber"
  | "replaced"
  | "declined"
  | "closed"
  | "reviewed";

export type LineStatus =
  | { kind: "stage"; stage: Stage }
  | { kind: "open"; outcome: OpenOutcome; supplied: number; notSupplied: number | null }
  | { kind: "closed"; outcome: ClosedOutcome; reasonCode?: string };

/** LO-1: least to most advanced. */
export const STAGES: readonly Stage[] = ["awaiting_cosign", "to_review", "queried", "ready"];
export const OPEN_OUTCOMES: readonly OpenOutcome[] = ["owed", "buying_outside"];
export const CLOSED_OUTCOMES: readonly ClosedOutcome[] = [
  "supplied",
  "cancelled_by_prescriber",
  "replaced",
  "declined",
  "closed",
  "reviewed",
];

/** A status as a key of the table; "new" is a line in scope that has not entered yet. */
export type StatusKey = "new" | Stage | OpenOutcome | ClosedOutcome;
export const STATUS_KEYS: readonly StatusKey[] = [
  "new",
  ...STAGES,
  ...OPEN_OUTCOMES,
  ...CLOSED_OUTCOMES,
];

/** H1: the reason a `completed` row carries. */
export const NOT_CONTINUED_AT_VISIT_CLOSE = "not_continued_at_visit_close";

/** The Event column of LO-4, one name per row (or per branch of a row). */
export const MOVE_KINDS = [
  "enter_cosign_needed",
  "enter",
  "cosigned",
  "cosigned_query_open",
  "query_sent",
  "accepted", // pharmacist-first: accepted · standard: decision saved · D-PH1-05: reason recorded
  "record_owed",
  "record_buying_outside",
  "lane_pharmacist_first", // LN-8
  "handover_full",
  "handover_part_owed",
  "handover_part_outside",
  "query_answered", // keep, or a whole-prescription "changed" that left this line alone
  "query_withdrawn",
  "query_reopened", // RQ-7 dispute
  "declined",
  "prescriber_changed",
  "prescriber_cancelled",
  "handover_part",
  "to_buying_outside",
  "to_owed",
  "filled_elsewhere",
  "closed",
  "closed_not_collected",
  "returned", // reversed the same day, or recorded in error
  "downtime_supplied", // DT-3
  "downtime_part_owed",
  "downtime_part_outside",
  "downtime_not_supplied_owed", // DT-9
  "downtime_not_supplied_outside",
  "reviewed", // review-only ward line
] as const;
export type MoveKind = (typeof MOVE_KINDS)[number];

/** A condition in the Event column, read from the facts the fold worked out and put on the move. */
export type Guard = "cleared" | "query_sent" | "written_before_today" | "by_handover";

export interface Move {
  kind: MoveKind;
  quantitySupplied?: number | null;
  quantityNotSupplied?: number | null;
  reasonCode?: string | null;
  /** Standard lane, or accepted, or D-PH1-05's reason recorded. */
  cleared?: boolean;
  /** LO-7: a query was sent on this version. */
  querySent?: boolean;
  writtenBeforeToday?: boolean;
  /** `returned`: the status immediately before the hand-over being reversed. */
  previous?: LineStatus;
}

export interface MoveRule {
  from: readonly StatusKey[];
  move: MoveKind;
  to: StatusKey | "previous";
  guard?: Guard;
  reasonCode?: string;
}

const ANY_STAGE = STAGES;
const ANY_OPEN = OPEN_OUTCOMES;

/** LO-4, row for row. Each (from, move) pair appears at most once. */
export const MOVES: readonly MoveRule[] = [
  { from: ["new"], move: "enter_cosign_needed", to: "awaiting_cosign" },
  { from: ["new"], move: "enter", to: "to_review" },
  { from: ["awaiting_cosign"], move: "cosigned", to: "to_review" },
  { from: ["awaiting_cosign"], move: "cosigned_query_open", to: "queried" },
  { from: ["to_review", "ready"], move: "query_sent", to: "queried" },
  { from: ["awaiting_cosign"], move: "query_sent", to: "awaiting_cosign" },
  { from: ["to_review"], move: "accepted", to: "ready" },
  { from: ["to_review", "ready"], move: "record_owed", to: "owed", guard: "cleared" },
  {
    from: ["to_review", "ready"],
    move: "record_buying_outside",
    to: "buying_outside",
    guard: "cleared",
  },
  { from: ["ready"], move: "lane_pharmacist_first", to: "to_review" },
  { from: ["ready"], move: "handover_full", to: "supplied" },
  { from: ["ready"], move: "handover_part_owed", to: "owed" },
  { from: ["ready"], move: "handover_part_outside", to: "buying_outside" },
  { from: ["queried"], move: "query_answered", to: "to_review" },
  { from: ["to_review", "ready"], move: "query_reopened", to: "queried" },
  { from: ["queried"], move: "declined", to: "declined" },
  { from: ["queried"], move: "query_withdrawn", to: "to_review" },
  { from: ["to_review"], move: "declined", to: "declined", guard: "query_sent" },
  { from: [...ANY_STAGE, ...ANY_OPEN], move: "prescriber_changed", to: "replaced" },
  {
    from: [...ANY_STAGE, ...ANY_OPEN],
    move: "prescriber_cancelled",
    to: "cancelled_by_prescriber",
  },
  { from: ANY_OPEN, move: "handover_full", to: "supplied" },
  { from: ["owed"], move: "handover_part", to: "owed" },
  { from: ["buying_outside"], move: "handover_part", to: "buying_outside" },
  { from: ["owed"], move: "to_buying_outside", to: "buying_outside" },
  { from: ["buying_outside"], move: "to_owed", to: "owed" },
  {
    from: ["buying_outside"],
    move: "filled_elsewhere",
    to: "closed",
    reasonCode: "filled_elsewhere",
  },
  { from: ANY_OPEN, move: "closed", to: "closed" },
  {
    from: ANY_STAGE,
    move: "closed_not_collected",
    to: "closed",
    guard: "written_before_today",
    reasonCode: "not_collected",
  },
  { from: ["supplied", ...ANY_OPEN], move: "returned", to: "previous", guard: "by_handover" },
  { from: [...ANY_STAGE, ...ANY_OPEN], move: "downtime_supplied", to: "supplied" },
  { from: [...ANY_STAGE, ...ANY_OPEN], move: "downtime_part_owed", to: "owed" },
  { from: [...ANY_STAGE, ...ANY_OPEN], move: "downtime_part_outside", to: "buying_outside" },
  { from: ANY_STAGE, move: "downtime_not_supplied_owed", to: "owed" },
  { from: ANY_STAGE, move: "downtime_not_supplied_outside", to: "buying_outside" },
  { from: ["to_review"], move: "reviewed", to: "reviewed" },
];

export const keyOf = (s: LineStatus | null): StatusKey =>
  s === null ? "new" : s.kind === "stage" ? s.stage : s.outcome;

export const ruleFor = (from: StatusKey, move: MoveKind): MoveRule | undefined =>
  MOVES.find((r) => r.move === move && r.from.includes(from));

const GUARD: Record<Guard, (m: Move) => boolean> = {
  cleared: (m) => m.cleared === true,
  query_sent: (m) => m.querySent === true,
  written_before_today: (m) => m.writtenBeforeToday === true,
  by_handover: (m) => m.previous !== undefined,
};

/** Live supplies of what was not supplied: never more than is left (LO-9). Downtime records (DT-10). */
const LIVE_SUPPLY = new Set<MoveKind>(["handover_full", "handover_part"]);
const HANDOVER = new Set<MoveKind>([
  "handover_full",
  "handover_part_owed",
  "handover_part_outside",
  "handover_part",
  "downtime_supplied",
  "downtime_part_owed",
  "downtime_part_outside",
]);

const isStage = (k: StatusKey): k is Stage => (STAGES as readonly string[]).includes(k);
const isOpen = (k: StatusKey): k is OpenOutcome => (OPEN_OUTCOMES as readonly string[]).includes(k);

export type MoveResult =
  | { ok: true; status: LineStatus }
  | { ok: false; reason: "not_allowed" | "over_quantity" };

/** One move under LO-4's table; anything else is refused and the status is unchanged. */
export function applyMove(status: LineStatus | null, move: Move): MoveResult {
  const rule = ruleFor(keyOf(status), move.kind);
  if (!rule || (rule.guard && !GUARD[rule.guard](move)))
    return { ok: false, reason: "not_allowed" };
  if (rule.to === "previous") return { ok: true, status: move.previous! };
  const to = rule.to;
  if (to === "new") return { ok: false, reason: "not_allowed" };
  if (isStage(to)) return { ok: true, status: { kind: "stage", stage: to } };

  const q = move.quantitySupplied ?? 0;
  const prior = status?.kind === "open" ? status : null;
  if (prior && LIVE_SUPPLY.has(move.kind) && prior.notSupplied !== null && q > prior.notSupplied)
    return { ok: false, reason: "over_quantity" };

  if (!isOpen(to)) {
    const reasonCode = rule.reasonCode ?? move.reasonCode ?? undefined;
    return {
      ok: true,
      status: { kind: "closed", outcome: to, ...(reasonCode ? { reasonCode } : {}) },
    };
  }
  if (!prior)
    return {
      ok: true,
      status: {
        kind: "open",
        outcome: to,
        supplied: q,
        notSupplied: move.quantityNotSupplied ?? null,
      },
    };
  if (move.kind === "handover_part")
    return {
      ok: true,
      status: {
        ...prior,
        supplied: prior.supplied + q,
        notSupplied: prior.notSupplied === null ? null : prior.notSupplied - q,
      },
    };
  if (move.kind === "to_owed" || move.kind === "to_buying_outside")
    return { ok: true, status: { ...prior, outcome: to } };
  // After downtime from an open outcome: the sheet shows what is still not supplied.
  return {
    ok: true,
    status: {
      kind: "open",
      outcome: to,
      supplied: prior.supplied + q,
      notSupplied: move.quantityNotSupplied ?? null,
    },
  };
}

/* ─── The record a status is folded from ─────────────────────────────── */

/** The kinds allowed by 0125's CHECK on pharmacy_line_events.kind. */
export const LINE_EVENT_KINDS = [
  "accepted",
  "accepted_overridden_stop",
  "reviewed",
  "decision_saved",
  "decision_cleared",
  "supplied_without_review",
  "owed",
  "buying_outside",
  "open_outcome_changed",
  "supplied",
  "part_supplied",
  "declined",
  "closed",
  "closed_not_collected",
  "filled_elsewhere",
  "replaced",
  "cancelled_by_prescriber",
  "returned",
  "patient_reported",
] as const;
export type LineEventKind = (typeof LINE_EVENT_KINDS)[number];

/**
 * One pharmacy_line_events row. A part hand-over from `ready` is written as `owed` or `buying_outside`
 * carrying the hand-over and the quantity supplied; `part_supplied` is a part of what was not
 * supplied. `enteredAfterDowntime` comes from the row's hand-over (or sheet) and marks DT-3 / DT-9.
 */
export interface PharmacyLineEvent {
  id: string;
  kind: LineEventKind;
  occurredAt: Date;
  effectiveAt: Date;
  lane: PrescriptionLane | null;
  quantitySupplied: number | null;
  quantityNotSupplied: number | null;
  reasonCode: string | null;
  handoverId: string | null;
  actorCadre: string | null;
  enteredAfterDowntime?: boolean;
}

export interface LineInput {
  /** The prescription row: the line version. */
  id: string;
  state: "active" | "administered" | "completed" | "cancelled";
  cosign: "none" | "awaiting" | "signed" | "withheld";
  createdAt: Date;
  /** When the co-sign was given; the line's createdAt when not known. */
  cosignedAt?: Date | null;
  /** When `state` left active (updated_at); null puts the prescriber's move after everything else. */
  stateChangedAt?: Date | null;
  /** LO-6: a pharmacist-first ward line with individual inpatient supply off. */
  reviewOnly?: boolean;
  cancellation?: { replacedBy: string | null; reasonCode: string } | null;
}

/** A query to the prescriber (pharmacy_queries) with the events that change its state (RQ-2). */
export interface QueryLite {
  id: string;
  scope: "line" | "prescription";
  /** The line versions it covers: its one line, or every line of the prescription when sent. */
  lineIds: readonly string[];
  sentAt: Date;
  /** pharmacy_query_events; only answered, disputed and withdrawn change state (RQ-7, RQ-8). */
  events: readonly { kind: string; at: Date; answer?: "keep" | "changed" | "stopped" | null }[];
}

export type QueryState = "not_sent_yet" | "open" | "answered" | "withdrawn";

/** RQ-2 at a point in the record (not a clock): open after sending, until answered or withdrawn. */
export function queryState(q: QueryLite, at = Infinity): QueryState {
  if (q.sentAt.getTime() > at) return "not_sent_yet";
  let state: QueryState = "open";
  for (const e of [...q.events].sort((a, b) => a.at.getTime() - b.at.getTime())) {
    if (e.at.getTime() > at || state === "withdrawn") break;
    if (e.kind === "answered") state = "answered";
    else if (e.kind === "disputed") state = "open";
    else if (e.kind === "withdrawn") state = "withdrawn";
  }
  return state;
}

const covering = (lineId: string, queries: readonly QueryLite[]) =>
  queries.filter((q) => q.lineIds.includes(lineId));

/** An open query covers the line (by itself or as part of the whole prescription). */
export const hasOpenQuery = (lineId: string, queries: readonly QueryLite[]): boolean =>
  covering(lineId, queries).some((q) => queryState(q) === "open");

/** LO-7: a line can be declined only once a query was sent on its current version. */
export const canDecline = (lineId: string, queries: readonly QueryLite[]): boolean =>
  covering(lineId, queries).length > 0;

const ACCEPTING = new Set<LineEventKind>([
  "accepted",
  "accepted_overridden_stop",
  "reviewed",
  "supplied_without_review",
]);

/** LO-1, LO-4: the line's one stage or outcome, folded from its record in the order recorded. */
export function lineStatus(
  line: LineInput,
  events: readonly PharmacyLineEvent[],
  queries: readonly QueryLite[],
  lane: PrescriptionLane,
): LineStatus {
  const mine = covering(line.id, queries);
  const fold: { status: LineStatus | null } = { status: null };
  let cleared = false; // an acceptance, or D-PH1-05's reason, on this version
  const handovers: { id: string; before: LineStatus }[] = [];

  const apply = (move: Move, handoverId: string | null = null) => {
    const r = applyMove(fold.status, move);
    if (!r.ok) return;
    if (move.kind === "returned") handovers.pop();
    else if (HANDOVER.has(move.kind) && handoverId && fold.status)
      handovers.push({ id: handoverId, before: fold.status });
    else handovers.length = 0; // a later move means the open outcome was not reached by that hand-over
    fold.status = r.status;
  };
  const laneMove = (l: PrescriptionLane) => {
    if (l === "pharmacist_first" && !cleared) apply({ kind: "lane_pharmacist_first" });
  };
  // Another query still covers the line: answering or withdrawing this one leaves it queried.
  const otherOpen = (q: QueryLite, t: number) =>
    mine.some((o) => o !== q && queryState(o, t) === "open");

  const lineEvent = (e: PharmacyLineEvent) => {
    if (e.lane) laneMove(e.lane);
    if (ACCEPTING.has(e.kind)) cleared = true;
    const laneAt = e.lane ?? lane;
    const q = {
      quantitySupplied: e.quantitySupplied,
      quantityNotSupplied: e.quantityNotSupplied,
      reasonCode: e.reasonCode,
    };
    const open = fold.status?.kind === "open" ? fold.status.outcome : null;
    switch (e.kind) {
      case "accepted":
      case "accepted_overridden_stop":
        return apply({ kind: line.reviewOnly ? "reviewed" : "accepted" });
      case "reviewed":
        return apply({ kind: "reviewed" });
      case "supplied_without_review":
        return apply({ kind: "accepted", reasonCode: e.reasonCode });
      case "decision_saved":
        return laneAt === "standard" ? apply({ kind: "accepted" }) : undefined;
      case "decision_cleared":
      case "patient_reported":
        return;
      case "owed":
      case "buying_outside": {
        const outside = e.kind === "buying_outside";
        if (e.enteredAfterDowntime) {
          const part = (e.quantitySupplied ?? 0) > 0;
          const kind = part
            ? outside
              ? "downtime_part_outside"
              : "downtime_part_owed"
            : outside
              ? "downtime_not_supplied_outside"
              : "downtime_not_supplied_owed";
          return apply({ kind, ...q }, e.handoverId);
        }
        if (e.handoverId)
          return apply(
            { kind: outside ? "handover_part_outside" : "handover_part_owed", ...q },
            e.handoverId,
          );
        if (open && open !== e.kind)
          return apply({ kind: outside ? "to_buying_outside" : "to_owed" });
        return apply({
          kind: outside ? "record_buying_outside" : "record_owed",
          ...q,
          cleared: laneAt === "standard" || cleared,
        });
      }
      case "open_outcome_changed":
        return apply({ kind: open === "owed" ? "to_buying_outside" : "to_owed" });
      case "supplied":
        return apply(
          { kind: e.enteredAfterDowntime ? "downtime_supplied" : "handover_full", ...q },
          e.handoverId,
        );
      case "part_supplied":
        return apply({ kind: "handover_part", ...q }, e.handoverId);
      case "declined":
        return apply({
          kind: "declined",
          reasonCode: e.reasonCode,
          querySent: mine.some((x) => x.sentAt.getTime() <= e.occurredAt.getTime()),
        });
      case "closed":
        return apply({ kind: "closed", reasonCode: e.reasonCode });
      case "closed_not_collected":
        return apply({
          kind: "closed_not_collected",
          writtenBeforeToday:
            startOfLocalDay(e.effectiveAt, DEFAULT_TIME_ZONE).getTime() > line.createdAt.getTime(),
        });
      case "filled_elsewhere":
        return apply({ kind: "filled_elsewhere" });
      case "replaced":
        return apply({ kind: "prescriber_changed" });
      case "cancelled_by_prescriber":
        return apply({ kind: "prescriber_cancelled", reasonCode: e.reasonCode });
      case "returned": {
        const top = handovers.at(-1);
        return apply({
          kind: "returned",
          ...(top && top.id === e.handoverId ? { previous: top.before } : {}),
        });
      }
    }
  };

  const prescriberMove = (): Move | null => {
    if (line.state === "completed")
      return { kind: "prescriber_cancelled", reasonCode: NOT_CONTINUED_AT_VISIT_CLOSE };
    if (line.state !== "cancelled") return null;
    if (line.cancellation?.replacedBy) return { kind: "prescriber_changed" };
    return { kind: "prescriber_cancelled", reasonCode: line.cancellation?.reasonCode ?? null };
  };

  // The record, in the order it was written; ties keep this order (entry, co-sign, queries, events).
  const items: { at: number; run: () => void }[] = [];
  const t0 = line.createdAt.getTime();
  items.push({
    at: t0,
    run: () => apply({ kind: line.cosign === "none" ? "enter" : "enter_cosign_needed" }),
  });
  if (line.cosign === "signed") {
    const at = line.cosignedAt?.getTime() ?? t0;
    items.push({
      at,
      run: () =>
        apply({
          kind: mine.some((q) => queryState(q, at) === "open") ? "cosigned_query_open" : "cosigned",
        }),
    });
  }
  for (const q of mine) {
    items.push({ at: q.sentAt.getTime(), run: () => apply({ kind: "query_sent" }) });
    for (const e of q.events) {
      const at = e.at.getTime();
      const kind: MoveKind | null =
        e.kind === "disputed"
          ? "query_reopened"
          : e.kind === "withdrawn"
            ? "query_withdrawn"
            : e.kind === "answered" && (e.answer === "keep" || e.answer === "changed")
              ? "query_answered"
              : null; // "stopped" acts through the prescriber's cancel
      if (kind)
        items.push({
          at,
          run: () => (kind === "query_reopened" || !otherOpen(q, at) ? apply({ kind }) : undefined),
        });
    }
  }
  for (const e of events) items.push({ at: e.occurredAt.getTime(), run: () => lineEvent(e) });
  const pm = prescriberMove();
  if (pm) items.push({ at: line.stateChangedAt?.getTime() ?? Infinity, run: () => apply(pm) });

  for (const item of items.sort((a, b) => a.at - b.at)) item.run();
  laneMove(lane); // LN-8, for the prescription as it now stands
  // A line in scope always has a status; it only stays null if its entry was refused, which cannot happen.
  return fold.status ?? { kind: "stage", stage: "to_review" };
}

/* ─── Projections ─────────────────────────────────────────────────── */

/** LO-3: the prescription is in the queue while any line has a stage. */
export const inQueue = (statuses: readonly LineStatus[]): boolean =>
  statuses.some((s) => s.kind === "stage");

/** LO-3: a line with an open outcome is listed in Open lines. */
export const inOpenLines = (status: LineStatus): boolean => status.kind === "open";

/** LO-1: the prescription's stage cell is its least advanced line stage. */
export function leastAdvanced(stages: readonly Stage[]): Stage | null {
  if (!stages.length) return null;
  return stages.reduce((a, b) => (STAGES.indexOf(b) < STAGES.indexOf(a) ? b : a));
}

/** LO-9: what is left to supply, where that is recorded. */
export function quantityLeft(status: LineStatus, decided: number | null): number | null {
  if (status.kind === "closed") return 0;
  if (status.kind === "stage") return decided;
  if (status.notSupplied !== null) return status.notSupplied;
  return decided === null ? null : Math.max(0, decided - status.supplied);
}

export type ScopeOrigin = "window" | "ward" | "emergency";
export type LineScope = "out" | "supply" | "review_only";

/**
 * LO-6. Window: written at or after the first live point, or brought in by a person. Ward: the same
 * terms with individual inpatient supply on; with it off, only pharmacist-first, and review-only.
 * Emergency: never (PQ-4).
 */
export function inScope(p: {
  writtenAt: Date;
  firstLiveAt: Date | null;
  broughtIn: boolean;
  lane: PrescriptionLane;
  origin: ScopeOrigin;
  inpatientSupply: boolean;
}): LineScope {
  if (p.origin === "emergency") return "out";
  const live =
    p.broughtIn || (p.firstLiveAt !== null && p.writtenAt.getTime() >= p.firstLiveAt.getTime());
  if (!live) return "out";
  if (p.origin === "window" || p.inpatientSupply) return "supply";
  return p.lane === "pharmacist_first" ? "review_only" : "out";
}

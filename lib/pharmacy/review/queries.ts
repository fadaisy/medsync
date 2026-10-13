import type { LineStatus, MoveKind } from "@/lib/pharmacy/lines";

import { keyOf, queryState, ruleFor } from "@/lib/pharmacy/lines";
import { printTime } from "@/lib/pharmacy/print/label";

/**
 * Queries to the prescriber (Pharmacy Phase 1; RQ-2..RQ-8, RQ-10, RQ-11, 5.4, gate-a-proposal §6). Pure:
 * the caller brings the query's events and the statuses of the lines it covers; the moves returned are
 * LO-4's own (`lines.ts`), filtered by its table, so nothing here invents a state.
 *
 * - RQ-2 A query's state is folded from append-only events: not sent, open, answered (a dispute reopens).
 * - RQ-3 Recipients: the prescriber, and the responsible clinician if a different person. An inactive one
 *   is skipped and listed. Nobody left: the query is `not_sent` and the pharmacy is told to call.
 * - RQ-4, RQ-5 Answers move lines: keep → to review; changed → the changed lines are replaced (each names
 *   its replacement, H4), the others return to review; stopped → cancelled by the prescriber. On a query
 *   about the whole prescription, changing one line does not close it; "Changes made" does.
 * - RQ-6 The first answer wins; any later attempt is shown the first and writes nothing.
 * - RQ-7 A phone "keep" from a clinician who may prescribe answers `via: phone`; any other phone answer is
 *   `call_logged` and changes nothing. A dispute reopens: to review / ready → queried; a line already
 *   supplied stays and goes to the look-back list.
 * - RQ-8 `seen` is never shown to the pharmacy as an answer.
 * - RQ-10 No escalation: nothing here reads a clock, so an unanswered query reads the same tomorrow.
 * - RQ-11 A not-supplied notice is of the same family and needs no answer.
 * Words: Appendix B (B-22, B-23, B-24, B-27) and gate-a-proposal §6, signed 13 Oct 2026.
 */

export const QUERY_COPY = {
  status: "signed",
  signedBy: "Fadhul (CSO)",
  signedOn: "2026-10-13",
  sent: "Query sent {time} · not answered",
  notTold: "The prescriber has NOT been told. Call them and log the call.",
  nobody: "Nobody can be told in MedSync. Call the ward or clinic.",
  phoneKeep: "Answered by phone: kept as written ({cadre}, {time}). Logged by {cadre2}.",
  /** gate-a-proposal §6 names the content ("the answer, its coded reason, who and when"), not the words. */
  answered: "Answered: {answer} ({cadre}, {time}).",
  withdrawn: "Query withdrawn {time}.",
  notSupplied:
    "From the pharmacy, {time}. {Medicine} was not supplied: {reason}. {What the patient was told}.",
} as const;

const ANSWER_WORDS: Record<Answer, string> = {
  keep: "kept as written",
  changed: "changed",
  stopped: "stopped",
};

const fill = (s: string, v: Record<string, string>) =>
  s.replace(/\{([\w ]+)\}/g, (m, k: string) => v[k] ?? m);
const time = (at: Date) => printTime(at.toISOString());

/* ─── RQ-3: who receives it ─────────────────────────────────────────── */

export type RecipientRole = "prescriber" | "responsible_clinician";

export function resolveRecipients(input: {
  prescriberUserId: string | null;
  prescriberActive: boolean;
  responsibleClinicianUserId: string | null;
  responsibleActive: boolean;
}): {
  recipients: { userId: string; role: RecipientRole }[];
  skipped: { userId: string; role: RecipientRole; why: "inactive" }[];
} {
  const candidates: { userId: string | null; role: RecipientRole; active: boolean }[] = [
    { userId: input.prescriberUserId, role: "prescriber", active: input.prescriberActive },
    {
      userId: input.responsibleClinicianUserId,
      role: "responsible_clinician",
      active: input.responsibleActive,
    },
  ];
  const seen = new Set<string>();
  const recipients: { userId: string; role: RecipientRole }[] = [];
  const skipped: { userId: string; role: RecipientRole; why: "inactive" }[] = [];
  for (const c of candidates) {
    if (!c.userId || seen.has(c.userId)) continue; // the same person once, as the prescriber
    seen.add(c.userId);
    if (c.active) recipients.push({ userId: c.userId, role: c.role });
    else skipped.push({ userId: c.userId, role: c.role, why: "inactive" });
  }
  return { recipients, skipped };
}

/* ─── RQ-2, RQ-8: what the pharmacy sees ───────────────────────────── */

export type Answer = "keep" | "changed" | "stopped";

/** One pharmacy_query_events row, as the pharmacy reads it (0125's kinds). */
export interface QueryEvent {
  kind:
    | "notified"
    | "skipped"
    | "notify_failed"
    | "seen"
    | "call_logged"
    | "answered"
    | "disputed"
    | "withdrawn"
    | "not_supplied_acknowledged";
  at: Date;
  answer?: Answer | null;
  via?: "app" | "phone" | null;
  answerReasonCode?: string | null;
  /** The answering clinician's cadre (never their name on a pharmacy screen). */
  answeredByCadre?: string | null;
  /** The pharmacy user who logged a phone answer, by cadre. */
  loggedByCadre?: string | null;
}

export type PharmacyQueryState = "not_sent" | "open" | "answered" | "withdrawn";

export interface StandingAnswer {
  answer: Answer;
  via: "app" | "phone";
  reasonCode: string | null;
  at: Date;
  byCadre: string | null;
  loggedByCadre: string | null;
}

/** RQ-6: the answer that stands (the last one no dispute followed), or null. */
export function standingAnswer(events: readonly QueryEvent[]): StandingAnswer | null {
  let current: StandingAnswer | null = null;
  for (const e of [...events].sort((a, b) => a.at.getTime() - b.at.getTime())) {
    if (e.kind === "answered" && e.answer)
      current = {
        answer: e.answer,
        via: e.via ?? "app",
        reasonCode: e.answerReasonCode ?? null,
        at: e.at,
        byCadre: e.answeredByCadre ?? null,
        loggedByCadre: e.loggedByCadre ?? null,
      };
    else if (e.kind === "disputed") current = null;
  }
  return current;
}

/** gate-a-proposal §6's table: the pharmacy's line for a query. `seen` changes nothing (RQ-8). */
export function queryOutcomeForPharmacy(query: { sentAt: Date; events: readonly QueryEvent[] }): {
  state: PharmacyQueryState;
  words: string;
  /** Amber, with an icon: nobody was told. */
  caution: boolean;
  answer: StandingAnswer | null;
} {
  const lite = { id: "", scope: "line" as const, lineIds: [], ...query };
  const state = queryState(lite);
  const answer = standingAnswer(query.events);
  if (state === "withdrawn") {
    const w = query.events.find((e) => e.kind === "withdrawn");
    return {
      state,
      words: fill(QUERY_COPY.withdrawn, { time: time(w?.at ?? query.sentAt) }),
      caution: false,
      answer: null,
    };
  }
  if (state === "answered" && answer)
    return {
      state,
      words:
        answer.via === "phone"
          ? fill(QUERY_COPY.phoneKeep, {
              cadre: answer.byCadre ?? "",
              time: time(answer.at),
              cadre2: answer.loggedByCadre ?? "",
            })
          : fill(QUERY_COPY.answered, {
              answer: ANSWER_WORDS[answer.answer],
              cadre: answer.byCadre ?? "",
              time: time(answer.at),
            }),
      caution: false,
      answer,
    };
  const has = (k: QueryEvent["kind"]) => query.events.some((e) => e.kind === k);
  if (has("notified"))
    return {
      state: "open",
      words: fill(QUERY_COPY.sent, { time: time(query.sentAt) }),
      caution: false,
      answer: null,
    };
  // Not delivered. Every recipient skipped (none failed) is RQ-3's "nobody"; anything else is a failure.
  const nobody = has("skipped") && !has("notify_failed");
  return {
    state: "not_sent",
    words: nobody ? QUERY_COPY.nobody : QUERY_COPY.notTold,
    caution: true,
    answer: null,
  };
}

/* ─── RQ-6, RQ-7: who may answer, and how ──────────────────────────── */

/** RQ-6: a clinician who may prescribe for the patient, and only the first answer. */
export function canAnswer<A>(input: {
  answererMayPrescribe: boolean;
  existingAnswer: A | null;
}):
  | { ok: true }
  | { ok: false; reason: "may_not_prescribe" }
  | { ok: false; reason: "already_answered"; first: A } {
  if (input.existingAnswer !== null)
    return { ok: false, reason: "already_answered", first: input.existingAnswer };
  if (!input.answererMayPrescribe) return { ok: false, reason: "may_not_prescribe" };
  return { ok: true };
}

export type PhoneEventRow =
  | {
      kind: "answered";
      answer: "keep";
      via: "phone";
      answeredByUserId: string;
      answerReasonCode: string | null;
      actorUserId: string;
    }
  | { kind: "call_logged"; actorUserId: string; note: string | null };

/** RQ-7: a logged call. Only a "keep" from a clinician who may prescribe answers the query. */
export function phoneAnswerEffect(answer: {
  said: "keep" | "change" | "stop";
  clinicianUserId: string;
  clinicianMayPrescribe: boolean;
  loggedByUserId: string;
  reasonCode?: string | null;
  note?: string | null;
}): PhoneEventRow {
  if (answer.said === "keep" && answer.clinicianMayPrescribe)
    return {
      kind: "answered",
      answer: "keep",
      via: "phone",
      answeredByUserId: answer.clinicianUserId,
      answerReasonCode: answer.reasonCode ?? null,
      actorUserId: answer.loggedByUserId,
    };
  return { kind: "call_logged", actorUserId: answer.loggedByUserId, note: answer.note ?? null };
}

/** RQ-7: a disputed phone answer. A line already handed over does not move; it goes to look-back. */
export function disputeEffect(
  lineStatus: LineStatus,
): { move: "query_reopened"; lookBack: false } | { move: null; lookBack: boolean } {
  if (ruleFor(keyOf(lineStatus), "query_reopened"))
    return { move: "query_reopened", lookBack: false };
  const handedOver =
    (lineStatus.kind === "closed" && lineStatus.outcome === "supplied") ||
    (lineStatus.kind === "open" && lineStatus.supplied > 0);
  return { move: null, lookBack: handedOver };
}

/* ─── RQ-4, RQ-5, RQ-9: what an answer does to the lines ───────────── */

export interface QueryLines {
  scope: "line" | "prescription";
  /** The line versions the query covers, as they stand now. */
  lines: readonly { id: string; status: LineStatus }[];
}

export interface LineEffect {
  lineId: string;
  move: MoveKind;
  /** H4, ple_replaced: a replaced line names its replacement. */
  replacedBy?: string;
}

/** Only LO-4's moves: anything the table refuses from a line's status is left out. */
const allowed = (q: QueryLines, effects: LineEffect[]): LineEffect[] =>
  effects.filter((e) => {
    const line = q.lines.find((l) => l.id === e.lineId);
    return line !== undefined && ruleFor(keyOf(line.status), e.move) !== undefined;
  });

export function answerEffects(
  query: QueryLines,
  answer: Answer,
  opts: { changedLineIds?: readonly string[]; replacedBy?: ReadonlyMap<string, string> } = {},
):
  | { ok: true; moves: LineEffect[]; closesQuery: true }
  | { ok: false; reason: "nothing_changed" | "replaced_by_missing" } {
  const ids = query.lines.map((l) => l.id);
  if (answer === "keep")
    return {
      ok: true,
      moves: allowed(
        query,
        ids.map((lineId) => ({ lineId, move: "query_answered" })),
      ),
      closesQuery: true,
    };
  if (answer === "stopped")
    return {
      ok: true,
      moves: allowed(
        query,
        ids.map((lineId) => ({ lineId, move: "prescriber_cancelled" })),
      ),
      closesQuery: true,
    };
  // changed: one line's query names its line; a whole-prescription query is "Changes made".
  const changed = new Set(query.scope === "line" ? ids : (opts.changedLineIds ?? []));
  if (changed.size === 0) return { ok: false, reason: "nothing_changed" };
  const moves = allowed(
    query,
    ids.map((lineId): LineEffect => {
      if (!changed.has(lineId)) return { lineId, move: "query_answered" };
      const by = opts.replacedBy?.get(lineId);
      return by
        ? { lineId, move: "prescriber_changed", replacedBy: by }
        : { lineId, move: "prescriber_changed" };
    }),
  );
  if (moves.some((m) => m.move === "prescriber_changed" && !m.replacedBy))
    return { ok: false, reason: "replaced_by_missing" };
  return { ok: true, moves, closesQuery: true };
}

/**
 * RQ-5, RQ-9: the prescriber changed one line while a query is open. The line is replaced; a query about
 * that line closes as `answered: changed`, a query about the whole prescription stays open.
 */
export function lineChangedUnderQuery(
  query: QueryLines,
  lineId: string,
  replacedBy: string,
): { moves: LineEffect[]; closesQuery: boolean } {
  return {
    moves: allowed(query, [{ lineId, move: "prescriber_changed", replacedBy }]),
    closesQuery: query.scope === "line",
  };
}

/** 5.4: the pharmacy withdraws a query, with a reason; its lines return to review. */
export function withdrawEffect(
  query: QueryLines,
  reasonCode: string,
): { ok: true; moves: LineEffect[] } | { ok: false; reason: "no_reason" } {
  if (reasonCode.trim().length < 2) return { ok: false, reason: "no_reason" };
  return {
    ok: true,
    moves: allowed(
      query,
      query.lines.map((l) => ({ lineId: l.id, move: "query_withdrawn" })),
    ),
  };
}

/* ─── RQ-11: the not-supplied notice ───────────────────────────────── */

/** RQ-11: the notice on the problem card (B-27). It needs no answer (`canAnswer` is never asked). */
export const notSuppliedNotice = (v: {
  at: Date;
  medicine: string;
  reason: string;
  patientTold: string;
}): { words: string; needsAnswer: false } => ({
  words: fill(QUERY_COPY.notSupplied, {
    time: time(v.at),
    Medicine: v.medicine,
    reason: v.reason,
    "What the patient was told": v.patientTold,
  }),
  needsAnswer: false,
});

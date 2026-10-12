import type { LineInput, LineStatus, QueryLite } from "@/lib/pharmacy/lines";
import type { QueryEvent, QueryLines } from "@/lib/pharmacy/review/queries";
import { afterEach, describe, expect, it, vi } from "vitest";

import { applyMove, lineStatus } from "@/lib/pharmacy/lines";
import {
  answerEffects,
  canAnswer,
  disputeEffect,
  lineChangedUnderQuery,
  notSuppliedNotice,
  phoneAnswerEffect,
  QUERY_COPY,
  queryOutcomeForPharmacy,
  resolveRecipients,
  standingAnswer,
  withdrawEffect,
} from "@/lib/pharmacy/review/queries";
import { failureNeverThrows } from "@/lib/pharmacy/supply/reversal";

/**
 * Pharmacy Phase 1 — queries to the prescriber (RQ-2..RQ-8, RQ-10, RQ-11; gate-a-proposal §6). Fixture
 * data: Fixture tablet A, invented users U-mo (a medical officer), U-intern, U-senior (Law 8).
 */
const T0 = new Date("2026-10-12T07:42:00.000Z"); // 10:42 in Kampala
const T = (min: number) => new Date(T0.getTime() + min * 60_000);
const stage = (s: "awaiting_cosign" | "to_review" | "queried" | "ready"): LineStatus => ({
  kind: "stage",
  stage: s,
});

afterEach(() => vi.useRealTimers());

describe("RQ-3 recipients", () => {
  const r = (o: Partial<Parameters<typeof resolveRecipients>[0]> = {}) =>
    resolveRecipients({
      prescriberUserId: "U-mo",
      prescriberActive: true,
      responsibleClinicianUserId: "U-mo",
      responsibleActive: true,
      ...o,
    });

  it("RQ-3 case 1: the prescriber is the responsible clinician: told once, as the prescriber", () => {
    expect(r()).toEqual({ recipients: [{ userId: "U-mo", role: "prescriber" }], skipped: [] });
  });

  it("RQ-3 case 2: an intern's prescription under a senior: both are told", () => {
    expect(
      r({ prescriberUserId: "U-intern", responsibleClinicianUserId: "U-senior" }).recipients,
    ).toEqual([
      { userId: "U-intern", role: "prescriber" },
      { userId: "U-senior", role: "responsible_clinician" },
    ]);
  });

  it("RQ-3 case 3: a prescriber who left is skipped and listed", () => {
    expect(
      r({
        prescriberUserId: "U-intern",
        prescriberActive: false,
        responsibleClinicianUserId: "U-senior",
      }),
    ).toEqual({
      recipients: [{ userId: "U-senior", role: "responsible_clinician" }],
      skipped: [{ userId: "U-intern", role: "prescriber", why: "inactive" }],
    });
  });

  it("RQ-3 case 4 S21: nobody active is left", () => {
    const out = r({ prescriberActive: false, responsibleActive: false });
    expect(out.recipients).toEqual([]);
    expect(out.skipped).toHaveLength(1);
    expect(r({ prescriberUserId: null, responsibleClinicianUserId: null })).toEqual({
      recipients: [],
      skipped: [],
    });
  });
});

describe("RQ-2 RQ-8 what the pharmacy sees (gate-a-proposal §6)", () => {
  const out = (events: QueryEvent[]) => queryOutcomeForPharmacy({ sentAt: T0, events });

  it("RQ-2: sent and notified reads 'Query sent {time} · not answered', never 'the prescriber knows'", () => {
    const o = out([{ kind: "notified", at: T(0) }]);
    expect(o).toMatchObject({
      state: "open",
      words: "Query sent 10:42 · not answered",
      caution: false,
    });
    expect(o.words).not.toMatch(/knows/);
  });

  it("RQ-8: seen is never shown as an answer", () => {
    const seen = out([
      { kind: "notified", at: T(0) },
      { kind: "seen", at: T(1) },
    ]);
    expect(seen).toEqual(out([{ kind: "notified", at: T(0) }]));
    expect(seen.answer).toBeNull();
  });

  it("RQ-2 S20: the notified write failed: 'The prescriber has NOT been told', in amber", () => {
    expect(out([])).toMatchObject({
      state: "not_sent",
      words: "The prescriber has NOT been told. Call them and log the call.",
      caution: true,
    });
    expect(out([{ kind: "notify_failed", at: T(0) }]).words).toBe(QUERY_COPY.notTold);
  });

  it("RQ-3 S21: nobody could be resolved: 'Nobody can be told in MedSync'", () => {
    expect(out([{ kind: "skipped", at: T(0) }])).toMatchObject({
      state: "not_sent",
      words: "Nobody can be told in MedSync. Call the ward or clinic.",
      caution: true,
    });
  });

  it("RQ-7 S21: a logged phone 'keep' answers a query that was never delivered", () => {
    const o = out([
      { kind: "skipped", at: T(0) },
      {
        kind: "answered",
        at: T(8),
        answer: "keep",
        via: "phone",
        answeredByCadre: "Medical officer",
        loggedByCadre: "Pharmacist",
      },
    ]);
    expect(o.state).toBe("answered");
    expect(o.words).toBe(
      "Answered by phone: kept as written (Medical officer, 10:50). Logged by Pharmacist.",
    );
  });

  it("RQ-2: an answer in the app shows the answer, who and when; a dispute reopens it", () => {
    const answered: QueryEvent = {
      kind: "answered",
      at: T(5),
      answer: "keep",
      via: "app",
      answerReasonCode: "intended",
      answeredByCadre: "Medical officer",
    };
    const o = out([{ kind: "notified", at: T(0) }, answered]);
    expect(o.words).toBe("Answered: kept as written (Medical officer, 10:47).");
    expect(o.answer?.reasonCode).toBe("intended");
    const reopened = out([
      { kind: "notified", at: T(0) },
      answered,
      { kind: "disputed", at: T(9) },
    ]);
    expect(reopened.state).toBe("open");
    expect(standingAnswer([answered, { kind: "disputed", at: T(9) }])).toBeNull();
  });

  it("RQ-2: a withdrawn query says so", () => {
    expect(
      out([
        { kind: "notified", at: T(0) },
        { kind: "withdrawn", at: T(20) },
      ]),
    ).toMatchObject({ state: "withdrawn", words: "Query withdrawn 11:02." });
  });

  it("RQ-10: no escalation: an unanswered query reads the same 30 days later", () => {
    const events: QueryEvent[] = [{ kind: "notified", at: T(0) }];
    const before = out(events);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(T0.getTime() + 30 * 86_400_000));
    expect(out(events)).toEqual(before);
  });

  it("RQ-10 S20: delivery that fails never throws; the pharmacy is told in words", async () => {
    await expect(
      failureNeverThrows(() => Promise.reject(new Error("realtime down")), QUERY_COPY.notTold),
    ).resolves.toEqual({ ok: false, words: QUERY_COPY.notTold });
  });
});

describe("RQ-6 the first answer wins", () => {
  it("RQ-6 S23: a second clinician answers what the prescriber left; a third is shown it", () => {
    expect(canAnswer({ answererMayPrescribe: true, existingAnswer: null })).toEqual({ ok: true });
    const first = { answer: "keep", by: "U-second" };
    expect(canAnswer({ answererMayPrescribe: true, existingAnswer: first })).toEqual({
      ok: false,
      reason: "already_answered",
      first,
    });
  });

  it("RQ-6: a clinician who may not prescribe for the patient cannot answer", () => {
    expect(canAnswer({ answererMayPrescribe: false, existingAnswer: null })).toEqual({
      ok: false,
      reason: "may_not_prescribe",
    });
  });
});

describe("RQ-7 phone answers and disputes", () => {
  const call = { clinicianUserId: "U-mo", clinicianMayPrescribe: true, loggedByUserId: "U-ph" };

  it("RQ-7 S22: a phone 'keep' answers via phone, naming the clinician and who logged it", () => {
    expect(phoneAnswerEffect({ ...call, said: "keep", reasonCode: "intended" })).toEqual({
      kind: "answered",
      answer: "keep",
      via: "phone",
      answeredByUserId: "U-mo",
      answerReasonCode: "intended",
      actorUserId: "U-ph",
    });
  });

  it("RQ-7: 'will change it', 'stop it', or a 'keep' from someone who may not prescribe: call_logged only", () => {
    expect(phoneAnswerEffect({ ...call, said: "change" }).kind).toBe("call_logged");
    expect(phoneAnswerEffect({ ...call, said: "stop" }).kind).toBe("call_logged");
    expect(phoneAnswerEffect({ ...call, said: "keep", clinicianMayPrescribe: false }).kind).toBe(
      "call_logged",
    );
  });

  it("RQ-7 S22: a dispute returns a line at to review or ready to queried", () => {
    expect(disputeEffect(stage("to_review"))).toEqual({ move: "query_reopened", lookBack: false });
    expect(disputeEffect(stage("ready"))).toEqual({ move: "query_reopened", lookBack: false });
  });

  it("RQ-7: a line already supplied does not move; it goes to look-back", () => {
    expect(disputeEffect({ kind: "closed", outcome: "supplied" })).toEqual({
      move: null,
      lookBack: true,
    });
    expect(disputeEffect({ kind: "open", outcome: "owed", supplied: 14, notSupplied: 14 })).toEqual(
      { move: null, lookBack: true },
    );
    expect(
      disputeEffect({ kind: "open", outcome: "owed", supplied: 0, notSupplied: null }),
    ).toEqual({ move: null, lookBack: false });
  });

  it("RQ-7 S22: through the line fold, the phone 'keep' then the dispute leaves the line queried", () => {
    const line: LineInput = { id: "L1", state: "active", cosign: "none", createdAt: T(-10) };
    const q: QueryLite = {
      id: "Q1",
      scope: "line",
      lineIds: ["L1"],
      sentAt: T(0),
      events: [{ kind: "answered", at: T(5), answer: "keep" }],
    };
    expect(lineStatus(line, [], [q], "standard")).toEqual(stage("to_review"));
    const disputed = { ...q, events: [...q.events, { kind: "disputed", at: T(9) }] };
    expect(lineStatus(line, [], [disputed], "standard")).toEqual(stage("queried"));
  });
});

describe("RQ-4 answers to a query about one line", () => {
  const one: QueryLines = { scope: "line", lines: [{ id: "L1", status: stage("queried") }] };

  it("RQ-4 S16: keep returns the line to review", () => {
    const r = answerEffects(one, "keep");
    expect(r).toEqual({
      ok: true,
      moves: [{ lineId: "L1", move: "query_answered" }],
      closesQuery: true,
    });
    expect(applyMove(stage("queried"), { kind: "query_answered" })).toEqual({
      ok: true,
      status: stage("to_review"),
    });
  });

  it("RQ-4 S17 H4: changed replaces the old line, naming the new one", () => {
    expect(answerEffects(one, "changed", { replacedBy: new Map([["L1", "L1b"]]) })).toEqual({
      ok: true,
      moves: [{ lineId: "L1", move: "prescriber_changed", replacedBy: "L1b" }],
      closesQuery: true,
    });
    expect(answerEffects(one, "changed")).toEqual({ ok: false, reason: "replaced_by_missing" });
  });

  it("RQ-4 S18: stopped cancels the line", () => {
    const r = answerEffects(one, "stopped");
    expect(r.ok && r.moves).toEqual([{ lineId: "L1", move: "prescriber_cancelled" }]);
    expect(applyMove(stage("queried"), { kind: "prescriber_cancelled" })).toEqual({
      ok: true,
      status: { kind: "closed", outcome: "cancelled_by_prescriber" },
    });
  });

  it("RQ-9: changing the queried line closes a query about that line", () => {
    expect(lineChangedUnderQuery(one, "L1", "L1b")).toEqual({
      moves: [{ lineId: "L1", move: "prescriber_changed", replacedBy: "L1b" }],
      closesQuery: true,
    });
  });
});

describe("RQ-5 a query about the whole prescription", () => {
  const whole: QueryLines = {
    scope: "prescription",
    lines: [
      { id: "L1", status: stage("queried") },
      { id: "L2", status: stage("queried") },
      { id: "L3", status: stage("awaiting_cosign") },
    ],
  };

  it("RQ-5 S19: changing one line does not close it", () => {
    const r = lineChangedUnderQuery(whole, "L2", "L2b");
    expect(r.closesQuery).toBe(false);
    expect(r.moves).toEqual([{ lineId: "L2", move: "prescriber_changed", replacedBy: "L2b" }]);
  });

  it("RQ-5 S19: 'Changes made' closes it: the changed line is replaced, the others return to review", () => {
    const after: QueryLines = {
      ...whole,
      lines: whole.lines.map((l) =>
        l.id === "L2" ? { ...l, status: { kind: "closed", outcome: "replaced" } } : l,
      ),
    };
    // L2 already replaced when it was changed; L3 awaits co-sign and keeps the query beside it.
    expect(answerEffects(after, "changed", { changedLineIds: ["L2"] })).toEqual({
      ok: true,
      moves: [{ lineId: "L1", move: "query_answered" }],
      closesQuery: true,
    });
    expect(
      answerEffects(whole, "changed", {
        changedLineIds: ["L2"],
        replacedBy: new Map([["L2", "L2b"]]),
      }),
    ).toEqual({
      ok: true,
      moves: [
        { lineId: "L1", move: "query_answered" },
        { lineId: "L2", move: "prescriber_changed", replacedBy: "L2b" },
      ],
      closesQuery: true,
    });
  });

  it("RQ-5: 'Changes made' with nothing changed is refused", () => {
    expect(answerEffects(whole, "changed", { changedLineIds: [] })).toEqual({
      ok: false,
      reason: "nothing_changed",
    });
  });

  it("RQ-5: keep returns every queried line to review; stopped cancels every remaining line", () => {
    const keep = answerEffects(whole, "keep");
    expect(keep.ok && keep.moves.map((m) => m.lineId)).toEqual(["L1", "L2"]);
    const stop = answerEffects(whole, "stopped");
    expect(stop.ok && stop.moves.map((m) => m.lineId)).toEqual(["L1", "L2", "L3"]);
  });
});

describe("5.4 withdrawing a query", () => {
  const one: QueryLines = { scope: "line", lines: [{ id: "L1", status: stage("queried") }] };

  it("5.4: a withdrawal needs a reason", () => {
    expect(withdrawEffect(one, " ")).toEqual({ ok: false, reason: "no_reason" });
  });

  it("5.4 S21: nobody can be reached: withdrawn, back to review, then recorded as owed", () => {
    const r = withdrawEffect(one, "unreachable");
    expect(r).toEqual({ ok: true, moves: [{ lineId: "L1", move: "query_withdrawn" }] });
    const back = applyMove(stage("queried"), { kind: "query_withdrawn" });
    expect(back).toEqual({ ok: true, status: stage("to_review") });
    expect(
      applyMove(stage("to_review"), {
        kind: "record_owed",
        cleared: true,
        reasonCode: "out_of_stock",
      }),
    ).toEqual({
      ok: true,
      status: { kind: "open", outcome: "owed", supplied: 0, notSupplied: null },
    });
  });
});

describe("RQ-11 the not-supplied notice", () => {
  it("RQ-11: B-27's words, and it needs no answer", () => {
    expect(
      notSuppliedNotice({
        at: T0,
        medicine: "Fixture tablet A",
        reason: "out of stock at this dispensing point",
        patientTold: "Owed; come back when it arrives",
      }),
    ).toEqual({
      words:
        "From the pharmacy, 10:42. Fixture tablet A was not supplied: out of stock at this dispensing point. Owed; come back when it arrives.",
      needsAnswer: false,
    });
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type {
  LineInput,
  LineStatus,
  Move,
  MoveKind,
  PharmacyLineEvent,
  QueryLite,
  StatusKey,
} from "@/lib/pharmacy/lines";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applyMove,
  canDecline,
  CLOSED_OUTCOMES,
  hasOpenQuery,
  inOpenLines,
  inQueue,
  inScope,
  keyOf,
  leastAdvanced,
  LINE_EVENT_KINDS,
  lineStatus,
  MOVE_KINDS,
  MOVES,
  NOT_CONTINUED_AT_VISIT_CLOSE,
  OPEN_OUTCOMES,
  quantityLeft,
  queryState,
  ruleFor,
  STAGES,
  STATUS_KEYS,
} from "@/lib/pharmacy/lines";

/**
 * Pharmacy Phase 1 — line stages and outcomes (LO-1..LO-9; gate-a-proposal §3, H1). Fixture data:
 * Fixture tablet A, batch FX-001, invented quantities (Law 8).
 */
const T0 = new Date("2026-10-12T07:00:00.000Z"); // 10:00 in Kampala
const T = (min: number) => new Date(T0.getTime() + min * 60_000);
const DAY = 24 * 60;

const line = (o: Partial<LineInput> = {}): LineInput => ({
  id: "L1",
  state: "active",
  cosign: "none",
  createdAt: T(0),
  ...o,
});
let n = 0;
const ev = (
  kind: PharmacyLineEvent["kind"],
  min: number,
  o: Partial<PharmacyLineEvent> = {},
): PharmacyLineEvent => ({
  id: `e${++n}`,
  kind,
  occurredAt: T(min),
  effectiveAt: T(min),
  lane: null,
  quantitySupplied: null,
  quantityNotSupplied: null,
  reasonCode: null,
  handoverId: null,
  actorCadre: "Pharmacist",
  ...o,
});
const query = (o: Partial<QueryLite> = {}): QueryLite => ({
  id: "Q1",
  scope: "line",
  lineIds: ["L1"],
  sentAt: T(5),
  events: [],
  ...o,
});
const stage = (s: LineStatus) => (s.kind === "stage" ? s.stage : null);

/* ─── LO-4, written out independently of MOVES from the prompt's table ─── */

const S = "awaiting_cosign to_review queried ready";
const O = "owed buying_outside";
/** `from… | move | to | guard` */
const LO4 = `
new | enter_cosign_needed | awaiting_cosign
new | enter | to_review
awaiting_cosign | cosigned | to_review
awaiting_cosign | cosigned_query_open | queried
to_review ready | query_sent | queried
awaiting_cosign | query_sent | awaiting_cosign
to_review | accepted | ready
to_review ready | record_owed | owed | cleared
to_review ready | record_buying_outside | buying_outside | cleared
ready | lane_pharmacist_first | to_review
ready | handover_full | supplied
ready | handover_part_owed | owed
ready | handover_part_outside | buying_outside
queried | query_answered | to_review
to_review ready | query_reopened | queried
queried | declined | declined
queried | query_withdrawn | to_review
to_review | declined | declined | query_sent
${S} ${O} | prescriber_changed | replaced
${S} ${O} | prescriber_cancelled | cancelled_by_prescriber
${O} | handover_full | supplied
owed | handover_part | owed
buying_outside | handover_part | buying_outside
owed | to_buying_outside | buying_outside
buying_outside | to_owed | owed
buying_outside | filled_elsewhere | closed
${O} | closed | closed
${S} | closed_not_collected | closed | written_before_today
supplied ${O} | returned | previous | by_handover
${S} ${O} | downtime_supplied | supplied
${S} ${O} | downtime_part_owed | owed
${S} ${O} | downtime_part_outside | buying_outside
${S} | downtime_not_supplied_owed | owed
${S} | downtime_not_supplied_outside | buying_outside
to_review | reviewed | reviewed
`;
const EXPECTED = new Map<string, { to: string; guard: string | null }>();
for (const row of LO4.trim().split("\n")) {
  const [from, move, to, guard] = row.split("|").map((s) => s.trim());
  for (const f of from!.split(/\s+/))
    EXPECTED.set(`${f}|${move}`, { to: to!, guard: guard ?? null });
}

const sample = (key: StatusKey): LineStatus | null => {
  if (key === "new") return null;
  if ((STAGES as readonly string[]).includes(key))
    return { kind: "stage", stage: key as (typeof STAGES)[number] };
  if ((OPEN_OUTCOMES as readonly string[]).includes(key))
    return {
      kind: "open",
      outcome: key as (typeof OPEN_OUTCOMES)[number],
      supplied: 0,
      notSupplied: 10,
    };
  return { kind: "closed", outcome: key as (typeof CLOSED_OUTCOMES)[number] };
};
const PREVIOUS: LineStatus = { kind: "stage", stage: "ready" };
const withGuards: Omit<Move, "kind"> = {
  cleared: true,
  querySent: true,
  writtenBeforeToday: true,
  previous: PREVIOUS,
  quantitySupplied: 1,
  quantityNotSupplied: 5,
};

describe("LO-4 the moves table", () => {
  it("LO-4 MOVES lists each (from, move) pair at most once, and only known kinds", () => {
    const seen = new Set<string>();
    for (const r of MOVES)
      for (const f of r.from) {
        const k = `${f}|${r.move}`;
        expect(seen.has(k), k).toBe(false);
        seen.add(k);
        expect(STATUS_KEYS).toContain(f);
      }
    expect(new Set(MOVES.map((r) => r.move))).toEqual(new Set(MOVE_KINDS));
    expect(seen).toEqual(new Set(EXPECTED.keys()));
  });

  it(`LO-4 exhaustive: every status × every move (${STATUS_KEYS.length} × ${MOVE_KINDS.length}) gives exactly the table`, () => {
    let allowed = 0;
    for (const from of STATUS_KEYS)
      for (const kind of MOVE_KINDS) {
        const want = EXPECTED.get(`${from}|${kind}`);
        const before = sample(from);
        const snapshot = structuredClone(before);
        const r = applyMove(before, { kind, ...withGuards });
        expect(before, "never mutates").toEqual(snapshot);
        if (!want) {
          expect(r, `${from} + ${kind}`).toEqual({ ok: false, reason: "not_allowed" });
          continue;
        }
        allowed++;
        expect(r.ok, `${from} + ${kind}`).toBe(true);
        if (r.ok)
          expect(keyOf(r.status), `${from} + ${kind}`).toBe(
            want.to === "previous" ? keyOf(PREVIOUS) : want.to,
          );
        // Without the facts its guard reads, a guarded move is refused.
        if (want.guard) {
          const bare: Move = { kind, quantitySupplied: 1, quantityNotSupplied: 5 };
          expect(applyMove(before, bare), `${from} + ${kind} unguarded`).toEqual({
            ok: false,
            reason: "not_allowed",
          });
        }
      }
    expect(allowed).toBe(EXPECTED.size);
  });

  it("LO-4 every closed outcome is final: no move leaves it except a same-day reversal of a supply", () => {
    for (const outcome of CLOSED_OUTCOMES)
      for (const kind of MOVE_KINDS) {
        const r = applyMove({ kind: "closed", outcome }, { kind, ...withGuards });
        expect(r.ok, `${outcome} + ${kind}`).toBe(outcome === "supplied" && kind === "returned");
      }
  });

  it("LO-4 a whole-prescription query puts to_review and ready at queried; awaiting co-sign stays", () => {
    const q = query({ scope: "prescription", lineIds: ["L1", "L2", "L3"], sentAt: T(20) });
    const l1 = lineStatus(line(), [], [q], "standard");
    const l2 = lineStatus(
      line({ id: "L2" }),
      [ev("decision_saved", 10, { lane: "standard" })],
      [q],
      "standard",
    );
    const l3 = lineStatus(line({ id: "L3", cosign: "awaiting" }), [], [q], "standard");
    expect([l1, l2, l3].map(stage)).toEqual(["queried", "queried", "awaiting_cosign"]);
    expect(hasOpenQuery("L3", [q])).toBe(true);
  });

  it("LO-4 co-signed with a query still open lands at queried; with none, at to_review", () => {
    const pending = line({ cosign: "signed", cosignedAt: T(30) });
    expect(stage(lineStatus(pending, [], [query({ sentAt: T(10) })], "standard"))).toBe("queried");
    expect(stage(lineStatus(pending, [], [], "standard"))).toBe("to_review");
    const answered = query({
      sentAt: T(10),
      events: [{ kind: "answered", at: T(20), answer: "keep" }],
    });
    expect(stage(lineStatus(pending, [], [answered], "standard"))).toBe("to_review");
  });

  it("LO-4 queried returns to to_review on keep, on a whole-prescription change that left the line, or on withdrawal", () => {
    for (const e of [
      { kind: "answered", at: T(20), answer: "keep" as const },
      { kind: "answered", at: T(20), answer: "changed" as const },
      { kind: "withdrawn", at: T(20) },
    ])
      expect(stage(lineStatus(line(), [], [query({ events: [e] })], "standard"))).toBe("to_review");
    // "seen" and a logged call change nothing (RQ-7, RQ-8).
    const seen = query({
      events: [
        { kind: "seen", at: T(20) },
        { kind: "call_logged", at: T(21) },
      ],
    });
    expect(stage(lineStatus(line(), [], [seen], "standard"))).toBe("queried");
  });

  it("LO-4 answering one query leaves the line queried while another covering it is still open", () => {
    const a = query({ id: "Qa", events: [{ kind: "answered", at: T(20), answer: "keep" }] });
    const b = query({ id: "Qb", scope: "prescription", sentAt: T(6) });
    expect(stage(lineStatus(line(), [], [a, b], "standard"))).toBe("queried");
  });

  it("LO-4 a disputed phone answer reopens the query (RQ-7); a supplied line does not move", () => {
    const q = query({
      events: [
        { kind: "answered", at: T(20), answer: "keep" },
        { kind: "disputed", at: T(40) },
      ],
    });
    expect(stage(lineStatus(line(), [], [q], "standard"))).toBe("queried");
    expect(queryState(q)).toBe("open");
    const supplied = lineStatus(
      line(),
      [ev("decision_saved", 25, { lane: "standard" }), ev("supplied", 30, { handoverId: "H1" })],
      [q],
      "standard",
    );
    expect(supplied).toEqual({ kind: "closed", outcome: "supplied" });
  });

  it("LO-4 pharmacist-first: a saved decision alone does not make a line ready; acceptance does", () => {
    const pf = { lane: "pharmacist_first" as const };
    expect(stage(lineStatus(line(), [ev("decision_saved", 10, pf)], [], "pharmacist_first"))).toBe(
      "to_review",
    );
    expect(stage(lineStatus(line(), [ev("accepted", 10, pf)], [], "pharmacist_first"))).toBe(
      "ready",
    );
    expect(
      stage(
        lineStatus(
          line(),
          [ev("supplied_without_review", 10, { ...pf, reasonCode: "no_pharmacist_on_site" })],
          [],
          "pharmacist_first",
        ),
      ),
    ).toBe("ready");
  });

  it("LO-4 recorded owed needs acceptance on a pharmacist-first line; a standard line needs none", () => {
    const owed = ev("owed", 10, {
      lane: "pharmacist_first",
      reasonCode: "out_of_stock_here",
      quantityNotSupplied: 28,
    });
    expect(stage(lineStatus(line(), [owed], [], "pharmacist_first"))).toBe("to_review");
    expect(
      lineStatus(
        line(),
        [ev("accepted", 5, { lane: "pharmacist_first" }), owed],
        [],
        "pharmacist_first",
      ),
    ).toEqual({ kind: "open", outcome: "owed", supplied: 0, notSupplied: 28 });
    expect(lineStatus(line(), [{ ...owed, lane: "standard" }], [], "standard")).toMatchObject({
      kind: "open",
      outcome: "owed",
    });
  });

  it("LO-4 / LN-8 a ready line with no acceptance returns to to_review when the prescription becomes pharmacist-first", () => {
    const events = [ev("decision_saved", 10, { lane: "standard" })];
    expect(stage(lineStatus(line(), events, [], "standard"))).toBe("ready");
    expect(stage(lineStatus(line(), events, [], "pharmacist_first"))).toBe("to_review");
    // An accepted line keeps its place.
    const accepted = [ev("accepted", 5, { lane: "standard" }), ...events];
    expect(stage(lineStatus(line(), accepted, [], "pharmacist_first"))).toBe("ready");
    // A later event stamped pharmacist-first also triggers it.
    const later = [...events, ev("decision_cleared", 20, { lane: "pharmacist_first" })];
    expect(stage(lineStatus(line(), later, [], "pharmacist_first"))).toBe("to_review");
  });

  it("LO-4 hand-over: full → supplied; part → owed or buying outside with the quantities", () => {
    const ready = ev("decision_saved", 10, { lane: "standard" });
    expect(
      lineStatus(
        line(),
        [ready, ev("supplied", 20, { handoverId: "H1", quantitySupplied: 28 })],
        [],
        "standard",
      ),
    ).toEqual({ kind: "closed", outcome: "supplied" });
    const partOwed = ev("owed", 20, {
      handoverId: "H1",
      quantitySupplied: 14,
      quantityNotSupplied: 14,
      reasonCode: "out_of_stock_here",
    });
    expect(lineStatus(line(), [ready, partOwed], [], "standard")).toEqual({
      kind: "open",
      outcome: "owed",
      supplied: 14,
      notSupplied: 14,
    });
    const partOut = { ...partOwed, kind: "buying_outside" as const };
    expect(lineStatus(line(), [ready, partOut], [], "standard")).toMatchObject({
      outcome: "buying_outside",
      supplied: 14,
    });
  });

  it("LO-4 owed: part of the rest, then the rest; owed ⇄ buying outside; filled elsewhere; closed", () => {
    const base = [
      ev("decision_saved", 10, { lane: "standard" }),
      ev("owed", 20, {
        handoverId: "H1",
        quantitySupplied: 14,
        quantityNotSupplied: 14,
        reasonCode: "out",
      }),
    ];
    const part = ev("part_supplied", 30, { handoverId: "H2", quantitySupplied: 7 });
    expect(lineStatus(line(), [...base, part], [], "standard")).toEqual({
      kind: "open",
      outcome: "owed",
      supplied: 21,
      notSupplied: 7,
    });
    const rest = ev("supplied", 40, { handoverId: "H3", quantitySupplied: 7 });
    expect(lineStatus(line(), [...base, part, rest], [], "standard")).toEqual({
      kind: "closed",
      outcome: "supplied",
    });
    const swap = ev("open_outcome_changed", 30, { reasonCode: "patient_cannot_wait" });
    expect(lineStatus(line(), [...base, swap], [], "standard")).toMatchObject({
      outcome: "buying_outside",
      supplied: 14,
      notSupplied: 14,
    });
    const back = ev("owed", 35, { reasonCode: "patient_will_wait" });
    expect(lineStatus(line(), [...base, swap, back], [], "standard")).toMatchObject({
      outcome: "owed",
      notSupplied: 14,
    });
    expect(lineStatus(line(), [...base, swap, ev("filled_elsewhere", 50)], [], "standard")).toEqual(
      {
        kind: "closed",
        outcome: "closed",
        reasonCode: "filled_elsewhere",
      },
    );
    expect(
      lineStatus(
        line(),
        [...base, ev("closed", 50, { reasonCode: "patient_declined" })],
        [],
        "standard",
      ),
    ).toEqual({ kind: "closed", outcome: "closed", reasonCode: "patient_declined" });
    // Filled elsewhere is only from buying outside.
    expect(lineStatus(line(), [...base, ev("filled_elsewhere", 50)], [], "standard")).toMatchObject(
      {
        outcome: "owed",
      },
    );
  });

  it("LO-4 a hand-over reversed returns the line to what it had immediately before", () => {
    const ready = ev("decision_saved", 10, { lane: "standard" });
    const full = ev("supplied", 20, { handoverId: "H1", quantitySupplied: 28 });
    expect(
      stage(
        lineStatus(
          line(),
          [ready, full, ev("returned", 30, { handoverId: "H1", reasonCode: "handed_back" })],
          [],
          "standard",
        ),
      ),
    ).toBe("ready");
    // A reversal naming another hand-over is refused.
    expect(
      lineStatus(
        line(),
        [ready, full, ev("returned", 30, { handoverId: "H9", reasonCode: "x1" })],
        [],
        "standard",
      ),
    ).toEqual({ kind: "closed", outcome: "supplied" });
    // Two hand-overs reversed in turn.
    const part = ev("owed", 20, {
      handoverId: "H1",
      quantitySupplied: 14,
      quantityNotSupplied: 14,
      reasonCode: "out",
    });
    const rest = ev("supplied", 25, { handoverId: "H2", quantitySupplied: 14 });
    const r1 = ev("returned", 30, { handoverId: "H2", reasonCode: "recorded_in_error" });
    const r2 = ev("returned", 31, { handoverId: "H1", reasonCode: "recorded_in_error" });
    expect(lineStatus(line(), [ready, part, rest, r1], [], "standard")).toEqual({
      kind: "open",
      outcome: "owed",
      supplied: 14,
      notSupplied: 14,
    });
    expect(stage(lineStatus(line(), [ready, part, rest, r1, r2], [], "standard"))).toBe("ready");
    // An owed line recorded without a hand-over cannot be "reversed".
    const recorded = ev("owed", 20, { reasonCode: "out", quantityNotSupplied: 28 });
    expect(
      lineStatus(
        line(),
        [ready, recorded, ev("returned", 30, { handoverId: "H1", reasonCode: "x1" })],
        [],
        "standard",
      ),
    ).toMatchObject({ kind: "open", outcome: "owed" });
  });

  it("LO-4 after downtime: a supply from any stage, and a not-supplied row as the sheet shows", () => {
    const dt = { enteredAfterDowntime: true, handoverId: "HD", effectiveAt: T(-30) };
    const awaiting = line({ cosign: "awaiting" });
    expect(
      lineStatus(awaiting, [ev("supplied", 60, { ...dt, quantitySupplied: 28 })], [], "standard"),
    ).toEqual({
      kind: "closed",
      outcome: "supplied",
    });
    expect(
      lineStatus(
        line(),
        [
          ev("owed", 60, {
            ...dt,
            quantitySupplied: 10,
            quantityNotSupplied: 18,
            reasonCode: "sheet",
          }),
        ],
        [],
        "standard",
      ),
    ).toEqual({ kind: "open", outcome: "owed", supplied: 10, notSupplied: 18 });
    expect(
      lineStatus(
        line(),
        [ev("buying_outside", 60, { ...dt, handoverId: null, reasonCode: "sheet" })],
        [],
        "standard",
      ),
    ).toEqual({ kind: "open", outcome: "buying_outside", supplied: 0, notSupplied: null });
  });

  it("LO-4 the prescriber's change and cancel close any stage or open outcome, never a supply", () => {
    const replaced = line({
      state: "cancelled",
      stateChangedAt: T(30),
      cancellation: { replacedBy: "L9", reasonCode: "dose_changed" },
    });
    expect(lineStatus(replaced, [], [], "standard")).toEqual({
      kind: "closed",
      outcome: "replaced",
    });
    const cancelled = line({
      state: "cancelled",
      stateChangedAt: T(30),
      cancellation: { replacedBy: null, reasonCode: "stopped_by_prescriber" },
    });
    expect(lineStatus(cancelled, [], [], "standard")).toEqual({
      kind: "closed",
      outcome: "cancelled_by_prescriber",
      reasonCode: "stopped_by_prescriber",
    });
    const supplied = [
      ev("decision_saved", 10, { lane: "standard" }),
      ev("supplied", 20, { handoverId: "H1", quantitySupplied: 28 }),
    ];
    expect(lineStatus(cancelled, supplied, [], "standard")).toEqual({
      kind: "closed",
      outcome: "supplied",
    });
  });

  it("LO-4 not collected: only a prescription written before today (Kampala day)", () => {
    const close = (min: number) => ev("closed_not_collected", min, { reasonCode: "not_collected" });
    expect(stage(lineStatus(line(), [close(60)], [], "standard"))).toBe("to_review");
    expect(lineStatus(line(), [close(3 * DAY)], [], "standard")).toEqual({
      kind: "closed",
      outcome: "closed",
      reasonCode: "not_collected",
    });
  });

  it("LO-4 a review-only ward line: accepted → reviewed", () => {
    const ward = line({ reviewOnly: true });
    expect(
      lineStatus(ward, [ev("accepted", 10, { lane: "pharmacist_first" })], [], "pharmacist_first"),
    ).toEqual({
      kind: "closed",
      outcome: "reviewed",
    });
  });
});

describe("line stages and outcomes", () => {
  it("LO-1 a new line enters at awaiting_cosign or to_review; stages order least to most advanced", () => {
    expect(stage(lineStatus(line({ cosign: "awaiting" }), [], [], "standard"))).toBe(
      "awaiting_cosign",
    );
    expect(stage(lineStatus(line(), [], [], "standard"))).toBe("to_review");
    expect(leastAdvanced(["ready", "queried", "to_review"])).toBe("to_review");
    expect(leastAdvanced(["ready", "awaiting_cosign"])).toBe("awaiting_cosign");
    expect(leastAdvanced(["ready"])).toBe("ready");
    expect(leastAdvanced([])).toBeNull();
  });

  it("LO-2 open outcomes carry the quantity supplied and not supplied; closed ones carry their reason", () => {
    const s: LineStatus = { kind: "open", outcome: "owed", supplied: 14, notSupplied: 14 };
    expect(inOpenLines(s)).toBe(true);
    expect(inOpenLines({ kind: "closed", outcome: "declined", reasonCode: "x1" })).toBe(false);
  });

  it("LO-3 the prescription is in the queue while any line has a stage", () => {
    const supplied: LineStatus = { kind: "closed", outcome: "supplied" };
    const owed: LineStatus = { kind: "open", outcome: "owed", supplied: 0, notSupplied: 1 };
    expect(inQueue([supplied, { kind: "stage", stage: "queried" }])).toBe(true);
    expect(inQueue([supplied, owed])).toBe(false);
    expect(inQueue([])).toBe(false);
  });

  describe("LO-5 nothing moves by the passing of time", () => {
    afterEach(() => vi.useRealTimers());
    it("LO-5 a fake clock advanced 30 days leaves every stage and open outcome unchanged", () => {
      const fixtures: [LineInput, PharmacyLineEvent[], QueryLite[]][] = [
        [line({ cosign: "awaiting" }), [], []],
        [line(), [], []],
        [line(), [], [query()]],
        [line(), [ev("decision_saved", 10, { lane: "standard" })], []],
        [
          line(),
          [
            ev("decision_saved", 10, { lane: "standard" }),
            ev("owed", 20, {
              handoverId: "H1",
              quantitySupplied: 14,
              quantityNotSupplied: 14,
              reasonCode: "out",
            }),
          ],
          [],
        ],
        [line(), [ev("buying_outside", 20, { reasonCode: "out", quantityNotSupplied: 28 })], []],
      ];
      vi.useFakeTimers();
      vi.setSystemTime(T(60));
      const before = fixtures.map(([l, e, q]) => lineStatus(l, e, q, "standard"));
      vi.setSystemTime(T(60 + 30 * DAY));
      const after = fixtures.map(([l, e, q]) => lineStatus(l, e, q, "standard"));
      expect(after).toEqual(before);
      expect(before.map(keyOf)).toEqual([
        "awaiting_cosign",
        "to_review",
        "queried",
        "ready",
        "owed",
        "buying_outside",
      ]);
      expect(fixtures.map(([, , q]) => q.map((x) => queryState(x)))).toEqual([
        [],
        [],
        ["open"],
        [],
        [],
        [],
      ]);
    });

    it("LO-5 the engine never reads the clock", () => {
      const src = readFileSync(resolve(process.cwd(), "lib/pharmacy/lines.ts"), "utf8");
      expect(src).not.toMatch(/Date\.now|new Date\(\)|performance\.now/);
    });
  });

  it("LO-6 scope: window, ward with and without inpatient supply, emergency", () => {
    const base = {
      writtenAt: T(0),
      firstLiveAt: T(-60),
      broughtIn: false,
      lane: "standard" as const,
      origin: "window" as const,
      inpatientSupply: false,
    };
    expect(inScope(base)).toBe("supply");
    expect(inScope({ ...base, writtenAt: T(-120) })).toBe("out");
    expect(inScope({ ...base, writtenAt: T(-120), broughtIn: true })).toBe("supply");
    expect(inScope({ ...base, firstLiveAt: null })).toBe("out");
    expect(inScope({ ...base, origin: "ward" })).toBe("out");
    expect(inScope({ ...base, origin: "ward", lane: "pharmacist_first" })).toBe("review_only");
    expect(inScope({ ...base, origin: "ward", inpatientSupply: true })).toBe("supply");
    expect(inScope({ ...base, origin: "emergency", broughtIn: true, inpatientSupply: true })).toBe(
      "out",
    );
  });

  it("LO-7 a line can be declined only once a query was sent on its current version", () => {
    expect(canDecline("L1", [])).toBe(false);
    expect(canDecline("L1", [query({ lineIds: ["L2"] })])).toBe(false);
    const answered = query({ events: [{ kind: "answered", at: T(20), answer: "keep" }] });
    expect(canDecline("L1", [answered])).toBe(true);
    const declined = ev("declined", 30, { reasonCode: "unsafe_dose" });
    expect(stage(lineStatus(line(), [declined], [], "standard"))).toBe("to_review");
    expect(lineStatus(line(), [declined], [answered], "standard")).toEqual({
      kind: "closed",
      outcome: "declined",
      reasonCode: "unsafe_dose",
    });
    // While the query is open.
    expect(lineStatus(line(), [declined], [query()], "standard")).toMatchObject({
      outcome: "declined",
    });
    // A query on another version (the line it replaced) does not count.
    expect(stage(lineStatus(line({ id: "L2" }), [declined], [query()], "standard"))).toBe(
      "to_review",
    );
  });

  it("LO-8 an outcome carries its coded reason onto the status", () => {
    const r = lineStatus(
      line(),
      [
        ev("buying_outside", 10, { reasonCode: "out" }),
        ev("closed", 20, { reasonCode: "patient_declined" }),
      ],
      [],
      "standard",
    );
    expect(r).toEqual({ kind: "closed", outcome: "closed", reasonCode: "patient_declined" });
  });

  it("LO-9 quantityLeft: the recorded rest, else decided less supplied; none on a closed line", () => {
    expect(quantityLeft({ kind: "stage", stage: "ready" }, 28)).toBe(28);
    expect(quantityLeft({ kind: "open", outcome: "owed", supplied: 14, notSupplied: 14 }, 28)).toBe(
      14,
    );
    expect(
      quantityLeft({ kind: "open", outcome: "owed", supplied: 14, notSupplied: null }, 28),
    ).toBe(14);
    expect(
      quantityLeft({ kind: "open", outcome: "owed", supplied: 14, notSupplied: null }, null),
    ).toBeNull();
    expect(quantityLeft({ kind: "closed", outcome: "supplied" }, 28)).toBe(0);
  });

  it("LO-9 a live supply of more than is left is refused", () => {
    const owed: LineStatus = { kind: "open", outcome: "owed", supplied: 14, notSupplied: 14 };
    expect(applyMove(owed, { kind: "handover_part", quantitySupplied: 15 })).toEqual({
      ok: false,
      reason: "over_quantity",
    });
    expect(applyMove(owed, { kind: "handover_full", quantitySupplied: 15 })).toEqual({
      ok: false,
      reason: "over_quantity",
    });
    // After downtime the medicine has already gone: it records (DT-10).
    expect(applyMove(owed, { kind: "downtime_supplied", quantitySupplied: 15 }).ok).toBe(true);
  });
});

describe("H1 and the prescriber's cancel", () => {
  it("H1 a `completed` row was not continued at visit close: cancelled_by_prescriber, never suppliable", () => {
    const completed = line({ state: "completed", stateChangedAt: T(5) });
    const expected = {
      kind: "closed",
      outcome: "cancelled_by_prescriber",
      reasonCode: NOT_CONTINUED_AT_VISIT_CLOSE,
    };
    expect(lineStatus(completed, [], [], "standard")).toEqual(expected);
    const tries = [
      ev("decision_saved", 10, { lane: "standard" }),
      ev("supplied", 20, { handoverId: "H1", quantitySupplied: 28 }),
      ev("owed", 21, { handoverId: "H2", quantitySupplied: 1, reasonCode: "x1" }),
    ];
    expect(lineStatus(completed, tries, [], "standard")).toEqual(expected);
    expect(lineStatus({ ...completed, stateChangedAt: null }, [], [], "standard")).toEqual(
      expected,
    );
    for (const kind of MOVE_KINDS.filter((k) => k !== "returned"))
      expect(applyMove(expected as LineStatus, { kind, ...withGuards }).ok, kind).toBe(false);
  });

  it("H4 a cancelled row whose cancellation names a replacement is replaced; without one, cancelled", () => {
    const q = query({ events: [{ kind: "answered", at: T(20), answer: "changed" }] });
    const old = line({
      state: "cancelled",
      stateChangedAt: T(19),
      cancellation: { replacedBy: "L9", reasonCode: "changed_after_query" },
    });
    expect(lineStatus(old, [], [q], "standard")).toEqual({ kind: "closed", outcome: "replaced" });
    // The new row enters as a new line.
    expect(stage(lineStatus(line({ id: "L9", createdAt: T(18) }), [], [q], "standard"))).toBe(
      "to_review",
    );
    // Co-sign withdrawn: cancelled with no cancellation row.
    expect(
      lineStatus(line({ state: "cancelled", cosign: "withheld" }), [], [], "standard"),
    ).toEqual({
      kind: "closed",
      outcome: "cancelled_by_prescriber",
    });
  });
});

/* ─── LO-9 property tests ─────────────────────────────────────────── */

/** mulberry32: a small seeded PRNG, so failures reproduce. */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
const RUNS = 2000;

describe("LO-9 properties", () => {
  it(`LO-9 random event sequences (${RUNS}): every line has exactly one stage or one outcome`, () => {
    const r = prng(20261012);
    for (let run = 0; run < RUNS; run++) {
      const events: PharmacyLineEvent[] = [];
      const len = Math.floor(r() * 12);
      for (let i = 0; i < len; i++)
        events.push(
          ev(pick(r, LINE_EVENT_KINDS), 10 + i * 5 + Math.floor(r() * 3), {
            lane: pick(r, [null, "standard", "pharmacist_first"] as const),
            quantitySupplied: r() < 0.5 ? null : Math.floor(r() * 30),
            quantityNotSupplied: r() < 0.5 ? null : Math.floor(r() * 30),
            reasonCode: r() < 0.3 ? null : "fixture_reason",
            handoverId: r() < 0.4 ? null : pick(r, ["H1", "H2", "H3"]),
            enteredAfterDowntime: r() < 0.15,
          }),
        );
      const queries: QueryLite[] =
        r() < 0.4
          ? [
              query({
                sentAt: T(Math.floor(r() * 60)),
                events:
                  r() < 0.5
                    ? []
                    : [
                        {
                          kind: pick(r, ["answered", "withdrawn", "disputed"]),
                          at: T(30 + Math.floor(r() * 40)),
                          answer: "keep",
                        },
                      ],
              }),
            ]
          : [];
      const l = line({
        cosign: pick(r, ["none", "awaiting", "signed"] as const),
        cosignedAt: T(Math.floor(r() * 60)),
        state: pick(r, ["active", "active", "active", "completed", "cancelled"] as const),
        stateChangedAt: r() < 0.5 ? null : T(Math.floor(r() * 80)),
        reviewOnly: r() < 0.1,
      });
      const s = lineStatus(l, events, queries, pick(r, ["standard", "pharmacist_first"] as const));
      const key = keyOf(s);
      expect(STATUS_KEYS).toContain(key);
      expect(key).not.toBe("new");
      const kinds = [s.kind === "stage", s.kind === "open", s.kind === "closed"];
      expect(kinds.filter(Boolean)).toHaveLength(1);
      if (l.state === "completed" && l.stateChangedAt && l.stateChangedAt <= T(10))
        expect(s.kind === "closed" && s.outcome === "supplied").toBe(false);
    }
  });

  it(`LO-9 random moves (${RUNS} sequences): no move outside the table is ever applied`, () => {
    const r = prng(7);
    for (let run = 0; run < RUNS; run++) {
      let s: LineStatus | null = null;
      for (let i = 0; i < 15; i++) {
        const kind: MoveKind = pick(r, MOVE_KINDS);
        const move: Move = {
          kind,
          cleared: r() < 0.5,
          querySent: r() < 0.5,
          writtenBeforeToday: r() < 0.5,
          ...(r() < 0.5
            ? { previous: sample(pick(r, ["to_review", "ready", "owed"] as const))! }
            : {}),
          quantitySupplied: Math.floor(r() * 10),
          quantityNotSupplied: Math.floor(r() * 10),
        };
        const res = applyMove(s, move);
        const rule = ruleFor(keyOf(s), kind);
        if (res.ok) {
          expect(rule, `${keyOf(s)} + ${kind}`).toBeDefined();
          expect(keyOf(res.status)).toBe(
            rule!.to === "previous" ? keyOf(move.previous!) : rule!.to,
          );
          s = res.status;
        } else if (rule && (!rule.guard || res.reason === "over_quantity")) {
          expect(res.reason).toBe("over_quantity");
        }
      }
    }
  });

  it(`LO-9 random live supplies (${RUNS}): the quantity supplied never exceeds what was decided`, () => {
    const r = prng(42);
    for (let run = 0; run < RUNS; run++) {
      const decided = 1 + Math.floor(r() * 40);
      const first = Math.floor(r() * decided);
      let total = first;
      let s: LineStatus = {
        kind: "open",
        outcome: pick(r, OPEN_OUTCOMES),
        supplied: first,
        notSupplied: decided - first,
      };
      for (let i = 0; i < 10 && s.kind === "open"; i++) {
        const kind = pick(r, [
          "handover_part",
          "handover_full",
          "to_owed",
          "to_buying_outside",
        ] as const);
        const q = Math.floor(r() * (decided + 5));
        const res = applyMove(s, { kind, quantitySupplied: q });
        if (!res.ok) continue;
        if (kind === "handover_part" || kind === "handover_full") total += q;
        s = res.status;
        if (s.kind === "open") expect(s.supplied + (s.notSupplied ?? 0)).toBe(decided);
      }
      expect(total).toBeLessThanOrEqual(decided);
    }
  });

  it("LO-9 the fold changes a status only through applyMove", () => {
    const src = readFileSync(resolve(process.cwd(), "lib/pharmacy/lines.ts"), "utf8");
    expect(src.match(/fold\.status = /g)).toEqual(["fold.status = "]);
    expect(src).toMatch(/fold\.status = r\.status;/);
  });
});

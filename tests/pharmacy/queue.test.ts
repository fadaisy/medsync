import type { QueueEncounter, QueueFilters, QueueLine, ReviewQueueRow } from "@/lib/pharmacy/queue";
import { describe, expect, it } from "vitest";

import {
  computeQueue,
  computeReviewQueue,
  defaultLane,
  laneOf,
  lineState,
  placementKey,
  rowState,
  servesRow,
} from "@/lib/pharmacy/queue";

/**
 * Pharmacy Phase 0 — the queue projection (PQ-1..PQ-13, DP-4; gate-a-proposal §5.1). Fixture lines
 * carry invented medicine names, named as fixtures (Law 8).
 */
const H = "11111111-1111-4111-8111-111111111111";
const H2 = "22222222-2222-4222-8222-222222222222";
const T0 = new Date("2026-10-10T06:52:07.413Z");
const at = (min: number) => new Date(T0.getTime() + min * 60_000);
let n = 0;
const line = (o: Partial<QueueLine> = {}): QueueLine => ({
  id: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
  placementId: "aaaaaaaa-0000-4000-8000-000000000001",
  placementLine: null,
  hospitalId: H,
  encounterId: "e1",
  patientUserId: "p1",
  prescriberUserId: "dr1",
  prescriberCadre: "Medical officer",
  drugName: "Fixture medicine A",
  kind: "drug",
  state: "active",
  controlled: false,
  conditionId: "c1",
  regimenId: "r1",
  checkAnswers: [],
  confirmedFlags: [],
  cosign: null,
  createdAt: T0,
  updatedAt: T0,
  ...o,
});
const enc = (o: Partial<QueueEncounter> = {}): QueueEncounter => ({
  id: "e1",
  departmentId: "d-clinic",
  departmentName: "Diabetes clinic",
  encounterType: "opd",
  disposition: null,
  admitted: false,
  ...o,
});
const ALL: QueueFilters = { lane: "all", state: "all", from: "all", sort: "written", desc: false };
const run = (lines: QueueLine[], encs: QueueEncounter[] = [enc()], f: Partial<QueueFilters> = {}) =>
  computeQueue({
    lines,
    encounters: new Map(encs.map((e) => [e.id, e])),
    hospitalId: H,
    filters: { ...ALL, ...f },
  });

describe("PQ-1: one row per placement", () => {
  it("three lines of one placement are one row, medicines in the order written", () => {
    const p = "aaaaaaaa-0000-4000-8000-0000000000aa";
    const r = run([
      line({ placementId: p, drugName: "Fixture C", createdAt: T0 }),
      line({ placementId: p, drugName: "Fixture A", createdAt: T0 }),
      line({ placementId: p, drugName: "Fixture B", createdAt: T0 }),
    ]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]!.medicines).toHaveLength(3);
    expect(r.rows[0]!.groupedByTime).toBe(false);
  });

  it("medicines keep the order written: lines of one placement share a time, the line number orders them", () => {
    const p = "aaaaaaaa-0000-4000-8000-0000000000ab";
    // Ids chosen so that sorting by id would reverse them.
    const r = run([
      line({
        id: "ffffffff-0000-4000-8000-000000000001",
        placementId: p,
        placementLine: 1,
        drugName: "Fixture first",
      }),
      line({
        id: "eeeeeeee-0000-4000-8000-000000000001",
        placementId: p,
        placementLine: 2,
        drugName: "Fixture second",
      }),
      line({
        id: "dddddddd-0000-4000-8000-000000000001",
        placementId: p,
        placementLine: 3,
        drugName: "Fixture third",
      }),
    ]);
    expect(r.rows[0]!.medicines).toEqual(["Fixture first", "Fixture second", "Fixture third"]);
  });

  it("older rows group by encounter, prescriber and the one transaction time, marked", () => {
    const r = run([
      line({ placementId: null, createdAt: T0 }),
      line({ placementId: null, createdAt: T0 }),
      line({ placementId: null, createdAt: at(4) }),
      line({ placementId: null, createdAt: T0, prescriberUserId: "dr2" }),
    ]);
    expect(r.rows.map((x) => x.lineIds.length).sort()).toEqual([1, 1, 2]);
    expect(r.rows.every((x) => x.groupedByTime)).toBe(true);
    expect(placementKey(line({ placementId: null, encounterId: null })).key).toMatch(/^t:none:/);
  });
});

describe("PQ-3: lanes", () => {
  it.each<[string, Partial<QueueEncounter> | null, string]>([
    ["closed home", { disposition: "home" }, "window"],
    ["referred out", { disposition: "referred_out" }, "window"],
    ["legacy discharge", { disposition: "discharge" }, "window"],
    ["closed admitted", { disposition: "admitted" }, "ward"],
    ["legacy observe", { disposition: "observe" }, "ward"],
    ["an admission names it", { admitted: true }, "ward"],
    ["an inpatient encounter, still open", { encounterType: "inpatient" }, "ward"],
    ["an open clinic visit", {}, "open"],
    ["no encounter", null, "open"],
  ])("%s → %s", (_n, o, lane) => {
    expect(laneOf(o === null ? undefined : enc(o))).toBe(lane);
  });
});

describe("PQ-5, PQ-6: states, and nothing disappears", () => {
  it("line states from the stored state and the co-sign", () => {
    expect(lineState({ state: "active", cosign: null })).toBe("prescribed");
    expect(lineState({ state: "active", cosign: "approved" })).toBe("prescribed");
    expect(lineState({ state: "active", cosign: "pending_review" })).toBe("awaiting_cosign");
    expect(lineState({ state: "cancelled", cosign: "returned" })).toBe("cancelled");
    expect(lineState({ state: "completed", cosign: null })).toBe("not_continued");
  });

  it("the row takes the first-ranked line; Cancelled only when every line is", () => {
    const s = (state: string, cosign: string | null = null) => ({ state, cosign });
    expect(rowState([s("active", "pending_review"), s("active")])).toBe("awaiting_cosign");
    expect(rowState([s("cancelled"), s("active")])).toBe("prescribed");
    expect(rowState([s("cancelled"), s("completed")])).toBe("not_continued");
    expect(rowState([s("cancelled"), s("cancelled")])).toBe("cancelled");
  });

  it("a cancelled prescription stays in All, with when", () => {
    const p = "aaaaaaaa-0000-4000-8000-0000000000bb";
    const r = run([
      line({ placementId: p, state: "cancelled", updatedAt: at(28) }),
      line({ placementId: p, state: "cancelled", updatedAt: at(30) }),
    ]);
    expect(r.total).toBe(1);
    expect(r.rows[0]!.state).toBe("cancelled");
    expect(r.rows[0]!.cancelledAt).toEqual(at(30));
  });
});

describe("PQ-7: changed, without a print record", () => {
  it("one of three lines cancelled: the row stays Prescribed and gains the change time", () => {
    const p = "aaaaaaaa-0000-4000-8000-0000000000cc";
    const r = run([
      line({ placementId: p }),
      line({ placementId: p, state: "cancelled", cosign: "returned", updatedAt: at(28) }),
      line({ placementId: p }),
    ]);
    expect(r.rows[0]!.state).toBe("prescribed");
    expect(r.rows[0]!.changedAt).toEqual(at(28));
  });

  it("an untouched prescription has no change time, whatever updated_at says", () => {
    expect(run([line({ updatedAt: at(0.01) })]).rows[0]!.changedAt).toBeNull();
  });
});

describe("PQ-8: the checks cell, from stored answers only", () => {
  it("orders stops, controlled, child, renal, typed", () => {
    const r = run([
      line({
        controlled: true,
        regimenId: null,
        checkAnswers: [
          { code: "kidney", answer: "aware_monitor", outcome: "check" },
          { code: "child", answer: "senior_agreed", outcome: "check" },
          { code: "dose_reference", answer: "senior_agreed", outcome: "stop" },
        ],
      }),
    ]);
    expect(r.rows[0]!.checks).toEqual([
      "1 stop overridden",
      "Controlled drug, witnessed",
      "Child under 16",
      "Renal check answered",
      "Typed dose",
    ]);
  });

  it("before levels were stored, only an answered allergy reads as a stop", () => {
    const r = run([
      line({
        checkAnswers: [
          { code: "allergy", answer: "not_allergic" },
          { code: "child", answer: "senior_agreed" },
        ],
      }),
    ]);
    expect(r.rows[0]!.checks).toEqual(["1 stop overridden", "Child under 16"]);
  });

  it("an EMR-sheet row: confirmed flags only, no witness claim, never 'typed'", () => {
    const r = run([
      line({ conditionId: null, regimenId: null, controlled: true, confirmedFlags: ["allergy"] }),
    ]);
    expect(r.rows[0]!.checks).toEqual(["1 stop overridden", "Controlled drug"]);
  });

  it("nothing stored, nothing shown", () => {
    expect(run([line()]).rows[0]!.checks).toEqual([]);
  });
});

describe("PQ-9, PQ-10, PQ-11: counts, order, hospital", () => {
  const p = (i: number) => `aaaaaaaa-0000-4000-8000-${String(i).padStart(12, "0")}`;
  const encs = [
    enc({ id: "w", disposition: "home" }),
    enc({ id: "a", disposition: "admitted", departmentId: "d-ward", departmentName: "Ward 4A" }),
    enc({ id: "o" }),
  ];
  const lines = [
    line({ placementId: p(1), encounterId: "w", createdAt: at(10) }),
    line({ placementId: p(2), encounterId: "w", createdAt: at(5), cosign: "pending_review" }),
    line({ placementId: p(3), encounterId: "a", createdAt: at(1) }),
    line({ placementId: p(4), encounterId: "o", createdAt: at(7) }),
    line({ placementId: p(5), encounterId: "w", createdAt: at(2), hospitalId: H2 }),
  ];

  it("lane counts ignore the lane filter and add up to All; state counts respect it", () => {
    const r = run(lines, encs, { lane: "window" });
    expect(r.laneCounts).toEqual({ window: 2, ward: 1, open: 1, all: 4 });
    expect(r.stateCounts).toMatchObject({ all: 2, awaiting_cosign: 1, prescribed: 1 });
    expect(r.rows).toHaveLength(2);
  });

  it("oldest first; a re-sort is stable", () => {
    expect(run(lines, encs).rows.map((x) => x.key)).toEqual([p(3), p(2), p(4), p(1)]);
    const byState = run(lines, encs, { sort: "state" }).rows.map((x) => x.key);
    expect(byState).toEqual([p(2), p(3), p(4), p(1)]);
  });

  it("PQ-11: a line from another hospital never appears", () => {
    expect(run(lines, encs).rows.some((x) => x.key === p(5))).toBe(false);
  });

  it("the ward or clinic filter narrows every count", () => {
    const r = run(lines, encs, { from: "d-ward" });
    expect(r.laneCounts).toEqual({ window: 0, ward: 1, open: 0, all: 1 });
    expect(r.total).toBe(4);
  });
});

describe("PQ-13: property — every placement exactly once under All, lanes sum to All", () => {
  // A seeded generator, so a failure replays.
  let seed = 20261010;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)]!;

  it("500 random queues", () => {
    for (let run_ = 0; run_ < 500; run_++) {
      const encs = Array.from({ length: 6 }, (_, i) =>
        enc({
          id: `e${i}`,
          departmentId: pick(["d1", "d2", null]),
          departmentName: "Fixture place",
          encounterType: pick(["opd", "inpatient", "emergency"]),
          disposition: pick([null, "home", "admitted", "referred_out", "observe", "deceased"]),
          admitted: rnd() < 0.1,
        }),
      );
      const placements = Array.from({ length: Math.floor(rnd() * 25) }, (_, i) => ({
        id: rnd() < 0.3 ? null : `aaaaaaaa-0000-4000-8000-${String(i).padStart(12, "0")}`,
        enc: pick(encs).id,
        dr: pick(["dr1", "dr2"]),
        t: at(Math.floor(rnd() * 600)),
        h: rnd() < 0.1 ? H2 : H,
      }));
      const lines = placements.flatMap((pl) =>
        Array.from({ length: 1 + Math.floor(rnd() * 4) }, () =>
          line({
            placementId: pl.id,
            encounterId: pl.enc,
            prescriberUserId: pl.dr,
            createdAt: pl.t,
            hospitalId: pl.h,
            state: pick(["active", "active", "cancelled", "completed"]),
            cosign: pick([null, null, "pending_review", "approved", "returned"]),
          }),
        ),
      );
      const expected = new Set(
        lines.filter((l) => l.hospitalId === H).map((l) => placementKey(l).key),
      );
      const all = computeQueue({
        lines,
        encounters: new Map(encs.map((e) => [e.id, e])),
        hospitalId: H,
        filters: {
          lane: pick(["all", "window", "ward", "open"] as const),
          state: "all",
          from: "all",
          sort: pick(["written", "from", "state"] as const),
          desc: rnd() < 0.5,
        },
      });
      expect(all.total).toBe(expected.size);
      expect(all.laneCounts.window + all.laneCounts.ward + all.laneCounts.open).toBe(
        all.laneCounts.all,
      );
      expect(all.laneCounts.all).toBe(expected.size);
      const full = computeQueue({
        lines,
        encounters: new Map(encs.map((e) => [e.id, e])),
        hospitalId: H,
        filters: ALL,
      });
      const keys = full.rows.map((r) => r.key);
      expect(new Set(keys).size).toBe(keys.length);
      expect(new Set(keys)).toEqual(expected);
      const states = full.stateCounts;
      expect(
        states.awaiting_cosign + states.prescribed + states.not_continued + states.cancelled,
      ).toBe(states.all);
    }
  });
});

describe("DP-4: the dispensing point picks the opening lane", () => {
  it.each([
    ["window", "window"],
    ["wards", "ward"],
    ["emergency", "ward"],
    ["all", "all"],
    [null, "all"],
  ] as const)("%s → %s", (serves, lane) => {
    expect(defaultLane(serves)).toBe(lane);
  });
});

describe("the review queue (Pharmacy Phase 1, 5.2)", () => {
  const r = (o: Partial<ReviewQueueRow> & { key: string }): ReviewQueueRow => ({
    lane: "standard",
    stage: "to_review",
    origin: "window",
    reasons: [],
    writtenAt: "2026-10-12T07:00:00.000Z",
    earlier: false,
    ...o,
  });
  const rows = [
    r({
      key: "a",
      lane: "pharmacist_first",
      reasons: ["renal_check"],
      writtenAt: "2026-10-12T06:00:00.000Z",
    }),
    r({
      key: "b",
      lane: "pharmacist_first",
      reasons: ["overridden_stop"],
      writtenAt: "2026-10-12T07:30:00.000Z",
    }),
    r({ key: "c", stage: "queried" }),
    r({ key: "d", origin: "ward", lane: "pharmacist_first", reasons: ["controlled"] }),
    r({ key: "e", earlier: true, writtenAt: "2026-10-09T07:00:00.000Z" }),
  ];

  it("lane counts ignore the lane filter and add up to All; stage counts are within lane and point", () => {
    const q = computeReviewQueue(rows, {
      lane: "pharmacist_first",
      stage: "all",
      serves: "window",
    });
    expect(q.laneCounts).toEqual({ pharmacist_first: 2, standard: 2, all: 4 });
    expect(q.laneCounts.pharmacist_first + q.laneCounts.standard).toBe(q.laneCounts.all);
    expect(q.stageCounts).toMatchObject({ all: 2, to_review: 2, queried: 0 });
    const all = computeReviewQueue(rows, { lane: "all", stage: "all", serves: null });
    expect(all.total).toBe(5);
  });

  it("an overridden stop first, then oldest first; earlier rows under the divider", () => {
    const q = computeReviewQueue(rows, { lane: "all", stage: "all", serves: "window" });
    expect(q.today.map((x) => x.key)).toEqual(["b", "a", "c"]);
    expect(q.earlier.map((x) => x.key)).toEqual(["e"]);
    const std = computeReviewQueue(rows, { lane: "standard", stage: "queried", serves: "all" });
    expect(std.today.map((x) => x.key)).toEqual(["c"]);
  });

  it("5.1: a point serves the prescriptions written where it serves", () => {
    expect(servesRow("wards", "ward")).toBe(true);
    expect(servesRow("window", "ward")).toBe(false);
    expect(servesRow("all", "window")).toBe(true);
    expect(servesRow(null, "ward")).toBe(true);
  });
});

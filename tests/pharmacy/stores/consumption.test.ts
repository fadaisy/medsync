import type { Movement } from "@/lib/pharmacy/stock/ledger";
import type { Locations } from "@/lib/pharmacy/stores/consumption";
import type { StoreMovement } from "@/lib/pharmacy/stores/ledger";
import { describe, expect, it } from "vitest";

import { localDate, stockoutSpans } from "@/lib/pharmacy/stock/ledger";
import { adjustedAmc, consumption, daysOutOfStock } from "@/lib/pharmacy/stores/consumption";
import { addDays, dayStart } from "@/lib/pharmacy/stores/ledger";
import { at, batch, int, mv, prng } from "./fixtures";

const locations: Locations = new Map([
  ["store", { kind: "store", model: null }],
  ["opd", { kind: "dispensing_point", model: null }],
  ["ward4", { kind: "ward", model: "issue_only" }],
  ["ward6", { kind: "ward", model: "stocked" }],
  ["cart1", { kind: "cart", model: null }],
  ["q", { kind: "quarantine", model: null }],
]);
const march = { from: at("2026-03-01T00:00:00"), to: at("2026-04-01T00:00:00") };

describe("CN-1 hospital consumption (gate A worked example)", () => {
  const t = at("2026-03-10T09:00:00");
  const pair = (from: string, to: string, q: number, id: string) => [
    mv(`b-${from}`, from, "issued", -q, t, { pairId: id }),
    mv(`b-${to}`, to, "received_from_issue", q, t, { pairId: id }),
  ];
  const ms: StoreMovement[] = [
    mv("b-store", "store", "received", 300, at("2026-03-01T09:00:00")),
    ...pair("store", "opd", 100, "p1"),
    mv("b-opd", "opd", "supplied", -60, t),
    ...pair("store", "ward4", 40, "p2"),
    ...pair("store", "ward6", 50, "p3"),
    mv("b-ward6", "ward6", "ward_used", -30, at("2026-03-28T09:00:00"), { sourceKind: "count" }),
    mv("b-store", "store", "quarantined_out", -5, t, { pairId: "p4" }),
    mv("b-q", "q", "quarantined_in", 5, t, { pairId: "p4" }),
    mv("b-q", "q", "written_off", -5, at("2026-03-20T09:00:00")),
  ];
  it("= 60 supplied + 40 to an issue-only ward + 30 used on a stocked ward = 130; write-offs apart", () => {
    const r = consumption(ms, locations, march);
    expect(r.consumption).toBe(130);
    expect(r.terms).toEqual({ suppliedNet: 60, wardUsed: 30, cartUsed: 0, issueOnlyWardNet: 40 });
    expect(r.losses).toEqual({ writtenOff: 5, adjusted: 0, countCorrection: 0 });
  });
  it("internal transfers, quarantine moves and loans are not consumption; reversals net off", () => {
    const extra = [
      mv("b-store", "store", "lent", -10, t, { counterpartyId: "fac" }),
      mv("b-opd", "opd", "reversed", 5, t),
      mv("b-cart", "cart1", "cart_used", -2, t, { sourceKind: "count" }),
    ];
    expect(consumption([...ms, ...extra], locations, march).consumption).toBe(130 - 5 + 2);
  });
});

describe("CN-2 location consumption", () => {
  it("is the same rule at one location", () => {
    const t = at("2026-03-10T09:00:00");
    const ms = [
      mv("b-opd", "opd", "supplied", -60, t),
      mv("b-w", "ward4", "received_from_issue", 40, t, { pairId: "p" }),
      mv("b-s", "store", "issued", -40, t, { pairId: "p" }),
    ];
    expect(consumption(ms, locations, march, "opd").consumption).toBe(60);
    expect(consumption(ms, locations, march, "ward4").consumption).toBe(40);
    expect(consumption(ms, locations, march, "store").consumption).toBe(0);
  });
});

/** Phase 1 SL-9 days, end-of-day rule: a span open at the last instant of the local day. */
function sl9Days(
  movements: Movement[],
  batches: ReturnType<typeof batch>[],
  from: string,
  to: string,
) {
  const spans = stockoutSpans(
    movements,
    batches,
    "fx-medicine-a",
    "opd",
    localDate,
    at("2026-05-01T00:00:00"),
  );
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const end = dayStart(addDays(d, 1));
    if (spans.some((s) => s.startedAt < end && (s.endedAt === null || s.endedAt >= end)))
      out.push(d);
  }
  return out;
}

describe("CN-3 days out of stock", () => {
  it("property: with one point and no store, equals Phase 1's SL-9 days", () => {
    for (let seed = 1; seed <= 150; seed++) {
      const r = prng(seed);
      const bs = [
        batch({
          id: "a",
          pointId: "opd",
          expiry: `2026-03-${String(int(r, 5, 31)).padStart(2, "0")}`,
        }),
        batch({ id: "b", pointId: "opd", expiry: "2027-01-31" }),
      ];
      const bal = new Map([
        ["a", int(r, 1, 30)],
        ["b", 0],
      ]);
      const ms: Movement[] = [
        {
          id: `${seed}-0`,
          batchId: "a",
          pointId: "opd",
          kind: "received",
          quantity: bal.get("a") ?? 1,
          effectiveAt: at("2026-02-27T09:00:00"),
          recordedAt: at("2026-02-27T09:00:00"),
          downtime: false,
        },
      ];
      const n = int(r, 0, 25);
      const times = Array.from({ length: n }, () => int(r, 0, 31 * 24 * 60 - 1)).sort(
        (x, y) => x - y,
      );
      times.forEach((min, i) => {
        const when = new Date(at("2026-03-01T00:00:00").getTime() + min * 60_000);
        const id = r() < 0.5 ? "a" : "b";
        const held = bal.get(id) ?? 0;
        const q = r() < 0.4 || held === 0 ? int(r, 1, 20) : -int(r, 1, held);
        bal.set(id, held + q);
        ms.push({
          id: `${seed}-${i + 1}`,
          batchId: id,
          pointId: "opd",
          kind: q > 0 ? "received" : "supplied",
          quantity: q,
          effectiveAt: when,
          recordedAt: when,
          downtime: false,
        });
      });
      const got = daysOutOfStock({
        movements: ms,
        batches: bs,
        locations,
        medicineId: "fx-medicine-a",
        fromDate: "2026-03-01",
        toDate: "2026-03-31",
        dayRule: "end_of_day",
      });
      expect("dates" in got && got.dates, `seed ${seed}`).toEqual(
        sl9Days(ms, bs, "2026-03-01", "2026-03-31"),
      );
    }
  });
  it("counts store and points together, excludes blocked, wards and quarantine; any_part catches a gap", () => {
    const bs = [
      batch({ id: "s", pointId: "store" }),
      batch({ id: "p", pointId: "opd" }),
      batch({ id: "w", pointId: "ward6" }),
    ];
    const ms = [
      mv("s", "store", "received", 10, at("2026-02-28T08:00:00")),
      mv("w", "ward6", "received_from_issue", 10, at("2026-02-28T08:00:00"), { pairId: "x" }),
      mv("s", "store", "issued", -10, at("2026-03-02T08:00:00"), { pairId: "y" }),
      mv("p", "opd", "received_from_issue", 10, at("2026-03-02T08:00:00"), { pairId: "y" }),
      mv("p", "opd", "supplied", -10, at("2026-03-03T08:00:00")),
      mv("p", "opd", "received_from_issue", 5, at("2026-03-03T15:00:00"), { pairId: "z" }),
    ];
    const base = {
      movements: ms,
      batches: bs,
      locations,
      medicineId: "fx-medicine-a",
      fromDate: "2026-03-01",
      toDate: "2026-03-04",
    };
    expect(daysOutOfStock({ ...base, dayRule: "end_of_day" })).toEqual({ days: 0, dates: [] });
    expect(daysOutOfStock({ ...base, dayRule: "any_part" })).toEqual({
      days: 1,
      dates: ["2026-03-03"],
    });
    const blockedFrom = new Map([["p", at("2026-03-04T10:00:00")]]);
    expect(daysOutOfStock({ ...base, dayRule: "end_of_day", blockedFrom })).toEqual({
      days: 1,
      dates: ["2026-03-04"],
    });
    expect(daysOutOfStock({ ...base, dayRule: null })).toEqual({ missing: ["stockout_day_rule"] });
  });
});

describe("CN-4 adjusted average monthly consumption", () => {
  const base = {
    consumption: 180,
    windowDays: 60,
    windowMonths: 2,
    daysOut: 15,
    historyDays: 400,
    minHistoryDays: 180,
  };
  it("returns every step: 180 ÷ 45 × 60 ÷ 2 = 120 (gate A fixture)", () => {
    const r = adjustedAmc(base);
    expect("amc" in r && r.amc).toBe(120);
    expect("steps" in r && r.steps.map((s) => s.value)).toEqual([180, 60, 15, 45, 240, 2, 120]);
  });
  it("no days in stock: no figure, and the row says so", () => {
    expect(adjustedAmc({ ...base, daysOut: 60 })).toMatchObject({
      amc: null,
      reason: "no_days_in_stock",
    });
  });
  it("Law 6: unsigned window or minimum history computes nothing", () => {
    expect(adjustedAmc({ ...base, minHistoryDays: null })).toEqual({
      missing: ["minimum_history"],
    });
    expect(adjustedAmc({ ...base, windowMonths: 0 })).toEqual({ missing: ["review_window"] });
  });
});

describe("CN-5 short history", () => {
  it("is flagged, never extrapolated", () => {
    const r = adjustedAmc({
      consumption: 30,
      windowDays: 60,
      windowMonths: 2,
      daysOut: 0,
      historyDays: 30,
      minHistoryDays: 90,
    });
    expect(r).toMatchObject({ amc: 15, flags: ["short_history"] });
  });
});

describe("S6 worked fixture: a 60-day window end to end", () => {
  it("store receives and issues to a point; 180 supplied; 15 days out → AMC 120", () => {
    const bs = [batch({ id: "s", pointId: "store" }), batch({ id: "p", pointId: "opd" })];
    const ms = [
      mv("s", "store", "received", 180, at("2026-03-01T08:00:00")),
      mv("s", "store", "issued", -180, at("2026-03-01T09:00:00"), { pairId: "i1" }),
      mv("p", "opd", "received_from_issue", 180, at("2026-03-01T09:00:00"), { pairId: "i1" }),
      mv("p", "opd", "supplied", -100, at("2026-03-20T10:00:00")),
      mv("p", "opd", "supplied", -80, at("2026-04-15T10:00:00")),
    ];
    const window = { from: at("2026-03-01T00:00:00"), to: at("2026-04-30T00:00:00") };
    const used = consumption(ms, locations, window).consumption;
    const out = daysOutOfStock({
      movements: ms,
      batches: bs,
      locations,
      medicineId: "fx-medicine-a",
      fromDate: "2026-03-01",
      toDate: "2026-04-29",
      dayRule: "end_of_day",
    });
    expect(used).toBe(180);
    expect("days" in out && out.days).toBe(15);
    const amc = adjustedAmc({
      consumption: used,
      windowDays: 60,
      windowMonths: 2,
      daysOut: "days" in out ? out.days : 0,
      historyDays: 60,
      minHistoryDays: 60,
    });
    expect(amc).toMatchObject({ amc: 120, flags: [] });
  });
});

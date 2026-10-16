import type { StockItem, StockLot, StockTx } from "@/lib/lab/stock";
import { describe, expect, it } from "vitest";

import {
  averageMonthlyUse,
  canMoveLot,
  countLine,
  countsDue,
  daysOutOfStock,
  expectedVersusIssued,
  expiryAlerts,
  fefoChoice,
  isExpired,
  LOT_TRANSITIONS,
  lotRefusal,
  nextLotToUse,
  onHand,
  stockLevel,
} from "@/lib/lab/stock";
import { H1, H2, kla, TZ } from "./_fixtures";

const item = (o: Partial<StockItem> = {}): StockItem => ({
  id: "item-strips",
  hospitalId: H1,
  name: "Fixture strips",
  kind: "strip",
  testsPerUnit: 50,
  testCodes: ["test.capillary_glucose"],
  hmisTracerCode: null,
  minMonths: 1,
  maxMonths: 3,
  ...o,
});
const lot = (id: string, o: Partial<StockLot> = {}): StockLot => ({
  id,
  hospitalId: H1,
  itemId: "item-strips",
  lot: id.toUpperCase(),
  useBy: "2027-01-31",
  receivedAt: kla("2026-06-01 09:00"),
  state: "accepted",
  ...o,
});
const tx = (
  kind: StockTx["kind"],
  quantity: number,
  at: string,
  o: Partial<StockTx> = {},
): StockTx => ({
  hospitalId: H1,
  itemId: "item-strips",
  lotId: "lot-a",
  kind,
  quantity,
  reason: null,
  at: kla(at),
  ...o,
});

describe("stock ledger (§6.1)", () => {
  it("ST-1 an item carries kind, tests per unit, linked tests, tracer code and levels", () => {
    const i = item({ hmisTracerCode: "SS11" });
    expect(i).toMatchObject({ kind: "strip", testsPerUnit: 50, hmisTracerCode: "SS11" });
    expect(expectedVersusIssued(i, 100, 2, 10)?.expected).toBe(2);
  });

  it("ST-2 lot states move only along GATE A §5.1, and expired is the clock's verdict", () => {
    expect(canMoveLot("received", "in_acceptance")).toBe(true);
    expect(canMoveLot("in_acceptance", "accepted")).toBe(true);
    expect(canMoveLot("accepted", "in_use")).toBe(true);
    expect(canMoveLot("in_use", "finished")).toBe(true);
    expect(canMoveLot("quarantined", "accepted")).toBe(true);
    expect(canMoveLot("received", "in_use")).toBe(false);
    expect(canMoveLot("rejected", "accepted")).toBe(false);
    expect(canMoveLot("finished", "in_use")).toBe(false);
    expect(LOT_TRANSITIONS.finished).toEqual([]);
    // use-by 13 OCT: still usable at 23:59 Kampala, expired at 00:01 on 14 OCT (21:01Z on the 13th).
    const l = lot("lot-a", { useBy: "2026-10-13", state: "in_use" });
    expect(isExpired(l, kla("2026-10-13 23:59"), TZ)).toBe(false);
    expect(isExpired(l, kla("2026-10-14 00:01"), TZ)).toBe(true);
    expect(l.state).toBe("in_use");
  });

  it("ST-3 on hand is the sum of the ledger, per item, lot and hospital", () => {
    const txs = [
      tx("receipt", 10, "2026-09-01 09:00"),
      tx("issue", -3, "2026-09-02 09:00"),
      tx("count", -1, "2026-09-03 09:00", { reason: "fixture: damaged box" }),
      tx("receipt", 5, "2026-09-03 10:00", { lotId: "lot-b" }),
      tx("return", 1, "2026-09-04 09:00"),
      tx("write_off", -2, "2026-09-05 09:00", { reason: "expired" }),
      tx("receipt", 99, "2026-09-01 09:00", { hospitalId: H2 }),
    ];
    const at = kla("2026-09-30 12:00");
    expect(onHand(txs, { hospitalId: H1, itemId: "item-strips", at })).toBe(10);
    expect(onHand(txs, { hospitalId: H1, itemId: "item-strips", lotId: "lot-a", at })).toBe(5);
    expect(onHand(txs, { hospitalId: H2, itemId: "item-strips", at })).toBe(99);
    expect(
      onHand(txs, { hospitalId: H1, itemId: "item-strips", at: kla("2026-09-02 12:00") }),
    ).toBe(7);
  });

  describe("ST-4 average monthly use and months of stock", () => {
    const q = {
      hospitalId: H1,
      itemId: "item-strips",
      now: kla("2026-10-13 10:00"),
      timeZone: TZ,
      lookBackMonths: 3,
    };
    const history = [
      tx("receipt", 100, "2026-06-15 09:00"),
      tx("issue", -6, "2026-07-10 09:00"),
      tx("issue", -9, "2026-08-10 09:00"),
      tx("issue", -4, "2026-09-10 09:00"),
      tx("return", 1, "2026-09-11 09:00"),
      tx("issue", -50, "2026-10-01 09:00"), // this month: outside the look-back
    ];

    it("ST-4 uses the issues of the last whole months, net of returns", () => {
      expect(averageMonthlyUse(history, q)).toBe(6); // (6 + 9 + 4 − 1) ÷ 3
    });

    it("ST-4 with fewer months of history than the look-back it is 'Not enough history', never a number", () => {
      const short = [tx("receipt", 100, "2026-08-02 09:00"), tx("issue", -10, "2026-09-10 09:00")];
      expect(averageMonthlyUse(short, q)).toBeNull();
      expect(stockLevel(item(), 90, null)).toEqual({
        monthsOfStock: null,
        belowMinimum: false,
        toMaximum: null,
      });
    });

    it("ST-4 two hospitals keep their own history", () => {
      expect(averageMonthlyUse(history, { ...q, hospitalId: H2 })).toBeNull();
    });
  });

  it("ST-5 quantity to reach maximum is max × use − on hand, never negative; below minimum flagged", () => {
    expect(stockLevel(item(), 3, 6)).toEqual({
      monthsOfStock: 0.5,
      belowMinimum: true,
      toMaximum: 15,
    });
    expect(stockLevel(item(), 30, 6)).toEqual({
      monthsOfStock: 5,
      belowMinimum: false,
      toMaximum: 0,
    });
    expect(stockLevel(item({ maxMonths: null }), 3, 6).toMaximum).toBeNull();
    expect(stockLevel(item(), 3, 0).monthsOfStock).toBe(Number.POSITIVE_INFINITY);
  });

  describe("ST-6 first expiry, first out", () => {
    const at = kla("2026-10-13 10:00");
    const lots = [
      lot("lot-late", { useBy: "2027-03-31" }),
      lot("lot-early", { useBy: "2026-12-31", state: "in_use" }),
      lot("lot-earliest-quarantined", { useBy: "2026-11-30", state: "quarantined" }),
      lot("lot-earliest-expired", { useBy: "2026-10-12" }),
      lot("lot-none", { useBy: null }),
      lot("lot-other-hospital", { hospitalId: H2, useBy: "2026-10-20" }),
    ];
    const q = { hospitalId: H1, itemId: "item-strips", at, timeZone: TZ };

    it("ST-6 nextLotToUse returns the selectable lot with the earliest use-by", () => {
      expect(nextLotToUse(lots, q)?.id).toBe("lot-early");
      expect(nextLotToUse(lots, { ...q, hospitalId: H2 })?.id).toBe("lot-other-hospital");
      expect(nextLotToUse([lot("x", { useBy: null }), lot("y")], q)?.id).toBe("y");
    });

    it("ST-6 choosing another lot needs a reason, which is recorded", () => {
      expect(fefoChoice(lots, { ...q, chosenLotId: "lot-early", reason: null })).toEqual({
        ok: true,
        fefoReason: null,
      });
      expect(fefoChoice(lots, { ...q, chosenLotId: "lot-late", reason: " " })).toEqual({
        ok: false,
        error: "fefo_reason_required",
      });
      expect(
        fefoChoice(lots, { ...q, chosenLotId: "lot-late", reason: "fixture: box opened" }),
      ).toEqual({
        ok: true,
        fefoReason: "fixture: box opened",
      });
      expect(fefoChoice(lots, { ...q, chosenLotId: "lot-earliest-expired", reason: "x" })).toEqual({
        ok: false,
        error: "expired",
      });
      expect(fefoChoice(lots, { ...q, chosenLotId: "lot-other-hospital", reason: "x" })).toEqual({
        ok: false,
        error: "unknown_lot",
      });
    });
  });

  describe("ST-7 days out of stock", () => {
    it("ST-7 counts days at 0 at the end of the hospital-local day, across a month boundary", () => {
      // The last unit leaves at 00:30 Kampala on 1 OCT (21:30Z on 30 SEP): 30 SEP ended with stock.
      const txs = [
        tx("receipt", 2, "2026-09-28 09:00"),
        tx("issue", -1, "2026-09-29 09:00"),
        tx("issue", -1, "2026-10-01 00:30"),
        tx("receipt", 5, "2026-10-03 08:00"),
        tx("receipt", 9, "2026-09-28 09:00", { hospitalId: H2 }),
      ];
      const q = { hospitalId: H1, itemId: "item-strips", timeZone: TZ };
      expect(daysOutOfStock(txs, { ...q, fromDay: "2026-09-29", toDay: "2026-10-04" })).toEqual([
        "2026-10-01",
        "2026-10-02",
      ]);
      expect(daysOutOfStock(txs, { ...q, fromDay: "2026-09-01", toDay: "2026-09-30" })).toEqual(
        Array.from({ length: 27 }, (_, i) => `2026-09-${String(i + 1).padStart(2, "0")}`),
      );
      expect(
        daysOutOfStock(txs, { ...q, hospitalId: H2, fromDay: "2026-09-29", toDay: "2026-10-04" }),
      ).toEqual([]);
    });
  });

  it("ST-8 expiry alerts at the window, and expired lots cannot be issued or selected", () => {
    const at = kla("2026-10-13 10:00");
    const lots = [
      lot("a", { useBy: "2026-10-12" }),
      lot("b", { useBy: "2026-10-20" }),
      lot("c", { useBy: "2026-12-31" }),
      lot("d", { useBy: "2026-10-14", state: "finished" }),
      lot("e", { useBy: "2026-10-14", hospitalId: H2 }),
    ];
    expect(expiryAlerts(lots, { hospitalId: H1, at, timeZone: TZ, windowDays: 14 })).toEqual([
      { lotId: "a", kind: "expired", daysLeft: -1 },
      { lotId: "b", kind: "expiring", daysLeft: 7 },
    ]);
    expect(
      expiryAlerts(lots, { hospitalId: H2, at, timeZone: TZ, windowDays: 14 }).map((a) => a.lotId),
    ).toEqual(["e"]);
    expect(lotRefusal(lots[0]!, at, TZ)).toBe("expired");
  });

  it("ST-9 expected versus issued lists a difference beyond the tolerance, and informs only", () => {
    expect(expectedVersusIssued(item(), 500, 10, 10)).toEqual({
      expected: 10,
      issued: 10,
      difference: 0,
      listed: false,
    });
    expect(expectedVersusIssued(item(), 500, 11, 10)?.listed).toBe(false); // exactly 10 %
    expect(expectedVersusIssued(item(), 500, 12, 10)).toMatchObject({
      difference: 2,
      listed: true,
    });
    expect(expectedVersusIssued(item(), 0, 1, 10)?.listed).toBe(true);
    expect(expectedVersusIssued(item({ testsPerUnit: null }), 500, 12, 10)).toBeNull();
  });

  it("ST-10 the count lists items due; a discrepancy needs a reason and adjusts the ledger", () => {
    const items = [
      item({ id: "i1" }),
      item({ id: "i2" }),
      item({ id: "i3" }),
      item({ id: "i4", hospitalId: H2 }),
    ];
    const last = new Map([
      ["i1", kla("2026-10-06 09:00")],
      ["i2", kla("2026-10-10 09:00")],
    ]);
    expect(
      countsDue(items, last, {
        hospitalId: H1,
        now: kla("2026-10-13 08:00"),
        timeZone: TZ,
        everyDays: 7,
      }),
    ).toEqual(["i1", "i3"]);
    expect(
      countsDue(items, last, {
        hospitalId: H2,
        now: kla("2026-10-13 08:00"),
        timeZone: TZ,
        everyDays: 7,
      }),
    ).toEqual(["i4"]);
    expect(countLine({ expected: 10, counted: 8, reason: null })).toEqual({
      ok: false,
      error: "reason_required",
    });
    expect(countLine({ expected: 10, counted: 8, reason: "fixture: broken" })).toEqual({
      ok: true,
      discrepancy: -2,
    });
    expect(countLine({ expected: 10, counted: 10, reason: null })).toEqual({
      ok: true,
      discrepancy: 0,
    });
  });
});

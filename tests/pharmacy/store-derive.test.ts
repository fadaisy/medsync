import type { StoreBatch, StoreRules, StoreWorld } from "@/lib/pharmacy/derive/store/types";
import { describe, expect, it } from "vitest";

import { hbarGeometry, niceStep, tipPosition } from "@/components/pharmacy/charts/geometry";
import { needsSignOff } from "@/lib/pharmacy/derive/store/counts";
import { riskQty } from "@/lib/pharmacy/derive/store/expiry";
import { suggest, trimToBudget } from "@/lib/pharmacy/derive/store/orders";
import {
  daysAt,
  needAt,
  placeBalance,
  spareAt,
  transfers,
} from "@/lib/pharmacy/derive/store/places";
import { shareFair } from "@/lib/pharmacy/derive/store/requisitions";
import { change, storeValueByWeek } from "@/lib/pharmacy/derive/store/stats";
import { fefo } from "@/lib/pharmacy/derive/store/stock";

const rules = {
  monthsTo: 4,
  shortUnder: 2,
  tooMuch: 6,
  notMoving: 180,
  trimTo: 2,
  urgentDays: 7,
  fillTarget: 95,
  runningOut: 7,
  coverAmber: 14,
  transferOver: 60,
  transferUnder: 14,
  countEvery: 30,
  cdCount: 1,
  countSign: 50_000,
  roomTemp: 25,
  roomTempWarn: 23,
  humidity: 60,
  humidityWarn: 55,
  expiryWindow: 6,
  expiryBad: 3,
  balanceCase: 200_000,
  coldNear: 0.5,
} satisfies StoreRules;

const med = (id: string, over = {}) => ({
  id,
  medicineId: id,
  name: id,
  short: id,
  unit: "tablet",
  ven: "E" as const,
  pack: 1,
  cold: false,
  controlled: false,
  cost: 100,
  use: 0,
  moved: 1,
  onOrder: 0,
  bin: null,
  ...over,
});

const world = (over: Partial<StoreWorld>): StoreWorld => ({
  today: "2026-11-03",
  now: "2026-11-03T09:00:00.000Z",
  storeId: "store",
  storeName: "Main store",
  hospitalId: "h",
  actor: { userId: "u", inCharge: true, name: "A" },
  rules,
  meds: [med("m")],
  batches: [],
  places: [
    { id: "a", name: "A", kind: "ward" },
    { id: "b", name: "B", kind: "ward" },
  ],
  placeStock: [],
  dispatches: [],
  requisitions: [],
  runs: [],
  returns: [],
  orders: [],
  suppliers: [],
  shelves: [],
  counts: [],
  stocktake: null,
  quarantine: [],
  losses: [],
  room: [],
  coldRoom: null,
  balances: [],
  balanceCases: [],
  weeks: [],
  storeDays: [],
  placeDays: [],
  expiryActions: {},
  transfersArranged: [],
  card: null,
  ...over,
});

const batch = (no: string, exp: string, qty: number): StoreBatch => ({
  id: no,
  medId: "m",
  no,
  exp,
  bin: null,
  qty,
  waiting: false,
  grn: null,
  receivedAt: null,
});

describe("fefo", () => {
  it("takes the earliest expiry first and spills into the next batch", () => {
    const takes = fefo([batch("late", "2027-06-30", 50), batch("soon", "2027-01-31", 30)], 40);
    expect(takes.map((t) => [t.no, t.n])).toEqual([
      ["soon", 30],
      ["late", 10],
    ]);
  });
  it("skips batches with nothing and never takes more than there is", () => {
    const takes = fefo([batch("none", "2026-12-31", 0), batch("some", "2027-01-31", 5)], 9);
    expect(takes.map((t) => [t.no, t.n])).toEqual([["some", 5]]);
  });
});

describe("shareFair", () => {
  it("water-fills to equal days and never gives more than there is", () => {
    const s = shareFair(
      100,
      [
        { id: "a", urgent: false, asked: 200, have: 0, use: 30 },
        { id: "b", urgent: false, asked: 200, have: 0, use: 90 },
      ],
      7,
    );
    expect(s.give.a! + s.give.b!).toBeLessThanOrEqual(100);
    expect(s.give.a! + s.give.b!).toBeGreaterThanOrEqual(98); // floors, at most one each under
    expect(Math.abs(s.give.b! / s.give.a! - 3)).toBeLessThan(0.2); // equal days: three times the use, three times the stock
  });
  it("urgent reaches its days of cover first", () => {
    const s = shareFair(
      10,
      [
        { id: "calm", urgent: false, asked: 50, have: 0, use: 30 },
        { id: "urgent", urgent: true, asked: 50, have: 0, use: 30 },
      ],
      7,
    );
    expect(s.give.urgent).toBeGreaterThanOrEqual(7);
  });
  it("gives each what it asked when there is plenty", () => {
    const s = shareFair(100, [{ id: "a", urgent: false, asked: 10, have: 0, use: 30 }], 7);
    expect(s.give.a).toBe(10);
  });
});

describe("the places count what is on the way", () => {
  const w = world({
    placeStock: [{ medId: "m", placeId: "a", here: 10, use: 30, level: 100 }],
    dispatches: [
      {
        id: "d",
        voucher: "RIV-0001",
        kind: "requisition",
        fromId: "store",
        toId: "a",
        sentAt: "2026-11-02T09:00:00Z",
        status: "transit",
        note: null,
        receivedAt: null,
        requisitionId: null,
        lines: [{ medId: "m", no: "B1", qty: 20 }],
      },
    ],
  });
  it("needAt = level − here − in transit", () => expect(needAt(w, "m", "a")).toBe(70));
  it("daysAt counts transit", () => expect(daysAt(w, "m", "a")).toBe(30));
});

describe("transfers", () => {
  const at = (aHere: number, bHere: number) =>
    world({
      placeStock: [
        { medId: "m", placeId: "a", here: aHere, use: 30, level: 10 },
        { medId: "m", placeId: "b", here: bHere, use: 30, level: 100 },
      ],
    });
  it("needs strictly over 60 days at one and strictly under 14 at the other", () => {
    expect(transfers(at(60, 5))).toHaveLength(0); // exactly 60 days
    expect(transfers(at(61, 14))).toHaveLength(0); // exactly 14 days
    const t = transfers(at(61, 13));
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ fromId: "a", toId: "b", qty: 51 }); // min(61 − 10, 100 − 13)
  });
  it("spare follows the same rule", () => {
    expect(spareAt(at(60, 5), "m", "b")).toHaveLength(0);
    expect(spareAt(at(61, 5), "m", "b")).toHaveLength(1);
  });
  it("an arranged transfer stays listed with its voucher", () => {
    const w = world({
      ...at(61, 13),
      transfersArranged: [
        { key: "m|a|b", voucher: "TRF-0001", toId: "b", qty: 51, medId: "m", fromId: "a" },
      ],
    });
    expect(transfers(w).find((t) => t.key === "m|a|b")?.voucher).toBe("TRF-0001");
  });
});

describe("suggest", () => {
  it("rounds up to whole packs", () => expect(suggest(100, 4, 150, 50, 30)).toBe(210));
  it("is never negative", () => expect(suggest(10, 4, 500, 0, 10)).toBe(0));
});

describe("trimToBudget", () => {
  const line = (medId: string, ven: "V" | "E" | "N", qty: number, minQty = 0) => ({
    medId,
    ven,
    qty,
    cost: 10,
    pack: 10,
    minQty,
  });
  it("cuts N first, then E, and never V", () => {
    const r = trimToBudget([line("v", "V", 100), line("e", "E", 100), line("n", "N", 100)], 2500);
    expect(r.qty.get("v")).toBe(100);
    expect(r.qty.get("n")).toBe(50);
    expect(r.qty.get("e")).toBe(100);
    expect(r.trimmed).toEqual(["n"]);
    expect(r.stillOver).toBe(false);
  });
  it("stops at the trim quantity and says when it is still over", () => {
    const r = trimToBudget([line("v", "V", 100), line("n", "N", 100, 80)], 1000);
    expect(r.qty.get("n")).toBe(80);
    expect(r.qty.get("v")).toBe(100);
    expect(r.stillOver).toBe(true);
  });
});

describe("riskQty", () => {
  it("is what will not be used before it expires", () => {
    expect(riskQty(100, 10, 6)).toBe(40);
    expect(riskQty(50, 10, 6)).toBe(0);
  });
});

describe("placeBalance", () => {
  const w = (qty: number, controlled = false) =>
    world({
      meds: [med("m", { cost: 1000, controlled }), med("n", { cost: 1000 })],
      balances: [
        {
          placeId: "a",
          medId: "m",
          opening: 100,
          received: 0,
          used: 100 - qty,
          sent: 0,
          closing: 0,
        },
        // A surplus on one line never hides a loss on another.
        { placeId: "a", medId: "n", opening: 0, received: 0, used: 0, sent: 0, closing: 500 },
      ],
    });
  it("sums positive gaps only, in value", () => {
    expect(placeBalance(w(10), "a").gap).toBe(10_000);
    expect(placeBalance(w(10), "a").state).toBe("warn");
  });
  it("goes bad over the case rule, not at it", () => {
    expect(placeBalance(w(99 + 1), "a").gap).toBe(100_000);
    expect(placeBalance(world({ ...w(0), balances: [] }), "a").state).toBe("ok");
  });
  it("any controlled gap is bad", () => expect(placeBalance(w(1, true), "a").state).toBe("bad"));
});

describe("needsSignOff", () => {
  it("is over the rule, not at it", () => {
    expect(needsSignOff(50_000, rules)).toBe(false);
    expect(needsSignOff(50_001, rules)).toBe(true);
  });
});

describe("storeValueByWeek", () => {
  it("ends at the live value and walks back through in and out", () => {
    const weeks = [
      { start: "2026-10-19", inValue: 0, outValue: 10 },
      { start: "2026-10-26", inValue: 50, outValue: 20 },
      { start: "2026-11-02", inValue: 0, outValue: 30 },
    ];
    const v = storeValueByWeek(100, weeks);
    expect(v.at(-1)).toBe(100);
    expect(v[1]).toBe(130);
    expect(v[0]).toBe(100);
  });
});

describe("change", () => {
  it("says when nothing moved", () =>
    expect(change(5, 5, "", true).delta).toBe("Same as last week"));
  it("marks a rise good or bad by the measure", () => {
    expect(change(6, 5, "points", true).good).toBe(true);
    expect(change(6, 5, "", false).good).toBe(false);
  });
});

describe("chart geometry", () => {
  it("niceStep lands on 1, 2, 2.5, 5 or 10 × a power of ten", () => {
    expect(niceStep(4)).toBe(1);
    expect(niceStep(8)).toBe(2);
    expect(niceStep(10)).toBe(2.5);
    expect(niceStep(20)).toBe(5);
    expect(niceStep(40)).toBe(10);
    expect(niceStep(4_000_000)).toBe(1_000_000);
  });
  it("hbar reserve fits the longest value at the tip, and small bars still show", () => {
    const g = hbarGeometry(
      [
        { label: "a", v: 1000, val: "UGX 911,070", color: "#000" },
        { label: "b", v: 1, val: "1", color: "#000" },
        { label: "c", v: 0, val: "0", color: "#000" },
      ],
      {},
    );
    expect(g.reserve).toBe(Math.round(11 * 7.6 + 14));
    expect(g.rows.map((r) => r.f)).toEqual([1, 0.01, 0]);
  });
  it("tips stay inside the plot", () => {
    expect(tipPosition(0, 12)).toBe("start");
    expect(tipPosition(6, 12)).toBe("center");
    expect(tipPosition(11, 12)).toBe("end");
  });
});

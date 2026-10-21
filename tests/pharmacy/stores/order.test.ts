import type { Locations } from "@/lib/pharmacy/stores/consumption";
import type { OrderParameters, OrderRowInput } from "@/lib/pharmacy/stores/order";
import { describe, expect, it } from "vitest";

import { adjustedAmc } from "@/lib/pharmacy/stores/consumption";
import {
  confirmCutRefusal,
  missingParameters,
  proposeRow,
  stockOnHand,
  trimToBudget,
  wholePack,
} from "@/lib/pharmacy/stores/order";
import { batch, int, prng } from "./fixtures";

/** Fixture parameters, not signed values. */
const params: OrderParameters = {
  maxMonths: 4,
  emergencyOrderPointMonths: "not_kept",
  outOfStockShareLimit: 0.5,
  largeDifferenceUnits: 50,
  version: "fx-order-params-v1",
};
const row = (o: Partial<OrderRowInput> = {}): OrderRowInput => ({
  productId: "fx-product-a",
  medicineId: "fx-medicine-a",
  amc: 120,
  stockOnHand: 130,
  packSize: "100",
  windowDays: 60,
  daysOut: 15,
  countedInWindow: true,
  shortHistory: false,
  unexplainedDifference: 0,
  ...o,
});
const ok = (r: ReturnType<typeof proposeRow>) => {
  if ("missing" in r) throw new Error(`missing ${r.missing.join(",")}`);
  return r;
};

describe("OQ-1 maximum stock = AMC × maximum months", () => {
  it("120 × 4 = 480", () => expect(ok(proposeRow(row(), params)).maxStock).toBe(480));
  it("Law 6: a missing parameter computes nothing and names it", () => {
    expect(proposeRow(row(), { ...params, maxMonths: null })).toEqual({ missing: ["max_months"] });
    expect(
      missingParameters({ ...params, emergencyOrderPointMonths: null, version: null }),
    ).toEqual(["emergency_order_point", "version"]);
  });
});

describe("OQ-2 proposed = maximum − stock on hand, never negative", () => {
  it("is zero when stock exceeds the maximum", () => {
    expect(ok(proposeRow(row({ stockOnHand: 900 }), params)).proposedUnits).toBe(0);
  });
  it("stock on hand: store and points only, unexpired and unblocked (D-PH2-09)", () => {
    const locations: Locations = new Map([
      ["store", { kind: "store", model: null }],
      ["opd", { kind: "dispensing_point", model: null }],
      ["ward", { kind: "ward", model: "stocked" }],
      ["cart", { kind: "cart", model: null }],
      ["q", { kind: "quarantine", model: null }],
    ]);
    const bs = [
      batch({ id: "s", pointId: "store" }),
      batch({ id: "p", pointId: "opd" }),
      batch({ id: "w", pointId: "ward" }),
      batch({ id: "c", pointId: "cart" }),
      batch({ id: "q", pointId: "q" }),
      batch({ id: "old", pointId: "store", expiry: "2026-01-31" }),
      batch({ id: "rc", pointId: "opd" }),
    ];
    const balances = new Map(bs.map((b) => [b.id, 10]));
    expect(
      stockOnHand({
        batches: bs,
        balances,
        locations,
        blocked: new Set(["rc"]),
        localDate: "2026-10-21",
        productIds: new Set(["fx-product-a"]),
      }),
    ).toBe(20);
  });
});

describe("OQ-3 issue units to packs", () => {
  it("rounds up to whole packs only for a whole-number pack size", () => {
    expect(ok(proposeRow(row(), params))).toMatchObject({
      proposedUnits: 400,
      proposedPacks: 4,
      packSize: 100,
    });
    const loose = ok(proposeRow(row({ packSize: "10 x 10" }), params));
    expect(loose).toMatchObject({ proposedUnits: 350, proposedPacks: null });
    expect(loose.flags).toContain("pack_size_not_whole");
    expect([
      wholePack("100"),
      wholePack(" 28 "),
      wholePack("1x10"),
      wholePack("0"),
      wholePack(null),
    ]).toEqual([100, 28, null, null, null]);
  });
});

describe("OQ-4 emergency order point", () => {
  it("flags months of stock below it; orders nothing", () => {
    const r = ok(proposeRow(row({ stockOnHand: 60 }), { ...params, emergencyOrderPointMonths: 1 }));
    expect(r.flags).toContain("below_emergency_order_point");
    expect(
      ok(proposeRow(row({ stockOnHand: 200 }), { ...params, emergencyOrderPointMonths: 1 })).flags,
    ).not.toContain("below_emergency_order_point");
  });
});

describe("OQ-5 VEN trimming", () => {
  const lines = [
    { productId: "v1", ven: "V" as const, units: 100, unitPrice: 10, packSize: 10 },
    { productId: "e1", ven: "E" as const, units: 100, unitPrice: 5, packSize: 10 },
    { productId: "n1", ven: "N" as const, units: 100, unitPrice: 2, packSize: 10 },
    { productId: "u1", ven: null, units: 50, unitPrice: 2, packSize: null },
  ];
  it("cuts necessary, then essential, then vital, by whole packs, only as far as the budget needs", () => {
    // Total 1000 + 500 + 200 + 100 = 1800; budget 1450: cut 350.
    const r = trimToBudget(lines, 1450, "N");
    expect(r).toMatchObject({ totalBefore: 1800, met: true });
    expect("cuts" in r && r.cuts.map((c) => [c.productId, c.toUnits, c.needsReason])).toEqual([
      ["n1", 0, false],
      ["u1", 0, false],
      ["e1", 90, false],
    ]);
  });
  it("vital cuts need a typed reason; returns proposals only", () => {
    const r = trimToBudget(lines, 300, "N");
    const vital = "cuts" in r ? r.cuts.find((c) => c.trimmedAs === "V") : undefined;
    expect(vital).toMatchObject({ productId: "v1", needsReason: true, toUnits: 30 });
    expect(confirmCutRefusal(vital as NonNullable<typeof vital>, "")).toBe("reason_needed");
    expect(
      confirmCutRefusal(vital as NonNullable<typeof vital>, "Donated supply expected"),
    ).toBeNull();
  });
  it("unclassed lines are never silently necessary: unsigned choice, or an unknown price, computes nothing", () => {
    expect(trimToBudget(lines, 1000, null)).toEqual({
      missing: ["unclassed_trim_order"],
      unpriced: [],
    });
    expect(
      trimToBudget(
        [{ productId: "v1", ven: "V", units: 1, unitPrice: null, packSize: null }],
        1,
        "N",
      ),
    ).toEqual({
      missing: ["price"],
      unpriced: ["v1"],
    });
  });
});

describe("OQ-6 every row carries inputs, formula in words and parameter versions", () => {
  it("prints its own appendix", () => {
    const r = ok(proposeRow(row(), params));
    expect(r.inputs).toMatchObject({ amc: 120, stockOnHand: 130, packSize: "100", maxMonths: 4 });
    expect(r.formula.length).toBeGreaterThan(0);
    expect(r.version).toBe("fx-order-params-v1");
  });
  it("5.9 warnings, and those whose parameter is unsigned are named as not checked", () => {
    const r = ok(
      proposeRow(
        row({ daysOut: 40, countedInWindow: false, shortHistory: true, unexplainedDifference: 60 }),
        params,
      ),
    );
    expect(r.flags).toEqual(
      expect.arrayContaining([
        "mostly_out_of_stock",
        "not_counted_in_window",
        "short_history",
        "large_unexplained_difference",
      ]),
    );
    const u = ok(
      proposeRow(row(), { ...params, outOfStockShareLimit: null, largeDifferenceUnits: null }),
    );
    expect(u.notChecked).toEqual(["out_of_stock_share", "large_difference"]);
  });
});

describe("OQ-7 properties", () => {
  it("never negative, never above maximum + one pack − one unit, grows with consumption", () => {
    for (let seed = 1; seed <= 500; seed++) {
      const r = prng(seed);
      const amc = int(r, 0, 5000) / int(r, 1, 7);
      const soh = int(r, 0, 20000);
      const pack = int(r, 1, 500);
      const p = ok(proposeRow(row({ amc, stockOnHand: soh, packSize: String(pack) }), params));
      expect(p.proposedUnits, `seed ${seed}`).toBeGreaterThanOrEqual(0);
      expect(p.proposedUnits, `seed ${seed}`).toBeLessThanOrEqual(Math.ceil(amc * 4) + pack - 1);
      const more = ok(
        proposeRow(
          row({ amc: amc + int(r, 1, 500), stockOnHand: soh, packSize: String(pack) }),
          params,
        ),
      );
      expect(more.proposedUnits, `seed ${seed}`).toBeGreaterThanOrEqual(p.proposedUnits);
    }
  });
  it("is unchanged by transfers between pharmacy locations", () => {
    const locations: Locations = new Map([
      ["store", { kind: "store", model: null }],
      ["opd", { kind: "dispensing_point", model: null }],
    ]);
    const bs = [batch({ id: "s", pointId: "store" }), batch({ id: "p", pointId: "opd" })];
    const soh = (s: number, p: number) =>
      stockOnHand({
        batches: bs,
        balances: new Map([
          ["s", s],
          ["p", p],
        ]),
        locations,
        blocked: new Set(),
        localDate: "2026-10-21",
        productIds: new Set(["fx-product-a"]),
      });
    for (let seed = 1; seed <= 100; seed++) {
      const r = prng(seed);
      const s = int(r, 0, 1000);
      const move = int(r, 0, s);
      const before = ok(proposeRow(row({ stockOnHand: soh(s, 50) }), params));
      const after = ok(proposeRow(row({ stockOnHand: soh(s - move, 50 + move) }), params));
      expect(after.proposedUnits).toBe(before.proposedUnits);
    }
  });
  it("S5: equals a hand calculation on three fixture products", () => {
    const amc = (consumption: number, daysOut: number) => {
      const a = adjustedAmc({
        consumption,
        windowDays: 60,
        windowMonths: 2,
        daysOut,
        historyDays: 365,
        minHistoryDays: 90,
      });
      return "amc" in a ? a.amc : null;
    };
    const p = { ...params, emergencyOrderPointMonths: 1.5 };
    // A: 180 used, 15 days out → 180 ÷ 45 × 60 ÷ 2 = 120; max 480; 480 − 130 = 350 → 4 packs of 100 = 400.
    const a = ok(
      proposeRow(row({ productId: "A", amc: amc(180, 15), stockOnHand: 130, packSize: "100" }), p),
    );
    // B: 60 used, no days out → 30; max 120; 150 on hand → 0.
    const b = ok(
      proposeRow(
        row({ productId: "B", amc: amc(60, 0), stockOnHand: 150, packSize: "30", daysOut: 0 }),
        p,
      ),
    );
    // C: 40 used, 12 days out → 40 ÷ 48 × 60 ÷ 2 = 25; max 100; 100 − 37 = 63; pack "1 x 10" not whole → 63, flagged.
    const c = ok(
      proposeRow(
        row({ productId: "C", amc: amc(40, 12), stockOnHand: 37, packSize: "1 x 10", daysOut: 12 }),
        p,
      ),
    );
    expect([a.maxStock, a.proposedUnits, a.proposedPacks]).toEqual([480, 400, 4]);
    expect([b.maxStock, b.proposedUnits, b.proposedPacks]).toEqual([120, 0, 0]);
    expect([c.maxStock, c.proposedUnits, c.proposedPacks]).toEqual([100, 63, null]);
    expect(c.flags).toEqual(
      expect.arrayContaining(["pack_size_not_whole", "below_emergency_order_point"]),
    );
    expect(a.flags).toContain("below_emergency_order_point");
    expect(b.flags).not.toContain("below_emergency_order_point");
  });
});

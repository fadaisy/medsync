import { describe, expect, it } from "vitest";

import {
  chargeFor,
  modeOn,
  priceInForce,
  proposePrice,
  stockValue,
} from "@/lib/pharmacy/prices/engine";

const rule = { multiplier: 1.25, roundingStep: 50, payerAdjustments: { staff: 0.8 } };

describe("prices (Step 8)", () => {
  it("S26: a proposal shows its arithmetic and rounds up to the step", () => {
    expect(proposePrice(130, rule, "cash")).toEqual({
      price: 200,
      steps: [
        { label: "Last unit cost", value: 130 },
        { label: "× 1.25 markup", value: 162.5 },
        { label: "Rounded up to 50", value: 200 },
      ],
    });
    expect(proposePrice(130, rule, "staff")!.price).toBe(150);
    expect(proposePrice(80, { ...rule, multiplier: 1.1, roundingStep: 1 }, "cash")!.price).toBe(88);
    expect(proposePrice(null, rule, "cash")).toBeNull();
    expect(proposePrice(100, null, "cash")).toBeNull();
  });

  it("S27: the price in force is the latest from on or before the date", () => {
    const row = (fromDate: string, priceUgx: number | null, free = false, at = 0) => ({
      productId: "p",
      payerId: "cash",
      priceUgx,
      free,
      fromDate,
      createdAt: new Date(at),
    });
    const rows = [
      row("2026-01-01", 100),
      row("2026-03-01", 150),
      row("2026-03-01", 160, false, 5),
      row("2026-06-01", null, true),
    ];
    expect(priceInForce(rows, "p", "cash", "2025-12-31")).toBeNull();
    expect(priceInForce(rows, "p", "cash", "2026-02-15")).toEqual({
      kind: "priced",
      priceUgx: 100,
    });
    expect(priceInForce(rows, "p", "cash", "2026-03-01")).toEqual({
      kind: "priced",
      priceUgx: 160,
    });
    expect(priceInForce(rows, "p", "cash", "2026-07-01")).toEqual({ kind: "free" });
    expect(priceInForce(rows, "p", "staff", "2026-07-01")).toBeNull();
  });

  it("S28, S29: no price is 'price not set', never 0; a free point bills free", () => {
    expect(chargeFor("charged", null)).toEqual({ kind: "price_not_set" });
    expect(chargeFor(null, { kind: "priced", priceUgx: 300 })).toEqual({
      kind: "priced",
      unitPrice: 300,
    });
    expect(chargeFor("free", { kind: "priced", priceUgx: 300 })).toEqual({ kind: "free" });
    expect(chargeFor("charged", { kind: "free" })).toEqual({ kind: "free" });
    const m = (mode: "charged" | "free", fromDate: string) => ({
      mode,
      fromDate,
      createdAt: new Date(0),
    });
    expect(modeOn([], "2026-01-01")).toBe("charged");
    expect(modeOn([m("free", "2026-02-01"), m("charged", "2026-05-01")], "2026-03-01")).toBe(
      "free",
    );
  });

  it("S31: stock value is the hand sum; batches without a cost are named", () => {
    const v = stockValue([
      { batchId: "a", balance: 40, receipts: [{ quantity: 100, unitCost: 120 }] },
      {
        batchId: "b",
        balance: 10,
        receipts: [
          { quantity: 30, unitCost: 100 },
          { quantity: 10, unitCost: 140 },
        ],
      },
      { batchId: "c", balance: 5, receipts: [] },
      { batchId: "d", balance: 0, receipts: [] },
    ]);
    expect(v).toEqual({ valueUgx: 40 * 120 + 10 * 110, unvalued: ["c"] });
  });
});

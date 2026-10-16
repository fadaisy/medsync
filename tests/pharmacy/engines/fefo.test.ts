import type { Batch } from "@/lib/pharmacy/stock/ledger";
import { describe, expect, it } from "vitest";

import { batchChoiceNeedsReason, proposeBatches } from "@/lib/pharmacy/stock/fefo";

/**
 * Pharmacy Phase 1 — first expiry, first out (SU-3, 5.3.1, SL-5). Fixture batches FX-* of "Fixture
 * tablet A" are invented.
 */
const batch = (id: string, expiry: string, expiryMonthOnly = false): Batch => ({
  id,
  pointId: "fixture-point",
  productId: "fixture-product",
  medicineId: "fixture-medicine",
  batchNumber: id.toUpperCase(),
  expiry,
  expiryMonthOnly,
});
const bal = (o: Record<string, number>) => new Map(Object.entries(o));
const today = "2026-10-12";

describe("SU-3 5.3.1 the proposal", () => {
  const batches = [batch("fx-late", "2027-09-30"), batch("fx-early", "2027-03-31")];

  it("SU-3 pre-selects the unexpired batch that expires first", () => {
    expect(
      proposeBatches({
        batches,
        balances: bal({ "fx-late": 100, "fx-early": 50 }),
        quantity: 30,
        localDate: today,
      }),
    ).toEqual({ ok: true, rows: [{ batchId: "fx-early", quantity: 30 }] });
  });

  it("SU-3 splits across batches in expiry order when the first holds less", () => {
    expect(
      proposeBatches({
        batches,
        balances: bal({ "fx-late": 100, "fx-early": 20 }),
        quantity: 30,
        localDate: today,
      }),
    ).toEqual({
      ok: true,
      rows: [
        { batchId: "fx-early", quantity: 20 },
        { batchId: "fx-late", quantity: 10 },
      ],
    });
  });

  it("SU-3 SL-5 an expired first batch is never offered", () => {
    const withExpired = [batch("fx-gone", "2026-10-11"), ...batches];
    expect(
      proposeBatches({
        batches: withExpired,
        balances: bal({ "fx-gone": 500, "fx-early": 5, "fx-late": 5 }),
        quantity: 8,
        localDate: today,
      }),
    ).toEqual({
      ok: true,
      rows: [
        { batchId: "fx-early", quantity: 5 },
        { batchId: "fx-late", quantity: 3 },
      ],
    });
  });

  it("SU-3 an empty or below-zero batch is skipped", () => {
    expect(
      proposeBatches({
        batches,
        balances: bal({ "fx-early": 0, "fx-late": 9 }),
        quantity: 9,
        localDate: today,
      }),
    ).toEqual({ ok: true, rows: [{ batchId: "fx-late", quantity: 9 }] });
    expect(
      proposeBatches({
        batches,
        balances: bal({ "fx-early": -3, "fx-late": 9 }),
        quantity: 9,
        localDate: today,
      }),
    ).toEqual({ ok: true, rows: [{ batchId: "fx-late", quantity: 9 }] });
  });

  it("SU-3 SL-5 a month-only expiry sorts by the month's last day: February, non-leap and leap", () => {
    // Feb 2027 (month only) runs to the 28th: before an exact 1 Mar 2027.
    const nonLeap = [batch("fx-mar", "2027-03-01"), batch("fx-feb", "2027-02-01", true)];
    expect(
      proposeBatches({
        batches: nonLeap,
        balances: bal({ "fx-mar": 5, "fx-feb": 5 }),
        quantity: 1,
        localDate: today,
      }),
    ).toEqual({ ok: true, rows: [{ batchId: "fx-feb", quantity: 1 }] });
    // Feb 2028 (month only) runs to the 29th: after an exact 28 Feb 2028.
    const leap = [batch("fx-feb29", "2028-02-01", true), batch("fx-feb28", "2028-02-28")];
    expect(
      proposeBatches({
        batches: leap,
        balances: bal({ "fx-feb29": 5, "fx-feb28": 5 }),
        quantity: 1,
        localDate: today,
      }),
    ).toEqual({ ok: true, rows: [{ batchId: "fx-feb28", quantity: 1 }] });
    // On 29 Feb 2028 the month-only batch is still in date; on 1 Mar it is not offered.
    expect(
      proposeBatches({
        batches: leap,
        balances: bal({ "fx-feb29": 5 }),
        quantity: 1,
        localDate: "2028-02-29",
      }),
    ).toEqual({ ok: true, rows: [{ batchId: "fx-feb29", quantity: 1 }] });
    expect(
      proposeBatches({
        batches: leap,
        balances: bal({ "fx-feb29": 5 }),
        quantity: 1,
        localDate: "2028-03-01",
      }),
    ).toEqual({ ok: false, reason: "not_enough", available: 0 });
  });

  it("SU-3 SL-5 not enough unexpired stock: nothing is proposed, and expired stock is not available", () => {
    const withExpired = [batch("fx-gone", "2026-09-30"), ...batches];
    expect(
      proposeBatches({
        batches: withExpired,
        balances: bal({ "fx-gone": 100, "fx-early": 4, "fx-late": 6 }),
        quantity: 11,
        localDate: today,
      }),
    ).toEqual({ ok: false, reason: "not_enough", available: 10 });
  });

  it("SU-2 the quantity is a whole number above zero", () => {
    for (const quantity of [0, -1, 2.5, Number.NaN])
      expect(
        proposeBatches({ batches, balances: bal({ "fx-early": 9 }), quantity, localDate: today }),
      ).toEqual({
        ok: false,
        reason: "invalid_quantity",
      });
  });
});

describe("SU-3 5.3.1 another batch needs a reason", () => {
  const proposal = [
    { batchId: "fx-early", quantity: 20 },
    { batchId: "fx-late", quantity: 10 },
  ];
  it("SU-3 the proposal as it stands needs none, in any row order", () => {
    expect(batchChoiceNeedsReason(proposal, proposal)).toBe(false);
    expect(batchChoiceNeedsReason([...proposal].reverse(), proposal)).toBe(false);
  });
  it("SU-3 another batch, or another split, needs a coded reason", () => {
    expect(batchChoiceNeedsReason([{ batchId: "fx-late", quantity: 30 }], proposal)).toBe(true);
    expect(
      batchChoiceNeedsReason(
        [
          { batchId: "fx-early", quantity: 15 },
          { batchId: "fx-late", quantity: 15 },
        ],
        proposal,
      ),
    ).toBe(true);
  });
});

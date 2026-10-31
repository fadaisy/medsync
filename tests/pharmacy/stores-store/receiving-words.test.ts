/**
 * Pharmacy Phase 2, 5.2: every receiving result and refusal has its words (RG-2 to RG-4), the arrival time is read
 * in Kampala time, and Phase 1's Receive stock closes its one-leg sources as the store opens (Law 3, S17a).
 */
import type { DeliveryLine, LineRefusal, LineResult } from "@/lib/pharmacy/stores/receiving";
import { afterEach, describe, expect, it } from "vitest";

import { resultWords, STORE } from "@/content/pharmacy-stores-store";
import { deliveryFromOffered } from "@/lib/pharmacy/stock/store";
import { arrivalText } from "@/lib/pharmacy/stores/receiving";
import { parseArrival, refusalWords } from "@/lib/pharmacy/stores/receiving-store";

const line: DeliveryLine = {
  lineNo: 3,
  productId: "p",
  noteProductId: null,
  orderLineId: null,
  noteQuantity: 10,
  acceptedQuantity: 10,
  rejectedKeptQuantity: 0,
  rejectedReturnedQuantity: 0,
  rejectReason: null,
  batchNumber: "B1",
  expiry: "2027-01-31",
  expiryMonthOnly: false,
  unitCost: null,
  shortDatedDecision: null,
};

describe("RG-2: the results in words (5.2's list)", () => {
  const all: [LineResult, string][] = [
    [{ kind: "matches" }, "Matches"],
    [{ kind: "fewer_than_note", n: 4 }, "4 fewer than the note"],
    [{ kind: "more_than_note", n: 2 }, "2 more than the note"],
    [{ kind: "short_of_order", n: 6 }, "6 short of the order"],
    [{ kind: "not_on_order" }, "Not on the order"],
    [{ kind: "expires_within", lookaheadDays: 90 }, "Expires in under 90 days"],
    [{ kind: "expired" }, "Expired"],
    [{ kind: "damaged" }, "Damaged"],
    [{ kind: "wrong_product" }, "Wrong product"],
  ];
  it.each(all)("%o", (r, words) => expect(resultWords(r)).toBe(words));
});

describe("RG-3, RG-4, SL-3: every refusal names its line in words", () => {
  const refusals: LineRefusal[] = [
    "expired_cannot_enter_stock",
    "short_dated_decision_needed",
    "rejected_short_dated_accepted",
    "batch_and_expiry_needed",
    "batch_expiry_conflict",
    "reject_reason_needed",
    "expiry_lookahead_not_set",
  ];
  it.each(refusals)("%s", (r) => {
    const w = refusalWords(r, line, { lookaheadDays: 90, heldExpiry: "2027-03-31" });
    expect(w.length).toBeGreaterThan(10);
    if (r !== "expiry_lookahead_not_set") expect(w).toMatch(/^Line 3/);
    else expect(w).toBe(STORE.delivery.noLookahead);
  });
  it("the clash shows both expiries", () => {
    expect(
      refusalWords("batch_expiry_conflict", line, { lookaheadDays: 90, heldExpiry: "2027-03-31" }),
    ).toContain("2027-03-31");
  });
});

describe("arrived at", () => {
  it("is Kampala time (UTC+3)", () => {
    expect(parseArrival("2026-10-21 09:30")?.toISOString()).toBe("2026-10-21T06:30:00.000Z");
    expect(parseArrival("2026-10-21T09:30")?.toISOString()).toBe("2026-10-21T06:30:00.000Z");
    expect(parseArrival("21/10/2026")).toBeNull();
  });

  it("defaults to now, to the minute, and reads back as itself", () => {
    const at = new Date("2026-10-29T21:45:30Z");
    expect(arrivalText(at)).toBe("2026-10-30 00:45");
    expect(parseArrival(arrivalText(at))?.toISOString()).toBe("2026-10-29T21:45:00.000Z");
  });
});

describe("S17a, Law 3: Phase 1's Receive stock once the store or ward stock is on", () => {
  const keep = { ...process.env };
  afterEach(() => {
    process.env = { ...keep };
  });
  it("offers every source with both off (the Phase 1 baseline)", () => {
    delete process.env.PHARMACY_STORE;
    delete process.env.PHARMACY_WARD_STOCK;
    expect(deliveryFromOffered("h-1")).toEqual([
      "main_store",
      "supplier",
      "borrowed",
      "ward_return",
    ]);
  });
  it("offers only a supplier with the store on", () => {
    process.env.PHARMACY_WORKSPACE = "1";
    process.env.PHARMACY_STORE = "h-1";
    expect(deliveryFromOffered("h-1")).toEqual(["supplier"]);
    expect(deliveryFromOffered("h-2")).toHaveLength(4);
  });
  it("closes 'Returned from a ward' with ward stock on", () => {
    process.env.PHARMACY_WORKSPACE = "1";
    delete process.env.PHARMACY_STORE;
    process.env.PHARMACY_WARD_STOCK = "1";
    expect(deliveryFromOffered("h-1")).toEqual(["main_store", "supplier", "borrowed"]);
  });
});

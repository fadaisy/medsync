import type { DeliveryLine } from "@/lib/pharmacy/stores/receiving";
import { describe, expect, it } from "vitest";

import {
  deliveryMovements,
  deliveryNext,
  discrepancyLines,
  lineRefusals,
  lineResults,
  orderStatus,
  stillOwed,
} from "@/lib/pharmacy/stores/receiving";

const TODAY = "2026-10-21";
const line = (o: Partial<DeliveryLine> = {}): DeliveryLine => ({
  lineNo: 1,
  productId: "fx-product-a",
  noteProductId: null,
  orderLineId: "ol-1",
  noteQuantity: 100,
  acceptedQuantity: 100,
  rejectedKeptQuantity: 0,
  rejectedReturnedQuantity: 0,
  rejectReason: null,
  batchNumber: "FX-1",
  expiry: "2028-06-30",
  expiryMonthOnly: false,
  unitCost: null,
  shortDatedDecision: null,
  ...o,
});
const ctx: Parameters<typeof lineResults>[1] = {
  today: TODAY,
  lookaheadDays: 90,
  orderNamed: true,
  owedBefore: 100,
};
const kinds = (l: DeliveryLine, c = ctx) => lineResults(l, c).results.map((r) => r.kind);

describe("RG-1 delivery states", () => {
  it("only counting changes; abandoning needs a reason; only received moves stock", () => {
    expect(deliveryNext("counting", { type: "save" })).toEqual({ ok: true, state: "counting" });
    expect(deliveryNext("counting", { type: "finish" })).toEqual({ ok: true, state: "received" });
    expect(deliveryNext("counting", { type: "abandon", reason: "" })).toEqual({
      ok: false,
      reason: "reason_needed",
    });
    expect(deliveryNext("counting", { type: "abandon", reason: "Wrong hospital" })).toEqual({
      ok: true,
      state: "abandoned",
    });
    expect(deliveryNext("received", { type: "save" })).toEqual({ ok: false, reason: "closed" });
    const d = { locationId: "loc-store", quarantineLocationId: "loc-q", lines: [line()] };
    expect(deliveryMovements({ ...d, state: "counting" })).toEqual([]);
    expect(deliveryMovements({ ...d, state: "abandoned" })).toEqual([]);
    expect(deliveryMovements({ ...d, state: "received" })).toHaveLength(1);
  });
});

describe("RG-2 line results (5.2)", () => {
  it("Matches", () => expect(kinds(line())).toEqual(["matches"]));
  it("fewer and more than the note", () => {
    expect(lineResults(line({ acceptedQuantity: 90 }), ctx).results).toContainEqual({
      kind: "fewer_than_note",
      n: 10,
    });
    expect(
      lineResults(line({ acceptedQuantity: 105 }), { ...ctx, owedBefore: 105 }).results,
    ).toEqual([{ kind: "more_than_note", n: 5 }]);
  });
  it("short of the order, and not on the order", () => {
    expect(lineResults(line(), { ...ctx, owedBefore: 120 }).results).toEqual([
      { kind: "short_of_order", n: 20 },
    ]);
    expect(kinds(line({ orderLineId: null }), { ...ctx, owedBefore: null })).toEqual([
      "not_on_order",
    ]);
  });
  it("expires in under the look-ahead, damaged, wrong product; several at once", () => {
    expect(
      lineResults(line({ expiry: "2026-12-01", shortDatedDecision: "accept" }), ctx).results,
    ).toEqual([{ kind: "expires_within", lookaheadDays: 90 }]);
    expect(
      kinds(line({ acceptedQuantity: 95, rejectedKeptQuantity: 5, rejectReason: "damaged" })),
    ).toEqual(["short_of_order", "damaged"]);
    expect(kinds(line({ noteProductId: "fx-product-b", acceptedQuantity: 90 }))).toEqual([
      "fewer_than_note",
      "short_of_order",
      "wrong_product",
    ]);
  });
  it("Law 6: with no look-ahead set, the short-dated check does not run and says so", () => {
    expect(lineResults(line({ expiry: "2026-11-01" }), { ...ctx, lookaheadDays: null })).toEqual({
      results: [{ kind: "matches" }],
      missing: ["expiry_lookahead"],
    });
  });
});

describe("RG-3 accepted, rejected kept, rejected returned", () => {
  const d = (l: DeliveryLine) =>
    deliveryMovements({
      state: "received",
      locationId: "loc-store",
      quarantineLocationId: "loc-q",
      lines: [l],
    });
  it("accepted → received at the location; rejected kept → received at quarantine with its reason", () => {
    expect(
      d(
        line({
          acceptedQuantity: 80,
          rejectedKeptQuantity: 15,
          rejectedReturnedQuantity: 5,
          rejectReason: "damaged",
        }),
      ).map((m) => [m.locationId, m.quantity, m.reasonCode]),
    ).toEqual([
      ["loc-store", 80, null],
      ["loc-q", 15, "damaged"],
    ]);
  });
  it("returned with the deliverer, or counted zero, writes nothing", () => {
    expect(
      d(line({ acceptedQuantity: 0, rejectedReturnedQuantity: 100, rejectReason: "other" })),
    ).toEqual([]);
    expect(d(line({ acceptedQuantity: 0 }))).toEqual([]);
  });
  it("a wrong product is received as the product actually delivered", () => {
    expect(d(line({ productId: "fx-actual", noteProductId: "fx-on-note" }))[0]?.productId).toBe(
      "fx-actual",
    );
  });
});

describe("RG-4 expired on arrival and short-dated", () => {
  const c = { today: TODAY, lookaheadDays: 90, existing: [] };
  it("an expired item never enters usable stock", () => {
    expect(lineRefusals(line({ expiry: "2026-10-01" }), c)).toContain("expired_cannot_enter_stock");
    expect(kinds(line({ expiry: "2026-10-01" }))).toContain("expired");
    expect(
      lineRefusals(
        line({
          expiry: "2026-10-01",
          acceptedQuantity: 0,
          rejectedKeptQuantity: 100,
          rejectReason: "expired",
        }),
        c,
      ),
    ).toEqual([]);
  });
  it("a short-dated item needs a recorded decision, and reject means none accepted", () => {
    expect(lineRefusals(line({ expiry: "2026-12-01" }), c)).toEqual([
      "short_dated_decision_needed",
    ]);
    expect(
      lineRefusals(line({ expiry: "2026-12-01", shortDatedDecision: "accept_tell" }), c),
    ).toEqual([]);
    expect(lineRefusals(line({ expiry: "2026-12-01", shortDatedDecision: "reject" }), c)).toEqual([
      "rejected_short_dated_accepted",
    ]);
  });
  it("SL-3: a batch number already at the location with another expiry is refused", () => {
    expect(
      lineRefusals(line(), {
        ...c,
        existing: [{ productId: "fx-product-a", batchNumber: "fx-1", expiry: "2028-01-31" }],
      }),
    ).toEqual(["batch_expiry_conflict"]);
  });
  it("IS-7: a borrowed line goes through the same checks before it enters stock", () => {
    const borrowed = line({ orderLineId: null, noteQuantity: null, expiry: "2026-09-30" });
    expect(lineRefusals(borrowed, c)).toContain("expired_cannot_enter_stock");
  });
});

describe("RG-5 discrepancy report", () => {
  it("lists every line that is not Matches, and every short-dated decision", () => {
    const ls = [
      line({ lineNo: 1 }),
      line({ lineNo: 2, acceptedQuantity: 90 }),
      line({ lineNo: 3, expiry: "2026-12-01", shortDatedDecision: "accept" }),
    ];
    const owed = new Map([["ol-1", 100]]);
    expect(
      discrepancyLines(ls, { today: TODAY, lookaheadDays: 90, orderNamed: true, owed }).map(
        (x) => x.line.lineNo,
      ),
    ).toEqual([2, 3]);
  });
});

describe("RG-6 still owed, by projection", () => {
  it("counts only accepted quantities of received deliveries; a closed line owes nothing", () => {
    const orderLines = [
      { id: "ol-1", units: 100, closedReason: null },
      { id: "ol-2", units: 50, closedReason: null },
      { id: "ol-3", units: 30, closedReason: "supplier_out" },
    ];
    const deliveries = [
      {
        state: "received" as const,
        lines: [line({ acceptedQuantity: 60, rejectedKeptQuantity: 10, rejectReason: "damaged" })],
      },
      { state: "counting" as const, lines: [line({ acceptedQuantity: 40 })] },
      { state: "received" as const, lines: [line({ orderLineId: "ol-2", acceptedQuantity: 50 })] },
    ];
    const owed = stillOwed(orderLines, deliveries);
    expect(owed.map((o) => [o.orderLineId, o.received, o.owed, o.state])).toEqual([
      ["ol-1", 60, 40, "part_received"],
      ["ol-2", 50, 0, "received"],
      ["ol-3", 0, 0, "closed"],
    ]);
    expect(orderStatus(owed.map((o) => o.state))).toBe("part_received");
    expect(orderStatus(["received", "closed"])).toBe("closed");
    expect(orderStatus(["open", "open"])).toBe("open");
  });
});

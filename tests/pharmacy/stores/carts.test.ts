import { describe, expect, it } from "vitest";

import {
  cartRow,
  checkRefusals,
  gapMovement,
  restockPlan,
  shortDatedSwaps,
} from "@/lib/pharmacy/stores/carts";
import { at, batch } from "./fixtures";

const TODAY = "2026-10-21";

describe("EC-1 restock", () => {
  const bs = [
    batch({ id: "s-late", expiry: "2027-09-30" }),
    batch({ id: "s-early", expiry: "2027-03-31" }),
  ];
  const balances = new Map([
    ["s-late", 50],
    ["s-early", 3],
  ]);
  it("= list − counted, first expiry first from the restocking location", () => {
    expect(
      restockPlan({
        listQuantity: 10,
        counted: 4,
        batches: bs,
        balances,
        blocked: new Set(),
        localDate: TODAY,
      }),
    ).toMatchObject({
      need: 6,
      rows: [
        { batchId: "s-early", quantity: 3 },
        { batchId: "s-late", quantity: 3 },
      ],
    });
  });
  it("is never negative", () => {
    expect(
      restockPlan({
        listQuantity: 10,
        counted: 14,
        batches: bs,
        balances,
        blocked: new Set(),
        localDate: TODAY,
      }),
    ).toMatchObject({
      need: 0,
      rows: [],
    });
  });
});

describe("EC-2 recorded uses are context only (S7)", () => {
  it("no figure changes with the recorded uses", () => {
    const base = { productId: "fx-product-a", listQuantity: 10, counted: 7 };
    const none = cartRow({ ...base, recordedUses: [] });
    const many = cartRow({
      ...base,
      recordedUses: Array.from({ length: 9 }, (_, i) => ({
        at: at("2026-10-20T03:00:00"),
        episodeRef: `ep-${i}`,
        medicineAsRecorded: "fixture",
      })),
    });
    expect(many.restock).toBe(none.restock);
    expect({ ...many, recordedUses: [] }).toEqual(none);
  });
});

describe("EC-3 a gap is a question for a person", () => {
  const g = {
    batchId: "c1",
    balanceBefore: 10,
    counted: 7,
    reasonCode: null,
    toCartLocationId: null,
  };
  it("each answer writes its movement", () => {
    expect(gapMovement({ ...g, explanation: "used_not_recorded" })).toMatchObject({
      gap: 3,
      movement: { kind: "cart_used", quantity: -3 },
    });
    expect(gapMovement({ ...g, explanation: "recorded_uses_accepted" })).toMatchObject({
      movement: { kind: "cart_used" },
    });
    expect(gapMovement({ ...g, explanation: "broken_or_discarded" })).toMatchObject({
      movement: { kind: "adjusted", quantity: -3, flagForInCharge: false },
    });
    expect(gapMovement({ ...g, explanation: "cannot_explain" })).toMatchObject({
      movement: { kind: "adjusted", quantity: -3, flagForInCharge: true },
      notifyUnitInCharge: true,
    });
    expect(
      gapMovement({ ...g, explanation: "moved_to_another_cart", toCartLocationId: "cart-2" }),
    ).toMatchObject({
      movement: { kind: "issued", quantity: 3, toCartLocationId: "cart-2", countTarget: true },
    });
  });
  it("MedSync never decides: no answer, no movement", () => {
    expect(gapMovement({ ...g, explanation: null })).toEqual({
      ok: false,
      reason: "explanation_needed",
    });
    expect(gapMovement({ ...g, explanation: "moved_to_another_cart" })).toEqual({
      ok: false,
      reason: "target_cart_needed",
    });
  });
  it("a negative gap is an adjustment with a reason, listed, as WS-3", () => {
    expect(
      gapMovement({ ...g, counted: 12, explanation: null, reasonCode: "found_extra" }),
    ).toMatchObject({
      gap: -2,
      movement: { kind: "adjusted", quantity: 2, listed: true },
    });
    expect(gapMovement({ ...g, counted: 10, explanation: null })).toEqual({
      ok: true,
      gap: 0,
      movement: null,
      notifyUnitInCharge: false,
    });
  });
  it("is confirmed by the nurse in charge with a second factor", () => {
    expect(
      checkRefusals({ checkedBy: "p1", confirmedBy: null, confirmAttestationId: null }),
    ).toEqual(["confirmer_needed"]);
    expect(
      checkRefusals({ checkedBy: "p1", confirmedBy: "n1", confirmAttestationId: null }),
    ).toEqual(["second_factor_needed"]);
    expect(
      checkRefusals({ checkedBy: "p1", confirmedBy: "n1", confirmAttestationId: "att" }),
    ).toEqual([]);
  });
});

describe("EC-4 short-dated swaps", () => {
  const bs = [
    batch({ id: "soon", pointId: "cart", expiry: "2026-11-15" }),
    batch({ id: "later", pointId: "cart", expiry: "2027-06-30" }),
  ];
  const balances = new Map([
    ["soon", 2],
    ["later", 4],
  ]);
  it("swaps by default inside the cart look-ahead; unsigned, nothing is computed", () => {
    expect(
      shortDatedSwaps({ batches: bs, balances, localDate: TODAY, cartLookaheadDays: 30 }),
    ).toEqual({
      swaps: [
        {
          batchId: "soon",
          quantity: 2,
          daysLeft: 25,
          swapByDefault: true,
          routes: ["return_to_issuer", "quarantine"],
        },
      ],
    });
    expect(
      shortDatedSwaps({ batches: bs, balances, localDate: TODAY, cartLookaheadDays: null }),
    ).toEqual({ missing: ["cart_lookahead"] });
  });
});

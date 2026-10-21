import type { StoreMovement } from "@/lib/pharmacy/stores/ledger";
import { describe, expect, it } from "vitest";

import { MOVEMENT_KINDS } from "@/db/schema/pharmacy-dispensing";
import {
  allocateFirstExpiry,
  attributeMonth,
  backdatingOk,
  countWriteOk,
  isPaired,
  localMonth,
  oneLegPairs,
  pairKey,
  PAIRS,
  twoLegs,
} from "@/lib/pharmacy/stores/ledger";
import { at, batch, int, mv, prng } from "./fixtures";

describe("SL-12 the new kinds and their pairs", () => {
  it("pairs exactly 0180's psm_pairs kinds, each the other's leg", () => {
    expect(MOVEMENT_KINDS.filter(isPaired).sort()).toEqual(
      [
        "issued",
        "received_from_issue",
        "returned_out",
        "returned_in",
        "quarantined_out",
        "quarantined_in",
      ].sort(),
    );
    for (const [k, other] of Object.entries(PAIRS))
      expect(PAIRS[other as keyof typeof PAIRS]).toBe(k);
    expect(isPaired("lent")).toBe(false);
  });
});

describe("SL-13 no pair with one leg (S4)", () => {
  const OUTS = ["issued", "returned_out", "quarantined_out"] as const;
  it("property: legs written by twoLegs never leave a pair with one leg; dropping any leg is found", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const r = prng(seed);
      const ms: StoreMovement[] = [];
      const n = int(r, 1, 12);
      for (let i = 0; i < n; i++) {
        const kind = OUTS[int(r, 0, 2)] ?? "issued";
        const legs = twoLegs(kind, {
          pairId: `p${seed}-${int(r, 0, 3)}`, // pair ids may repeat: matching is one to one
          fromBatchId: "b-from",
          fromLocationId: "loc-a",
          toBatchId: "b-to",
          toLocationId: "loc-b",
          quantity: int(r, 1, 50),
          at: at("2026-10-01T09:00:00"),
        });
        legs.forEach((l, j) => ms.push({ ...l, id: `s${seed}-${i}-${j}` }));
      }
      expect(oneLegPairs(ms), `seed ${seed}`).toEqual([]);
      const drop = int(r, 0, ms.length - 1);
      const dropped = ms[drop] as StoreMovement;
      const left = ms.filter((_, i) => i !== drop);
      const found = oneLegPairs(left);
      expect(found, `seed ${seed}`).toHaveLength(1);
      expect(found[0]?.pairId).toBe(dropped.pairId);
    }
  });
  it("a paired kind with no pair id, or a mismatched quantity, is one-legged", () => {
    const t = at("2026-10-01T09:00:00");
    expect(oneLegPairs([mv("b", "l", "issued", -5, t)])).toHaveLength(1);
    expect(
      oneLegPairs([
        mv("b", "l", "issued", -5, t, { pairId: "x" }),
        mv("c", "k", "received_from_issue", 4, t, { pairId: "x" }),
      ]),
    ).toHaveLength(2);
  });
  it("Phase 1 transfers pair through source_id (LC-5)", () => {
    expect(pairKey({ kind: "transfer_out", sourceId: "t1", pairId: null })).toBe("transfer:t1");
    expect(pairKey({ kind: "issued", pairId: "p1" })).toBe("pair:p1");
    expect(pairKey({ kind: "supplied" })).toBeNull();
  });
});

describe("SL-15 ward_used and cart_used only from a count, instead of count_correction", () => {
  it("is refused outside a count, and a ward or cart count writes no count_correction", () => {
    expect(countWriteOk("ward_used", { sourceKind: "count", locationKind: "ward" })).toBe(true);
    expect(countWriteOk("ward_used", { sourceKind: "adjustment", locationKind: "ward" })).toBe(
      false,
    );
    expect(countWriteOk("cart_used", { sourceKind: "issue", locationKind: "cart" })).toBe(false);
    expect(countWriteOk("count_correction", { sourceKind: "count", locationKind: "ward" })).toBe(
      false,
    );
    expect(countWriteOk("count_correction", { sourceKind: "count", locationKind: "store" })).toBe(
      true,
    );
  });
});

describe("SL-16 back-dating and attribution (MR-5)", () => {
  it("effective before recorded only for downtime or a late-confirmed receipt", () => {
    const m = {
      effectiveAt: at("2026-10-01T09:00:00"),
      recordedAt: at("2026-10-02T09:00:00"),
      downtime: false,
    };
    expect(backdatingOk(m, false)).toBe(false);
    expect(backdatingOk({ ...m, downtime: true }, false)).toBe(true);
    expect(backdatingOk(m, true)).toBe(true);
    expect(backdatingOk({ ...m, recordedAt: m.effectiveAt }, false)).toBe(true);
  });
  it("a movement recorded after its month closed goes to the first open month, labelled", () => {
    const closes = new Map([
      ["2026-09-01", at("2026-10-03T12:00:00")],
      ["2026-10-01", at("2026-11-02T12:00:00")],
    ]);
    const late = { effectiveAt: at("2026-09-20T10:00:00"), recordedAt: at("2026-11-05T10:00:00") };
    expect(attributeMonth(late, closes)).toEqual({ month: "2026-11-01", belongsTo: "2026-09-01" });
    const inTime = {
      effectiveAt: at("2026-09-20T10:00:00"),
      recordedAt: at("2026-09-20T10:00:00"),
    };
    expect(attributeMonth(inTime, closes)).toEqual({ month: "2026-09-01", belongsTo: null });
    expect(localMonth(new Date("2026-09-30T22:00:00Z"))).toBe("2026-10-01");
  });
});

describe("SL-18 allocation first expiry first", () => {
  const b = [
    batch({ id: "late", expiry: "2027-06-30" }),
    batch({ id: "early", expiry: "2027-01-31" }),
    batch({ id: "empty", expiry: "2026-12-31" }),
  ];
  const bal = new Map([
    ["late", 40],
    ["early", 15],
    ["empty", 0],
  ]);
  it("allocates across held batches in expiry order, every row marked allocated", () => {
    expect(allocateFirstExpiry(20, b, bal, { controlled: false })).toEqual({
      ok: true,
      rows: [
        { batchId: "early", quantity: 15, allocated: true },
        { batchId: "late", quantity: 5, allocated: true },
      ],
      unallocated: 0,
    });
  });
  it("controlled products are always counted per batch", () => {
    expect(allocateFirstExpiry(1, b, bal, { controlled: true })).toEqual({
      ok: false,
      reason: "controlled_counted_per_batch",
    });
  });
});

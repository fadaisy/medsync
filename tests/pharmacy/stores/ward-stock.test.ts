import { describe, expect, it } from "vitest";

import { suggestedTopUp, wardCountMovements, wardRow } from "@/lib/pharmacy/stores/ward-stock";
import { at, batch, int, prng } from "./fixtures";

const now = at("2026-10-21T10:00:00");
const count = (counted: number, local: string) => ({ counted, at: at(local), by: "nurse-1" });

describe("WS-1 suggested top-up", () => {
  it("= ward level − last count, only when the count is within the freshness setting", () => {
    expect(
      suggestedTopUp({
        wardLevel: 40,
        lastCount: count(12, "2026-10-20T08:00:00"),
        now,
        freshnessDays: 2,
      }),
    ).toEqual({
      kind: "top_up",
      quantity: 28,
    });
    expect(
      suggestedTopUp({
        wardLevel: 40,
        lastCount: count(12, "2026-10-10T08:00:00"),
        now,
        freshnessDays: 2,
      }),
    ).toEqual({
      kind: "count_first",
    });
    expect(suggestedTopUp({ wardLevel: 40, lastCount: null, now, freshnessDays: 2 })).toEqual({
      kind: "count_first",
    });
    expect(
      suggestedTopUp({
        wardLevel: 10,
        lastCount: count(12, "2026-10-21T08:00:00"),
        now,
        freshnessDays: 2,
      }),
    ).toEqual({
      kind: "top_up",
      quantity: 0,
    });
  });
  it("Law 6: an unsigned level or freshness computes nothing", () => {
    expect(suggestedTopUp({ wardLevel: null, lastCount: null, now, freshnessDays: null })).toEqual({
      kind: "missing",
      missing: ["ward_level", "count_freshness"],
    });
  });
});

describe("WS-2 doses charted are context only (S7)", () => {
  it("no figure on the row changes when the doses charted change", () => {
    const input = {
      productId: "fx-product-a",
      wardLevel: 40,
      lastCount: count(12, "2026-10-20T08:00:00"),
      issuedSince: 20,
      returnedSince: 2,
      now,
      freshnessDays: 2,
    };
    const a = wardRow({ ...input, dosesCharted: 0 });
    for (const doses of [1, 17, 999]) {
      const { dosesCharted, ...rest } = wardRow({ ...input, dosesCharted: doses });
      const { dosesCharted: _ignored, ...restA } = a;
      expect(dosesCharted).toBe(doses);
      expect(rest).toEqual(restA);
    }
  });
});

describe("WS-3 use since the last count", () => {
  const bs = [
    batch({ id: "w-late", pointId: "ward", expiry: "2027-08-31" }),
    batch({ id: "w-early", pointId: "ward", expiry: "2027-02-28" }),
  ];
  it("positive use writes ward_used; never count_correction", () => {
    const r = wardCountMovements({
      batches: bs,
      balances: new Map([
        ["w-early", 10],
        ["w-late", 30],
      ]),
      count: { perProduct: 25, controlled: false },
      negativeReason: null,
    });
    expect(r).toEqual({
      ok: true,
      movements: [
        {
          batchId: "w-early",
          kind: "ward_used",
          quantity: -10,
          allocated: true,
          reasonCode: null,
          listed: false,
        },
        {
          batchId: "w-late",
          kind: "ward_used",
          quantity: -5,
          allocated: true,
          reasonCode: null,
          listed: false,
        },
      ],
    });
  });
  it("negative use writes an adjusted movement with the counter's reason, and is listed", () => {
    const input = {
      batches: bs,
      balances: new Map([
        ["w-early", 10],
        ["w-late", 0],
      ]),
      count: { perBatch: new Map([["w-early", 14]]) },
    };
    expect(wardCountMovements({ ...input, negativeReason: null })).toEqual({
      ok: false,
      reason: "reason_needed",
    });
    expect(wardCountMovements({ ...input, negativeReason: "returns_not_recorded" })).toEqual({
      ok: true,
      movements: [
        {
          batchId: "w-early",
          kind: "adjusted",
          quantity: 4,
          allocated: false,
          reasonCode: "returns_not_recorded",
          listed: true,
        },
      ],
    });
  });
  it("controlled products are counted per batch (D-PH2-07)", () => {
    expect(
      wardCountMovements({
        batches: bs,
        balances: new Map(),
        count: { perProduct: 0, controlled: true },
        negativeReason: null,
      }),
    ).toEqual({ ok: false, reason: "controlled_counted_per_batch" });
  });
  it("property: after any ward count the ward's balance equals its count", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const r = prng(seed);
      const balances = new Map([
        ["w-early", int(r, 0, 50)],
        ["w-late", int(r, 0, 50)],
      ]);
      const perBatch = r() < 0.5;
      const counts = new Map([
        ["w-early", int(r, 0, 60)],
        ["w-late", int(r, 0, 60)],
      ]);
      const total = int(r, 0, 120);
      const res = wardCountMovements({
        batches: bs,
        balances,
        count: perBatch ? { perBatch: counts } : { perProduct: total, controlled: false },
        negativeReason: "found_on_ward",
      });
      expect(res.ok, `seed ${seed}`).toBe(true);
      if (!res.ok) continue;
      expect(res.movements.every((m) => m.kind === "ward_used" || m.kind === "adjusted")).toBe(
        true,
      );
      const after = new Map(balances);
      for (const m of res.movements) after.set(m.batchId, (after.get(m.batchId) ?? 0) + m.quantity);
      if (perBatch) for (const [id, c] of counts) expect(after.get(id), `seed ${seed}`).toBe(c);
      else
        expect(
          [...after.values()].reduce((s, v) => s + v, 0),
          `seed ${seed}`,
        ).toBe(total);
    }
  });
});

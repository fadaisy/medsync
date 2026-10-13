import type { Batch, Movement, MovementKind } from "@/lib/pharmacy/stock/ledger";
import { describe, expect, it } from "vitest";

import { proposeBatches } from "@/lib/pharmacy/stock/fefo";
import {
  admits,
  balances,
  correctBatch,
  countResult,
  expiresOn,
  isExpired,
  localDate,
  medicineTotal,
  MOVEMENT_KINDS,
  needsCount,
  signOk,
  stockoutSpans,
  stockState,
} from "@/lib/pharmacy/stock/ledger";
import { getAvailability } from "@/lib/prescribing/pharmacy";

/**
 * Pharmacy Phase 1 — the stock ledger (SL-1, SL-2, SL-4, SL-5, SL-6, SL-9, SL-10, SL-11, DT-7, 5.8),
 * with gate-a-proposal §5's worked day. Fixtures are invented: "Fixture tablet A", batches FX-*.
 */
const OP = "fixture-point-op";
const IP = "fixture-point-ip";
const MED = "fixture-medicine-a";
const at = (local: string) => new Date(`${local}+03:00`);

const batch = (o: Partial<Batch> & Pick<Batch, "id">): Batch => ({
  pointId: OP,
  productId: "fixture-product-a",
  medicineId: MED,
  batchNumber: o.id.toUpperCase(),
  expiry: "2027-03-31",
  expiryMonthOnly: false,
  ...o,
});

let seq = 0;
const mv = (
  batchId: string,
  kind: MovementKind,
  quantity: number,
  when: Date,
  o: Partial<Movement> = {},
): Movement => ({
  id: `m${++seq}`,
  batchId,
  pointId: OP,
  kind,
  quantity,
  effectiveAt: when,
  recordedAt: when,
  downtime: false,
  ...o,
});

describe("SL-1 movement kinds and signs", () => {
  it("SL-1 lists the seven kinds of 0124", () => {
    expect(MOVEMENT_KINDS).toEqual([
      "received",
      "supplied",
      "reversed",
      "adjusted",
      "count_correction",
      "transfer_out",
      "transfer_in",
    ]);
  });
  it("SL-1 each kind carries its sign; zero and fractions are refused", () => {
    expect(signOk("received", 5)).toBe(true);
    expect(signOk("received", -5)).toBe(false);
    expect(signOk("reversed", 1)).toBe(true);
    expect(signOk("transfer_in", -1)).toBe(false);
    expect(signOk("supplied", -1)).toBe(true);
    expect(signOk("supplied", 1)).toBe(false);
    expect(signOk("transfer_out", 2)).toBe(false);
    expect(signOk("adjusted", -3)).toBe(true);
    expect(signOk("adjusted", 3)).toBe(true);
    expect(signOk("count_correction", -1)).toBe(true);
    expect(signOk("adjusted", 0)).toBe(false);
    expect(signOk("received", 1.5)).toBe(false);
  });
});

describe("SL-5 expiry, hospital-local", () => {
  it("SL-5 localDate is Africa/Kampala (UTC+3, no daylight saving)", () => {
    expect(localDate(new Date("2026-10-12T20:59:59Z"))).toBe("2026-10-12");
    expect(localDate(new Date("2026-10-12T21:00:00Z"))).toBe("2026-10-13");
    expect(localDate(new Date("2026-06-30T21:30:00Z"))).toBe("2026-07-01");
  });
  it("SL-5 a month-only expiry runs to the end of the month: February in a non-leap and a leap year", () => {
    expect(expiresOn({ expiry: "2027-02-01", expiryMonthOnly: true })).toBe("2027-02-28");
    expect(expiresOn({ expiry: "2028-02-01", expiryMonthOnly: true })).toBe("2028-02-29");
    expect(expiresOn({ expiry: "2027-12-01", expiryMonthOnly: true })).toBe("2027-12-31");
    expect(expiresOn({ expiry: "2027-02-14", expiryMonthOnly: false })).toBe("2027-02-14");
  });
  it("SL-5 expired only when the expiry is before the local date", () => {
    const feb = { expiry: "2028-02-01", expiryMonthOnly: true };
    expect(isExpired(feb, "2028-02-29")).toBe(false);
    expect(isExpired(feb, "2028-03-01")).toBe(true);
    const exact = { expiry: "2027-03-31", expiryMonthOnly: false };
    expect(isExpired(exact, "2027-03-31")).toBe(false);
    expect(isExpired(exact, "2027-04-01")).toBe(true);
  });
  it("SL-5 an expired batch never counts towards the medicine's total", () => {
    const b = [batch({ id: "fx-old", expiry: "2026-09-30" }), batch({ id: "fx-new" })];
    const bal = new Map([
      ["fx-old", 40],
      ["fx-new", 7],
    ]);
    expect(medicineTotal(b, bal, MED, OP, "2026-10-12")).toBe(7);
    expect(medicineTotal(b, bal, MED, IP, "2026-10-12")).toBe(0);
    expect(medicineTotal(b, bal, "fixture-medicine-z", OP, "2026-10-12")).toBe(0);
  });
});

describe("SL-2 balances are the ledger's sum", () => {
  it("SL-2 sums per batch; the same batch number at two points is two balances", () => {
    const ms = [
      mv("op-fx", "received", 10, at("2026-10-12T08:00:00")),
      mv("op-fx", "supplied", -4, at("2026-10-12T09:00:00")),
      mv("ip-fx", "received", 3, at("2026-10-12T08:00:00"), { pointId: IP }),
    ];
    const bal = balances(ms);
    expect(bal.get("op-fx")).toBe(6);
    expect(bal.get("ip-fx")).toBe(3);
  });
});

describe("SL-4 and DT-7 the guard", () => {
  const b = batch({ id: "fx-g", expiry: "2026-10-01" });
  it("SL-4 refuses a live movement below zero and a live supply from an expired batch", () => {
    const fresh = batch({ id: "fx-f" });
    expect(
      admits({ kind: "supplied", quantity: -5, downtime: false }, fresh, 4, "2026-10-12"),
    ).toEqual({ ok: false, reason: "below_zero" });
    expect(
      admits({ kind: "supplied", quantity: -4, downtime: false }, fresh, 4, "2026-10-12"),
    ).toEqual({ ok: true });
    expect(admits({ kind: "supplied", quantity: -1, downtime: false }, b, 4, "2026-10-12")).toEqual(
      {
        ok: false,
        reason: "expired",
      },
    );
    expect(
      admits({ kind: "supplied", quantity: 1, downtime: false }, fresh, 4, "2026-10-12"),
    ).toEqual({
      ok: false,
      reason: "sign",
    });
  });
  it("DT-7 a downtime movement passes and the medicine then needs a count", () => {
    expect(admits({ kind: "supplied", quantity: -9, downtime: true }, b, 4, "2026-10-12")).toEqual({
      ok: true,
    });
    expect(needsCount(new Map([["fx-g", -5]]))).toBe(true);
    expect(needsCount(new Map([["fx-g", 0]]))).toBe(false);
  });
});

describe("SL-6 the blind count", () => {
  it("SL-6 a match records no correction; a difference is the correction's quantity", () => {
    expect(countResult({ counted: 80, balance: 80 })).toEqual({ matched: true, difference: 0 });
    expect(countResult({ counted: 36, balance: 40 })).toEqual({ matched: false, difference: -4 });
    expect(countResult({ counted: 12, balance: -4 })).toEqual({ matched: false, difference: 16 });
  });
  it("SL-6 the counted figure is the first argument the caller has; the balance is separate", () => {
    // The API takes them as two named fields, so a screen can hold `counted` without ever asking for it.
    expect(Object.keys(countResult({ counted: 1, balance: 1 })).sort()).toEqual([
      "difference",
      "matched",
    ]);
  });
});

describe("SL-11 batch corrections", () => {
  const b = batch({ id: "fx-c", batchNumber: "FX-0O1", expiry: "2027-03-31" });
  it("SL-11 keeps the old and the new value with a reason, and moves nothing", () => {
    const ms = [mv("fx-c", "received", 20, at("2026-10-12T08:00:00"))];
    const r = correctBatch(b, { batchNumber: "FX-001", expiry: "2027-03-31", reason: "Mistyped" });
    expect(r).toEqual({
      ok: true,
      batch: { ...b, batchNumber: "FX-001" },
      correction: {
        batchId: "fx-c",
        oldBatchNumber: "FX-0O1",
        newBatchNumber: "FX-001",
        oldExpiry: "2027-03-31",
        newExpiry: "2027-03-31",
        reason: "Mistyped",
      },
    });
    expect(balances(ms).get("fx-c")).toBe(20);
  });
  it("SL-11 refuses an unchanged batch or a missing reason", () => {
    expect(
      correctBatch(b, { batchNumber: "FX-0O1", expiry: "2027-03-31", reason: "Same" }),
    ).toEqual({
      ok: false,
      reason: "unchanged",
    });
    expect(correctBatch(b, { batchNumber: "FX-001", expiry: "2027-03-31", reason: "  " })).toEqual({
      ok: false,
      reason: "no_reason",
    });
  });
});

describe("SL-9 stock-outs from the ledger", () => {
  const now = at("2026-12-01T12:00:00");
  it("SL-9 starts at the movement that takes the total to zero and ends at the one that lifts it", () => {
    const b = [batch({ id: "fx-s" })];
    const ms = [
      mv("fx-s", "received", 10, at("2026-10-12T08:00:00")),
      mv("fx-s", "supplied", -10, at("2026-10-12T09:00:00")),
      mv("fx-s", "received", 5, at("2026-10-14T08:00:00")),
      mv("fx-s", "supplied", -5, at("2026-10-15T08:00:00")),
    ];
    const spans = stockoutSpans(ms, b, MED, OP, localDate, now);
    expect(spans).toEqual([
      {
        startedAt: at("2026-10-12T09:00:00"),
        endedAt: at("2026-10-14T08:00:00"),
        startMovementId: ms[1]?.id,
        expiredBatchId: null,
        endMovementId: ms[2]?.id,
      },
      {
        startedAt: at("2026-10-15T08:00:00"),
        endedAt: null,
        startMovementId: ms[3]?.id,
        expiredBatchId: null,
        endMovementId: null,
      },
    ]);
  });
  it("SL-9 a medicine that reaches zero only because its last batch expired: the span starts on the expiry", () => {
    const b = [batch({ id: "fx-e", expiry: "2026-10-01", expiryMonthOnly: true })];
    const ms = [mv("fx-e", "received", 30, at("2026-10-02T08:00:00"))];
    const span = stockoutSpans(ms, b, MED, OP, localDate, now)[0];
    expect(span?.expiredBatchId).toBe("fx-e");
    expect(span?.startMovementId).toBeNull();
    // The batch may be supplied all of 31 Oct; it is out from the first moment of the next local day.
    expect(span?.startedAt).toEqual(at("2026-11-01T00:00:00"));
    expect(span && localDate(span.startedAt)).toBe("2026-11-01");
    expect(span?.endedAt).toBeNull();
    // Before the expiry has passed, there is no stock-out.
    expect(stockoutSpans(ms, b, MED, OP, localDate, at("2026-10-31T23:59:00"))).toEqual([]);
  });
  it("SL-9 an expiry while another batch holds stock is not a stock-out", () => {
    const b = [batch({ id: "fx-e1", expiry: "2026-10-31" }), batch({ id: "fx-e2" })];
    const ms = [
      mv("fx-e1", "received", 30, at("2026-10-02T08:00:00")),
      mv("fx-e2", "received", 5, at("2026-10-02T08:00:00")),
    ];
    expect(stockoutSpans(ms, b, MED, OP, localDate, now)).toEqual([]);
  });
});

describe("5.8 the Stock page's state", () => {
  const base = {
    medicineId: MED,
    pointId: OP,
    localDate: "2026-10-12",
    reorderLevel: null,
    lookaheadDays: null,
    outSince: null,
  };
  const b = [
    batch({ id: "fx-a", expiry: "2027-01-31" }),
    batch({ id: "fx-b", expiry: "2027-06-30" }),
  ];
  const bal = (a: number, c: number) =>
    new Map([
      ["fx-a", a],
      ["fx-b", c],
    ]);
  it("5.8 in stock, and never low without a reorder level", () => {
    expect(stockState({ ...base, batches: b, balances: bal(1, 0) })).toEqual({
      state: "in_stock",
      days: null,
    });
  });
  it("5.8 low under the reorder level", () => {
    expect(stockState({ ...base, batches: b, balances: bal(5, 4), reorderLevel: 10 }).state).toBe(
      "low",
    );
    expect(stockState({ ...base, batches: b, balances: bal(5, 5), reorderLevel: 10 }).state).toBe(
      "in_stock",
    );
  });
  it("5.8 out with its days, from the stock-out's start", () => {
    expect(
      stockState({ ...base, batches: b, balances: bal(0, 0), outSince: at("2026-10-09T15:00:00") }),
    ).toEqual({ state: "out", days: 3 });
    expect(stockState({ ...base, batches: b, balances: bal(0, 0) })).toEqual({
      state: "out",
      days: null,
    });
  });
  it("5.8 expiring within the look-ahead, with days; none set is never expiring", () => {
    expect(stockState({ ...base, batches: b, balances: bal(14, 0), lookaheadDays: 120 })).toEqual({
      state: "expiring",
      days: 111,
    });
    expect(stockState({ ...base, batches: b, balances: bal(14, 0), lookaheadDays: 90 }).state).toBe(
      "in_stock",
    );
    expect(stockState({ ...base, batches: b, balances: bal(14, 0) }).state).toBe("in_stock");
    // An empty batch that expires first does not make the medicine "expiring".
    expect(stockState({ ...base, batches: b, balances: bal(0, 9), lookaheadDays: 120 }).state).toBe(
      "in_stock",
    );
  });
  it("5.8 an expired batch still holding stock says expired, remove", () => {
    const old = [...b, batch({ id: "fx-x", expiry: "2026-09-30" })];
    const m = new Map([...bal(9, 9), ["fx-x", 3]]);
    expect(stockState({ ...base, batches: old, balances: m }).state).toBe("expired_remove");
    expect(
      stockState({ ...base, batches: old, balances: new Map([...bal(9, 9), ["fx-x", 0]]) }).state,
    ).toBe("in_stock");
  });
  it("5.8 DT-7 count needed when any batch is below zero, before every other state", () => {
    expect(stockState({ ...base, batches: b, balances: bal(-4, 0), reorderLevel: 10 })).toEqual({
      state: "count_needed",
      days: null,
    });
  });
});

/* ─── gate-a-proposal §5: one day at Outpatient pharmacy ─────────────────────────────── */

describe("SL-2 SL-9 SL-10 SU-3 gate-a-proposal §5, the worked day", () => {
  it("SL-2 SL-9 SL-10 twelve events end at FX-002 80, FX-001 0, no stock-out, seven supplied movements for six supplies", () => {
    const fx1 = batch({ id: "fx-001", batchNumber: "FX-001", expiry: "2027-03-31" });
    const fx2 = batch({ id: "fx-002", batchNumber: "FX-002", expiry: "2027-09-30" });
    const fx2ip = batch({
      id: "fx-002-ip",
      batchNumber: "FX-002",
      expiry: "2027-09-30",
      pointId: IP,
    });
    const batches = [fx1, fx2, fx2ip];
    const ledger: Movement[] = [mv("fx-001", "received", 50, at("2026-10-11T16:00:00"))];
    const supplyOf = new Map<string, string>(); // supplied movement id → supply id
    const today = "2026-10-12";

    const write = (m: Movement) => {
      const b = batches.find((x) => x.id === m.batchId);
      if (!b) throw new Error("no batch");
      expect(admits(m, b, balances(ledger).get(m.batchId) ?? 0, today)).toEqual({ ok: true });
      ledger.push(m);
      return m;
    };
    const supply = (id: string, qty: number, time: string) => {
      const p = proposeBatches({
        batches: [fx1, fx2],
        balances: balances(ledger),
        quantity: qty,
        localDate: today,
      });
      if (!p.ok) throw new Error(p.reason);
      return p.rows.map((r) => {
        const m = write(mv(r.batchId, "supplied", -r.quantity, at(`${today}T${time}:00`)));
        supplyOf.set(m.id, id);
        return m;
      });
    };
    const row = () => [balances(ledger).get("fx-001") ?? 0, balances(ledger).get("fx-002") ?? 0];

    write(mv("fx-002", "received", 200, at(`${today}T08:05:00`)));
    expect(row()).toEqual([50, 200]);
    supply("S1", 30, "09:10");
    expect(row()).toEqual([20, 200]);
    const s2 = supply("S2", 30, "09:40");
    expect(s2.map((m) => [m.batchId, m.quantity])).toEqual([
      ["fx-001", -20],
      ["fx-002", -10],
    ]);
    expect(row()).toEqual([0, 190]);
    supply("S3", 28, "10:15");
    expect(row()).toEqual([0, 162]);
    supply("S4", 14, "11:00");
    expect(row()).toEqual([0, 148]);
    const count = countResult({ counted: 145, balance: balances(ledger).get("fx-002") ?? 0 });
    expect(count).toEqual({ matched: false, difference: -3 });
    write(mv("fx-002", "count_correction", count.difference, at(`${today}T12:30:00`)));
    expect(row()).toEqual([0, 145]);
    write(mv("fx-002", "adjusted", -5, at(`${today}T13:00:00`)));
    expect(row()).toEqual([0, 140]);
    write(mv("fx-002", "transfer_out", -40, at(`${today}T13:30:00`)));
    write(mv("fx-002-ip", "transfer_in", 40, at(`${today}T13:30:00`), { pointId: IP }));
    expect(row()).toEqual([0, 100]);
    const [s5] = supply("S5", 20, "14:00");
    expect(row()).toEqual([0, 80]);
    const [s6] = supply("S6", 10, "14:20");
    expect(row()).toEqual([0, 70]);
    if (!s5 || !s6) throw new Error("fixture: supplies wrote no movement");
    write(mv(s6.batchId, "reversed", 10, at(`${today}T14:40:00`)));
    expect(row()).toEqual([0, 80]);
    write(mv(s5.batchId, "reversed", 20, at(`${today}T15:10:00`)));
    write(mv(s5.batchId, "adjusted", -20, at(`${today}T15:10:00`)));
    expect(row()).toEqual([0, 80]);

    // SL-2: the projection equals the ledger sum; the other point's copy is its own balance.
    const sum = (id: string) =>
      ledger.filter((m) => m.batchId === id).reduce((s, m) => s + m.quantity, 0);
    expect(sum("fx-002")).toBe(200 - 10 - 28 - 14 - 3 - 5 - 40 - 20 - 10 + 10 + 20 - 20);
    expect(balances(ledger).get("fx-002")).toBe(80);
    expect(balances(ledger).get("fx-001")).toBe(0);
    expect(balances(ledger).get("fx-002-ip")).toBe(40);

    // SL-9: FX-001 reached zero at row 3, the medicine's unexpired total never did.
    const opLedger = ledger.filter((m) => m.pointId === OP);
    expect(stockoutSpans(opLedger, batches, MED, OP, localDate, at(`${today}T15:10:00`))).toEqual(
      [],
    );

    // SL-10: six supplies, seven supplied movements (S2 split); each has its supply, each supply its movements.
    const supplied = ledger.filter((m) => m.kind === "supplied");
    expect(supplied).toHaveLength(7);
    expect(new Set(supplied.map((m) => supplyOf.get(m.id))).size).toBe(6);
    expect(supplied.every((m) => supplyOf.has(m.id))).toBe(true);

    // At 15:10 the prescriber's answer: on the shelf at OP, counted 12:30, and no quantity.
    const answer = getAvailability({
      medicineId: MED,
      hospitalId: "fixture-hospital",
      origin: "window",
      points: [
        { id: OP, name: "Outpatient pharmacy", hospitalId: "fixture-hospital", serves: "window" },
        { id: IP, name: "Inpatient pharmacy", hospitalId: "fixture-hospital", serves: "wards" },
      ],
      stock: {
        [OP]: {
          products: [{ id: "fixture-product-a", medicineId: MED }],
          batches,
          movements: opLedger,
          lastCountAt: at(`${today}T12:30:00`),
          reorderLevel: null,
          countFreshnessDays: null,
        },
      },
      now: at(`${today}T15:10:00`),
    });
    expect(answer).toEqual({
      state: "in_stock",
      point: { id: OP, name: "Outpatient pharmacy" },
      lastCountAt: at(`${today}T12:30:00`),
      lastReceiptAt: at(`${today}T08:05:00`),
      since: null,
      elsewhere: [],
    });
  });
});

/* ─── SL-10: property test ─────────────────────────────────────────────────────────── */

/** mulberry32: a small seeded PRNG, so a failing seed can be replayed. */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("SL-10 property: random receipts, supplies, counts and downtime", () => {
  it("SL-10 SL-2 SL-4 every balance equals its ledger sum; none below zero without a downtime movement", () => {
    const today = "2026-10-12";
    for (let seed = 1; seed <= 60; seed++) {
      const rnd = prng(seed);
      const int = (n: number) => Math.floor(rnd() * n);
      const batches = [
        batch({ id: "p-1", expiry: "2026-11-30" }),
        batch({ id: "p-2", expiry: "2027-02-01", expiryMonthOnly: true }),
        batch({ id: "p-3", expiry: "2026-10-01" }), // expired: never supplied live
      ];
      const ledger: Movement[] = [];
      const cache = new Map<string, number>(); // the cached projection SL-2 allows, rebuilt and compared
      const supplyOf = new Map<string, string>();
      const supplies = new Map<string, string[]>();
      const t = at(`${today}T08:00:00`);
      const push = (m: Movement) => {
        const b = batches.find((x) => x.id === m.batchId);
        if (!b || !admits(m, b, cache.get(m.batchId) ?? 0, today).ok) return false;
        ledger.push(m);
        cache.set(m.batchId, (cache.get(m.batchId) ?? 0) + m.quantity);
        return true;
      };
      for (let step = 0; step < 150; step++) {
        const b = batches[int(3)];
        if (!b) continue;
        const op = int(6);
        if (op === 0) push(mv(b.id, "received", 1 + int(50), t));
        else if (op === 1 || op === 2) {
          const p = proposeBatches({
            batches,
            balances: cache,
            quantity: 1 + int(40),
            localDate: today,
          });
          if (!p.ok) continue;
          const id = `S${seed}-${step}`;
          for (const r of p.rows) {
            const m = mv(r.batchId, "supplied", -r.quantity, t);
            expect(push(m)).toBe(true); // a proposal always fits the guard
            supplyOf.set(m.id, id);
            supplies.set(id, [...(supplies.get(id) ?? []), m.id]);
          }
        } else if (op === 3) {
          const { matched, difference } = countResult({
            counted: int(60),
            balance: cache.get(b.id) ?? 0,
          });
          if (!matched) push(mv(b.id, "count_correction", difference, t));
        } else if (op === 4) {
          // A live movement that would go below zero is refused.
          const q = -(Math.max(0, cache.get(b.id) ?? 0) + 1 + int(5));
          expect(push(mv(b.id, "adjusted", q, t))).toBe(false);
        } else if (rnd() < 0.3) {
          const m = mv(b.id, "supplied", -(1 + int(30)), t, { downtime: true });
          expect(push(m)).toBe(true);
          const id = `D${seed}-${step}`;
          supplyOf.set(m.id, id);
          supplies.set(id, [m.id]);
        }
        const rebuilt = balances(ledger);
        for (const x of batches) expect(rebuilt.get(x.id) ?? 0).toBe(cache.get(x.id) ?? 0);
      }
      for (const x of batches) {
        if ((cache.get(x.id) ?? 0) < 0)
          expect(ledger.some((m) => m.batchId === x.id && m.downtime)).toBe(true);
      }
      expect(ledger.some((m) => m.batchId === "p-3" && m.kind === "supplied" && !m.downtime)).toBe(
        false,
      );
      const supplied = ledger.filter((m) => m.kind === "supplied");
      expect(supplied.every((m) => supplyOf.has(m.id))).toBe(true);
      expect([...supplies.values()].flat().sort()).toEqual(supplied.map((m) => m.id).sort());
    }
  });
});

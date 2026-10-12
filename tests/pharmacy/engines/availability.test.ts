import type { Batch, Movement } from "@/lib/pharmacy/stock/ledger";
import type {
  Availability,
  AvailabilityMapping,
  AvailabilityState,
  LivePoint,
  PointStockFacts,
} from "@/lib/prescribing/pharmacy";
import { describe, expect, it } from "vitest";

import {
  availabilityLevel,
  getAvailability,
  PHARMACY_WORD,
  pharmacyAvailability,
} from "@/lib/prescribing/pharmacy";

/**
 * Pharmacy Phase 1 — the stock answer (AV-1..AV-9, D-PH1-22, ADR 0190's seam). Pure over facts read
 * elsewhere. Fixture medicines, points and batches are invented.
 */
const H = "fixture-hospital-1";
const MED = "fixture-medicine-a";
const OTHER = "fixture-medicine-b";
const at = (local: string) => new Date(`${local}+03:00`);
const NOW = at("2026-10-12T15:00:00");

const point = (id: string, serves: LivePoint["serves"], hospitalId = H): LivePoint => ({
  id,
  name: `Fixture ${id}`,
  hospitalId,
  serves,
});
const batch = (id: string, pointId: string, o: Partial<Batch> = {}): Batch => ({
  id,
  pointId,
  productId: `${pointId}-product`,
  medicineId: MED,
  batchNumber: id.toUpperCase(),
  expiry: "2027-06-30",
  expiryMonthOnly: false,
  ...o,
});
let n = 0;
const mv = (
  b: Batch,
  kind: Movement["kind"],
  quantity: number,
  when: Date,
  downtime = false,
): Movement => ({
  id: `m${++n}`,
  batchId: b.id,
  pointId: b.pointId,
  kind,
  quantity,
  effectiveAt: when,
  recordedAt: when,
  downtime,
});

/** One medicine at one point: received, counted, with what is left. */
function facts(
  pointId: string,
  o: {
    left?: number;
    counted?: Date | null;
    received?: boolean;
    level?: number | null;
    freshness?: number | null;
    product?: boolean;
    extra?: { batches: Batch[]; movements: Movement[] };
  } = {},
): PointStockFacts {
  const b = batch(`${pointId}-fx1`, pointId);
  const left = o.left ?? 50;
  const received = o.received ?? true;
  const movements = [
    mv(b, received ? "received" : "transfer_in", 100, at("2026-10-10T08:00:00")),
    ...(left === 100 ? [] : [mv(b, "supplied", left - 100, at("2026-10-11T09:00:00"))]),
  ];
  return {
    products: o.product === false ? [] : [{ id: b.productId, medicineId: MED }],
    batches: [b, ...(o.extra?.batches ?? [])],
    movements: [...movements, ...(o.extra?.movements ?? [])],
    lastCountAt: o.counted === undefined ? at("2026-10-12T08:00:00") : o.counted,
    reorderLevel: o.level ?? null,
    countFreshnessDays: o.freshness ?? null,
  };
}

const ask = (
  stock: Record<string, PointStockFacts>,
  points: LivePoint[] = [point("op", "window")],
  origin: "window" | "wards" | "emergency" = "window",
) => getAvailability({ medicineId: MED, hospitalId: H, origin, points, stock, now: NOW });

describe("AV-1 AV-2 the answering point", () => {
  it("AV-1 returns the six fields", () => {
    expect(Object.keys(ask({ op: facts("op") })).sort()).toEqual([
      "elsewhere",
      "lastCountAt",
      "lastReceiptAt",
      "point",
      "since",
      "state",
    ]);
  });
  it("AV-2 the live point whose serves matches the origin answers; `all` matches every origin", () => {
    const points = [point("op", "window"), point("ward", "wards"), point("er", "emergency")];
    const stock = { op: facts("op"), ward: facts("ward"), er: facts("er") };
    expect(ask(stock, points, "window").point?.id).toBe("op");
    expect(ask(stock, points, "wards").point?.id).toBe("ward");
    expect(ask(stock, points, "emergency").point?.id).toBe("er");
    expect(ask({ main: facts("main") }, [point("main", "all")], "wards").point?.id).toBe("main");
  });
  it("AV-2 several match: the first in hub order answers; the others are listed only if they hold it", () => {
    const points = [point("op1", "window"), point("op2", "all"), point("op3", "window")];
    const r = ask(
      { op1: facts("op1", { left: 0 }), op2: facts("op2"), op3: facts("op3", { left: 0 }) },
      points,
    );
    expect(r.point?.id).toBe("op1");
    expect(r.state).toBe("out");
    expect(r.elsewhere).toEqual(["Fixture op2"]);
  });
  it("AV-2 not_linked with no live point, or none serving where the prescription is written", () => {
    const empty: Availability = {
      state: "not_linked",
      point: null,
      lastCountAt: null,
      lastReceiptAt: null,
      since: null,
      elsewhere: [],
    };
    expect(ask({}, [])).toEqual(empty);
    expect(ask({ ward: facts("ward") }, [point("ward", "wards")], "window")).toEqual(empty);
  });
});

describe("AV-3 every state", () => {
  it("AV-3 not_stocked: no active product of the medicine at the point", () => {
    expect(ask({ op: facts("op", { product: false }) }).state).toBe("not_stocked");
    expect(ask({}).state).toBe("not_stocked");
  });
  it("AV-3 not_counted: a batch below zero (DT-7)", () => {
    const b = batch("op-neg", "op");
    const r = ask({
      op: facts("op", {
        extra: {
          batches: [b],
          movements: [mv(b, "supplied", -4, at("2026-10-12T10:00:00"), true)],
        },
      }),
    });
    expect(r.state).toBe("not_counted");
  });
  it("AV-3 not_counted: never counted and no receipt on record", () => {
    expect(ask({ op: facts("op", { counted: null, received: false }) }).state).toBe("not_counted");
  });
  it("AV-3 not_counted: the last count is older than the freshness setting; none set never goes stale", () => {
    const old = at("2026-10-01T08:00:00");
    expect(ask({ op: facts("op", { counted: old, freshness: 7 }) }).state).toBe("not_counted");
    expect(ask({ op: facts("op", { counted: old, freshness: 14 }) }).state).toBe("in_stock");
    expect(ask({ op: facts("op", { counted: old }) }).state).toBe("in_stock");
  });
  it("AV-3 out, with since from the stock-out on record", () => {
    const r = ask({ op: facts("op", { left: 0 }) });
    expect(r.state).toBe("out");
    expect(r.since).toEqual(at("2026-10-11T09:00:00"));
  });
  it("AV-3 SL-5 SL-9 out when only expired stock is left, since the expiry", () => {
    const b = batch("op-old", "op", { expiry: "2026-10-05" });
    const f: PointStockFacts = {
      ...facts("op"),
      batches: [b],
      movements: [mv(b, "received", 30, at("2026-10-01T08:00:00"))],
    };
    const r = ask({ op: f });
    expect(r.state).toBe("out");
    expect(r.since).toEqual(at("2026-10-06T00:00:00"));
  });
  it("AV-3 low: under the reorder level; no level is never low", () => {
    expect(ask({ op: facts("op", { left: 9, level: 10 }) }).state).toBe("low");
    expect(ask({ op: facts("op", { left: 10, level: 10 }) }).state).toBe("in_stock");
    expect(ask({ op: facts("op", { left: 1 }) }).state).toBe("in_stock");
  });
  it("AV-3 in_stock", () => {
    expect(ask({ op: facts("op") }).state).toBe("in_stock");
  });
});

describe("AV-3 pairs of states that hold together resolve by the order", () => {
  const neg = (pointId: string) => {
    const b = batch(`${pointId}-neg`, pointId);
    return { batches: [b], movements: [mv(b, "supplied", -2, at("2026-10-12T10:00:00"), true)] };
  };
  const cases: [string, PointStockFacts, AvailabilityState][] = [
    [
      "not stocked AND below zero",
      facts("op", { product: false, extra: neg("op") }),
      "not_stocked",
    ],
    [
      "not stocked AND uncounted",
      facts("op", { product: false, counted: null, received: false }),
      "not_stocked",
    ],
    ["not stocked AND zero", facts("op", { product: false, left: 0 }), "not_stocked"],
    ["not stocked AND low", facts("op", { product: false, left: 5, level: 10 }), "not_stocked"],
    ["below zero AND zero total", facts("op", { left: 0, extra: neg("op") }), "not_counted"],
    ["below zero AND a positive total", facts("op", { left: 50, extra: neg("op") }), "not_counted"],
    ["uncounted AND zero", facts("op", { counted: null, received: false, left: 0 }), "not_counted"],
    [
      "stale count AND zero",
      facts("op", { counted: at("2026-09-01T08:00:00"), freshness: 7, left: 0 }),
      "not_counted",
    ],
    [
      "stale count AND low",
      facts("op", { counted: at("2026-09-01T08:00:00"), freshness: 7, left: 5, level: 10 }),
      "not_counted",
    ],
    [
      "uncounted AND low",
      facts("op", { counted: null, received: false, left: 5, level: 10 }),
      "not_counted",
    ],
    ["out AND under the reorder level", facts("op", { left: 0, level: 10 }), "out"],
  ];
  for (const [name, f, want] of cases)
    it(`AV-3 ${name} → ${want}`, () => expect(ask({ op: f }).state).toBe(want));
});

describe("AV-4 count and receipt times", () => {
  it("AV-4 a receipt and no count: lastReceiptAt only, and the state still stands", () => {
    const r = ask({ op: facts("op", { counted: null }) });
    expect(r.state).toBe("in_stock");
    expect(r.lastCountAt).toBeNull();
    expect(r.lastReceiptAt).toEqual(at("2026-10-10T08:00:00"));
  });
  it("AV-4 the last receipt is the latest `received` movement; a transfer in is not a receipt", () => {
    const f = facts("op");
    const b = batch("op-fx1", "op");
    const r = ask({
      op: {
        ...f,
        movements: [
          ...f.movements,
          mv(b, "received", 5, at("2026-10-12T07:00:00")),
          mv(b, "transfer_in", 5, at("2026-10-12T09:00:00")),
        ],
      },
    });
    expect(r.lastReceiptAt).toEqual(at("2026-10-12T07:00:00"));
    expect(r.lastCountAt).toEqual(at("2026-10-12T08:00:00"));
  });
});

describe("AV-5 elsewhere", () => {
  it("AV-5 names other live points of this hospital holding it; never another hospital's", () => {
    const points = [
      point("op", "window"),
      point("ward", "wards"),
      point("store", "all"),
      point("away", "window", "fixture-hospital-2"),
    ];
    const r = ask(
      {
        op: facts("op", { left: 0 }),
        ward: facts("ward", { left: 5, level: 10 }),
        store: facts("store", { counted: null, received: false }),
        away: facts("away"),
      },
      points,
    );
    expect(r.elsewhere).toEqual(["Fixture ward"]);
  });
});

/** True when any field of T (deeply) can be a number; Dates are timestamps and allowed. */
type CanHoldNumber<T> = T extends number
  ? true
  : T extends Date | string | boolean | null | undefined
    ? false
    : T extends readonly (infer U)[]
      ? CanHoldNumber<U>
      : T extends object
        ? { [K in keyof T]-?: CanHoldNumber<T[K]> }[keyof T]
        : false;

describe("AV-6 no quantity leaves the function", () => {
  it("AV-6 the return type has no numeric field", () => {
    const noNumber: [CanHoldNumber<Availability>] extends [false] ? true : never = true;
    expect(noNumber).toBe(true);
  });
  it("AV-6 no number appears in any answer, whatever the stock", () => {
    const walk = (v: unknown, path: string): string[] => {
      if (typeof v === "number" || typeof v === "bigint") return [path];
      if (v instanceof Date || v === null || typeof v !== "object") return [];
      return Object.entries(v).flatMap(([k, x]) => walk(x, `${path}.${k}`));
    };
    const stocks = [0, 1, 9, 50, 100].flatMap((left) => [
      facts("op", { left }),
      facts("op", { left, level: 10 }),
      facts("op", { left, counted: null }),
      facts("op", { left, freshness: 1, counted: at("2026-09-01T08:00:00") }),
    ]);
    for (const f of stocks) {
      const r = ask({ op: f, ward: facts("ward") }, [
        point("op", "window"),
        point("ward", "wards"),
      ]);
      expect(walk(r, "answer")).toEqual([]);
    }
  });
});

describe("AV-9 exact medicine only", () => {
  it("AV-9 another medicine's product or stock is never this medicine's availability", () => {
    const b = batch("op-other", "op", { medicineId: OTHER });
    const f: PointStockFacts = {
      products: [{ id: "other-product", medicineId: OTHER }],
      batches: [b],
      movements: [mv(b, "received", 100, at("2026-10-10T08:00:00"))],
      lastCountAt: at("2026-10-12T08:00:00"),
      reorderLevel: null,
      countFreshnessDays: null,
    };
    expect(ask({ op: f }).state).toBe("not_stocked");
    // With this medicine's product present but no batch of it, the other's stock does not count.
    const r = ask({
      op: { ...f, products: [...f.products, { id: "op-product", medicineId: MED }] },
    });
    expect(r.state).toBe("out");
    expect(r.lastReceiptAt).toBeNull();
  });
});

describe("AV-7 D-PH1-22 the level in the dialog", () => {
  const signed: AvailabilityMapping = {
    in_stock: "note",
    low: "note",
    not_counted: "note",
    out: "check",
    not_stocked: "check",
  };
  it("AV-7 D-PH1-22 Note for in stock, low and not counted; Check for out and not stocked", () => {
    expect(availabilityLevel("in_stock", signed)).toBe("note");
    expect(availabilityLevel("low", signed)).toBe("note");
    expect(availabilityLevel("not_counted", signed)).toBe("note");
    expect(availabilityLevel("out", signed)).toBe("check");
    expect(availabilityLevel("not_stocked", signed)).toBe("check");
  });
  it("AV-7 never a Stop, even if the stored mapping says so", () => {
    const bad = { ...signed, out: "stop" } as unknown as AvailabilityMapping;
    expect(availabilityLevel("out", bad)).toBe("check");
  });
  it("AV-7 not_linked, or an unsigned mapping, keeps today's behaviour (not checked)", () => {
    expect(availabilityLevel("not_linked", signed)).toBe("not_checked");
    expect(availabilityLevel("out", null)).toBe("not_checked");
  });
});

describe("ADR 0190 the old seam is unchanged", () => {
  it("pharmacyAvailability still answers not_linked and PHARMACY_WORD keeps its words", () => {
    expect(pharmacyAvailability("fixture-medicine", H)).toEqual({ status: "not_linked" });
    expect(PHARMACY_WORD).toEqual({
      not_linked: "Stock: not linked",
      in: "In stock",
      low: "Low stock",
      out: "Out of stock",
    });
  });
});

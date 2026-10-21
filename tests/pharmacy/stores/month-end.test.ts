import { createHash } from "node:crypto";
import type { MonthRow } from "@/lib/pharmacy/stores/month-end";
import { describe, expect, it } from "vitest";

import {
  canClose,
  carryForward,
  printSource,
  reconcile,
  snapshotContent,
  stableJson,
} from "@/lib/pharmacy/stores/month-end";
import { at, mv } from "./fixtures";

const P = "fx-product-a";
const productOf = new Map([
  ["b-opd", P],
  ["b-store", P],
  ["b-ward", P],
]);
const OCT = "2026-10-01";
const base = {
  month: OCT,
  productOf,
  closes: new Map<string, Date>(),
  opening: new Map([[P, 100]]),
  carried: [],
  explanations: new Map(),
  costs: new Map<string, number>(),
};
const countAt = at("2026-10-31T18:00:00");
const opd = [
  mv("b-opd", "opd", "received", 100, at("2026-09-01T09:00:00")),
  mv("b-opd", "opd", "received", 50, at("2026-10-05T09:00:00")),
  mv("b-opd", "opd", "supplied", -20, at("2026-10-10T09:00:00")),
  mv("b-opd", "opd", "count_correction", -2, at("2026-10-15T09:00:00"), {
    sourceKind: "count",
    sourceId: "c-mid",
    reasonCode: "miscount",
  }),
  mv("b-opd", "opd", "count_correction", -28, countAt, { sourceKind: "count", sourceId: "c-end" }),
];
const opdCount = { locationId: "opd", countId: "c-end", at: countAt, counted: new Map([[P, 100]]) };
const one = (rows: MonthRow[]) => rows[0] as MonthRow;

describe("MR-1 reconcile a location", () => {
  it("a 30-unit shortfall found at month end shows under Difference, not Adjusted", () => {
    const ms = [
      mv("b-opd", "opd", "received", 100, at("2026-09-01T09:00:00")),
      mv("b-opd", "opd", "received", 50, at("2026-10-05T09:00:00")),
      mv("b-opd", "opd", "supplied", -20, at("2026-10-10T09:00:00")),
      mv("b-opd", "opd", "count_correction", -30, countAt, {
        sourceKind: "count",
        sourceId: "c-end",
      }),
    ];
    const r = one(
      reconcile({
        ...base,
        scope: { kind: "location", locationId: "opd" },
        movements: ms,
        counts: [opdCount],
      }),
    );
    expect(r.columns).toMatchObject({ received: 50, supplied: -20, adjusted: 0 });
    expect([r.opening, r.shouldBe, r.counted, r.difference]).toEqual([100, 130, 100, -30]);
  });
  it("earlier corrections in the month appear under Adjusted with their reasons", () => {
    const r = one(
      reconcile({
        ...base,
        scope: { kind: "location", locationId: "opd" },
        movements: opd,
        counts: [opdCount],
      }),
    );
    expect(r.columns.adjusted).toBe(-2);
    expect(r.adjustedReasons).toEqual([{ reasonCode: "miscount", quantity: -2 }]);
    expect([r.shouldBe, r.difference]).toEqual([128, -28]);
  });
  it("at hospital level internal transfers cancel and are not shown as received", () => {
    const t = at("2026-10-12T09:00:00");
    const ms = [
      mv("b-store", "store", "received", 200, at("2026-10-02T09:00:00")),
      mv("b-store", "store", "issued", -40, t, { pairId: "i1" }),
      mv("b-opd", "opd", "received_from_issue", 40, t, { pairId: "i1" }),
      mv("b-opd", "opd", "supplied", -10, t),
    ];
    const counts = [
      { locationId: "store", countId: "cs", at: countAt, counted: new Map([[P, 160]]) },
      { locationId: "opd", countId: "co", at: countAt, counted: new Map([[P, 30]]) },
    ];
    const hosp = one(
      reconcile({
        ...base,
        opening: new Map(),
        scope: { kind: "hospital", locationIds: ["store", "opd"] },
        movements: ms,
        counts,
      }),
    );
    expect(hosp.columns).toMatchObject({ received: 200, issuedIn: 0, issuedOut: 0, supplied: -10 });
    expect([hosp.shouldBe, hosp.counted, hosp.difference]).toEqual([190, 190, 0]);
    const point = one(
      reconcile({
        ...base,
        opening: new Map(),
        scope: { kind: "location", locationId: "opd" },
        movements: ms,
        counts,
      }),
    );
    expect(point.columns.issuedIn).toBe(40);
  });
  it("a ward's month-end use is Used, from the count, with no difference", () => {
    const ms = [
      mv("b-ward", "ward", "received_from_issue", 50, at("2026-10-03T09:00:00"), { pairId: "w" }),
      mv("b-ward", "ward", "ward_used", -30, countAt, { sourceKind: "count", sourceId: "cw" }),
    ];
    const counts = [
      { locationId: "ward", countId: "cw", at: countAt, counted: new Map([[P, 20]]) },
    ];
    const r = one(
      reconcile({
        ...base,
        opening: new Map(),
        scope: { kind: "location", locationId: "ward" },
        movements: ms,
        counts,
      }),
    );
    expect([r.columns.issuedIn, r.columns.used, r.shouldBe, r.counted, r.difference]).toEqual([
      50, -30, 20, 20, 0,
    ]);
  });
  it("lists products not counted this month", () => {
    const r = one(
      reconcile({
        ...base,
        scope: { kind: "location", locationId: "opd" },
        movements: opd,
        counts: [],
      }),
    );
    expect([r.counted, r.difference, r.notCountedAt]).toEqual([null, null, ["opd"]]);
  });
});

describe("MR-2 opening and carried differences", () => {
  it("opening is the counted figure; an unexplained difference is a carried line, never opening", () => {
    const explanations = new Map([[P, { unexplained: true as const }]]);
    const rows = reconcile({
      ...base,
      scope: { kind: "location", locationId: "opd" },
      movements: opd,
      counts: [opdCount],
      explanations,
    });
    expect(one(rows).explanation).toBe("unexplained");
    const next = carryForward(OCT, rows);
    expect(next.opening.get(P)).toBe(100);
    expect(next.carried).toEqual([{ productId: P, month: OCT, difference: -28 }]);
    const nov = one(
      reconcile({
        ...base,
        month: "2026-11-01",
        opening: next.opening,
        carried: next.carried,
        scope: { kind: "location", locationId: "opd" },
        movements: opd,
        counts: [],
      }),
    );
    expect([nov.opening, nov.carried]).toEqual([100, [{ month: OCT, difference: -28 }]]);
  });
  it("a difference with a reason is explained", () => {
    const explanations = new Map([[P, { reasonCode: "breakage_found" }]]);
    const r = one(
      reconcile({
        ...base,
        scope: { kind: "location", locationId: "opd" },
        movements: opd,
        counts: [opdCount],
        explanations,
      }),
    );
    expect([r.explanation, r.explained]).toEqual(["reason", -28]);
  });
});

describe("MR-3 canClose", () => {
  const rows = reconcile({
    ...base,
    scope: { kind: "location", locationId: "opd" },
    movements: opd,
    counts: [opdCount],
  });
  const input = {
    month: OCT,
    rows,
    counts: [opdCount],
    notCountedReasons: new Set<string>(),
    countWindow: { daysBefore: 2, daysAfter: 3 },
    closedBy: "u1",
    approvedBy: "u2",
    approvalAttestationId: "att",
  };
  it("blocks a difference without a reason, then closes once it is marked unexplained", () => {
    expect(canClose(input)).toEqual({
      ok: false,
      blockers: [{ kind: "difference_without_reason", productId: P }],
    });
    const marked = reconcile({
      ...base,
      scope: { kind: "location", locationId: "opd" },
      movements: opd,
      counts: [opdCount],
      explanations: new Map([[P, { unexplained: true as const }]]),
    });
    expect(canClose({ ...input, rows: marked })).toEqual({ ok: true, blockers: [] });
  });
  it("blocks an uncounted product without a reason, a count outside the window, and no second approver", () => {
    const uncounted = reconcile({
      ...base,
      scope: { kind: "location", locationId: "opd" },
      movements: opd,
      counts: [],
    });
    const r = canClose({
      ...input,
      rows: uncounted,
      counts: [{ locationId: "opd", at: at("2026-10-20T09:00:00") }],
      approvedBy: "u1",
    });
    expect("blockers" in r && r.blockers).toEqual([
      { kind: "count_outside_window", locationId: "opd" },
      { kind: "not_counted", productId: P },
      { kind: "approver_is_closer" },
    ]);
    expect(
      canClose({
        ...input,
        rows: uncounted,
        notCountedReasons: new Set([P]),
        approvalAttestationId: null,
      }),
    ).toEqual({
      ok: false,
      blockers: [{ kind: "second_approver_needed" }],
    });
    expect(canClose({ ...input, countWindow: null })).toEqual({
      missing: ["month_end_count_window"],
    });
  });
});

describe("MR-4 snapshot", () => {
  it("stable JSON: same figures, same text and sha256, whatever the key order", () => {
    const a = stableJson({
      b: 1,
      a: {
        d: new Date("2026-10-31T15:00:00Z"),
        c: new Map([
          ["y", 2],
          ["x", 1],
        ]),
      },
    });
    const b = stableJson({
      a: {
        c: new Map([
          ["x", 1],
          ["y", 2],
        ]),
        d: new Date("2026-10-31T15:00:00Z"),
      },
      b: 1,
    });
    expect(a).toBe(b);
    expect(a).toBe('{"a":{"c":{"x":1,"y":2},"d":"2026-10-31T15:00:00.000Z"},"b":1}');
    const rows = reconcile({
      ...base,
      scope: { kind: "location", locationId: "opd" },
      movements: opd,
      counts: [opdCount],
    });
    const sha = (s: string) => createHash("sha256").update(s).digest("hex");
    expect(sha(snapshotContent("opd", OCT, rows))).toBe(
      sha(snapshotContent("opd", OCT, [...rows])),
    );
  });
});

describe("MR-5 late movements (S9)", () => {
  it("land in the first open month labelled 'belongs to', and the closed month is unchanged", () => {
    const closes = new Map([["2026-09-01", at("2026-10-02T12:00:00")]]);
    const late = mv("b-opd", "opd", "supplied", -7, at("2026-09-25T09:00:00"), {
      recordedAt: at("2026-10-06T09:00:00"),
      downtime: true,
    });
    const ms = [...opd, late];
    const sep = one(
      reconcile({
        ...base,
        month: "2026-09-01",
        opening: new Map(),
        closes,
        scope: { kind: "location", locationId: "opd" },
        movements: ms,
        counts: [],
      }),
    );
    expect(sep.columns.supplied).toBe(0);
    const oct = one(
      reconcile({
        ...base,
        closes,
        scope: { kind: "location", locationId: "opd" },
        movements: ms,
        counts: [opdCount],
      }),
    );
    expect(oct.columns.supplied).toBe(-27);
    expect(oct.late).toEqual([
      { movementId: late.id, belongsTo: "2026-09-01", recordedAt: at("2026-10-06T09:00:00") },
    ]);
  });
});

describe("MR-6 printing", () => {
  it("closed months print from the snapshot; open months live, with the banner", () => {
    expect(printSource(null)).toEqual({ from: "live", banner: "month_not_closed" });
    expect(printSource("{}")).toEqual({ from: "snapshot", content: "{}" });
  });
});

describe("D-PH2-14 money only from recorded cost", () => {
  it("each figure at the batch's recorded cost; a product with an uncosted batch shows no money", () => {
    const costs = new Map([["b-opd", 250]]);
    const r = one(
      reconcile({
        ...base,
        costs,
        scope: { kind: "location", locationId: "opd" },
        movements: opd,
        counts: [opdCount],
      }),
    );
    expect(r.money).toMatchObject({ received: 12_500, supplied: -5_000, adjusted: -500 });
    const mixed = [...opd, mv("b-other", "opd", "received", 5, at("2026-10-06T09:00:00"))];
    const r2 = one(
      reconcile({
        ...base,
        costs,
        productOf: new Map([...productOf, ["b-other", P]]),
        scope: { kind: "location", locationId: "opd" },
        movements: mixed,
        counts: [opdCount],
      }),
    );
    expect(r2.money).toBeNull();
  });
});

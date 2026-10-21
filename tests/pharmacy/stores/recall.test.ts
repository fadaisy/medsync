import type { LocationKind } from "@/lib/pharmacy/stores/locations";
import { describe, expect, it } from "vitest";

import {
  accountedFor,
  blocks,
  closeRefusals,
  exactList,
  holdWindows,
  mayHaveList,
  openRecalls,
  patientStatuses,
  recallMatches,
  reconciliationFigures,
} from "@/lib/pharmacy/stores/recall";
import { at, mv } from "./fixtures";

const recallStartedAt = at("2026-10-20T09:00:00");
const locationKind = new Map<string, LocationKind>([
  ["store", "store"],
  ["opd", "dispensing_point"],
  ["ward6", "ward"],
  ["ward7", "ward"],
  ["cart1", "cart"],
  ["q", "quarantine"],
]);

describe("RC-1 matching and blocking", () => {
  const b = {
    productId: "fx-product-a",
    batchNumber: "NEW-2",
    firstBatchNumber: "OLD-0",
    earlierNumbers: ["MID-1"],
  };
  it("matches the product and the current or any earlier number, case-insensitively", () => {
    for (const n of ["new-2", "OLD-0", "mid-1"])
      expect(recallMatches({ productId: "fx-product-a", batchNumber: n }, b)).toBe(true);
    expect(recallMatches({ productId: "fx-product-a", batchNumber: "OTHER" }, b)).toBe(false);
    expect(recallMatches({ productId: "fx-product-b", batchNumber: "NEW-2" }, b)).toBe(false);
    expect(recallMatches({ productId: "fx-product-a", batchNumber: null }, b)).toBe(true);
  });
  it("an open recall blocks at once; a closed one does not", () => {
    const r = {
      productId: "fx-product-a",
      batchNumber: "NEW-2",
      startedAt: recallStartedAt,
      closedAt: null,
    };
    expect(blocks(r, b)).toBe(true);
    expect(blocks({ ...r, closedAt: at("2026-10-21T09:00:00") }, b)).toBe(false);
  });
});

describe("RC-2 list 2, exact", () => {
  it("supplies net of reversals; a fully reversed patient is not listed", () => {
    const s = (patientId: string, quantity: number) => ({
      patientId,
      batchId: "b",
      locationId: "opd",
      at: recallStartedAt,
      quantity,
    });
    expect(
      exactList([s("p1", 10), s("p2", 5), s("p2", -5), s("p3", 3), s("p1", -4)]).map((p) => [
        p.patientId,
        p.quantity,
      ]),
    ).toEqual([
      ["p1", 6],
      ["p3", 3],
    ]);
  });
});

describe("RC-3 list 4, may have received it", () => {
  const ms = [
    mv("b-w6", "ward6", "received_from_issue", 20, at("2026-10-01T09:00:00"), { pairId: "i1" }),
    mv("b-w6", "ward6", "ward_used", -20, at("2026-10-10T09:00:00"), { sourceKind: "count" }),
    mv("b-w7", "ward7", "received_from_issue", 20, at("2026-10-05T09:00:00"), { pairId: "i2" }),
    mv("b-w7", "ward7", "ward_used", -20, at("2026-10-08T09:00:00"), {
      sourceKind: "count",
      allocated: true,
    }),
    mv("b-c1", "cart1", "received_from_issue", 2, at("2026-10-02T09:00:00"), { pairId: "i3" }),
    mv("b-c1", "cart1", "quarantined_out", -2, at("2026-10-12T09:00:00"), { pairId: "q1" }),
  ];
  it("windows: ward to count-zero; allocated ward to the recall's start; cart to its removal", () => {
    expect(
      holdWindows({ movements: ms, locationKind, recallStartedAt }).map((w) => [
        w.locationId,
        w.from,
        w.to,
        w.allocated,
        w.source,
      ]),
    ).toEqual([
      ["ward6", at("2026-10-01T09:00:00"), at("2026-10-10T09:00:00"), false, "ward"],
      ["ward7", at("2026-10-05T09:00:00"), recallStartedAt, true, "ward"],
      ["cart1", at("2026-10-02T09:00:00"), at("2026-10-12T09:00:00"), false, "cart"],
    ]);
  });
  it("lists charted patients in the window, labelled, never a list-2 patient", () => {
    const windows = holdWindows({ movements: ms, locationKind, recallStartedAt });
    const administrations = [
      { patientId: "p-in", locationId: "ward6", at: at("2026-10-03T09:00:00") },
      { patientId: "p-in", locationId: "ward6", at: at("2026-10-02T09:00:00") },
      { patientId: "p-after", locationId: "ward6", at: at("2026-10-11T09:00:00") },
      { patientId: "p-exact", locationId: "ward6", at: at("2026-10-03T09:00:00") },
      { patientId: "p-alloc", locationId: "ward7", at: at("2026-10-15T09:00:00") },
      { patientId: "p-cart", locationId: "cart1", at: at("2026-10-04T09:00:00") },
    ];
    expect(
      mayHaveList({ windows, administrations, exactPatientIds: new Set(["p-exact"]) }),
    ).toEqual([
      {
        patientId: "p-alloc",
        source: "ward",
        locationId: "ward7",
        firstAt: at("2026-10-15T09:00:00"),
        allocated: true,
      },
      {
        patientId: "p-cart",
        source: "cart",
        locationId: "cart1",
        firstAt: at("2026-10-04T09:00:00"),
        allocated: false,
      },
      {
        patientId: "p-in",
        source: "ward",
        locationId: "ward6",
        firstAt: at("2026-10-02T09:00:00"),
        allocated: false,
      },
    ]);
  });
  it("S8: empty when no ward or cart received the batch", () => {
    const pointOnly = [
      mv("b-o", "opd", "received_from_issue", 20, at("2026-10-01T09:00:00"), { pairId: "x" }),
    ];
    const windows = holdWindows({ movements: pointOnly, locationKind, recallStartedAt });
    expect(windows).toEqual([]);
    expect(
      mayHaveList({
        windows,
        administrations: [{ patientId: "p", locationId: "ward6", at: at("2026-10-03T09:00:00") }],
        exactPatientIds: new Set(),
      }),
    ).toEqual([]);
  });
});

describe("RC-4 accounted for", () => {
  it("shows every term; internal transfers cancel; a missing leg is a gap to explain", () => {
    const t = at("2026-10-05T09:00:00");
    const ms = [
      mv("s", "store", "received", 100, t),
      mv("s", "store", "borrowed", 10, t, { counterpartyId: "f" }),
      mv("s", "store", "issued", -60, t, { pairId: "a" }),
      mv("o", "opd", "received_from_issue", 60, t, { pairId: "a" }),
      mv("o", "opd", "supplied", -30, t),
      mv("o", "opd", "reversed", 2, t),
      mv("s", "store", "lent", -5, t, { counterpartyId: "f" }),
      mv("s", "store", "quarantined_out", -10, t, { pairId: "q" }),
      mv("q", "q", "quarantined_in", 10, t, { pairId: "q" }),
      mv("q", "q", "written_off", -4, t),
      mv("o", "opd", "adjusted", -1, t),
    ];
    const r = accountedFor(ms);
    expect(r.externalIn).toEqual({ received: 100, borrowed: 10, loanReturnedIn: 0, total: 110 });
    expect(r.out).toMatchObject({
      suppliedNet: 28,
      writtenOff: 4,
      lent: 5,
      adjustedNet: 1,
      total: 38,
    });
    expect([r.balance, r.gap]).toEqual([72, 0]);
    expect(accountedFor(ms.filter((m) => m.kind !== "received_from_issue")).gap).toBe(60);
    expect(reconciliationFigures(r)).toMatchObject({
      received: 110,
      issued: 33,
      returned: 0,
      outstanding: 72,
      gap: 0,
    });
  });
});

describe("RC-5 patient status from events", () => {
  it("is the latest event; none yet is 'not yet contacted'", () => {
    const s = patientStatuses(
      [
        { patientId: "p1", list: "exact" },
        { patientId: "p2", list: "exact" },
      ],
      [
        {
          patientId: "p1",
          list: "exact",
          outcome: "could_not_reach",
          at: at("2026-10-20T10:00:00"),
        },
        {
          patientId: "p1",
          list: "exact",
          outcome: "reached_by_phone",
          at: at("2026-10-21T10:00:00"),
        },
      ],
    );
    expect(s.map((x) => [x.patientId, x.status, x.events.length])).toEqual([
      ["p1", "reached_by_phone", 2],
      ["p2", "not_yet_contacted", 0],
    ]);
  });
});

describe("RC-6 closing a recall", () => {
  it("needs returned and destroyed quantities; open recalls stay listed", () => {
    expect(closeRefusals({ closedAt: null, returnedQuantity: null, destroyedQuantity: 0 })).toEqual(
      ["quantities_needed"],
    );
    expect(closeRefusals({ closedAt: null, returnedQuantity: 12, destroyedQuantity: 0 })).toEqual(
      [],
    );
    expect(
      closeRefusals({ closedAt: recallStartedAt, returnedQuantity: 1, destroyedQuantity: 1 }),
    ).toEqual(["already_closed"]);
    expect(
      openRecalls([
        { id: "a", closedAt: null },
        { id: "b", closedAt: recallStartedAt },
      ]).map((r) => r.id),
    ).toEqual(["a"]);
  });
});

import type { LocationKind } from "@/lib/pharmacy/stores/locations";
import { describe, expect, it } from "vitest";

import { expiredToQuarantine, expiring, writeOffRefusals } from "@/lib/pharmacy/stores/expiry";
import { batch } from "./fixtures";

const TODAY = "2026-10-21";
const locationKind = new Map<string, LocationKind>([
  ["store", "store"],
  ["opd", "dispensing_point"],
  ["q", "quarantine"],
]);
const bs = [
  batch({ id: "s-soon", pointId: "store", expiry: "2026-11-30" }),
  batch({ id: "s-month", pointId: "store", expiry: "2026-12-01", expiryMonthOnly: true }),
  batch({ id: "s-far", pointId: "store", expiry: "2028-01-31" }),
  batch({ id: "o-soon", pointId: "opd", expiry: "2026-11-01" }),
  batch({ id: "o-gone", pointId: "opd", expiry: "2026-10-01" }),
  batch({ id: "q-soon", pointId: "q", expiry: "2026-11-01" }),
];
const balances = new Map(bs.map((b) => [b.id, 5]));

describe("EX-1 expiring and expired", () => {
  it("lists held, unexpired batches inside the look-ahead, per location, first expiry first", () => {
    const r = expiring({
      batches: bs,
      balances,
      locationKind,
      localDate: TODAY,
      lookaheadDays: 90,
      supplierTakesReturns: (id) => id === "s-soon",
    });
    if (!("byLocation" in r)) throw new Error("missing");
    expect(r.byLocation.get("store")?.map((x) => [x.batchId, x.expiresOn, x.daysLeft])).toEqual([
      ["s-soon", "2026-11-30", 40],
      ["s-month", "2026-12-31", 71],
    ]);
    expect(r.byLocation.get("store")?.[0]?.actions).toEqual([
      "issue_first",
      "move_to_use",
      "return_to_supplier",
      "lend",
    ]);
    expect(r.byLocation.get("opd")?.map((x) => x.batchId)).toEqual(["o-soon"]);
    expect(r.byLocation.has("q")).toBe(false);
  });
  it("Law 6: no look-ahead set, nothing computed", () => {
    expect(
      expiring({
        batches: bs,
        balances,
        locationKind,
        localDate: TODAY,
        lookaheadDays: null,
        supplierTakesReturns: () => false,
      }),
    ).toEqual({
      missing: ["expiry_lookahead"],
    });
  });
  it("expired batches outside quarantine are listed to move there (SL-5)", () => {
    expect(expiredToQuarantine({ batches: bs, balances, locationKind, localDate: TODAY })).toEqual([
      { batchId: "o-gone", locationId: "opd", quantity: 5 },
    ]);
  });
});

describe("EX-2 write-off", () => {
  const ok = {
    locationKind: "quarantine" as const,
    canManage: true,
    reason: "expired",
    registerNumber: "ESM-0001",
    witnessAttestationId: "att",
    quantity: 5,
    balance: 5,
  };
  it("only from quarantine, by pharmacy.manage, with reason, register entry and witness", () => {
    expect(writeOffRefusals(ok)).toEqual([]);
    expect(
      writeOffRefusals({
        ...ok,
        locationKind: "store",
        canManage: false,
        reason: " ",
        registerNumber: null,
        witnessAttestationId: null,
        quantity: 6,
      }),
    ).toEqual([
      "not_quarantine",
      "manage_needed",
      "reason_needed",
      "register_entry_needed",
      "witness_needed",
      "invalid_quantity",
    ]);
  });
});

import { describe, expect, it } from "vitest";

import {
  locationConditions,
  monthEndReady,
  orderingReady,
} from "@/lib/pharmacy/stores/readiness-stores";
import { at } from "./fixtures";

const ready = {
  model: null,
  name: "Main store",
  productIds: ["a", "b"],
  openingCounted: new Set(["a", "b"]),
  packSigned: true,
  inChargeUserId: "u1",
  briefedAt: at("2026-10-15T09:00:00"),
  drill: { at: at("2026-10-16T09:00:00"), includedDelivery: true, includedIssue: true },
};
const ids = (cs: { id: string; met: boolean }[]) => cs.map((c) => [c.id, c.met]);

describe("GL2-1 conditions per location kind (5.12)", () => {
  it("a store needs products, a full opening count, in-charge, briefing and a drill with a delivery and an issue", () => {
    expect(ids(locationConditions({ ...ready, kind: "store" }))).toEqual([
      ["products_set_up", true],
      ["opening_count", true],
      ["in_charge_named", true],
      ["people_briefed", true],
      ["downtime_drill", true],
    ]);
    const partial = locationConditions({
      ...ready,
      kind: "store",
      openingCounted: new Set(["a"]),
      drill: { at: at("2026-10-16T09:00:00"), includedDelivery: true, includedIssue: false },
    });
    expect(partial.filter((c) => !c.met).map((c) => [c.id, c.action, c.evidence])).toEqual([
      ["opening_count", "opening_count", { counted: 1, of: 2 }],
      [
        "downtime_drill",
        "downtime_drill",
        { at: "2026-10-16T06:00:00.000Z", delivery: true, issue: false },
      ],
    ]);
  });
  it("a stocked ward needs its levels signed; a cart its cart list; no drill for either", () => {
    expect(
      ids(locationConditions({ ...ready, kind: "ward", model: "stocked", packSigned: false })),
    ).toEqual([
      ["products_set_up", true],
      ["opening_count", true],
      ["levels_signed", false],
      ["in_charge_named", true],
      ["people_briefed", true],
    ]);
    expect(ids(locationConditions({ ...ready, kind: "cart" })).map(([id]) => id)).toContain(
      "cart_list_signed",
    );
  });
  it("an issue-only ward needs only to be named (LC-4); quarantine its in-charge", () => {
    expect(ids(locationConditions({ ...ready, kind: "ward", model: "issue_only" }))).toEqual([
      ["location_named", true],
    ]);
    expect(ids(locationConditions({ ...ready, kind: "quarantine", inChargeUserId: null }))).toEqual(
      [["in_charge_named", false]],
    );
  });
  it("month end after one full counted month; ordering after a paper comparison with every difference explained", () => {
    expect(
      monthEndReady([
        {
          month: "2026-09-01",
          locations: [{ id: "s", countedAtStart: false, countedAtEnd: true }],
        },
      ]),
    ).toMatchObject({ met: false });
    expect(
      monthEndReady([
        { month: "2026-10-01", locations: [{ id: "s", countedAtStart: true, countedAtEnd: true }] },
      ]),
    ).toEqual({
      met: true,
      evidence: { month: "2026-10-01" },
      action: null,
    });
    expect(orderingReady(null)).toMatchObject({ met: false, action: "record_paper_comparison" });
    expect(
      orderingReady({
        recordedAt: at("2026-10-20T09:00:00"),
        differences: [{ explanation: null }],
      }),
    ).toMatchObject({ met: false, action: "explain_differences" });
    expect(
      orderingReady({
        recordedAt: at("2026-10-20T09:00:00"),
        differences: [{ explanation: "Paper used last year's AMC" }],
      }),
    ).toMatchObject({ met: true });
  });
});

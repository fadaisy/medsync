import { describe, expect, it } from "vitest";

import {
  buildNeedsYou,
  filterNeedsYou,
  groupNeedsYou,
  needsYouKinds,
} from "@/lib/pharmacy/workspace-v2/needs-you";

const ALL_TABS = new Set([
  "shelf.controlled",
  "window.supplied",
  "setup.downtime",
  "store.deliveries",
  "store.issues",
  "clinical.reactions",
  "clinical.reconciliation",
  "setup.packs",
]);

describe("needsYouKinds: each source only for the permission that acts on it", () => {
  it("no permissions, nothing", () => {
    expect(needsYouKinds({ permissions: new Set(["pharmacy.view"]), tabs: ALL_TABS, acting: true })).toEqual([]);
  });

  it("maps each permission to its sources", () => {
    const k = (p: string) => needsYouKinds({ permissions: new Set([p]), tabs: ALL_TABS, acting: true });
    expect(k("pharmacy.manage")).toEqual(["controlled", "pack"]);
    expect(k("pharmacy.review")).toEqual(["lookBack", "reaction", "reconciliation"]);
    expect(k("pharmacy.dispense")).toEqual(["downtime"]);
    expect(k("pharmacy.store")).toEqual(["delivery", "requisition"]);
    expect(k("pharmacy.stock")).toEqual(["confirm"]);
  });

  it("a source whose tab (flag) is off does not exist", () => {
    const perms = new Set(["pharmacy.manage", "pharmacy.review", "pharmacy.store", "pharmacy.stock", "pharmacy.dispense"]);
    expect(needsYouKinds({ permissions: perms, tabs: new Set(), acting: true })).toEqual([]);
  });

  it("controlled differences need an acting point", () => {
    const g = { permissions: new Set(["pharmacy.manage"]), tabs: ALL_TABS };
    expect(needsYouKinds({ ...g, acting: false })).toEqual(["pack"]);
  });
});

describe("buildNeedsYou and grouping", () => {
  const items = buildNeedsYou({
    controlled: [{ id: "d1", at: "2026-10-27T10:10:00Z", batchNumber: "M-0112", counted: 6, recorded: 7 }],
    lookBack: [
      { supplyId: "s2", at: "2026-10-27T08:00:00Z" },
      { supplyId: "s1", at: "2026-10-27T06:40:00Z" },
      { supplyId: "s3", at: "2026-10-27T09:00:00Z" },
    ],
    downtime: 0,
    deliveries: [
      { id: "v1", noteNumber: "INV-1", supplier: "A", locationName: "Main store", arrivedAt: new Date(), state: "counting" },
      { id: "v2", noteNumber: "INV-2", supplier: "A", locationName: "Main store", arrivedAt: new Date(), state: "finished" },
    ],
    requisitions: [
      { id: "r1", fromName: "Ward 3", toName: "Main store", raisedAt: new Date(), state: "raised", lines: 2 },
      { id: "r2", fromName: "Ward 3", toName: "Main store", raisedAt: new Date(), state: "issued", lines: 2 },
    ],
    reactions: [
      { id: "a1", medicine: "X", recordedAt: new Date("2026-10-27T08:00:00Z"), state: "to_submit", pastDue: false, dueAt: null },
      { id: "a2", medicine: "Y", recordedAt: new Date("2026-10-27T09:00:00Z"), state: "to_submit", pastDue: true, dueAt: null },
      { id: "a3", medicine: "Z", recordedAt: new Date(), state: "submitted", pastDue: false, dueAt: null },
    ],
    reconciliations: [
      { rec: { id: "m1", openedAt: new Date() }, state: "open" },
      { rec: { id: "m2", openedAt: new Date() }, state: "reopened" },
      { rec: { id: "m3", openedAt: new Date() }, state: "confirmed" },
    ],
    packs: [
      { kind: "a", signed: null },
      { kind: "b", signed: { id: "x" } },
      { kind: "c", signed: null },
    ],
  });

  it("look-back is one item with n and the oldest time; packs are one item", () => {
    const lb = items.filter((i) => i.kind === "lookBack");
    expect(lb).toHaveLength(1);
    expect(lb[0]).toMatchObject({ n: 3, since: "2026-10-27T06:40:00Z" });
    expect(items.filter((i) => i.kind === "pack")).toEqual([expect.objectContaining({ n: 2 })]);
  });

  it("keeps only rows in the acting state; zero downtime sheets is no item", () => {
    expect(items.filter((i) => i.kind === "delivery").map((i) => i.id)).toEqual(["delivery:v1"]);
    expect(items.filter((i) => i.kind === "requisition").map((i) => i.id)).toEqual(["requisition:r1"]);
    expect(items.filter((i) => i.kind === "reconciliation")).toHaveLength(2);
    expect(items.some((i) => i.kind === "downtime")).toBe(false);
  });

  it("past-due reactions first, with attention", () => {
    const r = items.filter((i) => i.kind === "reaction");
    expect(r.map((i) => i.id)).toEqual(["reaction:a2", "reaction:a1"]);
    expect(r[0]!.attention).toBe(true);
  });

  it("groups in §7 order; the chip filters by kind or group; the count is the list length", () => {
    expect(groupNeedsYou(items).map((g) => g.group)).toEqual(["today", "store", "clinical", "setup"]);
    expect(filterNeedsYou(items, "store").every((i) => ["delivery", "requisition", "confirm"].includes(i.kind))).toBe(true);
    expect(filterNeedsYou(items, "reaction")).toHaveLength(2);
    expect(filterNeedsYou(items, "all")).toHaveLength(items.length);
    expect(items).toHaveLength(1 + 1 + 1 + 1 + 2 + 2 + 1);
  });

  it("no detail names a patient", () => {
    expect(items.every((i) => !/patient/i.test(i.detail ?? ""))).toBe(true);
  });
});

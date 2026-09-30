import type { ItemRef } from "@/lib/wards/editor";
import type { WardLayout } from "@/lib/wards/layout-schema";
import { describe, expect, it } from "vitest";

import {
  itemsInBox,
  moveMany,
  removeMany,
  rotateEach,
  selectAll,
  serviceAcross,
  setServiceOn,
  toggleRef,
  unionRefs,
} from "@/lib/wards/editor";
import { emptyLayout } from "@/lib/wards/geometry";
import { planKeyAction } from "@/lib/wards/keys";
import { parseLayout } from "@/lib/wards/layout-schema";

/* Several items at once: a box across the floor, Shift+click, Ctrl/Cmd+A, and what a group can do. */

const bed = (
  key: string,
  x: number,
  y: number,
  services: WardLayout["beds"][number]["services"] = [],
) => ({
  key,
  label: key.toUpperCase(),
  type: "standard" as const,
  x,
  y,
  rot: 0 as const,
  services,
  status: "in" as const,
});

const doc: WardLayout = {
  ...emptyLayout({ w: 42, h: 32 }),
  rooms: [
    {
      key: "r1",
      kind: "bay",
      name: "Bay A",
      x: 20,
      y: 2,
      w: 12,
      h: 10,
      door: "bottom",
      features: {},
    },
  ],
  dividers: [
    { key: "l1", kind: "curtain", x1: 5, y1: 2, x2: 5, y2: 6 },
    { key: "l2", kind: "wall", x1: 0, y1: 20, x2: 42, y2: 20 },
  ],
  doors: [{ key: "o1", x: 10, y: 20, orient: "h" }],
  fixtures: [{ key: "f1", kind: "resus_trolley", label: "Resus", x: 12, y: 14, rot: 0 }],
  beds: [bed("b1", 2, 2, ["o2"]), bed("b2", 6, 2), bed("b3", 22, 4, ["o2", "suction"])],
};
const keys = (refs: ItemRef[]) => refs.map((r) => `${r.kind}:${r.key}`).sort();

describe("a box across the floor", () => {
  it("catches beds, fixtures and doors it touches; rooms and dividers only when wholly inside", () => {
    // Across the first two beds and the curtain between them.
    expect(keys(itemsInBox(doc, { x: 1, y: 1, w: 7, h: 6 }))).toEqual([
      "bed:b1",
      "bed:b2",
      "divider:l1",
    ]);
    // Touching the edge of bed 2 is enough; a curtain only half inside is not.
    expect(keys(itemsInBox(doc, { x: 5.5, y: 3, w: 1, h: 1 }))).toEqual(["bed:b2"]);
    // Inside the bay: its bed, not the bay.
    expect(keys(itemsInBox(doc, { x: 21, y: 3, w: 4, h: 6 }))).toEqual(["bed:b3"]);
    // Round the whole bay: the bay and its bed.
    expect(keys(itemsInBox(doc, { x: 19, y: 1, w: 14, h: 12 }))).toEqual(["bed:b3", "room:r1"]);
    // A door is a line: a box across it catches it.
    expect(keys(itemsInBox(doc, { x: 10.5, y: 19, w: 0.5, h: 2 }))).toEqual(["door:o1"]);
    expect(itemsInBox(doc, { x: 35, y: 25, w: 3, h: 3 })).toEqual([]);
  });

  it("Ctrl/Cmd+A takes everything; Shift+click adds and takes away; a box adds to what Shift kept", () => {
    expect(selectAll(doc)).toHaveLength(8);
    const one: ItemRef = { kind: "bed", key: "b1" };
    const two: ItemRef = { kind: "bed", key: "b2" };
    expect(toggleRef([one], two)).toEqual([one, two]);
    expect(toggleRef([one, two], one)).toEqual([two]);
    expect(unionRefs([one], [one, two])).toEqual([one, two]);
  });
});

describe("what a group can do", () => {
  const group: ItemRef[] = [
    { kind: "bed", key: "b1" },
    { kind: "bed", key: "b2" },
    { kind: "divider", key: "l1" },
  ];

  it("moves together, keeping the gaps; at the floor's edge the whole group stops", () => {
    const moved = moveMany(doc, group, 3, 4);
    expect(moved.beds.slice(0, 2).map((b) => [b.x, b.y])).toEqual([
      [5, 6],
      [9, 6],
    ]);
    expect(moved.dividers[0]).toMatchObject({ x1: 8, y1: 6, x2: 8, y2: 10 });
    // Left by 10: bed 1 can only go 2 before the wall, so the whole group goes 2.
    const edge = moveMany(doc, group, -10, 0);
    expect(edge.beds.slice(0, 2).map((b) => b.x)).toEqual([0, 4]);
    expect(edge.dividers[0]).toMatchObject({ x1: 3, x2: 3 });
    // What wasn't selected stays.
    expect(moved.beds[2]).toEqual(doc.beds[2]);
    expect(moveMany(doc, group, 0, 0)).toBe(doc);
    expect(parseLayout(moved).ok).toBe(true);
  });

  it("deletes them all, and rotates each about its own middle", () => {
    const gone = removeMany(doc, group);
    expect(gone.beds.map((b) => b.key)).toEqual(["b3"]);
    expect(gone.dividers.map((l) => l.key)).toEqual(["l2"]);
    const turned = rotateEach(doc, group.slice(0, 2));
    expect(turned.beds.slice(0, 2).map((b) => b.rot)).toEqual([90, 90]);
    expect(turned.beds[2]!.rot).toBe(0);
  });

  it("a service on every selected bed at once: all, some or none, then all or none", () => {
    const beds = ["b1", "b2", "b3"];
    expect(serviceAcross(doc, beds, "o2")).toBe("some");
    expect(serviceAcross(doc, ["b1", "b3"], "o2")).toBe("all");
    expect(serviceAcross(doc, beds, "monitor")).toBe("none");
    const on = setServiceOn(doc, beds, "o2", true);
    expect(on.beds.every((b) => b.services.includes("o2"))).toBe(true);
    // In catalogue order, never doubled.
    expect(on.beds[2]!.services).toEqual(["o2", "suction"]);
    const off = setServiceOn(on, beds, "o2", false);
    expect(off.beds.some((b) => b.services.includes("o2"))).toBe(false);
    expect(off.beds[2]!.services).toEqual(["suction"]);
  });
});

describe("the select-all key", () => {
  const key = (
    k: string,
    mods: { ctrl?: boolean; meta?: boolean; shift?: boolean } = {},
    target: unknown = { tagName: "DIV" },
  ) => ({
    key: k,
    ctrlKey: !!mods.ctrl,
    metaKey: !!mods.meta,
    shiftKey: !!mods.shift,
    altKey: false,
    target,
  });
  const o = { live: false, selected: false, armed: false };
  it("Ctrl+A and Cmd+A on the plan; a text field keeps its own; not in live mode", () => {
    expect(planKeyAction(key("a", { ctrl: true }), o)).toEqual({ type: "selectAll" });
    expect(planKeyAction(key("A", { meta: true }), o)).toEqual({ type: "selectAll" });
    expect(planKeyAction(key("a", { ctrl: true }, { tagName: "INPUT" }), o)).toBeNull();
    expect(planKeyAction(key("a", { ctrl: true, shift: true }), o)).toBeNull();
    expect(planKeyAction(key("a", { ctrl: true }), { ...o, live: true })).toBeNull();
    expect(planKeyAction(key("a"), o)).toBeNull();
  });
});

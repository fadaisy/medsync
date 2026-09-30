import type { LayoutBed, WardLayout } from "@/lib/wards/layout-schema";
import { describe, expect, it } from "vitest";

import {
  bedRect,
  cellOf,
  clampRect,
  crosses,
  emptyLayout,
  headAtWall,
  headEdge,
  lineOf,
  nextBedLabels,
  renumberBeds,
  rowOfBeds,
  segmentOf,
  snapDivider,
  turned,
} from "@/lib/wards/geometry";
import { parseLayout } from "@/lib/wards/layout-schema";

/* Plan geometry (ADR 0191): snapping, rotated footprints, clamping, the row of beds, dividers. */

const bed = (over: Partial<LayoutBed> = {}): LayoutBed => ({
  key: "b1",
  label: "B1",
  type: "standard",
  x: 4,
  y: 4,
  rot: 0,
  services: [],
  status: "in",
  ...over,
});

describe("snapping and footprints", () => {
  it("items snap to the cell under the pointer; dividers and doors to the nearest grid line", () => {
    expect([cellOf(3.2), cellOf(3.9), cellOf(0.01)]).toEqual([3, 3, 0]);
    expect([lineOf(3.2), lineOf(3.5), lineOf(3.9)]).toEqual([3, 4, 4]);
  });

  it("a turned footprint swaps width and depth at 90° and 270°, not at 180°", () => {
    expect(turned(2, 4, 0)).toEqual({ w: 2, h: 4 });
    expect(turned(2, 4, 90)).toEqual({ w: 4, h: 2 });
    expect(turned(2, 4, 180)).toEqual({ w: 2, h: 4 });
    expect(turned(2, 4, 270)).toEqual({ w: 4, h: 2 });
  });

  it("bed sizes: standard 1 × 2 m, ICU 1.5 × 2 m, cot 1 × 1.5 m (proposed)", () => {
    expect(bedRect(bed())).toEqual({ x: 4, y: 4, w: 2, h: 4 });
    expect(bedRect(bed({ type: "icu" }))).toMatchObject({ w: 3, h: 4 });
    expect(bedRect(bed({ type: "cot", rot: 90 }))).toMatchObject({ w: 3, h: 2 });
  });

  it("clamps a footprint to the floor, moving it rather than cutting it", () => {
    const floor = { w: 20, h: 10 };
    expect(clampRect({ x: 19, y: 8, w: 2, h: 4 }, floor)).toEqual({ x: 18, y: 6 });
    expect(clampRect({ x: -3, y: -1, w: 2, h: 4 }, floor)).toEqual({ x: 0, y: 0 });
  });
});

describe("dividers", () => {
  it("snap to the dominant axis: straight across or straight down", () => {
    expect(snapDivider({ x: 2, y: 2 }, { x: 10, y: 4 })).toEqual({ x2: 10, y2: 2 });
    expect(snapDivider({ x: 2, y: 2 }, { x: 4, y: 12 })).toEqual({ x2: 2, y2: 12 });
    // A tie goes across.
    expect(snapDivider({ x: 0, y: 0 }, { x: 3, y: 3 })).toEqual({ x2: 3, y2: 0 });
  });

  it("a divider crosses a bed only through its middle; touching an edge is fine", () => {
    const r = bedRect(bed());
    expect(crosses(r, segmentOf({ x1: 5, y1: 0, x2: 5, y2: 20 }))).toBe(true);
    expect(crosses(r, segmentOf({ x1: 4, y1: 0, x2: 4, y2: 20 }))).toBe(false);
    expect(crosses(r, segmentOf({ x1: 0, y1: 8, x2: 20, y2: 8 }))).toBe(false);
    expect(crosses(r, segmentOf({ x1: 0, y1: 6, x2: 3, y2: 6 }))).toBe(false);
  });
});

describe("head at the wall, for all four rotations", () => {
  const wallAt = (x1: number, y1: number, x2: number, y2: number) => [
    segmentOf({ x1, y1, x2, y2 }),
  ];
  it.each([
    [0, "top", wallAt(0, 3, 20, 3), { across: true, c: 4, a: 4, b: 6 }],
    [90, "right", wallAt(9, 0, 9, 20), { across: false, c: 8, a: 4, b: 6 }],
    [180, "bottom", wallAt(0, 9, 20, 9), { across: true, c: 8, a: 4, b: 6 }],
    [270, "left", wallAt(3, 0, 3, 20), { across: false, c: 4, a: 4, b: 6 }],
  ] as const)(
    "rot %i (head %s): within one cell of a wall along its width",
    (rot, _side, walls, edge) => {
      const b = bed({ rot });
      expect(headEdge(b)).toEqual(edge);
      expect(headAtWall(b, walls)).toBe(true);
    },
  );

  it("two cells away, or a wall that doesn't reach along the head, is not at the wall", () => {
    const b = bed();
    expect(headAtWall(b, [segmentOf({ x1: 0, y1: 2, x2: 20, y2: 2 })])).toBe(false);
    expect(headAtWall(b, [segmentOf({ x1: 10, y1: 4, x2: 20, y2: 4 })])).toBe(false);
    // A wall down the side is not a wall behind the head.
    expect(headAtWall(b, [segmentOf({ x1: 4, y1: 0, x2: 4, y2: 20 })])).toBe(false);
  });
});

describe("the row of beds", () => {
  const d: WardLayout = {
    ...emptyLayout({ w: 42, h: 32 }),
    beds: [bed({ key: "b1", label: "B7", x: 30, y: 20 })],
  };

  it("places n beds with the gap, heads to the chosen wall, numbered on from the highest", () => {
    const r = rowOfBeds(d, { x: 2, y: 2, n: 4, gap: 2, face: "top", curtains: false, o2: true });
    expect(r.beds.map((b) => [b.label, b.x, b.y, b.rot])).toEqual([
      ["B8", 2, 2, 0],
      ["B9", 6, 2, 0],
      ["B10", 10, 2, 0],
      ["B11", 14, 2, 0],
    ]);
    expect(r.beds.every((b) => b.services.join() === "o2")).toBe(true);
    expect(r.dividers).toEqual([]);
  });

  it("curtains sit halfway between beds; none after the last; none with no gap", () => {
    const r = rowOfBeds(d, { x: 2, y: 2, n: 3, gap: 2, face: "bottom", curtains: true, o2: false });
    expect(r.beds.every((b) => b.rot === 180 && b.services.length === 0)).toBe(true);
    expect(r.dividers.map((l) => [l.kind, l.x1, l.y1, l.x2, l.y2])).toEqual([
      ["curtain", 5, 2, 5, 6],
      ["curtain", 9, 2, 9, 6],
    ]);
    expect(
      rowOfBeds(d, { x: 2, y: 2, n: 3, gap: 0, face: "top", curtains: true, o2: false }).dividers,
    ).toEqual([]);
  });

  it("facing left or right stacks the beds down the wall, turned", () => {
    const r = rowOfBeds(d, { x: 1, y: 1, n: 3, gap: 1, face: "left", curtains: true, o2: false });
    expect(r.beds.map((b) => [b.x, b.y, b.rot])).toEqual([
      [1, 1, 270],
      [1, 4, 270],
      [1, 7, 270],
    ]);
    expect(r.dividers[0]).toMatchObject({ x1: 1, y1: 3, x2: 5, y2: 3 });
  });

  it("stops at the edge of the floor", () => {
    const r = rowOfBeds(d, { x: 34, y: 2, n: 6, gap: 2, face: "top", curtains: true, o2: false });
    expect(r.beds.map((b) => b.x)).toEqual([34, 38]);
    expect(r.dividers).toHaveLength(1);
  });

  it("the result is a valid layout", () => {
    const r = rowOfBeds(d, { x: 2, y: 2, n: 6, gap: 2, face: "top", curtains: true, o2: true });
    const next = { ...d, beds: [...d.beds, ...r.beds], dividers: [...d.dividers, ...r.dividers] };
    expect(parseLayout(next).ok).toBe(true);
  });
});

describe("numbering", () => {
  it("continues the ward's own style, skipping numbers already used", () => {
    expect(nextBedLabels([], 2)).toEqual(["B1", "B2"]);
    expect(nextBedLabels(["Bed 1", "Bed 2", "Bed 4"], 2)).toEqual(["Bed 5", "Bed 6"]);
    expect(nextBedLabels(["P1", "B3", "B4"], 1)).toEqual(["B5"]);
  });

  it("renumbers beds in the open ward and bays row by row, left to right; single rooms keep theirs", () => {
    const d: WardLayout = {
      ...emptyLayout(),
      rooms: [
        {
          key: "r1",
          kind: "private",
          name: "Private 1",
          x: 30,
          y: 20,
          w: 7,
          h: 9,
          door: "top",
          features: {},
        },
      ],
      beds: [
        bed({ key: "b1", label: "B9", x: 10, y: 2 }),
        bed({ key: "b2", label: "B3", x: 2, y: 2 }),
        bed({ key: "b3", label: "B1", x: 2, y: 20 }),
        bed({ key: "b4", label: "P1", x: 32, y: 22 }),
      ],
    };
    expect(renumberBeds(d).beds.map((b) => [b.key, b.label])).toEqual([
      ["b1", "B2"],
      ["b2", "B1"],
      ["b3", "B3"],
      ["b4", "P1"],
    ]);
  });
});

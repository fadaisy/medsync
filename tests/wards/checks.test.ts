import type { CheckCode, LayoutCheck } from "@/lib/wards/checks";
import type { LayoutBed, WardLayout } from "@/lib/wards/layout-schema";
import { describe, expect, it } from "vitest";

import { blockingFailures, layoutChecks, warningTexts } from "@/lib/wards/checks";
import { emptyLayout, shellWalls } from "@/lib/wards/geometry";

/* ADR 0196: every check, its words, and which two block. */

const bed = (key: string, label: string, over: Partial<LayoutBed> = {}): LayoutBed => ({
  key,
  label,
  type: "standard",
  x: 2 + Number(key.slice(1)) * 4,
  y: 2,
  rot: 0,
  services: ["o2", "call"],
  status: "in",
  ...over,
});

function ward(beds: LayoutBed[], extra: Partial<WardLayout> = {}): WardLayout {
  const d = emptyLayout({ w: 42, h: 32 });
  return {
    ...d,
    dividers: shellWalls(d),
    fixtures: [
      { key: "f1", kind: "station", label: "Nurses’ station", x: 18, y: 14, rot: 0 },
      { key: "f2", kind: "resus_trolley", label: "Resus trolley", x: 26, y: 14, rot: 0 },
    ],
    beds,
    ...extra,
  };
}
const byCode = (d: WardLayout, type: string | null = null) =>
  Object.fromEntries(layoutChecks(d, type).map((c) => [c.code, c])) as Record<
    CheckCode,
    LayoutCheck
  >;

describe("a good ward passes everything", () => {
  it("every check ok, nothing blocking, no warnings", () => {
    const d = ward([bed("b1", "B1"), bed("b2", "B2")]);
    const checks = layoutChecks(d, "general");
    expect(checks.every((c) => c.ok)).toBe(true);
    expect(blockingFailures(checks)).toEqual([]);
    expect(warningTexts(checks)).toEqual([]);
    expect(checks.map((c) => c.code)).toEqual([
      "nurse_call",
      "oxygen",
      "station",
      "resus_trolley",
      "bed_overlap",
      "overlap",
      "piped_at_wall",
      "duplicate_numbers",
    ]);
  });
});

describe("each check", () => {
  it("nurse call: names the beds in service without one; out-of-service beds don't count", () => {
    const c = byCode(
      ward([
        bed("b1", "B1", { services: ["o2"] }),
        bed("b2", "B2", { services: [], status: "out", outReason: "Broken" }),
      ]),
    );
    expect(c.nurse_call).toMatchObject({
      ok: false,
      blocking: false,
      text: "1 bed without a nurse call: B1",
    });
  });

  it("oxygen: names the beds, and says 'and N more' past eight", () => {
    const beds = Array.from({ length: 10 }, (_, i) =>
      bed(`b${i + 1}`, `B${i + 1}`, { services: ["call"], x: 2 + i * 3 }),
    );
    expect(byCode(ward(beds)).oxygen.text).toBe(
      "10 beds without wall oxygen: B1, B2, B3, B4, B5, B6, B7, B8 and 2 more",
    );
  });

  it("monitor: only on HDU, ICU and NICU wards", () => {
    const d = ward([bed("b1", "B1")]);
    expect(byCode(d, "general").monitor).toBeUndefined();
    expect(byCode(d, "hdu").monitor).toMatchObject({
      ok: false,
      text: "1 bed without a monitor on an HDU ward: B1",
    });
    expect(byCode(d, "icu").monitor!.text).toMatch(/on an ICU ward/);
  });

  it("isolation hand-wash: a room feature or a hand-wash fixture inside the room", () => {
    const room = {
      key: "r1",
      kind: "isolation" as const,
      name: "Isolation 1",
      x: 30,
      y: 20,
      w: 7,
      h: 9,
      door: "top" as const,
      features: {},
    };
    expect(byCode(ward([], { rooms: [room] })).isolation_handwash).toMatchObject({
      ok: false,
      text: "Isolation room without hand-wash: Isolation 1",
    });
    expect(
      byCode(ward([], { rooms: [{ ...room, features: { sink: true } }] })).isolation_handwash.ok,
    ).toBe(true);
    const sink = {
      key: "f9",
      kind: "sink" as const,
      label: "Hand-wash",
      x: 32,
      y: 22,
      rot: 0 as const,
    };
    const d = ward([], { rooms: [room] });
    expect(byCode({ ...d, fixtures: [...d.fixtures, sink] }).isolation_handwash.ok).toBe(true);
    // No isolation room, no check.
    expect(byCode(ward([])).isolation_handwash).toBeUndefined();
  });

  it("station and resus trolley: each its own line", () => {
    const d = { ...ward([bed("b1", "B1")]), fixtures: [] };
    const c = byCode(d);
    expect(c.station).toMatchObject({ ok: false, text: "No nurses’ station on the plan" });
    expect(c.resus_trolley).toMatchObject({ ok: false, text: "No resus trolley on the plan" });
  });

  it("a bed on a bed blocks; a bed on a fixture or across a wall only warns", () => {
    const onBed = byCode(ward([bed("b1", "B1", { x: 10 }), bed("b2", "B2", { x: 11 })]));
    expect(onBed.bed_overlap).toMatchObject({
      ok: false,
      blocking: true,
      text: "Beds on top of each other: B1 and B2",
    });
    const onFixture = byCode(ward([bed("b1", "B1", { x: 18, y: 13 })]));
    expect(onFixture.bed_overlap.ok).toBe(true);
    expect(onFixture.overlap).toMatchObject({ ok: false, blocking: false });
    expect(onFixture.overlap.text).toMatch(/B1 and Nurses’ station/);
    const acrossWall = ward([bed("b1", "B1", { x: 20, y: 10 })], {
      dividers: [
        ...shellWalls(emptyLayout({ w: 42, h: 32 })),
        { key: "d9", kind: "glass", x1: 21, y1: 5, x2: 21, y2: 20 },
      ],
    });
    expect(byCode(acrossWall).overlap.text).toBe("Overlapping: B1 and a wall");
    // A curtain is soft: crossing one is fine.
    const curtain = ward([bed("b1", "B1", { x: 20, y: 10 })], {
      dividers: [
        ...shellWalls(emptyLayout({ w: 42, h: 32 })),
        { key: "d9", kind: "curtain", x1: 21, y1: 5, x2: 21, y2: 20 },
      ],
    });
    expect(byCode(curtain).overlap.ok).toBe(true);
  });

  it("a room wall counts: across it is an overlap, against it is a wall for piped services", () => {
    const room = {
      key: "r1",
      kind: "private" as const,
      name: "Private 1",
      x: 20,
      y: 20,
      w: 7,
      h: 9,
      door: "top" as const,
      features: {},
    };
    const straddling = ward([bed("b1", "B1", { x: 19, y: 22, services: ["call"] })], {
      rooms: [room],
    });
    expect(byCode(straddling).overlap.text).toBe("Overlapping: B1 and a wall");
    const inside = ward([bed("b1", "B1", { x: 22, y: 24, rot: 180, services: ["o2", "call"] })], {
      rooms: [room],
    });
    expect(byCode(inside).piped_at_wall.ok).toBe(true);
    // A bay is curtained: its edge is no wall.
    const bay = ward([bed("b1", "B1", { x: 22, y: 24, rot: 180, services: ["o2", "call"] })], {
      rooms: [{ ...room, kind: "bay" }],
    });
    expect(byCode(bay).piped_at_wall.ok).toBe(false);
  });

  it("piped services away from the wall: oxygen, suction or air, head not at a wall", () => {
    const d = ward([
      bed("b1", "B1", { y: 12, services: ["suction", "call"] }),
      bed("b2", "B2", { y: 12, services: ["call"] }),
    ]);
    expect(byCode(d).piped_at_wall).toMatchObject({
      ok: false,
      blocking: false,
      text: "Piped services set, but the bed head is not at a wall: B1",
    });
  });

  it("duplicate numbers block, case and spaces aside", () => {
    const c = byCode(ward([bed("b1", "B1"), bed("b2", " b1 "), bed("b3", "B3")]));
    expect(c.duplicate_numbers).toMatchObject({
      ok: false,
      blocking: true,
      text: "Duplicate bed numbers: B1",
    });
  });
});

describe("what publish does with them", () => {
  it("blocking failures are only the integrity ones; every other failing text is a warning", () => {
    const d = {
      ...ward([bed("b1", "B1", { services: [] }), bed("b2", "B1", { x: 7 })]),
      fixtures: [],
    };
    const checks = layoutChecks(d, null);
    expect(
      blockingFailures(checks)
        .map((c) => c.code)
        .sort(),
    ).toEqual(["bed_overlap", "duplicate_numbers"]);
    expect(warningTexts(checks)).toEqual([
      "1 bed without a nurse call: B1",
      "1 bed without wall oxygen: B1",
      "No nurses’ station on the plan",
      "No resus trolley on the plan",
    ]);
  });
});

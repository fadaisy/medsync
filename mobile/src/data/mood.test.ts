import type { LogRow } from "@/data/health-log";

import { minutesOn, tapGlass, waterOn } from "@/data/activity";
import { monthDays, moodsFor, yearMix } from "@/data/mood";

const NOW = new Date(2026, 9, 17, 12, 0);
let n = 0;
const log = (kind: LogRow["kind"], v1: number, at: Date): LogRow => ({
  id: String(++n),
  kind,
  recordedAt: at.toISOString(),
  v1,
  v2: null,
  unit: null,
  note: null,
});
const on = (m: number, d: number, h = 9) => new Date(2026, m, d, h);
const newestFirst = (rows: LogRow[]) =>
  [...rows].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));

describe("mood rows", () => {
  it("maps 1/2/3 to not well/okay/good, the day's latest pick winning", () => {
    const rows = newestFirst([
      log("mood", 1, on(9, 17, 8)),
      log("mood", 3, on(9, 17, 10)),
      log("mood", 2, on(9, 15)),
    ]);
    expect(moodsFor(rows, [on(9, 15), on(9, 16), on(9, 17)])).toEqual(["okay", "none", "good"]);
  });

  it("a new patient's month is all empty days, up to today", () => {
    const month = moodsFor([], monthDays(NOW));
    expect(month).toHaveLength(17);
    expect(new Set(month)).toEqual(new Set(["none"]));
  });

  it("the year shows a mix only for months with entries", () => {
    const rows = newestFirst([
      log("mood", 3, on(9, 1)),
      log("mood", 3, on(9, 2)),
      log("mood", 1, on(9, 3)),
      log("mood", 2, on(0, 5)),
      log("mood", 3, new Date(2025, 9, 5)),
    ]);
    const mix = yearMix(rows, NOW);
    expect(mix).toHaveLength(10);
    expect(mix[0]).toEqual([0, 100, 0]);
    expect(mix[1]).toBeNull();
    expect(mix[9]).toEqual([67, 0, 33]);
  });
});

describe("water and walking", () => {
  it("water is the day's latest running total; a tap down is a smaller total", () => {
    const rows = newestFirst([
      log("water", 1, on(9, 17, 8)),
      log("water", 2, on(9, 17, 9)),
      log("water", 1, on(9, 17, 10)),
      log("water", 6, on(9, 16)),
    ]);
    expect(waterOn(rows, NOW)).toBe(1);
    expect(waterOn([], NOW)).toBe(0);
    expect(tapGlass(1, 4)).toBe(5);
  });

  it("minutes walked add up per day", () => {
    const rows = [
      log("activity", 10, on(9, 17, 7)),
      log("activity", 20, on(9, 17, 18)),
      log("activity", 30, on(9, 15)),
    ];
    expect(minutesOn(rows, [on(9, 15), on(9, 16), on(9, 17)])).toEqual([30, 0, 30]);
  });
});

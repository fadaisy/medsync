import { describe, expect, it } from "vitest";

import {
  dayWords,
  monthGrid,
  parseTime,
  shiftMonth,
  splitValue,
  tableDate,
} from "@/lib/lab/field-kit";

describe("field kit (5.12)", () => {
  it("reads 0810, 8.10, 8:10 and rejects nonsense", () => {
    for (const t of ["0810", "810", "8.10", "8:10", "08:10"])
      expect(parseTime(t)).toEqual({ h: 8, m: 10 });
    expect(parseTime("8")).toEqual({ h: 8, m: 0 });
    for (const t of ["2460", "25:00", "8:7", "abc", ""]) expect(parseTime(t)).toBeNull();
  });

  it("says the day in words", () => {
    expect(dayWords("2026-10-19", "2026-10-19")).toBe("Today, Mon 19 Oct");
    expect(dayWords("2026-10-18", "2026-10-19")).toBe("Yesterday, Sun 18 Oct");
    expect(dayWords("2026-10-16", "2026-10-19")).toBe("Fri 16 Oct");
    expect(dayWords("2025-12-31", "2026-01-01")).toBe("Yesterday, Wed 31 Dec");
    expect(dayWords("2025-10-16", "2026-10-19")).toBe("Thu 16 Oct 2025");
    expect(tableDate("2026-10-19")).toBe("19 OCT 2026");
  });

  it("lays a month out Monday first", () => {
    const g = monthGrid(2026, 10);
    expect(g[0]!.slice(0, 3)).toEqual([null, null, null]);
    expect(g[0]![3]).toBe("2026-10-01");
    expect(g.flat().filter(Boolean)).toHaveLength(31);
    expect(shiftMonth(2026, 1, -1)).toEqual({ y: 2025, mo: 12 });
    expect(splitValue("2026-10-19T08:10")).toEqual({ day: "2026-10-19", time: "08:10" });
  });
});

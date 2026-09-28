import { describe, expect, it } from "vitest";

import {
  clockTicks,
  formatClock,
  formatHourSpan,
  linearScale,
  niceTicks,
  timeDomain,
} from "@/lib/emr/charts/scale";

/** Kampala is UTC+3 with no daylight saving. */
const k = (hhmm: string, day = 28) => new Date(`2026-09-${day}T${hhmm}:00+03:00`);

describe("linearScale", () => {
  it("maps the domain onto the range, inverted y included", () => {
    const y = linearScale([0, 10], [200, 0]);
    expect(y(0)).toBe(200);
    expect(y(5)).toBe(100);
    expect(y(10)).toBe(0);
    expect(y.domain).toEqual([0, 10]);
  });
  it("a zero-width domain maps to the middle of the range", () => {
    expect(linearScale([3, 3], [0, 100])(3)).toBe(50);
  });
});

describe("niceTicks: three or four round ticks covering the values", () => {
  it.each([
    [0, 10, [0, 5, 10]],
    [0, 3, [0, 1, 2, 3]],
    [0, 29, [0, 10, 20, 30]],
    [34.5, 39.1, [34, 36, 38, 40]],
    [-312, 595, [-500, 0, 500, 1000]],
    [0, 9, [0, 5, 10]],
    [3.8, 7.7, [2, 4, 6, 8]],
  ])("%s to %s → %j", (lo, hi, ticks) => {
    expect(niceTicks(lo, hi)).toEqual(ticks);
  });

  it("widens a flat series so it still has an axis", () => {
    expect(niceTicks(5, 5)).toEqual([4, 5, 6]);
  });

  it("always gives 3 or 4 ticks that cover the range, on round steps", () => {
    for (let i = 0; i < 400; i++) {
      const a = (Math.sin(i * 12.9898) * 43758.5453) % 500;
      const b = a + Math.abs((Math.cos(i * 78.233) * 1000) % 300) + 0.01;
      const t = niceTicks(a, b);
      expect(t.length, `${a}..${b}`).toBeGreaterThanOrEqual(3);
      expect(t.length, `${a}..${b}`).toBeLessThanOrEqual(4);
      expect(t[0]!).toBeLessThanOrEqual(a);
      expect(t.at(-1)!).toBeGreaterThanOrEqual(b);
      const step = t[1]! - t[0]!;
      const mantissa = step / 10 ** Math.floor(Math.log10(step));
      expect([1, 2, 2.5, 5].some((m) => Math.abs(m - mantissa) < 1e-9)).toBe(true);
    }
  });

  it("no ticks for a non-number", () => {
    expect(niceTicks(Number.NaN, 3)).toEqual([]);
  });
});

describe("clock time in Africa/Kampala", () => {
  it("formats HH:MM, 24-hour, in the chart's zone", () => {
    expect(formatClock("2026-09-27T21:00:00Z")).toBe("00:00");
    expect(formatClock(k("23:05", 27))).toBe("23:05");
    expect(formatClock(k("07:20"))).toBe("07:20");
  });

  it("names the hour a row stands for", () => {
    expect(formatHourSpan(k("14:00"), 1)).toBe("14:00 to 15:00");
    expect(formatHourSpan(k("20:00"), 4)).toBe("20:00 to 00:00");
  });

  it("puts x ticks on whole local hours that are a multiple of the step, at most 7", () => {
    const ticks = clockTicks(k("00:00"), k("07:00"));
    expect(ticks.map((t) => formatClock(t))).toEqual(["00:00", "02:00", "04:00", "06:00"]);
    const day = clockTicks(k("00:00"), k("00:00", 29));
    expect(day.map((t) => formatClock(t))).toEqual([
      "00:00",
      "04:00",
      "08:00",
      "12:00",
      "16:00",
      "20:00",
      "00:00",
    ]);
  });

  it("starts at the first whole hour after a start mid-hour", () => {
    const ticks = clockTicks(k("23:40", 27), k("03:10"));
    expect(ticks.map((t) => formatClock(t))).toEqual(["00:00", "01:00", "02:00", "03:00"]);
  });

  it("a domain covers its points and now, on whole hours, at least four hours wide", () => {
    const [start, end] = timeDomain([k("23:00", 27), k("06:00")], {
      from: k("23:00", 27),
      now: k("07:20"),
    });
    expect(formatClock(start)).toBe("23:00");
    expect(formatClock(end)).toBe("08:00");
    const [s2, e2] = timeDomain([k("07:05")], { from: k("07:05"), now: k("07:20") });
    expect((e2.getTime() - s2.getTime()) / 3600000).toBe(4);
  });
});

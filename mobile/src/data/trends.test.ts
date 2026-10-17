import type { SavedReading } from "@/data/readings";
import rules from "@clinical-rules/patient-thresholds.v0.json";

import {
  DIARY_SLOTS,
  diaryClass,
  diaryColumn,
  insight,
  sugarDiary,
  trendTiles,
  weekSeries,
} from "@/data/trends";

const NOW = new Date(2026, 9, 17, 12, 0); // Saturday
const DAYS = Array.from({ length: 7 }, (_, i) => new Date(2026, 9, 11 + i));
const at = (day: number, h = 8) => new Date(2026, 9, day, h, 0).toISOString();
const bp = (day: number, top: number, bottom: number): SavedReading => ({
  id: `bp${day}`,
  at: at(day),
  feel: [],
  input: { kind: "bp", top, bottom },
});
const sugar = (day: number, value: number, h = 7, context = "fasting" as const): SavedReading => ({
  id: `s${day}${h}`,
  at: at(day, h),
  feel: [],
  input: { kind: "sugar", value, context },
});

describe("sugar diary", () => {
  it.each(DIARY_SLOTS.map((s) => [s.head, s.ctx] as const))("%s: edges of the target", (_, ctx) => {
    const max = rules.sugar.targetMaxByContext[ctx];
    expect(diaryClass(max, ctx)).toBe("in");
    expect(diaryClass(max + 0.1, ctx)).toBe("high");
    expect(diaryClass(rules.sugar.dangerLowBelow - 0.1, ctx)).toBe("low");
    expect(diaryClass(rules.sugar.dangerHighAtLeast, ctx)).toBe("veryHigh");
    expect(diaryClass(null, ctx)).toBe("none");
  });

  it("splits 'after a meal' by the clock and leaves 'another time' out", () => {
    expect(diaryColumn("after", new Date(2026, 9, 17, 9))).toBe(1);
    expect(diaryColumn("after", new Date(2026, 9, 17, 15))).toBe(3);
    expect(diaryColumn("random", new Date())).toBeNull();
  });

  it("puts each day's latest reading in its cell; empty days stay empty", () => {
    // Newest first, as the repository returns them.
    const grid = sugarDiary([sugar(17, 6.5, 8), sugar(17, 7.9, 7), sugar(12, 8.1, 7)], DAYS);
    expect(grid[6][0]).toBe(6.5);
    expect(grid[1][0]).toBe(8.1);
    expect(grid[0].every((v) => v === null)).toBe(true);
  });
});

describe("week series and words", () => {
  it("is a gap, not a guess, on a day with nothing logged", () => {
    const s = weekSeries([bp(17, 134, 82), bp(13, 148, 92)], "bp", "fasting", DAYS);
    expect(s.a).toEqual([null, null, 148, null, null, null, 134]);
    expect(s.b).toEqual([null, null, 92, null, null, null, 82]);
    expect(insight("bp", s, DAYS)).toBe("Your top number went down 14 since Tuesday.");
  });

  it("asks for more readings when there is one or none", () => {
    expect(insight("bp", weekSeries([bp(17, 134, 82)], "bp", "fasting", DAYS), DAYS)).toBe(
      "Log on a few days to see your trend.",
    );
    expect(insight("sugar", weekSeries([], "sugar", "fasting", DAYS), DAYS)).toBe(
      "No readings at this time this week.",
    );
  });

  it("counts sugar readings in target", () => {
    const s = weekSeries([sugar(17, 6.9), sugar(16, 8.8)], "sugar", "fasting", DAYS);
    expect(insight("sugar", s, DAYS)).toBe("1 of 2 readings in your target this week.");
  });
});

describe("Care hub tiles", () => {
  it("say so when a new patient has nothing", () => {
    const tiles = trendTiles([], DAYS);
    expect(tiles.map((t) => t.trend)).toEqual(Array(4).fill("No readings yet"));
    expect(tiles.every((t) => t.value === "–" && t.tone === "neutral")).toBe(true);
  });

  it("show the latest value and the week's direction", () => {
    const [bpTile] = trendTiles([bp(17, 134, 82), bp(11, 148, 92)], DAYS);
    expect(bpTile).toMatchObject({
      value: "134/82",
      dir: "down",
      tone: "good",
      trend: "Down 14 this week",
    });
  });

  it("never judge weight", () => {
    const w = (day: number, value: number): SavedReading => ({
      id: `w${day}`,
      at: at(day),
      feel: [],
      input: { kind: "weight", value },
    });
    const tile = trendTiles([w(17, 85.5), w(11, 86.4)], DAYS)[2];
    expect(tile).toMatchObject({ dir: "down", tone: "neutral", trend: "Down 0.9 kg this week" });
    expect(NOW.getDay()).toBe(6);
  });
});

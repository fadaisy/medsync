import { describe, expect, it } from "vitest";

import { REFERRAL_STATES } from "@/lib/exchange/types";
import { overdue } from "@/lib/lab/referral";
import {
  BOARD_COLUMNS,
  boardColumn,
  median,
  recentMonths,
  routeOf,
  sentToBack,
  stillToRefer,
} from "@/lib/lab/send-outs-board";

const now = new Date("2026-10-19T09:00:00Z");
const past = new Date("2026-10-10T09:00:00Z");
const future = new Date("2026-10-25T09:00:00Z");

describe("send-outs board (prompt 5.6)", () => {
  it("S21: every referral state lands in exactly one column", () => {
    for (const state of REFERRAL_STATES)
      for (const expected of [null, past, future]) {
        const col = boardColumn({ state, expected }, now);
        expect(BOARD_COLUMNS.filter((c) => c === col)).toHaveLength(1);
      }
    expect(boardColumn({ state: "draft", expected: null }, now)).toBe("on_manifest");
    expect(boardColumn({ state: "packed", expected: null }, now)).toBe("on_manifest");
    expect(boardColumn({ state: "at_hub", expected: future }, now)).toBe("out");
    expect(boardColumn({ state: "completed", expected: past }, now)).toBe("back");
    expect(boardColumn({ state: "in_progress", expected: future, backToFile: true }, now)).toBe(
      "back",
    );
  });

  it("S22: overdue is RF-5's overdue(), for every state", () => {
    for (const state of REFERRAL_STATES)
      for (const expected of [null, past, future]) {
        const col = boardColumn({ state, expected }, now);
        expect(col === "overdue").toBe(overdue(now, expected, state).overdue);
      }
  });

  it("S23: the outbreak route stays separate and never goes on a manifest", () => {
    expect(routeOf({ highRisk: true })).toBe("outbreak");
    expect(routeOf({ routine: false })).toBe("outbreak");
    expect(routeOf({ highRisk: false, routine: true })).toBe("manifest");
    // An outbreak referral starts handed over (no manifest), so it is Out or Overdue, never On a manifest.
    expect(boardColumn({ state: "handed_over", expected: null }, now)).toBe("out");
  });

  it("a specimen stays to refer until a referral is live", () => {
    expect(stillToRefer([])).toBe(true);
    expect(stillToRefer(["rejected", "lost"])).toBe(true);
    expect(stillToRefer(["packed"])).toBe(false);
    expect(stillToRefer(["cancelled", "completed"])).toBe(false);
  });

  it("figures: no data is null, never 0", () => {
    expect(median([])).toBeNull();
    expect(median([1, 3, 2])).toBe(2);
    expect(median([1, 2])).toBe(1.5);
    expect(sentToBack([]).median).toBeNull();
    expect(recentMonths(now, 3)).toEqual(["2026-10", "2026-09", "2026-08"]);
  });
});

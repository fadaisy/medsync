import { describe, expect, it, vi } from "vitest";

import {
  clockFor,
  formatDuration,
  parseStatedTat,
  releasedTurnaround,
  serverNowAt,
  targetFor,
} from "@/lib/lab/turnaround";

/** Lab Phase 0 — the turnaround clock (TA-1..TA-8, D-LAB0-06/07/16; gate-a-proposal §5.2). */
const at = (hhmm: string) => new Date(`2026-10-10T${hhmm}:00+03:00`);
const NOW = at("10:42");

describe("turnaround", () => {
  it("TA-1: runs from receipt; a preliminary does not stop it; release does", () => {
    const c = clockFor({ collectedAt: at("10:05"), receivedAt: at("10:18") }, null, NOW);
    expect(c).toEqual({ kind: "running", elapsed: 24, target: null, lateBy: null });
    expect(releasedTurnaround(at("10:18"), at("10:52"), null)).toEqual({
      minutes: 34,
      lateBy: null,
    });
  });

  it("TA-2: before receipt, time since collection, no target, no label", () => {
    expect(
      clockFor(
        { collectedAt: at("10:07"), receivedAt: null },
        { minutes: 30, source: "facility" },
        NOW,
      ),
    ).toEqual({
      kind: "not_received",
      sinceCollection: 35,
    });
  });

  it("TA-3: facility text when unambiguous, else catalogue (default), else none", () => {
    expect(targetFor("1 h", 240)).toEqual({ minutes: 60, source: "facility" });
    expect(targetFor("same day", 240)).toEqual({ minutes: 240, source: "catalogue" });
    expect(targetFor("same day", null)).toBeNull();
    expect(targetFor(null, null)).toBeNull();
    expect(targetFor(null, 0)).toBeNull();
  });

  it("D-LAB0-16: reads only one unambiguous duration", () => {
    const ok: [string, number][] = [
      ["45 min", 45],
      ["45 mins", 45],
      ["45 minutes", 45],
      ["2 h", 120],
      ["2h", 120],
      ["2 hrs", 120],
      ["1 hour", 60],
      ["3 hours", 180],
      ["1 h 30 min", 90],
      ["1 hr 5 mins", 65],
      ["1 d", 1440],
      ["2 days", 2880],
      ["  4 H  ", 240],
    ];
    for (const [text, minutes] of ok) expect(parseStatedTat(text), text).toBe(minutes);
    for (const bad of [
      "24-48 h",
      "24–48 h",
      "same day",
      "next morning",
      "1.5 h",
      "0 min",
      "1000 min",
      "2",
      "h",
      "",
      "about 2 h",
      "2 h approx",
      "1 d 2 h",
    ])
      expect(parseStatedTat(bad), bad).toBeNull();
    expect(parseStatedTat(null)).toBeNull();
  });

  it("TA-4: late means elapsed past the target; the label carries the overrun", () => {
    const c = clockFor(
      { collectedAt: at("08:00"), receivedAt: at("08:17") },
      { minutes: 120, source: "facility" },
      NOW,
    );
    expect(c).toMatchObject({ kind: "running", elapsed: 145, lateBy: 25 });
    const onTime = clockFor(
      { collectedAt: at("10:00"), receivedAt: at("10:18") },
      { minutes: 60, source: "catalogue" },
      NOW,
    );
    expect(onTime).toMatchObject({ lateBy: null });
    const exactly = clockFor(
      { collectedAt: at("09:00"), receivedAt: at("09:42") },
      { minutes: 60, source: "facility" },
      NOW,
    );
    expect(exactly).toMatchObject({ elapsed: 60, lateBy: null });
  });

  it("TA-5: no per-priority target is derived — one target per test", () => {
    expect(targetFor("1 h", null)).toEqual(targetFor("1 h", null));
  });

  it("TA-6: 'now' is server time plus the page's age; a device clock 3 h wrong changes nothing", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW.getTime() + 3 * 60 * 60 * 1000)); // the device is 3 h fast
    const serverNow = NOW.getTime();
    const now = serverNowAt(serverNow, 1000, 1000 + 6 * 60_000); // page open six minutes
    expect(now.toISOString()).toBe(new Date(serverNow + 6 * 60_000).toISOString());
    const c = clockFor({ collectedAt: at("10:00"), receivedAt: at("10:18") }, null, now);
    expect(c).toMatchObject({ elapsed: 30 });
    // A monotonic clock going backwards (sleep, tab restore) never moves "now" behind the server.
    expect(serverNowAt(serverNow, 5000, 1000).getTime()).toBe(serverNow);
    vi.useRealTimers();
  });

  it("TA-7: wall clock — no opening hours subtracted", () => {
    expect(
      clockFor({ collectedAt: at("00:00"), receivedAt: at("00:42") }, null, NOW),
    ).toMatchObject({ elapsed: 600 });
  });

  it("TA-8: formatDuration at its boundaries", () => {
    expect(formatDuration(0)).toBe("0 min");
    expect(formatDuration(59)).toBe("59 min");
    expect(formatDuration(60)).toBe("1 h");
    expect(formatDuration(70)).toBe("1 h 10 min");
    expect(formatDuration(1439)).toBe("23 h 59 min");
    expect(formatDuration(1440)).toBe("1 d");
    expect(formatDuration(2 * 1440 + 180)).toBe("2 d 3 h");
    expect(formatDuration(-5)).toBe("0 min");
  });
});

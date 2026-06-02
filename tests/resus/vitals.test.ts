import type { TimelineEvent } from "@/lib/resus/types";
import { describe, expect, it } from "vitest";

import { buildResusVitals } from "@/lib/resus/vitals";

/**
 * Resus continuous monitoring (GATE D). buildResusVitals reconstructs the
 * trend + latest snapshot + derived metrics from the timeline's 'vital'
 * events — pure, so the trend is reproducible from the immutable record.
 */

function vital(id: string, recordedAt: string, snapshot: Record<string, unknown>): TimelineEvent {
  return {
    id,
    episodeId: "epi-1",
    kind: "vital",
    step: "C",
    recordedByUserId: "u-1",
    recordedAt,
    createdAt: recordedAt,
    payload: { snapshot },
    supersedesEventId: null,
  };
}

describe("buildResusVitals", () => {
  it("returns an empty view for no vital events", () => {
    const v = buildResusVitals([]);
    expect(v.count).toBe(0);
    expect(v.series).toEqual([]);
    expect(v.latest.hr ?? null).toBeNull();
  });

  it("ignores non-vital events", () => {
    const v = buildResusVitals([
      { ...vital("a", "2026-06-02T10:00:00.000Z", { hr: 80 }), kind: "assessment" },
    ]);
    expect(v.count).toBe(0);
  });

  it("builds an ordered series for a vital across snapshots", () => {
    const v = buildResusVitals([
      vital("a", "2026-06-02T10:00:00.000Z", { hr: 120 }),
      vital("b", "2026-06-02T10:05:00.000Z", { hr: 132 }),
    ]);
    const hr = v.series.find((s) => s.key === "hr")!;
    expect(hr.points.map((p) => p.value)).toEqual([120, 132]);
    expect(v.count).toBe(2);
  });

  it("latest merges the most recent non-null value per field", () => {
    const v = buildResusVitals([
      vital("a", "2026-06-02T10:00:00.000Z", { hr: 120, spo2: 90 }),
      vital("b", "2026-06-02T10:05:00.000Z", { spo2: 94 }), // only SpO2 re-checked
    ]);
    expect(v.latest.hr).toBe(120); // carried from the earlier snapshot
    expect(v.latest.spo2).toBe(94); // updated
  });

  it("computes derived metrics (shock index, MAP) from the latest snapshot", () => {
    const v = buildResusVitals([
      vital("a", "2026-06-02T10:00:00.000Z", { hr: 120, systolicBp: 80, diastolicBp: 50 }),
    ]);
    expect(v.derived.shockIndex).toBeCloseTo(1.5, 5);
    expect(v.derived.shockIndexFlag).toBe("shock");
    expect(v.derived.meanArterialPressure).toBeCloseTo(60, 5);
  });

  it("includes a shock-index trend series when HR + SBP are present", () => {
    const v = buildResusVitals([
      vital("a", "2026-06-02T10:00:00.000Z", { hr: 100, systolicBp: 100 }),
      vital("b", "2026-06-02T10:05:00.000Z", { hr: 120, systolicBp: 80 }),
    ]);
    const si = v.series.find((s) => s.key === "shockIndex")!;
    expect(si.points).toHaveLength(2);
    expect(si.points[0]!.value).toBeCloseTo(1.0, 5);
    expect(si.points[1]!.value).toBeCloseTo(1.5, 5);
  });
});

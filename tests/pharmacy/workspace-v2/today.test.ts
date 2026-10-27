import { describe, expect, it } from "vitest";

import type { PointIn, QueueIn, TodayRows } from "@/lib/pharmacy/workspace-v2/today";
import { dayKeys, todayFigures } from "@/lib/pharmacy/workspace-v2/today";

/** Hand-counted fixture. Now is Tue 27 Oct 2026 15:30 in Kampala (UTC+3). */
const TZ = "Africa/Kampala";
const now = new Date("2026-10-27T12:30:00Z");

const points: PointIn[] = [
  { id: "A", name: "Window A", serves: "window", liveAt: "2026-01-01", switchedOffAt: null },
  { id: "B", name: "Ward B", serves: "wards", liveAt: "2026-01-01", switchedOffAt: null },
  { id: "C", name: "Window C", serves: "window", liveAt: "2026-01-01", switchedOffAt: "2026-09-01" },
  { id: "D", name: "All D", serves: "all", liveAt: null, switchedOffAt: null },
];

const row = (key: string, origin: QueueIn["origin"], stage: QueueIn["stage"], writtenAt: string, x: Partial<QueueIn> = {}): QueueIn => ({
  key,
  origin,
  stage,
  lane: "standard",
  reasons: [],
  writtenAt,
  queriedSince: null,
  earlier: false,
  ...x,
});

const rows: TodayRows = {
  queue: [
    row("r1", "window", "to_review", "2026-10-27T06:00:00Z"),
    row("r2", "window", "to_review", "2026-10-26T10:00:00Z", { earlier: true }),
    row("r3", "ward", "ready", "2026-10-27T09:00:00Z"),
    row("r4", "window", "queried", "2026-10-27T05:00:00Z", { queriedSince: "2026-10-27T11:30:00Z" }),
    row("r5", "ward", "awaiting_cosign", "2026-10-27T12:05:00Z"),
  ],
  arrivals: [
    { origin: "window", at: "2026-10-27T04:30:00Z" }, // 07:30
    { origin: "ward", at: "2026-10-27T06:10:00Z" }, // 09:10
    { origin: "window", at: "2026-10-27T06:50:00Z" }, // 09:50
    { origin: "window", at: "2026-10-26T10:00:00Z" }, // yesterday
  ],
  handovers: [
    { pointId: "A", at: "2026-10-27T07:00:00Z" }, // 10:00
    { pointId: "A", at: "2026-10-27T12:10:00Z" }, // 15:10
    { pointId: "B", at: "2026-10-27T08:00:00Z" }, // 11:00
    { pointId: "B", at: "2026-10-26T21:30:00Z" }, // 00:30 on the 27th, local
    { pointId: "B", at: "2026-10-26T20:59:00Z" }, // 23:59 on the 26th, local
    { pointId: "A", at: "2026-10-20T09:00:00Z" }, // last Tuesday
    { pointId: "A", at: "2026-10-20T10:00:00Z" },
    { pointId: "A", at: "2026-10-20T11:00:00Z" },
    { pointId: "A", at: "2026-10-24T09:00:00Z" },
  ],
  notOnShelf: [
    { pointId: "A", at: "2026-10-27T07:00:00Z", kind: "owed" },
    { pointId: "A", at: "2026-10-27T08:00:00Z", kind: "buying_outside" },
    { pointId: null, at: "2026-10-27T09:00:00Z", kind: "owed" },
    { pointId: "B", at: "2026-10-20T09:00:00Z", kind: "owed" },
  ],
  stockouts: [
    { pointId: "A", medicineId: "m1", startedAt: "2026-10-25T10:00:00Z", endedAt: null },
    { pointId: "A", medicineId: "m3", startedAt: "2026-10-25T10:00:00Z", endedAt: null },
    { pointId: "B", medicineId: "m2", startedAt: "2026-10-19T10:00:00Z", endedAt: "2026-10-22T10:00:00Z" },
  ],
  vital: new Set(["m1", "m2"]),
  lookBacks: [
    { pointId: "A", at: "2026-10-27T08:00:00Z", open: true },
    { pointId: "A", at: "2026-10-23T08:00:00Z", open: false },
    { pointId: "A", at: "2026-10-10T08:00:00Z", open: true },
  ],
  differences: [
    { pointId: "A", recordedAt: "2026-10-27T08:00:00Z", closedAt: null },
    { pointId: "A", recordedAt: "2026-10-22T08:00:00Z", closedAt: "2026-10-23T08:00:00Z" },
  ],
  refills: [{ pointId: "A" }, { pointId: null }, { pointId: "B" }],
};

const at = (scope: string) => todayFigures(rows, { points, scope, now, timeZone: TZ });

describe("Today read model (GATE A §6)", () => {
  it("keys eight local days, last week's weekday first", () => {
    expect(dayKeys(now, TZ)).toEqual([
      "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27",
    ]);
  });

  it("counts waiting and each stage's oldest at the point, late only by the queue's divider", () => {
    const t = at("A");
    expect(t.waiting).toBe(3);
    expect(t.stages).toEqual([
      { stage: "to_review", n: 2, oldestMin: 1590, late: true },
      { stage: "ready", n: 0, oldestMin: null, late: false },
      { stage: "queried", n: 1, oldestMin: 60, late: false },
      { stage: "awaiting_cosign", n: 0, oldestMin: null, late: false },
    ]);
    expect(at("all").waiting).toBe(5);
    expect(at("all").stages.find((s) => s.stage === "awaiting_cosign")).toEqual({
      stage: "awaiting_cosign",
      n: 1,
      oldestMin: 25,
      late: false,
    });
  });

  it("buckets arrivals and supplies by local hour, from the first event before 08:00 to now", () => {
    const h = at("A").hours;
    expect(h.map((x) => x.hour)).toEqual([7, 8, 9, 10, 11, 12, 13, 14, 15]);
    expect(h.find((x) => x.hour === 7)).toMatchObject({ arrived: 1, supplied: 0, partial: false });
    expect(h.find((x) => x.hour === 9)).toMatchObject({ arrived: 1, supplied: 0 });
    expect(h.find((x) => x.hour === 10)).toMatchObject({ arrived: 0, supplied: 1 });
    expect(h.at(-1)).toEqual({ hour: 15, arrived: 0, supplied: 1, partial: true });
    // All points: the 00:30 local hand-over is today and opens the axis at midnight.
    const all = at("all").hours;
    expect(all[0]).toEqual({ hour: 0, arrived: 0, supplied: 1, partial: false });
    expect(all.find((x) => x.hour === 9)).toMatchObject({ arrived: 2 });
  });

  it("draws seven day bars and the change from the same weekday last week", () => {
    const f = at("A").figures;
    expect(f.supplied).toEqual({ value: 2, week: [0, 0, 0, 1, 0, 0, 2], change: -1 });
    expect(f.notOnShelf).toEqual({ value: 2, week: [0, 0, 0, 0, 0, 0, 2], change: 2 });
    expect(f.boughtOutside).toBe(1);
    expect(f.vitalOut).toEqual({ value: 1, week: [0, 0, 0, 0, 1, 1, 1], change: 1 });
    expect(f.lookBack).toEqual({ value: 2, week: [0, 0, 1, 0, 0, 0, 1], change: null });
    expect(f.controlled).toEqual({ value: 1, week: [0, 1, 0, 0, 0, 0, 1], change: null });
    expect(at("all").figures.vitalOut).toEqual({ value: 1, week: [1, 0, 0, 0, 1, 1, 1], change: 0 });
    expect(at("all").figures.notOnShelf.value).toBe(3);
  });

  it("has no earlier data for refills, and vital out is not set without the national list", () => {
    expect(at("A").figures.refills).toEqual({ value: 1, week: null, change: null });
    expect(at("all").figures.refills.value).toBe(3);
    const noList = todayFigures({ ...rows, vital: null }, { points, scope: "all", now, timeZone: TZ });
    expect(noList.figures.vitalOut).toEqual({ value: null, week: null, change: null });
    expect(noList.points.every((p) => p.vitalOut === null)).toBe(true);
  });

  it("lists every point with its state, and the all-points totals are the sum of the points", () => {
    const t = at("all");
    expect(t.points).toEqual([
      { id: "A", name: "Window A", queue: 3, supplied: 2, vitalOut: 1, state: "live" },
      { id: "B", name: "Ward B", queue: 2, supplied: 2, vitalOut: 0, state: "live" },
      { id: "C", name: "Window C", queue: 3, supplied: 0, vitalOut: 0, state: "off" },
      { id: "D", name: "All D", queue: 5, supplied: 0, vitalOut: 0, state: "notLive" },
    ]);
    const sum = (k: "supplied" | "vitalOut") => t.points.reduce((n, p) => n + (p[k] ?? 0), 0);
    expect(t.figures.supplied.value).toBe(sum("supplied"));
    expect(t.figures.vitalOut.value).toBe(sum("vitalOut"));
  });
});

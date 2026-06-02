import type { RoleAssignment, TimelineEvent } from "@/lib/resus/types";
import { describe, expect, it } from "vitest";

import { reconstructTimeline, resolveRoster } from "@/lib/resus/timeline";

/**
 * The immutable resus timeline (GATE B). These tests pin the two
 * properties the medico-legal record must guarantee:
 *   1. IMMUTABILITY — a correction never edits/deletes the original; it
 *      appends a new event that supersedes it. The store keeps both;
 *      only the active VIEW hides the superseded one.
 *   2. RECONSTRUCTABILITY — the record's state at any past system-time
 *      can be replayed from the append-only store (asOf).
 * Both functions are PURE and must never mutate their input.
 */

function ev(partial: Partial<TimelineEvent> & Pick<TimelineEvent, "id">): TimelineEvent {
  return {
    episodeId: "epi-1",
    kind: "assessment",
    step: "A",
    recordedByUserId: "u-1",
    recordedAt: "2026-06-02T10:00:00.000Z",
    createdAt: "2026-06-02T10:00:00.000Z",
    payload: {},
    supersedesEventId: null,
    ...partial,
  };
}

describe("reconstructTimeline — active view", () => {
  it("returns [] for no events", () => {
    expect(reconstructTimeline([])).toEqual([]);
  });

  it("orders by clinical time (recordedAt) ascending, createdAt breaking ties", () => {
    const a = ev({ id: "a", recordedAt: "2026-06-02T10:05:00.000Z" });
    const b = ev({ id: "b", recordedAt: "2026-06-02T10:01:00.000Z" });
    const c1 = ev({
      id: "c1",
      recordedAt: "2026-06-02T10:01:00.000Z",
      createdAt: "2026-06-02T10:01:30.000Z",
    });
    const out = reconstructTimeline([a, b, c1]);
    expect(out.map((e) => e.id)).toEqual(["b", "c1", "a"]);
  });

  it("excludes a superseded event from the active view but keeps the correction", () => {
    const original = ev({ id: "orig", payload: { value: "RR 18" } });
    const correction = ev({
      id: "corr",
      payload: { value: "RR 28" },
      supersedesEventId: "orig",
      createdAt: "2026-06-02T10:10:00.000Z",
    });
    const out = reconstructTimeline([original, correction]);
    expect(out.map((e) => e.id)).toEqual(["corr"]);
    expect(out[0]!.payload.value).toBe("RR 28");
  });

  it("collapses a supersede chain to the latest correction only", () => {
    const a = ev({ id: "a" });
    const b = ev({ id: "b", supersedesEventId: "a", createdAt: "2026-06-02T10:02:00.000Z" });
    const c = ev({ id: "c", supersedesEventId: "b", createdAt: "2026-06-02T10:03:00.000Z" });
    const out = reconstructTimeline([a, b, c]);
    expect(out.map((e) => e.id)).toEqual(["c"]);
  });

  it("reconstructs the record as it stood at a past system-time (asOf)", () => {
    const original = ev({ id: "orig", payload: { value: "RR 18" } });
    const correction = ev({
      id: "corr",
      payload: { value: "RR 28" },
      supersedesEventId: "orig",
      createdAt: "2026-06-02T10:10:00.000Z",
    });
    const all = [original, correction];
    // Before the correction was written: the original is the truth.
    const before = reconstructTimeline(all, { asOf: "2026-06-02T10:05:00.000Z" });
    expect(before.map((e) => e.id)).toEqual(["orig"]);
    expect(before[0]!.payload.value).toBe("RR 18");
    // After: the correction supersedes it.
    const after = reconstructTimeline(all, { asOf: "2026-06-02T10:11:00.000Z" });
    expect(after.map((e) => e.id)).toEqual(["corr"]);
  });

  it("never mutates its input", () => {
    const a = ev({ id: "a", recordedAt: "2026-06-02T10:05:00.000Z" });
    const b = ev({ id: "b", recordedAt: "2026-06-02T10:01:00.000Z" });
    const input = [a, b];
    const snapshot = JSON.stringify(input);
    reconstructTimeline(input);
    expect(JSON.stringify(input)).toBe(snapshot);
    expect(input[0]).toBe(a); // order of the original array preserved
  });
});

describe("resolveRoster — current role holders", () => {
  function ra(p: Partial<RoleAssignment> & Pick<RoleAssignment, "id" | "role">): RoleAssignment {
    return {
      episodeId: "epi-1",
      userId: "u-" + p.id,
      assignedAt: "2026-06-02T10:00:00.000Z",
      endedAt: null,
      ...p,
    };
  }

  it("returns one current holder per role, excluding ended assignments", () => {
    const out = resolveRoster([
      ra({ id: "1", role: "leader" }),
      ra({ id: "2", role: "scribe" }),
      ra({ id: "3", role: "airway", endedAt: "2026-06-02T10:05:00.000Z" }),
    ]);
    expect(out.map((r) => r.role).sort()).toEqual(["leader", "scribe"]);
  });

  it("when a role was handed over, the latest open assignment wins", () => {
    const out = resolveRoster([
      ra({ id: "1", role: "leader", assignedAt: "2026-06-02T10:00:00.000Z" }),
      ra({ id: "2", role: "leader", assignedAt: "2026-06-02T10:20:00.000Z" }),
    ]);
    const leader = out.find((r) => r.role === "leader")!;
    expect(out).toHaveLength(1);
    expect(leader.id).toBe("2");
  });

  it("returns [] when no one is assigned", () => {
    expect(resolveRoster([])).toEqual([]);
  });
});

import type { RESUS_ACTION_STATE_RANK } from "@/lib/resus/action-order";
import { describe, expect, it } from "vitest";

import { orderResusActions, outstandingActionCount } from "@/lib/resus/action-order";

/**
 * Shared resus actions urgency-ordering (whole-surface, presentation-only).
 * The composite: state band (failed → indicated → in_progress → deferred →
 * performed → not_indicated) first, then engine time-criticality (priority asc)
 * within the band, stable. SURFACING ≠ FILTERING — ordering never removes.
 */

type A = { code: string; priority?: number; state?: keyof typeof RESUS_ACTION_STATE_RANK };
const codes = (arr: A[]) => orderResusActions(arr).map((a) => a.code);

describe("orderResusActions — state band, then time-criticality", () => {
  it("failed is boosted to the very TOP (needs escalation)", () => {
    const out = codes([
      { code: "indicated", state: "indicated", priority: 0 },
      { code: "failed", state: "failed", priority: 9 },
    ]);
    expect(out[0]).toBe("failed");
  });

  it("orders the full state ladder: failed → indicated → in_progress → deferred → performed → not_indicated", () => {
    const out = codes([
      { code: "not_indicated", state: "not_indicated", priority: 0 },
      { code: "performed", state: "performed", priority: 0 },
      { code: "deferred", state: "deferred", priority: 0 },
      { code: "in_progress", state: "in_progress", priority: 0 },
      { code: "indicated", state: "indicated", priority: 0 },
      { code: "failed", state: "failed", priority: 0 },
    ]);
    expect(out).toEqual([
      "failed",
      "indicated",
      "in_progress",
      "deferred",
      "performed",
      "not_indicated",
    ]);
  });

  it("within a state band, more time-critical (lower priority) ranks first", () => {
    const out = codes([
      { code: "lateA", state: "indicated", priority: 3 },
      { code: "urgent", state: "indicated", priority: 0 },
      { code: "mid", state: "indicated", priority: 1 },
    ]);
    expect(out).toEqual(["urgent", "mid", "lateA"]);
  });

  it("an undefined state is treated as 'indicated' (recommended, not yet recorded)", () => {
    const out = codes([
      { code: "performed", state: "performed", priority: 0 },
      { code: "fresh", priority: 5 },
    ]);
    expect(out[0]).toBe("fresh");
  });

  it("a triggered action (with priority) ranks above a recorded-only one (no priority) in the same band", () => {
    const out = codes([
      { code: "recordedOnly", state: "indicated" },
      { code: "triggered", state: "indicated", priority: 2 },
    ]);
    expect(out).toEqual(["triggered", "recordedOnly"]);
  });

  it("is stable + deterministic (equal keys keep input order; pure — no mutation)", () => {
    const input: A[] = [
      { code: "a", state: "indicated", priority: 1 },
      { code: "b", state: "indicated", priority: 1 },
      { code: "c", state: "indicated", priority: 1 },
    ];
    const snapshot = input.map((x) => x.code);
    expect(codes(input)).toEqual(["a", "b", "c"]);
    expect(input.map((x) => x.code)).toEqual(snapshot); // not mutated
  });

  it("NEVER drops an action — every input is present in the output (surfacing ≠ filtering)", () => {
    const input: A[] = [
      { code: "x", state: "performed" },
      { code: "y", state: "failed" },
      { code: "z", state: "not_indicated" },
      { code: "w", state: "deferred" },
    ];
    expect(orderResusActions(input)).toHaveLength(4);
    expect(new Set(codes(input))).toEqual(new Set(["x", "y", "z", "w"]));
  });
});

describe("outstandingActionCount — failed + indicated + in_progress (the actionable ones)", () => {
  it("counts failed, indicated, in_progress; excludes performed, deferred, not_indicated", () => {
    const n = outstandingActionCount([
      { code: "a", state: "failed" },
      { code: "b", state: "indicated" },
      { code: "c", state: "in_progress" },
      { code: "d", state: "performed" },
      { code: "e", state: "deferred" },
      { code: "f", state: "not_indicated" },
    ]);
    expect(n).toBe(3);
  });
  it("an undefined state counts as outstanding (it is an unrecorded indicated action)", () => {
    expect(outstandingActionCount([{ code: "a" }, { code: "b", state: "performed" }])).toBe(1);
  });
});

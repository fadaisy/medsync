import type { TimelineEvent } from "@/lib/resus/types";
import { describe, expect, it } from "vitest";

import { computeStepBar } from "@/lib/resus/survey/step-bar";

/**
 * Resus Desk v2 — Phase 0 regression tests for P3 and P4 (written FAILING
 * against the v1 derivation; they go green when Phase 4 lands the fix).
 *
 * P3: vitals never feed step state — the live desk showed C "Clear" beside
 *     SBP 70 / MAP 63 / shock index 1.86, and B "Pending" with SpO₂ 67 %.
 * P4: the step bar says "Clear" (assessed, no threat) while the step's own
 *     engine says "Not yet assessed" — a vitals event (logged under step C)
 *     or an unclassifiable findings set marked the step assessed.
 */

const EP = "00000000-0000-4000-8000-000000000001";
const NOW = Date.parse("2026-09-23T17:00:00Z");
let seq = 0;
function ev(
  kind: TimelineEvent["kind"],
  step: TimelineEvent["step"],
  minsAgo: number,
  payload: Record<string, unknown>,
): TimelineEvent {
  seq += 1;
  const at = new Date(NOW - minsAgo * 60_000).toISOString();
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    episodeId: EP,
    kind,
    step,
    recordedByUserId: null,
    recordedAt: at,
    createdAt: at,
    payload,
    supersedesEventId: null,
  };
}
const vitals = (minsAgo: number, snapshot: Record<string, unknown>) =>
  ev("vital", "C", minsAgo, { label: "Vitals", snapshot });
const bar = (tl: TimelineEvent[], ageYears: number | null = 26) =>
  Object.fromEntries(
    computeStepBar(tl, { ageYears, arrestDetected: false, nowMs: NOW }).map((e) => [e.step, e]),
  );

describe("P4 — the step bar never claims more than the step engine knows", () => {
  it("a vitals event alone does not make C 'Clear'", () => {
    const b = bar([vitals(2, { hr: 80, systolicBp: 120, diastolicBp: 80 })]);
    expect(b.C!.visual).toBe("pending");
    expect(b.C!.assessed).toBe(false);
  });

  it("an airway findings set the engine cannot classify leaves A pending", () => {
    const tl = [
      ev("assessment", "A", 1, {
        airway: { patency: null, present: [], difficulty: [], context: {} },
        airwayState: null,
        label: "Airway findings",
        danger: false,
      }),
    ];
    const b = bar(tl);
    expect(b.A!.visual).toBe("pending");
    expect(b.A!.assessed).toBe(false);
  });

  it("control: a patent airway recorded reads Clear", () => {
    const tl = [
      ev("assessment", "A", 1, {
        airway: { patency: "patent", present: [], difficulty: [], context: {} },
        airwayState: "secure",
        label: "Airway findings → secure",
        danger: false,
      }),
    ];
    expect(bar(tl).A!.visual).toBe("clear");
  });
});

describe("P3 — fresh adult vitals feed the step state (worsen only)", () => {
  const shocked = { hr: 130, rr: 20, spo2: 67, systolicBp: 70, diastolicBp: 60 };

  it("SBP 70 / HR 130 makes C a threat, marked as from vitals and not yet assessed", () => {
    const b = bar([vitals(3, shocked)]);
    expect(["threatened", "active_threat"]).toContain(b.C!.visual);
    expect(b.C!.fromVitals).toBe(true);
    expect(b.C!.assessed).toBe(false);
  });

  it("SpO₂ 67 % makes B a threat", () => {
    const b = bar([vitals(3, shocked)]);
    expect(["threatened", "active_threat"]).toContain(b.B!.visual);
    expect(b.B!.fromVitals).toBe(true);
  });

  it("children (< 16) get no vitals-derived findings", () => {
    const b = bar([vitals(3, shocked)], 9);
    expect(b.C!.visual).toBe("pending");
    expect(b.C!.fromVitals).toBe(false);
  });

  it("stale vitals (older than the freshness window) derive nothing", () => {
    const b = bar([vitals(45, shocked)]);
    expect(b.C!.visual).toBe("pending");
    expect(b.C!.fromVitals).toBe(false);
  });

  it("normal vitals never turn a Pending step Clear", () => {
    const b = bar([vitals(2, { hr: 80, rr: 14, spo2: 98, systolicBp: 125, diastolicBp: 80 })]);
    for (const L of ["A", "B", "C", "D", "E"] as const) expect(b[L]!.visual).toBe("pending");
  });
});

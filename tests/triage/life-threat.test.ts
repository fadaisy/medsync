import type { LifeThreatFlags, TriageVitals } from "@/lib/triage/types";
import { describe, expect, it } from "vitest";

import { screenLifeThreat } from "@/lib/triage/scoring/life-threat";

/**
 * Step-0 immediate-life-threat screen (research doc §9 Step 0).
 * If any fires → Level 1, bypass scoring, resus now.
 */

function vitals(o: Partial<TriageVitals> = {}): TriageVitals {
  return {
    respiratoryRate: 16,
    spo2: 98,
    oxygen: "air",
    systolicBp: 120,
    diastolicBp: 80,
    pulse: 70,
    consciousness: "A",
    temperature: 37,
    bloodGlucose: 6,
    ...o,
  };
}

describe("Step 0 — clinician-observed life threats", () => {
  it.each([
    ["airwayCompromise"],
    ["absentAgonalBreathing"],
    ["cardiacArrestNoPulse"],
    ["unresponsive"],
    ["activeSeizure"],
    ["exsanguinatingHaemorrhage"],
  ] as const)("%s flag → life threat", (flag) => {
    const flags: LifeThreatFlags = { [flag]: true };
    const r = screenLifeThreat(vitals(), flags);
    expect(r.isLifeThreat).toBe(true);
    expect(r.reasons.length).toBeGreaterThan(0);
  });

  it("no flags + normal vitals → not a life threat", () => {
    const r = screenLifeThreat(vitals(), {});
    expect(r.isLifeThreat).toBe(false);
    expect(r.reasons).toEqual([]);
  });
});

describe("Step 0 — vital-derived life threats", () => {
  it("SpO₂ < 90 ON OXYGEN → life threat (research doc §A.2: '<90 despite O₂')", () => {
    const r = screenLifeThreat(vitals({ spo2: 88, oxygen: "oxygen" }), {});
    expect(r.isLifeThreat).toBe(true);
  });

  it("SpO₂ < 90 ON AIR → NOT auto-Level-1 (goes through scoring, gets NEWS2 +3)", () => {
    // Honoring the doc precisely: the life-threat is '<90 despite O₂'.
    // On air it is still severe but routed through the score, not bypass.
    const r = screenLifeThreat(vitals({ spo2: 88, oxygen: "air" }), {});
    expect(r.isLifeThreat).toBe(false);
  });

  it("SpO₂ 90 exactly on oxygen → not a life threat (strict <90)", () => {
    const r = screenLifeThreat(vitals({ spo2: 90, oxygen: "oxygen" }), {});
    expect(r.isLifeThreat).toBe(false);
  });

  it("glucose < 3.0 → life threat (boundary)", () => {
    expect(screenLifeThreat(vitals({ bloodGlucose: 2.9 }), {}).isLifeThreat).toBe(true);
    expect(screenLifeThreat(vitals({ bloodGlucose: 3.0 }), {}).isLifeThreat).toBe(false);
  });
});

describe("Step 0 — determinism", () => {
  it("identical inputs produce identical output", () => {
    const v = vitals({ spo2: 85, oxygen: "oxygen", bloodGlucose: 2.5 });
    const f: LifeThreatFlags = { activeSeizure: true };
    expect(screenLifeThreat(v, f)).toEqual(screenLifeThreat(v, f));
  });

  it("collects ALL firing reasons, not just the first", () => {
    const r = screenLifeThreat(vitals({ bloodGlucose: 2.5 }), { unresponsive: true });
    expect(r.reasons.length).toBe(2);
  });
});

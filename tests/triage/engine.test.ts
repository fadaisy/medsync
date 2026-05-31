import type { TriageInput } from "@/lib/triage/types";
import { describe, expect, it } from "vitest";

import { runTriage } from "@/lib/triage/engine";

/**
 * Engine orchestration (Steps 0–6, research doc §9). Integration-level
 * behaviour: life-threat fast-track, population routing, worse-of of
 * score-vs-discriminator, trend escalation, and the absolute baseline
 * floor. Unit boundaries are covered in the per-module tests.
 */

function input(o: Partial<TriageInput> = {}): TriageInput {
  return {
    context: {
      ageYears: 40,
      pregnancy: "not_pregnant",
      reproductiveAgeFemale: false,
      spo2Scale2Enabled: false,
    },
    vitals: {
      respiratoryRate: 16,
      spo2: 98,
      oxygen: "air",
      systolicBp: 120,
      diastolicBp: 80,
      pulse: 70,
      consciousness: "A",
      temperature: 37,
      bloodGlucose: 6,
    },
    ...o,
  };
}

describe("Step 0 — life-threat fast-track bypasses scoring", () => {
  it("a life threat → Level 1 Red, resus, scoring bypassed", () => {
    const r = runTriage(input({ lifeThreatFlags: { cardiacArrestNoPulse: true } }));
    expect(r.level).toBe(1);
    expect(r.colour).toBe("red");
    expect(r.lifeThreat).toBe(true);
    expect(r.targetMinutes).toBe(0);
    // No NEWS2 computed on a bypass.
    expect(r.news2).toBeNull();
  });

  it("glucose < 3.0 → Level 1 via Step 0", () => {
    const r = runTriage(input({ vitals: { ...input().vitals, bloodGlucose: 2.4 } }));
    expect(r.level).toBe(1);
    expect(r.lifeThreat).toBe(true);
  });
});

describe("normal adult → low acuity", () => {
  it("all-normal vitals → Green (Level 4)", () => {
    const r = runTriage(input());
    expect(r.ruleset).toBe("adult_news2");
    expect(r.news2?.total).toBe(0);
    expect(r.level).toBe(4);
    expect(r.colour).toBe("green");
    expect(r.lifeThreat).toBe(false);
  });
});

describe("Step 4 — worse-of score vs discriminator", () => {
  it("low score but a high discriminator → discriminator wins", () => {
    // Normal vitals (NEWS2 0 → would be Green/4) + chest pain (Orange/2).
    const r = runTriage(input({ presentDiscriminators: ["cardiac_chest_pain"] }));
    expect(r.scoreAcuity).toBe(4);
    expect(r.discriminatorAcuity).toBe(2);
    expect(r.level).toBe(2); // worse-of
  });

  it("high score (no life-threat) → score drives acuity", () => {
    const r = runTriage(
      input({
        vitals: { ...input().vitals, respiratoryRate: 26, spo2: 92, oxygen: "oxygen" },
      }),
    );
    expect(r.lifeThreat).toBe(false);
    expect(r.news2!.total).toBeGreaterThanOrEqual(7);
    expect(r.level).toBe(2);
  });
});

describe("Step 5 — trend escalation", () => {
  it("a worsening trend escalates beyond the snapshot", () => {
    // Snapshot would be Green (4); prior level was Orange (2) →
    // worsening means we don't drop them back to Green.
    const r = runTriage(input({ adjustments: { priorLevel: 2 } }));
    expect(r.trendEscalated).toBe(true);
    expect(r.level).toBeLessThanOrEqual(2);
  });

  it("an improving trend does NOT auto-downgrade (safety: snapshot stands)", () => {
    // Prior worse (1) but we never auto-improve from trend alone; a
    // downgrade is a clinician override, not an engine inference.
    const r = runTriage(
      input({ presentDiscriminators: ["cardiac_chest_pain"], adjustments: { priorLevel: 4 } }),
    );
    // Discriminator says 2; prior 4 must NOT pull it to 4.
    expect(r.level).toBe(2);
  });
});

describe("Step 5 — baseline adjustment floor (absolute)", () => {
  it("baseline temper can raise the level number when only the score drove it", () => {
    // High NEWS2 (RR26 +3, pulse115 +2, temp39.5 +2 = 7 → Orange/2) from
    // a chronic baseline; clinician tempers to Yellow (3). No red-flag,
    // no life-threat → temper is permitted.
    const r = runTriage(
      input({
        vitals: { ...input().vitals, respiratoryRate: 26, pulse: 115, temperature: 39.5 },
        adjustments: { baselineAdjustment: { temperToLevel: 3, reason: "Known COPD baseline" } },
      }),
    );
    expect(r.scoreAcuity).toBe(2);
    expect(r.baselineApplied).toBe(true);
    expect(r.level).toBe(3);
  });

  it("baseline temper can NEVER pull below a fired red-flag discriminator", () => {
    const r = runTriage(
      input({
        presentDiscriminators: ["cardiac_chest_pain"], // Orange (2)
        adjustments: { baselineAdjustment: { temperToLevel: 4, reason: "tries to downgrade" } },
      }),
    );
    // Floor is the discriminator's 2; temper to 4 is refused.
    expect(r.level).toBe(2);
    expect(r.baselineApplied).toBe(false);
  });

  it("baseline temper can NEVER override a Step-0 life threat", () => {
    const r = runTriage(
      input({
        lifeThreatFlags: { unresponsive: true },
        adjustments: { baselineAdjustment: { temperToLevel: 5, reason: "tries to downgrade" } },
      }),
    );
    expect(r.level).toBe(1);
    expect(r.baselineApplied).toBe(false);
  });
});

describe("transparency + provisional", () => {
  it("always returns human-readable reasoning", () => {
    const r = runTriage(input({ presentDiscriminators: ["cardiac_chest_pain"] }));
    expect(r.reasoning.length).toBeGreaterThan(0);
    expect(r.reasoning.join(" ")).toMatch(/chest pain/i);
  });

  it("missing vitals make the result provisional", () => {
    const r = runTriage(input({ vitals: { ...input().vitals, respiratoryRate: null } }));
    expect(r.provisional).toBe(true);
  });
});

describe("determinism", () => {
  it("identical inputs → identical output", () => {
    const i = input({
      vitals: { ...input().vitals, respiratoryRate: 22, pulse: 115 },
      presentDiscriminators: ["sepsis_suspicion"],
    });
    expect(runTriage(i)).toEqual(runTriage(i));
  });
});

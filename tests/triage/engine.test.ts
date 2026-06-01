import type { TriageInput } from "@/lib/triage/types";
import { describe, expect, it } from "vitest";

import { runTriage } from "@/lib/triage/engine";

/**
 * Engine orchestration (Steps 0–6, research doc §9 + ESI v5).
 * Integration-level behaviour: life-threat fast-track, population
 * routing, worse-of of score-vs-discriminator-vs-ESI-v5, trend
 * escalation, the absolute baseline floor, and the ESI v5
 * mandatory-vitals + danger-zone reassess-up rule. Unit boundaries are
 * covered in the per-module tests.
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
    expect(r.incompleteVitals).toBe(false);
  });
});

describe("Step 4 — worse-of (score vs discriminator vs ESI-v5)", () => {
  it("low score but a high discriminator → discriminator wins", () => {
    // Normal vitals (NEWS2 0 → Green/4) + chest pain (Orange/2).
    const r = runTriage(input({ presentDiscriminators: ["cardiac_chest_pain"] }));
    expect(r.scoreAcuity).toBe(4);
    expect(r.discriminatorAcuity).toBe(2);
    expect(r.level).toBe(2);
  });

  it("high NEWS2 (RR 26 → danger) → Orange via score AND ESI-v5", () => {
    const r = runTriage(
      input({ vitals: { ...input().vitals, respiratoryRate: 26, spo2: 92, oxygen: "oxygen" } }),
    );
    expect(r.lifeThreat).toBe(false);
    expect(r.news2!.total).toBeGreaterThanOrEqual(7);
    expect(r.dangerVitals.length).toBeGreaterThan(0); // RR 26 > 20
    expect(r.level).toBe(2);
  });
});

describe("ESI v5 — danger-zone reassess-up (the v1 miss)", () => {
  it("a lone danger-zone vital floors a would-be-Green patient to Orange", () => {
    // SpO2 91 on air: NEWS2 spo2 = +3 (single-3 → L3 by score). But
    // SpO2 91 < 92 is an ESI-v5 danger vital → floor L2. Worse-of → 2.
    const r = runTriage(input({ vitals: { ...input().vitals, spo2: 91 } }));
    expect(r.dangerVitals.some((d) => d.includes("SpO"))).toBe(true);
    expect(r.esiV5Acuity).toBe(2);
    expect(r.level).toBe(2);
  });

  it("pulse 110 (danger) on an otherwise calm patient → at least Orange", () => {
    // Pulse 110 = NEWS2 +1 (score alone would be Green/4), but >100 is
    // an ESI-v5 danger vital → floor L2.
    const r = runTriage(input({ vitals: { ...input().vitals, pulse: 110 } }));
    expect(r.scoreAcuity).toBe(4);
    expect(r.esiV5Acuity).toBe(2);
    expect(r.level).toBe(2);
  });
});

describe("ESI v5 — mandatory vitals (HR/RR/SpO₂ required)", () => {
  it("missing SpO₂ → incomplete, floored to L3, provisional, with a flag", () => {
    const r = runTriage(input({ vitals: { ...input().vitals, spo2: null } }));
    expect(r.incompleteVitals).toBe(true);
    expect(r.missingRequiredVitals).toContain("spo2");
    expect(r.level).toBeLessThanOrEqual(3); // cannot be reassuring Green/Blue
    expect(r.provisional).toBe(true);
    expect(r.flags.join(" ")).toMatch(/incomplete/i);
  });

  it("complete required vitals on a well patient → Green, not provisional", () => {
    const r = runTriage(input());
    expect(r.incompleteVitals).toBe(false);
    expect(r.level).toBe(4);
    expect(r.provisional).toBe(false);
  });
});

describe("Step 5 — trend escalation (never auto-improve)", () => {
  it("a worsening trend escalates beyond the snapshot", () => {
    // All-normal snapshot (Green/4); prior level Orange/2 → escalate.
    const r = runTriage(input({ adjustments: { priorLevel: 2 } }));
    expect(r.trendEscalated).toBe(true);
    expect(r.level).toBeLessThanOrEqual(2);
  });

  it("an improving trend does NOT auto-downgrade (snapshot stands)", () => {
    const r = runTriage(
      input({ presentDiscriminators: ["cardiac_chest_pain"], adjustments: { priorLevel: 4 } }),
    );
    expect(r.level).toBe(2); // discriminator Orange; prior 4 must not pull it down
  });
});

describe("Step 5 — baseline adjustment floor (absolute)", () => {
  it("baseline temper raises the level number when only the score drove it (no danger vital)", () => {
    // NEWS2 6 from temp 39.1 (+2) + SBP 100 (+2) + SpO2 93 (+2) → L3.
    // None are ESI-v5 danger vitals (HR 70, RR 16, SpO2 93 ≥ 92). No
    // red-flag, no life-threat → clinician temper to L4 is permitted.
    const r = runTriage(
      input({
        vitals: { ...input().vitals, temperature: 39.1, systolicBp: 100, spo2: 93 },
        adjustments: { baselineAdjustment: { temperToLevel: 4, reason: "Known COPD baseline" } },
      }),
    );
    expect(r.dangerVitals.length).toBe(0);
    expect(r.scoreAcuity).toBe(3);
    expect(r.baselineApplied).toBe(true);
    expect(r.level).toBe(4);
  });

  it("baseline temper can NEVER pull below a fired red-flag discriminator", () => {
    const r = runTriage(
      input({
        presentDiscriminators: ["cardiac_chest_pain"],
        adjustments: { baselineAdjustment: { temperToLevel: 4, reason: "tries to downgrade" } },
      }),
    );
    expect(r.level).toBe(2);
    expect(r.baselineApplied).toBe(false);
  });

  it("baseline temper can NEVER pull below an ESI-v5 danger-zone vital", () => {
    // RR 26 is a danger vital → absolute L2 floor; temper to L3 refused.
    const r = runTriage(
      input({
        vitals: { ...input().vitals, respiratoryRate: 26 },
        adjustments: { baselineAdjustment: { temperToLevel: 3, reason: "tries to downgrade" } },
      }),
    );
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

describe("transparency + determinism", () => {
  it("always returns human-readable reasoning", () => {
    const r = runTriage(input({ presentDiscriminators: ["cardiac_chest_pain"] }));
    expect(r.reasoning.length).toBeGreaterThan(0);
    expect(r.reasoning.join(" ")).toMatch(/chest pain/i);
  });

  it("identical inputs → identical output", () => {
    const i = input({
      vitals: { ...input().vitals, respiratoryRate: 22, pulse: 115 },
      presentDiscriminators: ["sepsis_suspicion"],
    });
    expect(runTriage(i)).toEqual(runTriage(i));
  });
});

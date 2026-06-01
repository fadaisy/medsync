import type { PaedScoreInput } from "@/lib/triage/scoring/paeds-scorer";
import type { TriageInput } from "@/lib/triage/types";
import { describe, expect, it } from "vitest";

import { runTriage } from "@/lib/triage/engine";
import { scorePaediatric } from "@/lib/triage/scoring/paeds-scorer";

/**
 * Paediatric age-banded scorer (GATE B). Pins: catalog age-banded
 * ranges → acuity, the over-flag caveat (no auto-alarm on a single mild
 * deviation), the absolute red lines (hypotension/hypoglycaemia → L1,
 * SpO₂<92 → L2, infant fever → L2), and the engine integration making
 * paeds REAL (no longer provisional-by-default).
 */

function paed(o: Partial<PaedScoreInput> = {}): PaedScoreInput {
  // A well 4-year-old (preschool: HR 80–140, RR 22–34, SBP 80–110).
  return {
    ageYears: 4,
    respiratoryRate: 26,
    heartRate: 110,
    systolicBp: 95,
    spo2: 98,
    temperature: 37,
    bloodGlucose: 6,
    ...o,
  };
}

describe("scorePaediatric — over-flag caveat (no auto-alarm)", () => {
  it("a well child scores L5", () => {
    expect(scorePaediatric(paed()).acuity).toBe(5);
  });

  it("a single lone out-of-band HR → L3 (significant), NOT L1/L2 auto-alarm", () => {
    // HR 150 is above the preschool 80–140 band, nothing else deranged.
    expect(scorePaediatric(paed({ heartRate: 150 })).acuity).toBe(3);
  });

  it("a single isolated mild SpO₂ (92–95) → L5 (no auto-alarm on one mild blip)", () => {
    expect(scorePaediatric(paed({ spo2: 94 })).acuity).toBe(5);
  });

  it("two mild deviations → L4", () => {
    expect(scorePaediatric(paed({ spo2: 94, temperature: 38.2 })).acuity).toBe(4);
  });

  it("a normal infant (HR 130, RR 35) is NOT flagged (age-banded, not adult thresholds)", () => {
    // ageYears 0 → infant band HR 100–160 / RR 24–40; 130/35 are normal.
    expect(
      scorePaediatric(paed({ ageYears: 0, heartRate: 130, respiratoryRate: 35, systolicBp: 85 }))
        .acuity,
    ).toBe(5);
  });
});

describe("scorePaediatric — escalation", () => {
  it("two deranged vitals → L2 (multi-system)", () => {
    expect(scorePaediatric(paed({ heartRate: 150, respiratoryRate: 40 })).acuity).toBe(2);
  });

  it("SpO₂ < 92 → L2 (significant hypoxaemia red line)", () => {
    expect(scorePaediatric(paed({ spo2: 90 })).acuity).toBe(2);
  });

  it("SBP below the age hypotension line → L1 (decompensated shock)", () => {
    // preschool 4y: hypotension line 70+2×4 = 78; SBP 70 < 78.
    expect(scorePaediatric(paed({ systolicBp: 70 })).acuity).toBe(1);
  });

  it("paediatric hypoglycaemia (<2.6) → L1", () => {
    expect(scorePaediatric(paed({ bloodGlucose: 2.0 })).acuity).toBe(1);
  });

  it("infant <3mo with fever ≥38 → L2 red flag (when months known)", () => {
    const r = scorePaediatric(
      paed({
        ageYears: 0,
        ageMonths: 2,
        temperature: 38.5,
        systolicBp: 85,
        heartRate: 130,
        respiratoryRate: 35,
      }),
    );
    expect(r.acuity).toBe(2);
  });
});

describe("scorePaediatric — missing vitals", () => {
  it("a missing vital is provisional + not_recorded, never silently normal", () => {
    const r = scorePaediatric(paed({ heartRate: null }));
    expect(r.provisional).toBe(true);
    expect(r.missing).toContain("heart_rate");
  });
});

describe("scorePaediatric — engine integration (paeds is now REAL)", () => {
  function input(o: Partial<TriageInput> = {}): TriageInput {
    return {
      context: {
        ageYears: 4,
        pregnancy: "not_pregnant",
        reproductiveAgeFemale: false,
        spo2Scale2Enabled: false,
      },
      vitals: {
        respiratoryRate: 26,
        spo2: 98,
        oxygen: "air",
        systolicBp: 95,
        diastolicBp: 60,
        pulse: 110,
        consciousness: "A",
        temperature: 37,
        bloodGlucose: 6,
      },
      ...o,
    };
  }

  it("a well child routes paeds and computes a real acuity (not provisional)", () => {
    const r = runTriage(input());
    expect(r.ruleset).toBe("paediatric_pews");
    expect(r.scoreAcuity).toBe(5);
    expect(r.provisional).toBe(false);
  });

  it("a normal infant is NOT floored to L2 by the adult ESI danger-zone (the bug fix)", () => {
    const r = runTriage(
      input({
        context: {
          ageYears: 0,
          pregnancy: "not_pregnant",
          reproductiveAgeFemale: false,
          spo2Scale2Enabled: false,
        },
        vitals: {
          respiratoryRate: 35,
          spo2: 98,
          oxygen: "air",
          systolicBp: 85,
          diastolicBp: 55,
          pulse: 130,
          consciousness: "A",
          temperature: 37,
          bloodGlucose: 6,
        },
      }),
    );
    expect(r.level).toBe(5);
  });

  it("decompensated shock in a child → L1 via the scorer", () => {
    const r = runTriage(input({ vitals: { ...input().vitals, systolicBp: 70 } }));
    expect(r.level).toBe(1);
  });
});

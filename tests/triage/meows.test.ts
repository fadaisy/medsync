import type { MeowsInput } from "@/lib/triage/scoring/meows";
import type { TriageInput } from "@/lib/triage/types";
import { describe, expect, it } from "vitest";

import { meowsToAcuity } from "@/lib/triage/constants";
import { runTriage } from "@/lib/triage/engine";
import { scoreMeows } from "@/lib/triage/scoring/meows";

/**
 * MEOWS obstetric scorer (GATE C). Pins: hypertension-as-emergency
 * (not hypotension), the Red/Yellow→acuity map, the Modified Shock Index
 * concealed-haemorrhage catch, no over-call of physiological pregnancy
 * shifts, and the engine integration making obstetric REAL.
 */

function ob(o: Partial<MeowsInput> = {}): MeowsInput {
  // A well pregnant patient.
  return {
    systolicBp: 110,
    diastolicBp: 70,
    temperature: 37,
    spo2: 98,
    modifiedShockIndexFlag: "normal",
    ...o,
  };
}

describe("meowsToAcuity — trigger → acuity", () => {
  it("any Red → L2; two Yellow → L3; one/none → L4", () => {
    expect(meowsToAcuity(1, 0)).toBe(2);
    expect(meowsToAcuity(0, 2)).toBe(3);
    expect(meowsToAcuity(0, 1)).toBe(4);
    expect(meowsToAcuity(0, 0)).toBe(4);
  });
});

describe("scoreMeows — hypertension is the obstetric emergency", () => {
  it("severe-range BP ≥160/110 → a Red", () => {
    expect(scoreMeows(ob({ systolicBp: 165 })).redCount).toBe(1);
    expect(scoreMeows(ob({ diastolicBp: 112 })).redCount).toBe(1);
  });

  it("hypertension ≥140/90 (but <severe) → a Yellow", () => {
    const r = scoreMeows(ob({ systolicBp: 145 }));
    expect(r.yellowCount).toBe(1);
    expect(r.redCount).toBe(0);
  });

  it("does NOT over-call physiological low BP / mild tachycardia", () => {
    // BP 100/60 is low-normal in pregnancy; no MSI haemorrhage → no trigger.
    const r = scoreMeows(ob({ systolicBp: 100, diastolicBp: 60 }));
    expect(r.redCount).toBe(0);
    expect(r.yellowCount).toBe(0);
  });
});

describe("scoreMeows — sepsis / hypoxaemia / haemorrhage", () => {
  it("temp ≥38 → Red (sepsis)", () => {
    expect(scoreMeows(ob({ temperature: 38.2 })).redCount).toBe(1);
  });

  it("SpO₂ <95 → Yellow; <92 → Red", () => {
    expect(scoreMeows(ob({ spo2: 94 })).yellowCount).toBe(1);
    expect(scoreMeows(ob({ spo2: 90 })).redCount).toBe(1);
  });

  it("MSI haemorrhage flag → Red (concealed-bleed catch)", () => {
    expect(scoreMeows(ob({ modifiedShockIndexFlag: "haemorrhage" })).redCount).toBe(1);
  });

  it("uncomputable MSI surfaces a 'do not be reassured' note", () => {
    const r = scoreMeows(ob({ modifiedShockIndexFlag: null }));
    expect(r.reasons.join(" ").toLowerCase()).toContain("do not be reassured");
  });
});

describe("scoreMeows — missing vitals", () => {
  it("missing BP + temp → provisional + not_recorded", () => {
    const r = scoreMeows(ob({ systolicBp: null, diastolicBp: null, temperature: null }));
    expect(r.provisional).toBe(true);
    expect(r.missing).toEqual(expect.arrayContaining(["blood_pressure", "temperature"]));
  });
});

describe("scoreMeows — engine integration (obstetric is now REAL)", () => {
  function input(o: Partial<TriageInput> = {}): TriageInput {
    return {
      context: {
        ageYears: 30,
        pregnancy: "pregnant",
        reproductiveAgeFemale: true,
        spo2Scale2Enabled: false,
      },
      vitals: {
        respiratoryRate: 16,
        spo2: 98,
        oxygen: "air",
        systolicBp: 110,
        diastolicBp: 70,
        pulse: 85,
        consciousness: "A",
        temperature: 37,
        bloodGlucose: 6,
      },
      ...o,
    };
  }

  it("a well pregnant patient routes obstetric + computes a real acuity (not provisional)", () => {
    const r = runTriage(input());
    expect(r.ruleset).toBe("obstetric_meows");
    expect(r.scoreAcuity).toBe(4);
    expect(r.provisional).toBe(false);
  });

  it("severe-range BP → at least L2 from the scorer (and L1 via the severe-HTN discriminator)", () => {
    const r = runTriage(
      input({ vitals: { ...input().vitals, systolicBp: 170, diastolicBp: 115 } }),
    );
    // worse-of: scorer Red→L2, obstetric_severe_htn discriminator→L1 → final L1.
    expect(r.level).toBe(1);
  });

  it("obstetric temp ≥38 → L2 even with no backing discriminator (scorer is load-bearing)", () => {
    const r = runTriage(input({ vitals: { ...input().vitals, temperature: 38.5 } }));
    expect(r.level).toBeLessThanOrEqual(2);
  });
});

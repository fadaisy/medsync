import type { TriageInput } from "@/lib/triage/types";
import { describe, expect, it } from "vitest";

import { runTriage } from "@/lib/triage/engine";
import { computeCrossVitalRules } from "@/lib/triage/scoring/cross-vital-rules";
import { computeDerivedMetrics } from "@/lib/triage/scoring/derived";

/**
 * Cross-vital "smart layer" rules (GATE D, catalog Part F). Pins:
 * Cushing's triad → L1 (age-band brady bound for paeds), temp+HR sepsis
 * overlay (suspicion only), pulse-pressure strings, SpO₂+RR raise-only
 * floor, and the bias-up / over-flag-caveat guarantees.
 */

function vit(o: Partial<TriageInput["vitals"]> = {}): TriageInput["vitals"] {
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

const run = (
  vitals: TriageInput["vitals"],
  flags: TriageInput["lifeThreatFlags"] = {},
  ruleset: "adult_news2" | "paediatric_pews" = "adult_news2",
  ageYears: number | null = 40,
) => computeCrossVitalRules(vitals, computeDerivedMetrics(vitals), flags ?? {}, ruleset, ageYears);

describe("Cushing's reflex (triad → L1)", () => {
  it("fires only with all three: bradycardia + hypertension + irregular breathing", () => {
    const r = run(vit({ pulse: 45, systolicBp: 200 }), { irregularBreathing: true });
    const c = r.find((x) => x.code === "cushings_reflex")!;
    expect(c.fired).toBe(true);
    expect(c.acuityImplication).toBe(1);
  });

  it("does NOT fire on bradycardia + hypertension WITHOUT irregular breathing (over-flag caveat)", () => {
    const r = run(vit({ pulse: 45, systolicBp: 200 }), { irregularBreathing: false });
    expect(r.find((x) => x.code === "cushings_reflex")).toBeUndefined();
  });

  it("escalates to L1 end-to-end through the engine", () => {
    const input: TriageInput = {
      context: {
        ageYears: 50,
        pregnancy: "not_pregnant",
        reproductiveAgeFemale: false,
        spo2Scale2Enabled: false,
      },
      vitals: vit({ pulse: 45, systolicBp: 200 }),
      lifeThreatFlags: { irregularBreathing: true },
    };
    expect(runTriage(input).level).toBe(1);
  });
});

describe("temp + HR sepsis overlay (suspicion only, no standalone acuity)", () => {
  it("hypothermia + tachycardia fires the overlay with null acuity", () => {
    const r = run(vit({ temperature: 35.5, pulse: 100 }));
    const t = r.find((x) => x.code === "temp_hr_sepsis")!;
    expect(t.fired).toBe(true);
    expect(t.acuityImplication).toBeNull();
    expect(t.interpretation.toLowerCase()).toContain("cold sepsis");
  });

  it("only WIDENS an already-ticked sepsis_suspicion (never auto-creates it)", () => {
    const base: TriageInput = {
      context: {
        ageYears: 40,
        pregnancy: "not_pregnant",
        reproductiveAgeFemale: false,
        spo2Scale2Enabled: false,
      },
      vitals: vit({ temperature: 38.5, pulse: 100 }), // febrile + tachy, but NEWS2 < 5 and qSOFA < 2
    };
    // Without the clinician ticking sepsis_suspicion → no sepsis discriminator.
    expect(runTriage(base).firedDiscriminators.some((d) => d.code === "sepsis_suspicion")).toBe(
      false,
    );
    // With it ticked, the overlay widens the gate → sepsis fires.
    const ticked = runTriage({ ...base, presentDiscriminators: ["sepsis_suspicion"] });
    expect(ticked.firedDiscriminators.some((d) => d.code === "sepsis_suspicion")).toBe(true);
  });
});

describe("SpO₂ + RR will-fail (raise-only floor to L3)", () => {
  it("normal SpO₂ + high RR fires with a L3 implication", () => {
    const r = run(vit({ spo2: 98, respiratoryRate: 24 }));
    const w = r.find((x) => x.code === "spo2_rr_will_fail")!;
    expect(w.acuityImplication).toBe(3);
  });

  it("never overwrites a more-acute level (raise-only)", () => {
    // A patient already L1 from another path keeps L1.
    const input: TriageInput = {
      context: {
        ageYears: 40,
        pregnancy: "not_pregnant",
        reproductiveAgeFemale: false,
        spo2Scale2Enabled: false,
      },
      vitals: vit({ spo2: 98, respiratoryRate: 24 }),
      lifeThreatFlags: { cardiacArrestNoPulse: true },
    };
    expect(runTriage(input).level).toBe(1);
  });

  it("raises an otherwise-reassuring adult from L4 toward L3", () => {
    const input: TriageInput = {
      context: {
        ageYears: 40,
        pregnancy: "not_pregnant",
        reproductiveAgeFemale: false,
        spo2Scale2Enabled: false,
      },
      // RR 22 scores NEWS2 +2 but no single-3; with normal everything else
      // the will-fail floor ensures it can't read reassuring.
      vitals: vit({ spo2: 98, respiratoryRate: 22 }),
    };
    expect(runTriage(input).level).toBeLessThanOrEqual(3);
  });
});

describe("pulse pressure interpretation (strings only, no acuity)", () => {
  it("narrow pulse pressure surfaces a hypovolaemia string", () => {
    const r = run(vit({ systolicBp: 100, diastolicBp: 85 })); // PP 15 < 25% of 100
    const p = r.find((x) => x.code === "pulse_pressure_narrow")!;
    expect(p.acuityImplication).toBeNull();
    expect(p.interpretation.toLowerCase()).toContain("hypovolaemia");
  });
});

describe("paediatric bounds (no adult numbers on children)", () => {
  it("Cushing's uses the age-band HR min, not adult ≤50", () => {
    // Infant band HR min 100; HR 90 is bradycardia for an infant (not for an adult).
    const r = run(
      vit({ pulse: 90, systolicBp: 150, diastolicBp: 95 }),
      { irregularBreathing: true },
      "paediatric_pews",
      0,
    );
    expect(r.find((x) => x.code === "cushings_reflex")?.fired).toBe(true);
  });

  it("a normal infant HR does not fire the adult sepsis-tachy bound", () => {
    // HR 130 normal for infant; febrile. Adult bound 91 would fire; age-band max 160 should not.
    const r = run(vit({ pulse: 130, temperature: 38.5 }), {}, "paediatric_pews", 0);
    expect(r.find((x) => x.code === "temp_hr_sepsis")).toBeUndefined();
  });
});

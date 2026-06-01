import type { TriageInput } from "@/lib/triage/types";
import { describe, expect, it } from "vitest";

import { runTriage } from "@/lib/triage/engine";
import { interpretVitals } from "@/lib/triage/interpret";

/**
 * Per-vital interpretation is a PRESENTATION layer over the engine's
 * already-validated output (News2Result.parameters + derived metrics).
 * It invents no thresholds — these tests pin that each vital's
 * interpretation tracks the engine, and that severity tone maps from
 * NEWS2 points.
 */

function input(o: Partial<TriageInput["vitals"]> = {}): TriageInput {
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
      ...o,
    },
  };
}

describe("interpretVitals — NEWS2 vitals track engine points → tone", () => {
  it("normal vitals all read 'normal'", () => {
    const i = interpretVitals(input().vitals, runTriage(input()));
    expect(i.respiratoryRate.tone).toBe("normal");
    expect(i.pulse.tone).toBe("normal");
    expect(i.temperature.tone).toBe("normal");
    expect(i.consciousness.tone).toBe("normal");
  });

  it("RR 26 (NEWS2 +3) reads critical with the points", () => {
    const v = input({ respiratoryRate: 26 }).vitals;
    const i = interpretVitals(v, runTriage(input({ respiratoryRate: 26 })));
    expect(i.respiratoryRate.tone).toBe("critical");
    expect(i.respiratoryRate.points).toBe(3);
  });

  it("SpO2 93 (+2) reads abnormal", () => {
    const v = input({ spo2: 93 }).vitals;
    expect(interpretVitals(v, runTriage(input({ spo2: 93 }))).spo2.tone).toBe("abnormal");
  });

  it("pulse 95 (+1) reads borderline", () => {
    const v = input({ pulse: 95 }).vitals;
    expect(interpretVitals(v, runTriage(input({ pulse: 95 }))).pulse.tone).toBe("borderline");
  });
});

describe("interpretVitals — non-NEWS2 vitals", () => {
  it("glucose < 3.0 reads critical (hypoglycaemia)", () => {
    const v = input({ bloodGlucose: 2.5 }).vitals;
    expect(interpretVitals(v, runTriage(input({ bloodGlucose: 2.5 }))).bloodGlucose.tone).toBe(
      "critical",
    );
  });

  it("glucose > 15 reads abnormal (DKA screen)", () => {
    const v = input({ bloodGlucose: 18 }).vitals;
    const i = interpretVitals(v, runTriage(input({ bloodGlucose: 18 })));
    expect(i.bloodGlucose.tone).toBe("abnormal");
    expect(i.bloodGlucose.label.toLowerCase()).toContain("dka");
  });

  it("oxygen on O2 is noted", () => {
    const v = input({ oxygen: "oxygen" }).vitals;
    expect(
      interpretVitals(v, runTriage(input({ oxygen: "oxygen" }))).oxygen.label.toLowerCase(),
    ).toContain("o");
  });

  it("diastolic ≥110 reads abnormal (severe hypertension range)", () => {
    const v = input({ diastolicBp: 115 }).vitals;
    expect(interpretVitals(v, runTriage(input({ diastolicBp: 115 }))).diastolicBp.tone).toBe(
      "abnormal",
    );
  });
});

describe("interpretVitals — 'scores 0 ≠ normal' BP/temp correction", () => {
  it("systolic 200 (NEWS2 = 0) is NEVER 'Normal' — reads severe hypertension", () => {
    const v = input({ systolicBp: 200 }).vitals;
    const i = interpretVitals(v, runTriage(input({ systolicBp: 200 })));
    expect(i.systolicBp.label.toLowerCase()).not.toContain("normal");
    expect(i.systolicBp.label.toLowerCase()).toContain("severe hypertension");
    expect(i.systolicBp.tone).toBe("critical");
  });

  it("systolic 150 (NEWS2 = 0) reads hypertension (abnormal), not normal", () => {
    const v = input({ systolicBp: 150 }).vitals;
    const i = interpretVitals(v, runTriage(input({ systolicBp: 150 })));
    expect(i.systolicBp.tone).toBe("abnormal");
    expect(i.systolicBp.label.toLowerCase()).toContain("hypertension");
  });

  it("systolic 125 (NEWS2 = 0) reads elevated/high-normal (borderline)", () => {
    const v = input({ systolicBp: 125 }).vitals;
    expect(interpretVitals(v, runTriage(input({ systolicBp: 125 }))).systolicBp.tone).toBe(
      "borderline",
    );
  });

  it("a genuinely normal systolic (115) still reads Normal", () => {
    const v = input({ systolicBp: 115 }).vitals;
    expect(interpretVitals(v, runTriage(input({ systolicBp: 115 }))).systolicBp.tone).toBe(
      "normal",
    );
  });

  it("hypotension (NEWS2-scored) is never softened by the clinical overlay", () => {
    const v = input({ systolicBp: 88 }).vitals;
    expect(interpretVitals(v, runTriage(input({ systolicBp: 88 }))).systolicBp.tone).toBe(
      "critical",
    );
  });

  it("hyperpyrexia ≥41 reads critical (NEWS2 caps temp at +2)", () => {
    const v = input({ temperature: 41.5 }).vitals;
    const i = interpretVitals(v, runTriage(input({ temperature: 41.5 })));
    expect(i.temperature.tone).toBe("critical");
    expect(i.temperature.label.toLowerCase()).toContain("hyperpyrexia");
  });
});

describe("interpretVitals — missing vitals", () => {
  it("a missing vital reads 'missing', never 'normal'", () => {
    const v = input({ respiratoryRate: null }).vitals;
    expect(
      interpretVitals(v, runTriage(input({ respiratoryRate: null }))).respiratoryRate.tone,
    ).toBe("missing");
  });
});

describe("interpretVitals — determinism", () => {
  it("identical inputs → identical interpretation", () => {
    const v = input({ respiratoryRate: 22, spo2: 93, pulse: 115 }).vitals;
    const r = runTriage(input({ respiratoryRate: 22, spo2: 93, pulse: 115 }));
    expect(interpretVitals(v, r)).toEqual(interpretVitals(v, r));
  });
});

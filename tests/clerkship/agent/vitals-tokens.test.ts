import type { AgentInput } from "@/lib/clerkship/agent/types";
import { describe, expect, it } from "vitest";

import { buildFeatureIndex } from "@/lib/clerkship/agent/feature-index";
import { bmi } from "@/lib/clerkship/exam/types";

const EMPTY: AgentInput = {
  hpcItems: [],
  ros: [],
  pmhItems: [],
  pmhScreen: {},
  examVitals: {},
  bpStandard: "who_esc",
  examGeneralFindings: [],
  examRespiratory: {},
  examCardiovascular: {},
  examAbdominal: {},
  examNeurological: {},
  examMusculoskeletal: {},
  examEndoVascularFoot: {},
};

const idxOf = (examVitals: AgentInput["examVitals"]) => buildFeatureIndex({ ...EMPTY, examVitals });
const has = (v: AgentInput["examVitals"], token: string) => idxOf(v).presentDisplays.has(token);

describe("bmi()", () => {
  it("computes from weight + height", () => {
    expect(bmi({ weightKg: 50, heightCm: 170 })).toBeCloseTo(17.3, 1);
  });

  // A missing height is not a default height — never guess anthropometry.
  it("is undefined unless BOTH are recorded, and rejects non-positive values", () => {
    expect(bmi({ weightKg: 50 })).toBeUndefined();
    expect(bmi({ heightCm: 170 })).toBeUndefined();
    expect(bmi({})).toBeUndefined();
    expect(bmi({ weightKg: 0, heightCm: 170 })).toBeUndefined();
    expect(bmi({ weightKg: 50, heightCm: 0 })).toBeUndefined();
  });
});

describe("vitals → feature tokens (ADR 0078)", () => {
  // The rule the whole clerkship follows: not-measured is never normal.
  it("emits NOTHING when nothing was recorded", () => {
    expect(idxOf({}).presentDisplays.size).toBe(0);
  });

  it("emits nothing for values inside the normal bands", () => {
    const idx = idxOf({ glucose: 6, tempC: 37, sbp: 120, hr: 80, spo2: 98 });
    expect(idx.presentDisplays.size).toBe(0);
  });

  it("glucose thresholds (WHO/ADA diagnostic + hypoglycaemia alert values)", () => {
    expect(has({ glucose: 12.0 }, "random glucose over 11.1")).toBe(true);
    expect(has({ glucose: 11.1 }, "random glucose over 11.1")).toBe(true);
    expect(has({ glucose: 11.0 }, "random glucose over 11.1")).toBe(false);
    expect(has({ glucose: 3.2 }, "glucose under 3.9")).toBe(true);
    expect(has({ glucose: 3.2 }, "glucose under 2.2")).toBe(false);
    // WHO severe-malaria hypoglycaemia — the lower band implies the upper one
    expect(has({ glucose: 1.8 }, "glucose under 2.2")).toBe(true);
    expect(has({ glucose: 1.8 }, "glucose under 3.9")).toBe(true);
  });

  it("temperature, haemodynamic and oxygenation thresholds", () => {
    expect(has({ tempC: 38.4 }, "febrile 38 or above")).toBe(true);
    expect(has({ tempC: 35.2 }, "hypothermic under 36")).toBe(true);
    expect(has({ sbp: 84 }, "systolic under 90")).toBe(true);
    expect(has({ hr: 118 }, "tachycardia over 100")).toBe(true);
    expect(has({ hr: 44 }, "bradycardia under 50")).toBe(true);
    expect(has({ spo2: 88 }, "hypoxia under 92")).toBe(true);
  });

  it("anthropometry: BMI bands need BOTH measurements, MUAC stands alone", () => {
    // 45kg at 170cm = 15.6 → both underweight and severe-thinness bands
    expect(has({ weightKg: 45, heightCm: 170 }, "bmi under 18.5")).toBe(true);
    expect(has({ weightKg: 45, heightCm: 170 }, "bmi under 16")).toBe(true);
    // 70kg at 170cm = 24.2 → neither
    expect(has({ weightKg: 70, heightCm: 170 }, "bmi under 18.5")).toBe(false);
    // weight alone cannot produce a BMI token
    expect(has({ weightKg: 45 }, "bmi under 18.5")).toBe(false);
    // MUAC needs only a tape — it must work without a scale
    expect(has({ muacCm: 21 }, "muac under 23")).toBe(true);
    expect(has({ muacCm: 25 }, "muac under 23")).toBe(false);
  });

  it("tokens carry vitals provenance so the UI can show where they came from", () => {
    const idx = idxOf({ glucose: 14 });
    expect(idx.provenance.get("random glucose over 11.1")?.from).toBe("vitals");
  });
});

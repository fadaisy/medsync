import { describe, expect, it } from "vitest";

import { evidenceLine } from "@/lib/resus/survey/do-now";
import { deriveMeasureFindings } from "@/lib/resus/survey/vitals-bands";
import { NOW, vitals } from "./survey-fixtures";

/**
 * GATE A §2 ⓖ SV-DN-02 — the "because …" line lists only the values that met
 * their own rule, and never rounds a value onto the wrong side of its threshold.
 */

const line = (snapshot: Record<string, unknown>) => {
  const m = deriveMeasureFindings([vitals(2, snapshot)], { ageYears: 40, nowMs: NOW });
  return { codes: m.C, because: evidenceLine(m.C, m.values) };
};

describe("SV-DN-02 — only the values that triggered the rule", () => {
  it("SV-DN-02: hypotension by MAP < 65 alone does not list a normal SBP (120/35)", () => {
    const r = line({ systolicBp: 120, diastolicBp: 35 });
    expect(r.codes).toEqual(["hypotension"]);
    expect(r.because).toBe("because MAP 63");
  });
  it("SV-DN-02: hypotension by SBP ≤ 90 alone does not list a normal MAP (90/55)", () => {
    const r = line({ systolicBp: 90, diastolicBp: 55 });
    expect(r.codes).toEqual(["hypotension"]);
    expect(r.because).toBe("because SBP 90");
  });
  it("SV-DN-02: both limits met lists both (70/60)", () => {
    expect(line({ systolicBp: 70, diastolicBp: 60 }).because).toBe("because SBP 70, MAP 63, PP 10");
  });
});

describe("SV-DN-02 — rounding never lands on or across the threshold", () => {
  it("SV-DN-02: HR 85, BP 94/50 → MAP 64.7 and SI 0.904, not 'MAP 65, SI 0.90'", () => {
    const r = line({ hr: 85, systolicBp: 94, diastolicBp: 50 });
    expect(r.codes).toEqual(["hypotension", "shock_index_high"]);
    expect(r.because).toBe("because MAP 64.7, SI 0.904");
  });
  it("SV-DN-02: SI just under 1.0 is not shown as 1.00 beside a SI < 1.0 state", () => {
    expect(evidenceLine(["shock_index_high"], { shockIndex: 0.9952 })).toBe("because SI 0.995");
  });
  it("SV-DN-02: glucose 2.97 shows as 2.97, not 3.0 beside a glucose < 3.0 rule", () => {
    expect(evidenceLine(["hypoglycaemia"], { glucose: 2.97 })).toBe("because glucose 2.97");
  });
  it("SV-DN-02: SpO₂ 91.6 shows as 91.6 %, not 92 % beside an SpO₂ < 92 rule", () => {
    expect(evidenceLine(["spo2_lt92", "spo2_lt94"], { spo2: 91.6 })).toBe("because SpO₂ 91.6 %");
  });
  it("SV-DN-02: values clear of the threshold keep their usual precision", () => {
    expect(
      evidenceLine(["hypotension", "shock_index_severe"], { map: 63.33, shockIndex: 1.857 }),
    ).toBe("because MAP 63, SI 1.86");
  });
});

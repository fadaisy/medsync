import type { EsiV5Vitals } from "@/lib/triage/scoring/esi-v5";
import { describe, expect, it } from "vitest";

import { assessEsiV5 } from "@/lib/triage/scoring/esi-v5";

/**
 * ESI v5 mandatory-vitals + danger-zone reassess-up (ENA 2023).
 * Verified thresholds (GATE A §1): adult HR>100, RR>20, SpO₂<92;
 * HR+RR+SpO₂ mandatory for any non-L1/L2 patient.
 *
 * Pure function, boundary-tested both sides of every cutoff.
 */

function vitals(o: Partial<EsiV5Vitals> = {}): EsiV5Vitals {
  return { respiratoryRate: 16, pulse: 70, spo2: 98, ...o };
}

describe("assessEsiV5 — mandatory vitals (non-L1/L2)", () => {
  it("complete HR+RR+SpO₂ → not incomplete, no floor", () => {
    const r = assessEsiV5(vitals());
    expect(r.incompleteVitals).toBe(false);
    expect(r.missingRequired).toEqual([]);
    expect(r.acuityFloor).toBeNull();
  });

  it.each([
    ["respiratoryRate", "respiratory_rate"],
    ["pulse", "pulse"],
    ["spo2", "spo2"],
  ] as const)("missing %s → incomplete + floor L3", (field, code) => {
    const r = assessEsiV5(vitals({ [field]: null }));
    expect(r.incompleteVitals).toBe(true);
    expect(r.missingRequired).toContain(code);
    expect(r.acuityFloor).toBe(3);
  });

  it("multiple missing are all listed", () => {
    const r = assessEsiV5(vitals({ pulse: null, spo2: null }));
    expect(r.missingRequired).toEqual(expect.arrayContaining(["pulse", "spo2"]));
    expect(r.missingRequired).not.toContain("respiratory_rate");
  });
});

describe("assessEsiV5 — danger-zone reassess-up (boundaries)", () => {
  it.each([
    [100, false], // not > 100
    [101, true], // > 100
  ])("pulse %i danger=%s", (pulse, danger) => {
    const r = assessEsiV5(vitals({ pulse }));
    expect(r.dangerVitals.some((d) => d.includes("Pulse"))).toBe(danger);
  });

  it.each([
    [20, false], // not > 20
    [21, true], // > 20
  ])("RR %i danger=%s", (respiratoryRate, danger) => {
    const r = assessEsiV5(vitals({ respiratoryRate }));
    expect(r.dangerVitals.some((d) => d.includes("Resp"))).toBe(danger);
  });

  it.each([
    [92, false], // not < 92
    [91, true], // < 92
  ])("SpO₂ %i danger=%s", (spo2, danger) => {
    const r = assessEsiV5(vitals({ spo2 }));
    expect(r.dangerVitals.some((d) => d.includes("SpO"))).toBe(danger);
  });

  it("any danger-zone vital floors acuity to 2", () => {
    expect(assessEsiV5(vitals({ pulse: 130 })).acuityFloor).toBe(2);
    expect(assessEsiV5(vitals({ respiratoryRate: 24 })).acuityFloor).toBe(2);
    expect(assessEsiV5(vitals({ spo2: 90 })).acuityFloor).toBe(2);
  });

  it("danger (L2) takes precedence over incomplete (L3) when both apply", () => {
    // RR present + dangerous, pulse missing → danger floor 2 wins (more acute).
    const r = assessEsiV5(vitals({ respiratoryRate: 28, pulse: null }));
    expect(r.dangerVitals.length).toBeGreaterThan(0);
    expect(r.incompleteVitals).toBe(true);
    expect(r.acuityFloor).toBe(2);
  });
});

describe("assessEsiV5 — paediatric danger-zone gating (anti-over-flag)", () => {
  it("a normal infant's HR/RR do NOT fire the adult danger-zone when gated off", () => {
    // HR 130 / RR 35 are normal for an infant but breach adult HR>100/RR>20.
    const r = assessEsiV5(vitals({ pulse: 130, respiratoryRate: 35, adultDangerZone: false }));
    expect(r.dangerVitals).toEqual([]);
    expect(r.acuityFloor).toBeNull();
  });

  it("SpO₂<92 STILL fires for a child (population-agnostic, matches paed catalog)", () => {
    const r = assessEsiV5(
      vitals({ pulse: 130, respiratoryRate: 35, spo2: 90, adultDangerZone: false }),
    );
    expect(r.dangerVitals.some((d) => d.includes("SpO"))).toBe(true);
    expect(r.acuityFloor).toBe(2);
  });

  it("the mandatory-vitals floor still applies for a child", () => {
    const r = assessEsiV5(vitals({ pulse: null, adultDangerZone: false }));
    expect(r.incompleteVitals).toBe(true);
    expect(r.acuityFloor).toBe(3);
  });

  it("adults are unaffected (default adultDangerZone true)", () => {
    expect(assessEsiV5(vitals({ pulse: 110 })).dangerVitals.length).toBeGreaterThan(0);
  });
});

describe("assessEsiV5 — determinism", () => {
  it("identical inputs → identical output", () => {
    const v = vitals({ pulse: 120, respiratoryRate: 26, spo2: 89 });
    expect(assessEsiV5(v)).toEqual(assessEsiV5(v));
  });
});

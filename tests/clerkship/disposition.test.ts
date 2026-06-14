import { describe, expect, it } from "vitest";

import { crossCheckDisposition } from "@/lib/clerkship/disposition";

/* The disposition cross-check is DECISION-SUPPORT: it derives the minimum
   disposition acuity the recorded state supports (reusing the CSO-signed NEWS2 /
   GCS / BP thresholds — no new clinical content) and flags when the clinician's
   chosen disposition is LESS acute. It never blocks; it never invents. Bias to
   over-escalation, never under. */

describe("crossCheckDisposition", () => {
  it("flags divergence when discharge is chosen but vitals mandate escalation", () => {
    // SpO2 88 → NEWS2 single-parameter 3; RR 28 → +3.
    const r = crossCheckDisposition({
      chosen: "discharge",
      vitals: { spo2: 88, rr: 28 },
      bpStandard: "who_esc",
      examEmergencies: [],
    });
    expect(r.expected).toBe("escalate");
    expect(r.diverges).toBe(true);
    expect(r.reasons.some((x) => x.includes("NEWS2"))).toBe(true);
  });

  it("does not flag when admit is chosen and the state mandates escalation", () => {
    const r = crossCheckDisposition({
      chosen: "admit",
      vitals: { spo2: 88, rr: 28 },
      bpStandard: "who_esc",
      examEmergencies: [],
    });
    expect(r.expected).toBe("escalate");
    expect(r.diverges).toBe(false);
  });

  it("treats refer and transfer as escalation-equivalent (no divergence)", () => {
    for (const chosen of ["refer", "transfer"] as const) {
      const r = crossCheckDisposition({
        chosen,
        vitals: { spo2: 88 },
        bpStandard: "who_esc",
        examEmergencies: [],
      });
      expect(r.diverges).toBe(false);
    }
  });

  it("flags observe as too low when escalation is mandated", () => {
    const r = crossCheckDisposition({
      chosen: "observe",
      vitals: { gcsE: 2, gcsV: 2, gcsM: 4 }, // GCS 8 → critical
      bpStandard: "who_esc",
      examEmergencies: [],
    });
    expect(r.expected).toBe("escalate");
    expect(r.diverges).toBe(true);
    expect(r.reasons.some((x) => x.includes("GCS"))).toBe(true);
  });

  it("expects observe (not escalate) for a mid-range NEWS2 aggregate without a single-3", () => {
    // RR 24 (+2), Temp 39.5 (+2), HR 100 (+1) → total 5, no single parameter 3.
    const r = crossCheckDisposition({
      chosen: "discharge",
      vitals: { rr: 24, tempC: 39.5, hr: 100 },
      bpStandard: "who_esc",
      examEmergencies: [],
    });
    expect(r.expected).toBe("observe");
    expect(r.diverges).toBe(true);
    // observe satisfies an observe floor
    expect(
      crossCheckDisposition({
        chosen: "observe",
        vitals: { rr: 24, tempC: 39.5, hr: 100 },
        bpStandard: "who_esc",
        examEmergencies: [],
      }).diverges,
    ).toBe(false);
  });

  it("escalates on a must-not-miss exam emergency pattern", () => {
    const r = crossCheckDisposition({
      chosen: "discharge",
      vitals: {},
      bpStandard: "who_esc",
      examEmergencies: ["Tension pneumothorax"],
    });
    expect(r.expected).toBe("escalate");
    expect(r.diverges).toBe(true);
    expect(r.reasons.some((x) => x.includes("Tension pneumothorax"))).toBe(true);
  });

  it("escalates on a high triage acuity carried into the encounter", () => {
    const r = crossCheckDisposition({
      chosen: "discharge",
      vitals: {},
      bpStandard: "who_esc",
      examEmergencies: [],
      triageAcuity: 2,
    });
    expect(r.expected).toBe("escalate");
    expect(r.diverges).toBe(true);
  });

  it("no floor and no divergence when everything is normal", () => {
    const r = crossCheckDisposition({
      chosen: "discharge",
      vitals: { spo2: 98, rr: 16, hr: 72, sbp: 118, dbp: 76, tempC: 36.8 },
      bpStandard: "who_esc",
      examEmergencies: [],
    });
    expect(r.expected).toBe("none");
    expect(r.diverges).toBe(false);
    expect(r.reasons).toEqual([]);
  });

  it("never flags a deceased disposition and never flags when none is chosen yet", () => {
    expect(
      crossCheckDisposition({
        chosen: "deceased",
        vitals: { spo2: 88 },
        bpStandard: "who_esc",
        examEmergencies: [],
      }).diverges,
    ).toBe(false);
    expect(
      crossCheckDisposition({
        chosen: null,
        vitals: { spo2: 88 },
        bpStandard: "who_esc",
        examEmergencies: [],
      }).diverges,
    ).toBe(false);
  });
});

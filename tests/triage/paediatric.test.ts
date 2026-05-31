import { describe, expect, it } from "vitest";

import { flagPaediatricVitals, resolvePaedAgeBand } from "@/lib/triage/scoring/pews";

/**
 * Paediatric age-band tests — research doc §7.
 *
 * NOTE: the research doc provides age-banded NORMAL ranges but NOT the
 * full Brighton PEWS per-point sub-rubric. So this module flags
 * out-of-range vitals against the correct age band (which is fully
 * specified) and does NOT fabricate a PEWS aggregate. Tests cover the
 * specified behaviour only.
 */

describe("resolvePaedAgeBand (§7)", () => {
  it.each([
    [0.5, "<1y (infant)"],
    [1, "1–2y"],
    [4, "2–5y"],
    [8, "6–12y"],
    [14, ">12y"],
  ])("age %s years → band %s", (age, label) => {
    expect(resolvePaedAgeBand(age)?.label).toBe(label);
  });

  it("returns null for adult age (≥18) — caller should route to NEWS2", () => {
    expect(resolvePaedAgeBand(20)).toBeNull();
  });
});

describe("flagPaediatricVitals (§7) — age-correct out-of-range detection", () => {
  it("an infant HR of 80 is flagged low (infant normal 100–160)", () => {
    // 80 would be NORMAL for an adult — proving age-routing matters.
    const flags = flagPaediatricVitals(0.5, { heartRate: 80 });
    expect(flags.find((f) => f.parameter === "heart_rate")?.status).toBe("low");
  });

  it("the same HR 80 is normal for a 4-year-old (normal 80–140)", () => {
    const flags = flagPaediatricVitals(4, { heartRate: 80 });
    expect(flags.find((f) => f.parameter === "heart_rate")?.status).toBe("normal");
  });

  it("infant RR 70 is flagged high (infant normal 30–60)", () => {
    const flags = flagPaediatricVitals(0.5, { respiratoryRate: 70 });
    expect(flags.find((f) => f.parameter === "respiratory_rate")?.status).toBe("high");
  });

  it("systolic BP below the age lower-limit is flagged (≈70+2×age)", () => {
    // 6–12y lower limit 82; SBP 78 → low.
    const flags = flagPaediatricVitals(8, { systolicBp: 78 });
    expect(flags.find((f) => f.parameter === "systolic_bp")?.status).toBe("low");
  });

  it("a missing vital is flagged as not-recorded, never assumed normal (§10)", () => {
    const flags = flagPaediatricVitals(4, { heartRate: null });
    expect(flags.find((f) => f.parameter === "heart_rate")?.status).toBe("not_recorded");
  });

  it("is deterministic", () => {
    const input = { heartRate: 80, respiratoryRate: 30, systolicBp: 90 };
    expect(flagPaediatricVitals(4, input)).toEqual(flagPaediatricVitals(4, input));
  });
});

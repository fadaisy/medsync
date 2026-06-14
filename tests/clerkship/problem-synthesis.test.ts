import type { ScoredDifferential } from "@/lib/clerkship/reasoning/types";
import type { AbnormalItem } from "@/lib/clerkship/synthesis";
import { describe, expect, it } from "vitest";

import { synthesiseProblemList } from "@/lib/clerkship/problem-synthesis";

/** Build a scored differential fixture (only the fields the synthesis reads). */
function scored(p: Partial<ScoredDifferential> & { dx: string }): ScoredDifferential {
  return {
    dx: p.dx,
    likelihood: p.likelihood ?? "likely",
    score: p.score ?? 1,
    status: p.status ?? "supported",
    matchedRuleIn: p.matchedRuleIn ?? [],
    matchedRuleOut: p.matchedRuleOut ?? [],
    supportPresent: p.supportPresent ?? [],
    supportDenied: p.supportDenied ?? [],
    refutePresent: p.refutePresent ?? [],
    riskPresent: p.riskPresent ?? [],
    supportingSymptoms: p.supportingSymptoms ?? [],
    ruleIn: p.ruleIn,
    ruleOut: p.ruleOut,
    riskFactors: p.riskFactors,
    refutingSymptoms: p.refutingSymptoms,
  };
}

const vital = (label: string): AbnormalItem => ({
  source: "vitals",
  label,
  severity: "borderline",
});

const acs = (over: Partial<ScoredDifferential> = {}) =>
  scored({
    dx: "Acute coronary syndrome / MI",
    likelihood: "must_not_miss",
    score: 3,
    matchedRuleIn: ["Crushing", "Exertional"],
    supportPresent: ["dyspnoea"],
    riskPresent: ["smoking"],
    supportingSymptoms: [
      { system: "cardiovascular", symptom: "palpitations" },
      { system: "respiratory", symptom: "dyspnoea" },
    ],
    ...over,
  });

describe("synthesiseProblemList — reasoned problems-with-evidence", () => {
  it("surfaces the leading hypothesis with its symptoms/signs/risks + the vitals it explains", () => {
    const r = synthesiseProblemList({
      scored: [acs()],
      vitals: [vital("SpO₂ 88%"), vital("BP 189/110")],
    });
    expect(r.synthesised).toHaveLength(1);
    const p = r.synthesised[0]!;
    expect(p.dx).toMatch(/Acute coronary/);
    expect(p.mustNotMiss).toBe(true);
    const byKind = (k: string) => p.evidence.filter((e) => e.kind === k).map((e) => e.label);
    expect(byKind("symptom")).toContain("Crushing");
    expect(byKind("risk")).toContain("smoking");
    expect(byKind("vital")).toEqual(expect.arrayContaining(["SpO₂ 88%", "BP 189/110"]));
    // both vitals explained → none standalone (a reasoned problem, not 4 raw lines)
    expect(r.standaloneVitals).toEqual([]);
  });

  it("leaves an abnormal vital STANDALONE when no shown hypothesis explains its system", () => {
    const r = synthesiseProblemList({
      scored: [acs()], // cardiovascular + respiratory only
      vitals: [vital("Glucose 18 mmol/L")], // endocrine → unexplained
    });
    expect(r.synthesised[0]!.evidence.some((e) => e.kind === "vital")).toBe(false);
    expect(r.standaloneVitals.map((v) => v.label)).toEqual(["Glucose 18 mmol/L"]);
  });

  it("never force-absorbs a non-specific vital (temperature stays standalone)", () => {
    const r = synthesiseProblemList({ scored: [acs()], vitals: [vital("T 39.2°C")] });
    expect(r.standaloneVitals.map((v) => v.label)).toEqual(["T 39.2°C"]);
  });

  it("returns an excluded hypothesis's vitals to standalone (nothing dropped on reject)", () => {
    const r = synthesiseProblemList({
      scored: [acs()],
      vitals: [vital("SpO₂ 88%"), vital("BP 189/110")],
      excludedTexts: new Set(["acute coronary syndrome / mi"]),
    });
    expect(r.synthesised).toEqual([]);
    expect(r.standaloneVitals.map((v) => v.label)).toEqual(["SpO₂ 88%", "BP 189/110"]);
  });

  it("does not re-surface a vital already carried as evidence in a confirmed problem", () => {
    const r = synthesiseProblemList({
      scored: [acs()],
      vitals: [vital("SpO₂ 88%"), vital("BP 189/110")],
      confirmed: [{ item: "Acute coronary syndrome / MI", evidence: ["SpO₂ 88%", "BP 189/110"] }],
    });
    // confirmed dx drops out of the proposed synthesised list...
    expect(r.synthesised).toEqual([]);
    // ...and its vitals are NOT re-proposed standalone (they live under the confirmed problem)
    expect(r.standaloneVitals).toEqual([]);
  });

  it("only synthesises SUPPORTED hypotheses; an open/lowered one is not a problem", () => {
    const r = synthesiseProblemList({
      scored: [scored({ dx: "Costochondritis", status: "open", score: 0 })],
      vitals: [],
    });
    expect(r.synthesised).toEqual([]);
  });

  it("with no supported hypothesis, every abnormal vital is standalone (the safe floor)", () => {
    const r = synthesiseProblemList({
      scored: [],
      vitals: [vital("SpO₂ 88%"), vital("HR 130")],
    });
    expect(r.synthesised).toEqual([]);
    expect(r.standaloneVitals).toHaveLength(2);
  });

  it("de-duplicates evidence and fabricates nothing on empty input", () => {
    const r = synthesiseProblemList({
      scored: [acs({ matchedRuleIn: ["Crushing", "Crushing"] })],
      vitals: [],
    });
    const symptoms = r.synthesised[0]!.evidence.filter((e) => e.kind === "symptom");
    expect(symptoms).toHaveLength(1);
    expect(synthesiseProblemList({ scored: [], vitals: [] })).toEqual({
      synthesised: [],
      standaloneVitals: [],
    });
  });

  it("absorbs a vital under the HIGHEST-scoring matching hypothesis only (no duplication)", () => {
    const r = synthesiseProblemList({
      scored: [
        acs({ dx: "ACS", score: 5 }),
        acs({ dx: "Stable angina", likelihood: "likely", score: 2 }),
      ],
      vitals: [vital("BP 189/110")],
    });
    const withVital = r.synthesised.filter((p) =>
      p.evidence.some((e) => e.kind === "vital" && e.label === "BP 189/110"),
    );
    expect(withVital).toHaveLength(1);
    expect(withVital[0]!.dx).toBe("ACS");
  });
});

import type { ScoredDifferential } from "@/lib/clerkship/reasoning/types";
import { describe, expect, it } from "vitest";

import { suggestDiagnoses } from "@/lib/clerkship/diagnosis/suggest";

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
  };
}

describe("suggestDiagnoses — borrows the reasoning engine; ranks by support", () => {
  it("re-presents scored differentials with their evidence + catalog ICD-10", () => {
    const out = suggestDiagnoses([
      scored({
        dx: "Malaria",
        score: 3,
        matchedRuleIn: ["Rigors"],
        supportPresent: ["headache"],
        riskPresent: ["endemic residence"],
      }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.dx).toBe("Malaria");
    expect(out[0]!.icd10).toBe("B54"); // joined from the catalog (verified)
    const kinds = out[0]!.evidence.map((e) => e.kind);
    expect(kinds).toEqual(expect.arrayContaining(["feature", "symptom", "risk"]));
  });

  it("floats must-not-miss to the top REGARDLESS of support (even at low/negative score)", () => {
    const out = suggestDiagnoses([
      scored({ dx: "Common cold", score: 5, status: "supported" }),
      scored({
        dx: "Pulmonary embolism",
        score: -2,
        status: "lowered",
        likelihood: "must_not_miss",
      }),
    ]);
    expect(out[0]!.dx).toBe("Pulmonary embolism");
    expect(out[0]!.mustNotMiss).toBe(true);
  });

  it("ranks non-must-not-miss by the engine's score (borrowed, not recomputed)", () => {
    const out = suggestDiagnoses([
      scored({ dx: "Low", score: 1 }),
      scored({ dx: "High", score: 4 }),
    ]);
    expect(out.map((s) => s.dx)).toEqual(["High", "Low"]);
  });

  it("includes against-evidence (ruleOut / refute) and de-duplicates", () => {
    const out = suggestDiagnoses([
      scored({
        dx: "Costochondritis",
        matchedRuleOut: ["Exertional"],
        refutePresent: ["Exertional"],
      }),
    ]);
    const against = out[0]!.evidence.filter((e) => e.kind === "against");
    expect(against).toHaveLength(1); // de-duped
    expect(against[0]!.label).toBe("Exertional");
  });

  it("leaves icd10 null for a diagnosis with no verified code (never fabricated)", () => {
    const out = suggestDiagnoses([scored({ dx: "Cerebral malaria" })]);
    expect(out[0]!.icd10).toBeNull();
  });

  it("fabricates nothing on empty input", () => {
    expect(suggestDiagnoses([])).toEqual([]);
  });
});

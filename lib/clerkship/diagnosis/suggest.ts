import type { Likelihood, ScoredDifferential } from "@/lib/clerkship/reasoning/types";

import { diagnosisByDisplay } from "@/lib/clerkship/diagnosis/catalog";

/**
 * Support-matching adapter (Assessment-as-diagnostic-logic, GATE B) — BORROWS the
 * reasoning engine; it does NOT re-implement it. The reasoning engine already
 * matches each diagnosis's catalog supports against the captured clerkship and
 * returns `ScoredDifferential[]` (score + per-hypothesis matched evidence). This
 * adapter simply RE-PRESENTS that output as ranked, evidence-backed diagnosis
 * SUGGESTIONS, joined with the diagnosis catalog's metadata (ICD-10, the
 * presentation provenance, the workup seam). So the suggestions can never diverge
 * from the reasoning rail — same substrate, one engine.
 *
 * Ranks by SUPPORT, never asserts: must-not-miss surfaces REGARDLESS of support
 * (floated to the top even at low/negative score — low support ≠ safe to drop);
 * the rest follow by the engine's own score. Decision-support only — the clinician
 * Selects / Rejects / Adds own; the diagnosis of record is the clinician's.
 */

export type EvidenceKind = "feature" | "symptom" | "risk" | "against";

export interface DiagnosisEvidence {
  label: string;
  kind: EvidenceKind;
}

export interface DiagnosisSuggestion {
  dx: string;
  /** From the catalog: a verified ICD-10 code, or null (pending CSO web-verification). */
  icd10: string | null;
  mustNotMiss: boolean;
  likelihood: Likelihood;
  /** The reasoning engine's support status + score (BORROWED — the rank). */
  status: ScoredDifferential["status"];
  score: number;
  /** The captured features supporting (and arguing against) this diagnosis — the
   *  engine's OWN matched evidence, reused verbatim. */
  evidence: DiagnosisEvidence[];
  /** The reasoning-map presentation(s) this diagnosis appears under (provenance). */
  presentations: string[];
  /** Workup seam — placeholder; the committed diagnosis feeds workup next. */
  workupRef: null;
}

/**
 * Re-present the reasoning engine's scored differential as ranked, evidence-backed
 * diagnosis suggestions. Pure. Must-not-miss first (regardless of support), then by
 * the engine's score, then alphabetical. Evidence is the engine's matched buckets
 * (ruleIn = discriminating feature, supportPresent = supporting symptom, riskPresent
 * = risk factor, ruleOut/refute = against) — nothing recomputed, nothing invented.
 */
export function suggestDiagnoses(scored: ScoredDifferential[]): DiagnosisSuggestion[] {
  const out = scored.map((s) => {
    const cat = diagnosisByDisplay(s.dx);
    const evidence: DiagnosisEvidence[] = [];
    const seen = new Set<string>();
    const add = (label: string, kind: EvidenceKind) => {
      const k = `${kind}:${label.trim().toLowerCase()}`;
      if (!label.trim() || seen.has(k)) return;
      seen.add(k);
      evidence.push({ label, kind });
    };
    s.matchedRuleIn.forEach((l) => add(l, "feature"));
    s.supportPresent.forEach((l) => add(l, "symptom"));
    s.riskPresent.forEach((l) => add(l, "risk"));
    s.matchedRuleOut.forEach((l) => add(l, "against"));
    s.refutePresent.forEach((l) => add(l, "against"));
    return {
      dx: s.dx,
      icd10: cat?.icd10 ?? null,
      mustNotMiss: s.likelihood === "must_not_miss",
      likelihood: s.likelihood,
      status: s.status,
      score: s.score,
      evidence,
      presentations: cat?.presentations ?? [],
      workupRef: null as null,
    };
  });

  return out.sort(
    (a, b) =>
      Number(b.mustNotMiss) - Number(a.mustNotMiss) ||
      b.score - a.score ||
      a.dx.localeCompare(b.dx),
  );
}

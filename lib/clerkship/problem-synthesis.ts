import type { Likelihood, ScoredDifferential } from "@/lib/clerkship/reasoning/types";
import type { AbnormalItem } from "@/lib/clerkship/synthesis";

/**
 * Problem-list SYNTHESIS (GATE A-signed model, 2026-06-14) — turns the clerkship
 * into reasoned PROBLEMS-WITH-EVIDENCE instead of a data dump of raw abnormal
 * vitals.
 *
 * The synthesised problem IS the reasoning engine's leading hypothesis — this is
 * NOT a second diagnosis-engine. It reuses each supported `ScoredDifferential`'s
 * own evidence buckets (matchedRuleIn = symptoms, supportPresent = signs,
 * riskPresent = risk factors) verbatim, and surfaces it as a PROPOSED problem the
 * clinician confirms/edits/rejects. The diagnosis of record is always the
 * clinician's; wording stays an honest hypothesis ("likely … (working)").
 *
 * The reasoning engine is vitals-blind, so abnormal vitals are absorbed
 * CONSERVATIVELY (CSO-signed Q1): a vital joins a synthesised problem as evidence
 * ONLY when its body system matches one the hypothesis already draws support from
 * (the differential's `supportingSymptoms` systems). The match is coarse,
 * clinician-confirmable, and biased to leaving the vital STANDALONE. No abnormal
 * vital is ever dropped: it is either nested under a shown synthesised problem, or
 * carried as evidence in an already-confirmed problem, or surfaced standalone.
 */

export type EvidenceKind = "symptom" | "sign" | "risk" | "vital";

export interface ProblemEvidence {
  label: string;
  kind: EvidenceKind;
}

export interface SynthesisedProblem {
  /** The reasoning engine's hypothesis (the diagnosis text, unhedged). */
  dx: string;
  likelihood: Likelihood;
  status: ScoredDifferential["status"];
  mustNotMiss: boolean;
  /** Supporting evidence, in clinical order: symptoms → signs → risks → vitals. */
  evidence: ProblemEvidence[];
}

export interface SynthesiseInput {
  /** The reasoning engine's scored differential (the SOLE source of hypotheses). */
  scored: ScoredDifferential[];
  /** Abnormal vitals (the `source === "vitals"` items from the assembly). */
  vitals: AbnormalItem[];
  /** Lowercased dx texts already excluded ("considered & excluded"). */
  excludedTexts?: Set<string>;
  /** Already-confirmed problems (their dx + the evidence labels they carry). */
  confirmed?: { item: string; evidence?: string[] }[];
}

export interface SynthesisResult {
  /** Leading hypotheses surfaced as proposed problems-with-evidence. */
  synthesised: SynthesisedProblem[];
  /** Abnormal vitals not absorbed anywhere — standalone "unexplained" problems. */
  standaloneVitals: AbnormalItem[];
}

/** The CONSERVATIVE vital→body-system map (the only new reference data; the
 *  differential's systems come from the CSO-signed reasoning maps). Temperature
 *  is deliberately left unmapped — fever is non-specific, so it stays standalone
 *  rather than being force-absorbed into an unrelated hypothesis. */
function vitalSystemOf(label: string): string | null {
  if (/^SpO₂|^RR\b/.test(label)) return "respiratory";
  if (/^HR\b|^BP\b/.test(label)) return "cardiovascular";
  if (/^Glucose\b/.test(label)) return "endocrine";
  if (/^GCS\b/.test(label)) return "neurological";
  return null;
}

/** The body systems a hypothesis draws support from (from its cross-system
 *  supporting symptoms — CSO-signed map data, not a free-text classifier). */
function dxSystemsOf(s: ScoredDifferential): Set<string> {
  return new Set((s.supportingSymptoms ?? []).map((c) => c.system));
}

const norm = (x: string) => x.trim().toLowerCase();

/**
 * Synthesise the proposed problem list. Pure. Surfaces the supported leading
 * hypotheses (minus any already excluded or confirmed) as problems-with-evidence,
 * conservatively absorbing the abnormal vitals each one plausibly explains, and
 * leaves every other abnormal vital standalone. Never fabricates: with no
 * supported hypothesis, `synthesised` is empty and every abnormal vital is
 * standalone (the safe floor).
 */
export function synthesiseProblemList(input: SynthesiseInput): SynthesisResult {
  const excluded = input.excludedTexts ?? new Set<string>();
  const confirmed = input.confirmed ?? [];
  const confirmedDx = new Set(confirmed.map((c) => norm(c.item)));
  const confirmedEvidence = new Set(confirmed.flatMap((c) => (c.evidence ?? []).map(norm)));

  // The leading hypotheses still in play (supported, not yet excluded/confirmed).
  const shown = input.scored.filter(
    (s) => s.status === "supported" && !excluded.has(norm(s.dx)) && !confirmedDx.has(norm(s.dx)),
  );

  // Conservative vital absorption: each abnormal vital joins the highest-scoring
  // shown hypothesis whose systems include the vital's system. Default standalone.
  const absorbed = new Map<string, AbnormalItem[]>(); // dx → vitals
  const absorbedLabels = new Set<string>();
  for (const v of input.vitals) {
    const sys = vitalSystemOf(v.label);
    if (!sys) continue; // unmapped vital → standalone
    const home = shown.find((s) => dxSystemsOf(s).has(sys)); // shown is score-ordered
    if (!home) continue;
    const list = absorbed.get(home.dx) ?? [];
    list.push(v);
    absorbed.set(home.dx, list);
    absorbedLabels.add(norm(v.label));
  }

  const synthesised: SynthesisedProblem[] = shown.map((s) => {
    const evidence: ProblemEvidence[] = [];
    const seen = new Set<string>();
    const add = (label: string, kind: EvidenceKind) => {
      const k = norm(label);
      if (!k || seen.has(k)) return;
      seen.add(k);
      evidence.push({ label, kind });
    };
    s.matchedRuleIn.forEach((l) => add(l, "symptom"));
    s.supportPresent.forEach((l) => add(l, "sign"));
    s.riskPresent.forEach((l) => add(l, "risk"));
    (absorbed.get(s.dx) ?? []).forEach((v) => add(v.label, "vital"));
    return {
      dx: s.dx,
      likelihood: s.likelihood,
      status: s.status,
      mustNotMiss: s.likelihood === "must_not_miss",
      evidence,
    };
  });

  // A vital is standalone unless it is absorbed under a shown problem OR already
  // carried as evidence in a confirmed problem — so nothing is ever dropped.
  const standaloneVitals = input.vitals.filter(
    (v) => !absorbedLabels.has(norm(v.label)) && !confirmedEvidence.has(norm(v.label)),
  );

  return { synthesised, standaloneVitals };
}

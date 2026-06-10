/**
 * Clinical Reasoning Engine — PURE. Merges the CSO-signed reasoning maps that
 * fire for the captured presenting complaint(s) into a single, ALWAYS-PLURAL
 * differential + the hypothesis-driven prompts. It is structurally incapable of
 * returning one answer, the must-not-miss is always surfaced, and it NEVER
 * concludes/auto-fills — every output is a suggestion the clinician leads.
 * Decision-support, not autonomous. See ADR 0065.
 */

import type {
  CapturedContext,
  DifferentialItem,
  Likelihood,
  LiveReasoning,
  ReasoningMap,
  ReasoningResult,
  ScoredDifferential,
} from "@/lib/clerkship/reasoning/types";

const SEVERITY: Record<Likelihood, number> = { must_not_miss: 2, likely: 1, less_likely: 0 };
const ORDER: Record<Likelihood, number> = { likely: 0, less_likely: 1, must_not_miss: 2 };

const uniq = (xs: string[]) => Array.from(new Set(xs.map((x) => x.trim()).filter(Boolean)));

/** The reflective diagnostic time-out (run at synthesis) — counters premature closure. */
export function diagnosticPausePrompts(): string[] {
  return [
    "What else could this be? (broaden the differential)",
    "What doesn't fit my leading thought?",
    "What must not be missed here — have I actively excluded it?",
    "Have I re-checked the red flags?",
    "Is this a new problem, or am I anchoring on a known diagnosis?",
  ];
}

/** Maps whose trigger codes intersect the captured presenting-complaint codes. */
export function mapsForCodes(maps: ReasoningMap[], pcCodes: string[]): ReasoningMap[] {
  const codes = new Set(pcCodes);
  return maps.filter((m) => m.triggerCodes.some((c) => codes.has(c)));
}

/**
 * Merge the fired maps into one plural reasoning result. Differential is deduped
 * by dx (keeping the MOST cautious likelihood — a dx flagged must-not-miss
 * anywhere stays must-not-miss). knownDiseaseTraps fire when a captured PMH
 * condition matches a candidate (the "is this different from usual?" safeguard).
 */
export function mergeReasoning(
  maps: ReasoningMap[],
  context: { pmhConditions?: string[] } = {},
): ReasoningResult {
  const byDx = new Map<string, DifferentialItem>();
  for (const m of maps) {
    for (const d of m.differential) {
      const key = d.dx.trim().toLowerCase();
      const prev = byDx.get(key);
      if (!prev) {
        byDx.set(key, { ...d, ruleIn: uniq(d.ruleIn ?? []), ruleOut: uniq(d.ruleOut ?? []) });
      } else {
        byDx.set(key, {
          dx: prev.dx,
          likelihood:
            SEVERITY[d.likelihood] > SEVERITY[prev.likelihood] ? d.likelihood : prev.likelihood,
          ruleIn: uniq([...(prev.ruleIn ?? []), ...(d.ruleIn ?? [])]),
          ruleOut: uniq([...(prev.ruleOut ?? []), ...(d.ruleOut ?? [])]),
        });
      }
    }
  }
  const differential = Array.from(byDx.values()).sort(
    (a, b) => ORDER[a.likelihood] - ORDER[b.likelihood] || a.dx.localeCompare(b.dx),
  );

  // Exacerbation-of-known-disease trap: a captured PMH condition that matches a
  // candidate → prompt to confirm this isn't anchoring on the known problem.
  const pmh = (context.pmhConditions ?? []).map((c) => c.trim().toLowerCase()).filter(Boolean);
  const knownDiseaseTraps = differential
    .filter((d) =>
      pmh.some((c) => c && (d.dx.toLowerCase().includes(c) || c.includes(d.dx.toLowerCase()))),
    )
    .map(
      (d) =>
        `Known ${d.dx}: is this presentation different from usual? Have you excluded a new cause?`,
    );

  return {
    basis: maps.map((m) => m.display),
    problemRepr: uniq(maps.map((m) => m.problemReprHint ?? "")),
    differential,
    discriminatingHpc: uniq(maps.flatMap((m) => m.discriminatingHpc)),
    associated: uniq(maps.flatMap((m) => m.associated)),
    redFlags: uniq(maps.flatMap((m) => m.redFlags)),
    examTargets: dedupeTargets(maps.flatMap((m) => m.examTargets)),
    historyEmphasis: uniq(maps.flatMap((m) => m.historyEmphasis)),
    combinations: maps.flatMap((m) => m.combinations),
    knownDiseaseTraps,
  };
}

function dedupeTargets(targets: ReasoningResult["examTargets"]): ReasoningResult["examTargets"] {
  const seen = new Set<string>();
  const out: ReasoningResult["examTargets"] = [];
  for (const t of targets) {
    const k = `${t.area}|${t.sign}`.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

/** Convenience: reasoning for captured PC codes (empty result if nothing fires). */
export function reasoningForCodes(
  maps: ReasoningMap[],
  pcCodes: string[],
  context: { pmhConditions?: string[] } = {},
): ReasoningResult {
  return mergeReasoning(mapsForCodes(maps, pcCodes), context);
}

/* ── Live re-weighting ─────────────────────────────────────────────────────
 * As the clinician taps symptom properties / ROS / history, the differential
 * re-ranks: rule-in features RAISE a candidate, rule-out features LOWER it. This
 * narrows the differential WITHOUT ever dropping a must-not-miss (it stays shown,
 * just re-ranked) and without ever concluding. Keyword matching on content words
 * — deterministic + transparent (we show which features matched). */

const STOP = new Set([
  "pain",
  "with",
  "this",
  "that",
  "from",
  "none",
  "onset",
  "your",
  "have",
  "associated",
  "symptoms",
  "features",
  "risk",
  "factors",
  "vs",
  "and",
  "the",
]);

/** Content words (≥4 chars, not a stopword) for keyword matching. */
function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z]+/g) ?? []).filter((w) => w.length >= 4 && !STOP.has(w));
}

function featureSet(strings: string[]): Set<string> {
  const set = new Set<string>();
  for (const s of strings) for (const w of tokens(s)) set.add(w);
  return set;
}

/** A clinical phrase "matches" the captured set if it shares a content word. */
function phraseHits(phrase: string, set: Set<string>): boolean {
  return tokens(phrase).some((w) => set.has(w));
}

/**
 * Live reasoning: merge the fired maps, then re-weight each candidate by the
 * captured features. Always plural; must-not-miss never dropped; transparent
 * (matchedRuleIn/Out). Also computes what's still worth asking + risk factors.
 */
export function scoreReasoning(maps: ReasoningMap[], ctx: CapturedContext): LiveReasoning {
  const merged = mergeReasoning(maps, { pmhConditions: ctx.history });
  const captured = featureSet([...ctx.features, ...ctx.positives]);
  const refuted = featureSet(ctx.negatives);

  const posSet = featureSet(ctx.positives);
  const negSet = featureSet(ctx.negatives);
  const histSet = featureSet(ctx.history);
  const refLabel = (c: { system: string; symptom: string }) => c.symptom;

  const scored: ScoredDifferential[] = merged.differential
    .map((d) => {
      const matchedRuleIn = (d.ruleIn ?? []).filter((f) => phraseHits(f, captured));
      // a rule-OUT counts when its feature was POSITIVELY captured (present), or
      // when a rule-IN feature was explicitly denied (negative).
      const matchedRuleOut = [
        ...(d.ruleOut ?? []).filter((f) => phraseHits(f, captured)),
        ...(d.ruleIn ?? []).filter((f) => phraseHits(f, refuted)),
      ];
      // Cross-system: a supporting symptom recorded PRESENT confirms; recorded
      // DENIED argues against; a refuting symptom present argues against.
      const supportPresent = (d.supportingSymptoms ?? [])
        .filter((c) => phraseHits(c.symptom, posSet))
        .map(refLabel);
      const supportDenied = (d.supportingSymptoms ?? [])
        .filter((c) => phraseHits(c.symptom, negSet))
        .map(refLabel);
      const refutePresent = (d.refutingSymptoms ?? [])
        .filter((c) => phraseHits(c.symptom, posSet))
        .map(refLabel);
      const riskPresent = (d.riskFactors ?? []).filter((f) => phraseHits(f, histSet));

      const score =
        matchedRuleIn.length +
        supportPresent.length +
        riskPresent.length -
        matchedRuleOut.length -
        supportDenied.length -
        refutePresent.length;
      const status: ScoredDifferential["status"] =
        score > 0 ? "supported" : score < 0 ? "lowered" : "open";
      return {
        ...d,
        score,
        status,
        matchedRuleIn,
        matchedRuleOut: Array.from(new Set(matchedRuleOut)),
        supportPresent: Array.from(new Set(supportPresent)),
        supportDenied: Array.from(new Set(supportDenied)),
        refutePresent: Array.from(new Set(refutePresent)),
        riskPresent,
      };
    })
    // most-cautious first within score: must-not-miss outranks ties, then score.
    .sort((a, b) => {
      const mnm = (x: ScoredDifferential) => (x.likelihood === "must_not_miss" ? 1 : 0);
      return b.score - a.score || mnm(b) - mnm(a) || a.dx.localeCompare(b.dx);
    });

  // Discriminators / associated not yet addressed (present or denied).
  const addressed = featureSet([...ctx.features, ...ctx.positives, ...ctx.negatives]);
  const toAsk = [...merged.discriminatingHpc, ...merged.associated].filter(
    (f) => !phraseHits(f, addressed),
  );

  // Risk factors: history-emphasis items present in the captured history vs. to-check.
  const hist = featureSet(ctx.history);
  const riskFactorsPresent = merged.historyEmphasis.filter((f) => phraseHits(f, hist));
  const riskFactorsToCheck = merged.historyEmphasis.filter((f) => !phraseHits(f, hist));

  return {
    basis: merged.basis,
    scored,
    redFlags: merged.redFlags,
    toAsk: Array.from(new Set(toAsk)),
    examTargets: merged.examTargets,
    riskFactorsPresent,
    riskFactorsToCheck,
    knownDiseaseTraps: merged.knownDiseaseTraps,
    combinations: merged.combinations,
  };
}

/** Live reasoning straight from captured PC codes + context. */
export function liveReasoningForCodes(
  maps: ReasoningMap[],
  pcCodes: string[],
  ctx: CapturedContext,
): LiveReasoning {
  return scoreReasoning(mapsForCodes(maps, pcCodes), ctx);
}

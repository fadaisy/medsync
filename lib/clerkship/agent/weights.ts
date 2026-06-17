import type {
  AgeBand,
  Contribution,
  Demographics,
  DxTier,
  FeatureIndex,
  MapDifferential,
  ReasoningMap,
} from "@/lib/clerkship/agent/types";

import { featurePresent } from "@/lib/clerkship/agent/aliases";
import { normalizeFeature } from "@/lib/clerkship/agent/normalize";

/**
 * Weighted differential scoring — pure, client-safe. The clinical assertions live
 * in the CSO-approved maps (and sourced per-complaint weight files); this module
 * only turns them into a comparable score + the contributions that explain it.
 * Decision-support, never autonomous. No fabricated age priors (bootstrap leaves
 * age/sex neutral until a complaint is sourced).
 */

/** Bootstrap constants — calibration, NOT clinical content. Tuned in validation. */
export const BOOTSTRAP = {
  base: { likely: 2, less_likely: 1, must_not_miss: 1 } as Record<string, number>,
  ruleIn: 3,
  supporting: 1,
  ruleOut: -3,
  refuting: -1,
  risk: 1,
};

/** Tier thresholds — calibration constants, tuned in validation. */
export const TIERS = { LEADING: 5, CONSIDER: 2, FLOOR: 0 };

/** Shared-dx reinforcement: a dx fitting ≥2 active complaints is boosted once. */
export const REINFORCE = 2;

export interface DerivedWeights {
  basePrior: number;
  agePrior: AgeBand[];
  sexPrior: Record<string, number>;
  featureWeights: Record<string, number>;
  riskWeights: Record<string, number>;
}

/** Per category, an explicit sourced field fully replaces its derived counterpart. */
export function deriveWeights(d: MapDifferential): DerivedWeights {
  const basePrior = d.basePrior ?? BOOTSTRAP.base[d.likelihood] ?? 1;
  const agePrior = d.agePrior ?? [];
  const sexPrior = (d.sexPrior as Record<string, number> | undefined) ?? {};

  let featureWeights: Record<string, number>;
  if (d.featureWeights) {
    featureWeights = d.featureWeights;
  } else {
    featureWeights = {};
    for (const f of d.ruleIn) featureWeights[f] = BOOTSTRAP.ruleIn;
    for (const s of d.supportingSymptoms) featureWeights[s.symptom] = BOOTSTRAP.supporting;
    for (const f of d.ruleOut) featureWeights[f] = BOOTSTRAP.ruleOut;
    for (const s of d.refutingSymptoms) featureWeights[s.symptom] = BOOTSTRAP.refuting;
  }

  let riskWeights: Record<string, number>;
  if (d.riskWeights) {
    riskWeights = d.riskWeights;
  } else {
    riskWeights = {};
    for (const r of d.riskFactors) riskWeights[r] = BOOTSTRAP.risk;
  }

  return { basePrior, agePrior, sexPrior, featureWeights, riskWeights };
}

export interface ScoredDifferential {
  score: number;
  contributions: Contribution[];
}

const clean = (s: string) => s.replace(/[«»]/g, "");

export function scoreDifferential(
  d: MapDifferential,
  idx: FeatureIndex,
  demo: Demographics | undefined,
): ScoredDifferential {
  const w = deriveWeights(d);
  const contributions: Contribution[] = [];
  let score = w.basePrior;
  contributions.push({ source: "base", label: "baseline", delta: w.basePrior });

  if (demo?.ageYears != null && w.agePrior.length) {
    let ageDelta = 0;
    for (const b of w.agePrior) {
      const minOk = b.minAge == null || demo.ageYears >= b.minAge;
      const maxOk = b.maxAge == null || demo.ageYears <= b.maxAge;
      if (minOk && maxOk) ageDelta += b.delta;
    }
    if (ageDelta !== 0) {
      score += ageDelta;
      contributions.push({ source: "age", label: `age ${demo.ageYears}`, delta: ageDelta });
    }
  }

  if (demo?.sex && w.sexPrior[demo.sex]) {
    const delta = w.sexPrior[demo.sex]!;
    score += delta;
    contributions.push({ source: "sex", label: demo.sex, delta });
  }

  for (const [token, weight] of Object.entries(w.featureWeights)) {
    if (featurePresent(idx, token)) {
      score += weight;
      contributions.push({ source: "feature", label: clean(token), delta: weight });
    }
  }
  for (const [token, weight] of Object.entries(w.riskWeights)) {
    if (featurePresent(idx, token)) {
      score += weight;
      contributions.push({ source: "risk", label: clean(token), delta: weight });
    }
  }

  return { score, contributions };
}

export function tierOf(score: number): DxTier {
  if (score >= TIERS.LEADING) return "leading";
  if (score >= TIERS.CONSIDER) return "consider";
  if (score >= TIERS.FLOOR) return "less_likely";
  return "ruled_down";
}

/** A sourced weight entry for one differential (all weight fields optional). */
export interface DdxWeightEntry {
  dxCode?: string;
  dx?: string;
  basePrior?: number;
  agePrior?: AgeBand[];
  sexPrior?: Record<string, number>;
  featureWeights?: Record<string, number>;
  riskWeights?: Record<string, number>;
  confidence?: string;
  needsCsoInput?: boolean;
  weightCitation?: string;
}
/** One sourced file: a complaint code + its differential weight entries. */
export interface DdxWeightFile {
  complaint: string;
  weights: DdxWeightEntry[];
}

const WEIGHT_KEYS: (keyof DdxWeightEntry)[] = [
  "dxCode",
  "basePrior",
  "agePrior",
  "sexPrior",
  "featureWeights",
  "riskWeights",
  "confidence",
  "needsCsoInput",
  "weightCitation",
];

/** Merge sourced weight files onto the maps (pure; identity by dxCode, else name). */
export function mergeDdxWeights(maps: ReasoningMap[], files: DdxWeightFile[]): ReasoningMap[] {
  if (!files.length) return maps;
  const byComplaint = new Map<string, DdxWeightEntry[]>();
  for (const f of files) byComplaint.set(f.complaint, f.weights);

  return maps.map((m) => {
    const entries = byComplaint.get(m.code);
    if (!entries) return m;
    const differential = m.differential.map((d) => {
      const match = entries.find((e) =>
        e.dxCode && d.dxCode
          ? e.dxCode === d.dxCode
          : normalizeFeature(e.dx ?? "") === normalizeFeature(d.dx),
      );
      if (!match) return d;
      const patch: Record<string, unknown> = {};
      for (const k of WEIGHT_KEYS) if (match[k] !== undefined) patch[k] = match[k];
      return { ...d, ...patch };
    });
    return { ...m, differential };
  });
}

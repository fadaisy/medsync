import type {
  AgeBand,
  Contribution,
  Demographics,
  DxTier,
  FeatureIndex,
  MapDifferential,
  PinWhen,
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

/** Is a conditional must-not-miss's pin gate satisfied? No gate (or empty) → always
 * pins (the default). Otherwise pins only when a listed risk/feature is present. */
export function pinSatisfied(pinWhen: PinWhen | undefined, idx: FeatureIndex): boolean {
  if (!pinWhen) return true;
  const toks = [...(pinWhen.riskAny ?? []), ...(pinWhen.featureAny ?? [])];
  return toks.length === 0 ? true : toks.some((t) => featurePresent(idx, t));
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
  pinWhen?: PinWhen; // conditional must-not-miss gate (overlay or new dx)
  // Core fields for an APPENDED new differential (omit for pure weight overlays):
  likelihood?: string; // "must_not_miss" | "likely" | "less_likely"
  ruleIn?: string[];
  ruleOut?: string[];
  supportingSymptoms?: string[];
  refutingSymptoms?: string[];
  riskFactors?: string[];
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
  "pinWhen",
];

function entryMatchesDifferential(e: DdxWeightEntry, d: MapDifferential): boolean {
  return e.dxCode && d.dxCode
    ? e.dxCode === d.dxCode
    : normalizeFeature(e.dx ?? "") === normalizeFeature(d.dx);
}

/** Build a full MapDifferential from a sourced entry that introduces a NEW dx. */
function toDifferential(e: DdxWeightEntry): MapDifferential {
  const patch: Record<string, unknown> = {};
  for (const k of WEIGHT_KEYS)
    if ((e as Record<string, unknown>)[k] !== undefined)
      patch[k] = (e as Record<string, unknown>)[k];
  return {
    dx: e.dx ?? "",
    likelihood: e.likelihood ?? "less_likely",
    ruleIn: e.ruleIn ?? [],
    ruleOut: e.ruleOut ?? [],
    supportingSymptoms: (e.supportingSymptoms ?? []).map((s) => ({ system: "", symptom: s })),
    refutingSymptoms: (e.refutingSymptoms ?? []).map((s) => ({ system: "", symptom: s })),
    riskFactors: e.riskFactors ?? [],
    ...patch,
  } as MapDifferential;
}

/** Merge sourced weight files onto the maps (pure; identity by dxCode, else name).
 *  Also appends entries whose dx matches no existing differential (new dx for ranked mode). */
export function mergeDdxWeights(maps: ReasoningMap[], files: DdxWeightFile[]): ReasoningMap[] {
  if (!files.length) return maps;
  const byComplaint = new Map<string, DdxWeightEntry[]>();
  for (const f of files) byComplaint.set(f.complaint, f.weights);

  return maps.map((m) => {
    const entries = byComplaint.get(m.code);
    if (!entries) return m;
    const overlaid = m.differential.map((d) => {
      const match = entries.find((e) => entryMatchesDifferential(e, d));
      if (!match) return d;
      const patch: Record<string, unknown> = {};
      for (const k of WEIGHT_KEYS)
        if ((match as Record<string, unknown>)[k] !== undefined)
          patch[k] = (match as Record<string, unknown>)[k];
      return { ...d, ...patch };
    });
    const appended = entries
      .filter((e) => e.dx && !m.differential.some((d) => entryMatchesDifferential(e, d)))
      .map(toDifferential);
    return { ...m, differential: [...overlaid, ...appended] };
  });
}

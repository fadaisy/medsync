/**
 * Clinical Reasoning Engine — types. The engine is a differential-BROADENING,
 * must-not-miss-SURFACING, hypothesis-driven-inquiry support — NOT a
 * diagnosis-giver. It is structurally incapable of returning a single answer:
 * every result is a plural differential that always includes the must-not-miss.
 * Decision-support, not autonomous. CSO-signed reasoning maps. See ADR 0065.
 */

/** Qualitative likelihood ONLY — never false-precision probabilities. */
export type Likelihood = "likely" | "less_likely" | "must_not_miss";

export interface DifferentialItem {
  dx: string;
  likelihood: Likelihood;
  /** Features that point toward this candidate (rule-in). */
  ruleIn?: string[];
  /** Pertinent negatives / features that lower or exclude it (rule-out). */
  ruleOut?: string[];
}

/** A hypothesis-driven examination target (system/area + the sign + what it discriminates). */
export interface ExamTarget {
  area: string;
  sign: string;
  discriminates?: string;
}

/** A high-value symptom combination → what it may indicate + the action (never a verdict). */
export interface CombinationCue {
  features: string[];
  suggests: string;
  action: string;
}

/** A CSO-signed reasoning map for one presenting complaint (code reference data). */
export interface ReasoningMap {
  /** Stable map code. */
  code: string;
  display: string;
  /** Symptom-catalog codes that trigger this map (PC may be multi-system). */
  triggerCodes: string[];
  /** How to frame the problem representation (the reasoning pivot). */
  problemReprHint?: string;
  /** Plural differential — likely + must-not-miss. NEVER a single answer. */
  differential: DifferentialItem[];
  /** Discriminating HPC features to capture (hypothesis-driven inquiry). */
  discriminatingHpc: string[];
  /** Associated symptoms to actively rule in/out (+ pertinent negatives). */
  associated: string[];
  /** Red-flag features mandating escalation — surfaced AND re-evaluated. */
  redFlags: string[];
  /** Hypothesis-driven examination targets. */
  examTargets: ExamTarget[];
  /** PMH/DH/FH/SH that shift the pre-test probability. */
  historyEmphasis: string[];
  /** High-value combinations (the "smart" cluster layer). */
  combinations: CombinationCue[];
  source?: string;
}

/** What the clinician has captured so far — drives live re-weighting (pure input). */
export interface CapturedContext {
  /** HPC tap values + symptom displays (e.g. "crushing", "radiation to arm"). */
  features: string[];
  /** ROS / associated symptoms recorded present. */
  positives: string[];
  /** ROS / associated symptoms explicitly denied. */
  negatives: string[];
  /** PMH conditions + FH positives + social tokens (risk-factor matching). */
  history: string[];
}

/** A differential candidate re-weighted by the captured features. */
export interface ScoredDifferential extends DifferentialItem {
  /** +rule-in hits − rule-out hits from the captured features. */
  score: number;
  status: "supported" | "lowered" | "open";
  matchedRuleIn: string[];
  matchedRuleOut: string[];
}

/** Live reasoning — the differential re-ranked + what to do next + risk factors. */
export interface LiveReasoning {
  basis: string[];
  scored: ScoredDifferential[];
  redFlags: string[];
  /** Discriminators / associated symptoms not yet addressed — ask/examine next. */
  toAsk: string[];
  examTargets: ExamTarget[];
  /** Risk factors from history present vs. worth checking. */
  riskFactorsPresent: string[];
  riskFactorsToCheck: string[];
  knownDiseaseTraps: string[];
  combinations: CombinationCue[];
}

/** The merged reasoning surfaced to the clinician (always plural; suggestion only). */
export interface ReasoningResult {
  /** Maps that fired (by display) — transparency: shown so the clinician sees why. */
  basis: string[];
  problemRepr: string[];
  differential: DifferentialItem[];
  discriminatingHpc: string[];
  associated: string[];
  redFlags: string[];
  examTargets: ExamTarget[];
  historyEmphasis: string[];
  combinations: CombinationCue[];
  /** "Exacerbation-of-known-disease" trap — fired when a captured PMH condition
   * matches a differential candidate (prompt: is this different from usual?). */
  knownDiseaseTraps: string[];
}

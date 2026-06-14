/**
 * Clinical Suggestions — types. The suggestion layer turns what the tool already
 * knows (presenting complaint → live differential, triage, vitals, exam patterns)
 * into OPTIONAL, SOURCED, tap-to-accept suggestions. Decision-support, never
 * autonomous; pre-fills nothing. Every clinical assertion is a CITED constant
 * (fetched from a current primary source + version-stamped + CSO-signed at build,
 * NEVER from memory). Doses live ONLY in the prescribing engine — this layer
 * carries agents/classes + investigations, never a dose. See ADR + the kickoff.
 */

/** Resource-variability honesty: essential/first-line vs context-dependent. */
export type UgandaTier = "core" | "context";

export type SuggestionConfidence = "high" | "medium" | "needs_cso_input";

/** The provenance every clinical assertion carries — so staleness is visible. */
export interface EvidenceSource {
  /** Issuing body + guideline name, e.g. "ESC Acute Coronary Syndromes". */
  guideline: string;
  /** The version/year shown on the fetched source, e.g. "2023". */
  version: string;
  /** The specific recommendation the assertion came from. */
  recommendation: string;
  /** The exact page/PDF URL fetched at build. */
  url: string;
  /** Retrieval date (ISO) — drives the re-verification cadence. */
  retrieved: string;
}

export interface InvestigationSuggestion {
  /** The investigation, e.g. "12-lead ECG". */
  test: string;
  /** LOINC code where confidently known. */
  loinc?: string;
  /** Short clinical reason. */
  rationale: string;
  ugandaTier: UgandaTier;
  /** Rules out a time-critical must-not-miss → surfaced even at low probability. */
  mustNotMiss: boolean;
  confidence: SuggestionConfidence;
  source: EvidenceSource;
}

/** A CSO-signed investigation set for one presenting complaint (cited reference data). */
export interface InvestigationSet {
  /** Symptom-catalog / reasoning-map PC code that triggers this set. */
  pcCode: string;
  presentation: string;
  tests: InvestigationSuggestion[];
}

/** A suggestion surfaced to the clinician, with which presentation(s) triggered it. */
export interface SuggestedInvestigation extends InvestigationSuggestion {
  /** The presentation(s) that drove this suggestion (the "why"). */
  why: string[];
}

/* ── Management pathways (Plan GATE C) ─────────────────────────────────────────
   Ordered, CITED management STEPS for an emergency presentation — decision-support
   that complements the investigation suggestions. Drug steps name the AGENT/CLASS
   ONLY and hand off to the prescribing safety engine; NO dose ever lives here (a
   unit test rejects dose tokens). Each step carries its source so staleness is
   visible. Gated dark behind MANAGEMENT_PATHWAYS_CSO_SIGNED until the CSO ratifies
   the tranche (many steps carry Uganda-calibration questions). */

export interface ManagementStep {
  /** The management action (e.g. "Blood cultures before antimicrobials"). */
  step: string;
  /** Short clinical detail / timing / rationale. */
  detail: string;
  /** True for a drug step — then `agentClass` names the agent/class (NO dose). */
  isDrug: boolean;
  /** Agent/class for a drug step; the dose is the prescribing engine's job. */
  agentClass?: string;
  /** A time-critical, do-not-miss step (surfaced first). */
  mustNotMiss: boolean;
  confidence: SuggestionConfidence;
  source: EvidenceSource;
}

/** A CSO-signed management pathway for one emergency presentation. */
export interface ManagementPathway {
  /** Reasoning-map PC codes that trigger this pathway. */
  pcCodes: string[];
  /** The condition the pathway manages (e.g. "Sepsis / septic shock (adult)"). */
  condition: string;
  /** Ordered management steps. */
  steps: ManagementStep[];
  /** Patient-facing return-advice lines (the safety-netting templates). */
  safetyNetting: string[];
  /** The FEAST paediatric-fluid guardrail, where fluids-in-children apply. */
  feastGuardrail?: string;
}

/** A pathway surfaced to the clinician (with the PC code(s) that triggered it). */
export interface SuggestedManagementPathway extends ManagementPathway {
  /** The presentation PC code(s) that drove this pathway (the "why"). */
  why: string[];
}

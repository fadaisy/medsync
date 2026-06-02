import type { EmergencyDrug } from "@/lib/prescribing/reference/emergency-drug-catalog";

import {
  drugsForRecommendation,
  variantsOf,
} from "@/lib/prescribing/reference/emergency-drug-catalog";

/**
 * Smart-prescribing engine (GATE B) — PURE + deterministic. Resolves a
 * clinical recommendation into ready-to-confirm prescription option(s) and
 * runs the prescribe-time safety checks. DECISION-SUPPORT: it surfaces flags;
 * the clinician reviews → adjusts → confirms. A `block` flag can still be
 * overridden in a time-critical resus, but the override + reason are recorded
 * (see the server action). The engine never auto-administers and never doses
 * a child from an adult flat number.
 */

/** A paediatric patient is < 16 years (engine routing threshold). */
export const PAEDIATRIC_AGE_THRESHOLD = 16;

export interface PrescribePatient {
  ageYears: number | null;
  weightKg: number | null;
  /** Free-text allergy substances (matched case-insensitively). */
  allergies: string[];
  /** Active conditions/context flags (e.g. "asthma") for contraindications. */
  conditions: string[];
}

export interface PriorAdministration {
  drugKey: string;
  amountMg?: number;
}

/** Significant tokens for condition/contraindication matching (drops adjectives
 *  + short words so "severe asthma" doesn't spuriously match "Severe AV block"). */
const MATCH_STOPWORDS = new Set([
  "severe",
  "acute",
  "chronic",
  "mild",
  "moderate",
  "without",
  "with",
  "risk",
  "context",
  "known",
  "suspected",
  "other",
  "degree",
]);
function sigTokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 4 && !MATCH_STOPWORDS.has(t)),
  );
}

export type SafetySeverity = "block" | "warn" | "info";
export type SafetyCode =
  | "allergy"
  | "concentration"
  | "weight_missing"
  | "paediatric_routing"
  | "max_cumulative"
  | "contraindication"
  | "controlled";

export interface SafetyFlag {
  code: SafetyCode;
  severity: SafetySeverity;
  message: string;
  /** A block can be overridden-with-reason in an emergency (and recorded). */
  overrideable: boolean;
}

export interface SafetyCheckInput {
  drug: EmergencyDrug;
  patient: PrescribePatient;
  priorAdministrations: PriorAdministration[];
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * The six prescribe-time safety checks (catalog §3 of the kickoff), each a
 * decision-support flag. Ordered most-severe-first for display.
 */
export function runSafetyChecks(input: SafetyCheckInput): SafetyFlag[] {
  const { drug, patient, priorAdministrations } = input;
  const flags: SafetyFlag[] = [];

  // ── 1. Allergy (hard block on a match) — name/brand/key/class, NOT the
  //    free-text indications (which would over-fire on prose like "shock"). ──
  const haystack = [drug.name, drug.brand, drug.drugKey, drug.drugClass]
    .filter((s): s is string => !!s)
    .map(norm)
    .join(" | ");
  for (const a of patient.allergies) {
    const term = norm(a);
    if (term.length >= 3 && haystack.includes(term)) {
      flags.push({
        code: "allergy",
        severity: "block",
        message: `Documented allergy to "${a}" — matches ${drug.name}. Confirm it is safe to proceed (override is recorded).`,
        overrideable: true,
      });
      break;
    }
  }

  // ── 2. Concentration / look-alike guard (warn — surface, never hide) ──
  if (drug.lookAlikeGuard && variantsOf(drug.drugKey).length > 1) {
    flags.push({
      code: "concentration",
      severity: "warn",
      message: drug.lookAlikeGuard,
      overrideable: true,
    });
  }

  // ── 3. Weight / age (paediatric) routing — never an adult flat dose ──
  const isPaediatric = patient.ageYears != null && patient.ageYears < PAEDIATRIC_AGE_THRESHOLD;
  if (isPaediatric && drug.adult) {
    if (drug.paediatric.weightBased && patient.weightKg == null) {
      flags.push({
        code: "weight_missing",
        severity: "block",
        message: `Paediatric patient — a weight is required before dosing. Do NOT use the adult dose. ${drug.paediatric.note}`,
        overrideable: false,
      });
    } else {
      flags.push({
        code: "paediatric_routing",
        severity: "warn",
        message: `Paediatric — use weight-based dosing, NOT the adult flat dose: ${drug.paediatric.note}`,
        overrideable: true,
      });
    }
  }

  // ── 4a. Max / cumulative dose (mg cap, e.g. atropine 3 mg) ──
  const samePrior = priorAdministrations.filter((p) => p.drugKey === drug.drugKey);
  if (drug.cumulativeMaxMg != null) {
    const priorMg = samePrior.reduce((sum, p) => sum + (p.amountMg ?? 0), 0);
    const projected = priorMg + (drug.unitDoseMg ?? 0);
    if (projected > drug.cumulativeMaxMg) {
      flags.push({
        code: "max_cumulative",
        severity: "block",
        message: `Cumulative ${drug.name} would reach ${projected} mg — exceeds the ${drug.cumulativeMaxMg} mg maximum (already given ${priorMg} mg).`,
        overrideable: true,
      });
    } else if (projected === drug.cumulativeMaxMg) {
      flags.push({
        code: "max_cumulative",
        severity: "warn",
        message: `This dose reaches the ${drug.cumulativeMaxMg} mg ceiling for ${drug.name} (already given ${priorMg} mg) — no further doses.`,
        overrideable: true,
      });
    }
  }

  // ── 4b. Max / cumulative dose (DOSE-COUNT cap, e.g. benzodiazepine 2 doses
  //    per NICE NG217 — across agents sharing the drugKey) ──
  if (drug.cumulativeMaxDoses != null) {
    const projectedCount = samePrior.length + 1;
    if (projectedCount > drug.cumulativeMaxDoses) {
      flags.push({
        code: "max_cumulative",
        severity: "block",
        message: `This would be dose ${projectedCount} of ${drug.name} (${drug.drugClass}) — exceeds the ${drug.cumulativeMaxDoses}-dose maximum; escalate to second-line.`,
        overrideable: true,
      });
    } else if (projectedCount === drug.cumulativeMaxDoses) {
      flags.push({
        code: "max_cumulative",
        severity: "warn",
        message: `This is the ${drug.cumulativeMaxDoses}-dose ceiling for ${drug.drugClass} — no further doses; move to the status/second-line pathway.`,
        overrideable: true,
      });
    }
  }

  // ── 5. Contraindication (block on a matching condition; significant-token
  //    intersection so adjectives don't over-fire and multi-word terms match) ──
  for (const ci of drug.contraindications) {
    const ciToks = sigTokens(ci);
    const hit = patient.conditions.find((c) => {
      for (const t of sigTokens(c)) if (ciToks.has(t)) return true;
      return false;
    });
    if (hit) {
      flags.push({
        code: "contraindication",
        severity: "block",
        message: `Contraindication — ${drug.name}: "${ci}" (patient has "${hit}"). Override is recorded.`,
        overrideable: true,
      });
      break;
    }
  }

  // ── 6. Controlled drug (info — stricter witnessed capture) ──
  if (drug.controlled) {
    flags.push({
      code: "controlled",
      severity: "info",
      message: `Controlled drug — witnessed administration + stricter capture required.`,
      overrideable: true,
    });
  }

  const order: Record<SafetySeverity, number> = { block: 0, warn: 1, info: 2 };
  return flags.sort((a, b) => order[a.severity] - order[b.severity]);
}

/** True when any `block` flag is present — confirm requires an override reason. */
export function prescriptionRequiresOverride(flags: SafetyFlag[]): boolean {
  return flags.some((f) => f.severity === "block");
}

export interface PrescriptionOption {
  drug: EmergencyDrug;
  flags: SafetyFlag[];
  requiresOverride: boolean;
}

/**
 * The SMART LINK: resolve a resus recommendation code into pre-filled
 * prescription option(s), each with its own safety flags computed for THIS
 * patient. Where the recommendation offers a choice (steroid PO vs IV), both
 * options are returned for the clinician to pick.
 */
export function resolvePrescriptionOptions(
  recCode: string,
  patient: PrescribePatient,
  priorAdministrations: PriorAdministration[] = [],
): PrescriptionOption[] {
  return drugsForRecommendation(recCode).map((drug) => {
    const flags = runSafetyChecks({ drug, patient, priorAdministrations });
    return { drug, flags, requiresOverride: prescriptionRequiresOverride(flags) };
  });
}

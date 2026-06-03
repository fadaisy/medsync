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
  | "controlled"
  | "dose_range";

export interface SafetyFlag {
  code: SafetyCode;
  severity: SafetySeverity;
  message: string;
  /** A block can be overridden-with-reason in an emergency (and recorded). */
  overrideable: boolean;
  /** Dangerously far out of range — the UI requires a typed dose confirmation. */
  egregious?: boolean;
}

/**
 * Editable prescription parameters (the addendum) — the prescriber's overrides
 * of the catalog defaults. Passing these RE-RUNS the safety checks against the
 * edited values (editing is NOT a bypass): the edited dose drives the range +
 * cumulative checks, and an edited route re-validates concentration/route.
 */
export interface PrescriptionEdit {
  /** Edited numeric dose in mg — for the out-of-range + cumulative checks. */
  doseMg?: number;
  /** Edited route — re-validated against the presentation's listed routes. */
  route?: string;
  /** Edited concentration/presentation (free text). */
  concentration?: string;
}

export interface SafetyCheckInput {
  drug: EmergencyDrug;
  patient: PrescribePatient;
  priorAdministrations: PriorAdministration[];
  /** Prescriber edits — when present the checks run against the EDITED values. */
  edit?: PrescriptionEdit;
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * The six prescribe-time safety checks (catalog §3 of the kickoff), each a
 * decision-support flag. Ordered most-severe-first for display.
 */
export function runSafetyChecks(input: SafetyCheckInput): SafetyFlag[] {
  const { drug, patient, priorAdministrations, edit } = input;
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
  // ── 2b. Edited route — re-validate concentration/route correctness (addendum:
  //    editing the route must not bypass the concentration check). ──
  if (edit?.route && drug.adult && !drug.adult.route.includes(edit.route as never)) {
    flags.push({
      code: "concentration",
      severity: "warn",
      message: `Route "${edit.route.toUpperCase()}" is not a listed route for this presentation (${drug.adult.route.join("/").toUpperCase()}) — confirm the concentration + volume are correct for the chosen route.`,
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

  // The dose this administration would give — the EDITED value when present,
  // else the catalog default (addendum: the edited value drives the checks).
  const thisDoseMg = edit?.doseMg ?? drug.unitDoseMg ?? 0;

  // ── 4a. Max / cumulative dose (mg cap, e.g. atropine 3 mg) ──
  const samePrior = priorAdministrations.filter((p) => p.drugKey === drug.drugKey);
  if (drug.cumulativeMaxMg != null) {
    const priorMg = samePrior.reduce((sum, p) => sum + (p.amountMg ?? 0), 0);
    const projected = priorMg + thisDoseMg;
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

  // ── 7. Out-of-range / plausibility guard on an EDITED dose (addendum A2).
  //    Compares the edited dose to the catalog reference (unitDoseMg). A normal
  //    clinical adjustment (≈0.5–2×, e.g. renal dose-halving) raises nothing;
  //    further out warns; far out blocks (override-with-reason); egregiously out
  //    additionally requires a typed dose confirmation. NEVER a hard block. ──
  // An invalid (non-finite) edited dose must NOT silently skip the checks
  // (NaN passes `!= null` but fails every comparison) — block it explicitly.
  if (edit?.doseMg != null && !Number.isFinite(edit.doseMg)) {
    flags.push({
      code: "dose_range",
      severity: "block",
      message: "Edited dose is not a valid number — enter a numeric dose.",
      overrideable: false,
    });
  } else if (edit?.doseMg != null && drug.unitDoseMg != null && drug.unitDoseMg > 0) {
    const ref = drug.unitDoseMg;
    const ratio = edit.doseMg / ref;
    const xfmt = ratio >= 1 ? `${ratio.toFixed(1)}×` : `${ratio.toFixed(2)}×`;
    if (ratio >= 5 || ratio <= 0.2) {
      flags.push({
        code: "dose_range",
        severity: "block",
        egregious: true,
        message: `Edited dose ${edit.doseMg} mg is ${xfmt} the usual ${ref} mg for ${drug.name} — dangerously outside range. Type the dose to confirm; override + reason are recorded.`,
        overrideable: true,
      });
    } else if (ratio > 3 || ratio < 0.34) {
      flags.push({
        code: "dose_range",
        severity: "block",
        message: `Edited dose ${edit.doseMg} mg is outside the usual ~${ref} mg for ${drug.name} (${xfmt}) — confirm; override + reason are recorded.`,
        overrideable: true,
      });
    } else if (ratio > 2 || ratio < 0.5) {
      flags.push({
        code: "dose_range",
        severity: "warn",
        message: `Edited dose ${edit.doseMg} mg differs from the usual ~${ref} mg (${xfmt}) — check it is intended.`,
        overrideable: true,
      });
    }
  }

  // ── 8. A numerically edited dose may no longer match the default concentration
  //    / volume — nudge the prescriber to confirm it (addendum should-fix). ──
  if (edit?.doseMg != null && Number.isFinite(edit.doseMg) && edit.concentration == null) {
    flags.push({
      code: "concentration",
      severity: "warn",
      message: "Dose edited — confirm the concentration + volume match the new dose.",
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

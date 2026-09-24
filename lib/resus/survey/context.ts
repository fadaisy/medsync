/**
 * Resus Desk v2 — patient context entered once, one arrest state (GATE A §4;
 * decisions D19, D20). PURE.
 *
 * Maps the patient-level context flags + the one arrest state + the step-local
 * toggles + the derived A/B/C-abnormal marker onto EXACTLY each step's legacy
 * `context` object, so the signed A–E engines run unchanged. Flags are
 * independent except the signed co-variances (§4): Trauma moves A/C/E, Allergen
 * moves A/B/C, Head injury moves C/D, Spinal injury sets C and A (D19), and
 * Pregnancy confirmed / postpartum sets C and D. The arrest state feeds A/B
 * `noSignsOfLife` and C/D/E `noPulse` (D20).
 */
import type { AirwayFindingSet } from "@/lib/resus/airway";
import type { BreathingFindingSet } from "@/lib/resus/breathing";
import type { CirculationFindingSet } from "@/lib/resus/circulation";
import type { DisabilityFindingSet } from "@/lib/resus/disability";
import type { ExposureFindingSet } from "@/lib/resus/exposure";
import type { PatientContextFlags, StepLocalToggles, StepState } from "@/lib/resus/model";
import type { AbcdeLetter, TimelineEvent } from "@/lib/resus/types";

import { tempStage } from "@/lib/resus/exposure";
import { EMPTY_CONTEXT } from "@/lib/resus/model";
import { ADULT_MIN_AGE_YEARS, VITAL_BAND_RULES } from "@/lib/resus/survey/vitals-bands";

/** Each step's legacy context, every key present (exact shapes of the FindingSets). */
export interface LegacyContexts {
  A: Required<AirwayFindingSet["context"]>;
  B: Required<BreathingFindingSet["context"]>;
  C: Required<CirculationFindingSet["context"]>;
  D: Required<DisabilityFindingSet["context"]>;
  E: Required<ExposureFindingSet["context"]>;
}

export interface V2ContextInput {
  flags: PatientContextFlags;
  /** The one patient-level arrest state (D20). */
  inArrest: boolean;
  local: StepLocalToggles;
  /** A, B or C is Threatened / Active threat (abcAbnormalFrom). */
  abcAbnormal: boolean;
}

/** SV-CTX-03..17: every step's legacy context from the v2 inputs. */
export function legacyContexts(i: V2ContextInput): LegacyContexts {
  const f = i.flags;
  const pregnancyConfirmed = f.pregnancy === "confirmed" || f.pregnancy === "postpartum";
  return {
    A: {
      trauma: f.trauma || f.spinalInjury,
      allergenTrigger: f.allergenTrigger,
      noSignsOfLife: i.inArrest,
      gagPresent: i.local.gagPresent,
    },
    B: {
      trauma: f.chestTrauma,
      allergenTrigger: f.allergenTrigger,
      knownAsthma: f.knownAsthma,
      copdRisk: f.copdRisk,
      peSuspected: f.peSuspected,
      noSignsOfLife: i.inArrest,
    },
    C: {
      trauma: f.trauma,
      activeBleeding: f.activeBleeding,
      febrileChild: f.febrileChild,
      pregnancyPossible: f.pregnancy !== "none",
      spinalInjury: f.spinalInjury,
      allergenTrigger: f.allergenTrigger,
      headInjury: f.headInjury,
      noPulse: i.inArrest,
    },
    D: {
      opioidsSuspected: f.opioidsSuspected,
      lowRespRate: i.local.lowRespRate,
      pregnancyPostpartum: pregnancyConfirmed,
      headInjury: f.headInjury,
      alcoholMalnourished: f.alcoholMalnourished,
      feverMeningism: f.feverMeningism,
      abcAbnormal: i.abcAbnormal,
      noPulse: i.inArrest,
    },
    E: {
      trauma: f.trauma,
      exposureEnvironment: f.environmentalExposure,
      serotonergicOrNeuroleptic: f.serotonergicOrNeuroleptic,
      notRecovered: i.local.notRecovered,
      noPulse: i.inArrest,
    },
  };
}

/** One step's legacy context object (exact keys; see legacyContexts). */
export function legacyStepContext<S extends AbcdeLetter>(
  step: S,
  input: V2ContextInput,
): LegacyContexts[S] {
  return legacyContexts(input)[step];
}

/** D20: the keys the one arrest state owns (A/B `noSignsOfLife`, C/D/E `noPulse`). */
const ARREST_KEYS: ReadonlySet<string> = new Set(["noSignsOfLife", "noPulse"]);

/**
 * SV-CTX-18: per key, recorded || current — a flag recorded on a legacy
 * assessment is never silently dropped; the current context can only add.
 * Two exceptions read `current` alone: the arrest keys (D20 — the arrest state
 * clears on ROSC, so a step recorded during CPR must not stay in arrest) and
 * D's derived `abcAbnormal` (SV-CTX-17 — it follows A/B/C's current states).
 * `arrestState` = the episode has an arrest state (any `arrest_detected`);
 * without one (a v1 episode), a recorded per-step "No pulse" / "No signs of
 * life" toggle is the only arrest record and still counts.
 */
export function mergeContext<T extends Record<string, boolean | undefined>>(
  recorded: T,
  current: Required<T>,
  arrestState = true,
): Required<T> {
  const out = { ...current };
  for (const k of Object.keys(current) as (keyof T)[]) {
    const key = String(k);
    const currentOnly = key === "abcAbnormal" || (arrestState && ARREST_KEYS.has(key));
    out[k] = (current[k] === true ||
      (!currentOnly && recorded[k] === true)) as Required<T>[keyof T];
  }
  return out;
}

const byTime = (a: TimelineEvent, b: TimelineEvent) =>
  a.recordedAt !== b.recordedAt
    ? a.recordedAt < b.recordedAt
      ? -1
      : 1
    : a.createdAt < b.createdAt
      ? -1
      : a.createdAt > b.createdAt
        ? 1
        : 0;

function latestOf(events: readonly TimelineEvent[], kinds: ReadonlySet<string>) {
  let latest: TimelineEvent | null = null;
  for (const e of events) {
    if (!kinds.has(e.kind)) continue;
    if (!latest || byTime(e, latest) >= 0) latest = e;
  }
  return latest;
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object";

/**
 * SV-CTX-01: the patient context, folded over the `context` events in clinical
 * time. A row carrying `patch` (the keys one toggle changed) applies only those
 * keys, so two devices toggling different flags never erase each other, and a
 * queued patch that lands late still applies unless a later row changed the
 * same key. A row without `patch` (a full set, v1 and early v2) replaces the
 * whole context; missing keys fall back to EMPTY_CONTEXT.
 */
export function latestContext(events: readonly TimelineEvent[]): PatientContextFlags {
  let out: PatientContextFlags = EMPTY_CONTEXT;
  for (const e of events.filter((x) => x.kind === "context").sort(byTime)) {
    const { patch, flags } = e.payload;
    if (isObject(patch)) out = { ...out, ...(patch as Partial<PatientContextFlags>) };
    else if (isObject(flags))
      out = { ...EMPTY_CONTEXT, ...(flags as Partial<PatientContextFlags>) };
  }
  return out;
}

const ARREST_END_KINDS: ReadonlySet<string> = new Set([
  "rosc",
  "resuscitation_stopped",
  "death_confirmed",
]);

/**
 * SV-CTX-02: the arrest state is active iff the latest `arrest_detected` is
 * later than the latest ROSC / stop / death event. Legacy episodes (an
 * `arrest_detected` without `arrestSeq`, no ROSC kind) read as in arrest.
 */
export function arrestActive(events: readonly TimelineEvent[]): boolean {
  const start = latestOf(events, new Set(["arrest_detected"]));
  if (!start) return false;
  const end = latestOf(events, ARREST_END_KINDS);
  return !end || byTime(start, end) > 0;
}

/** SV-CTX-17: D `abcAbnormal` while A, B or C shows Threatened / Active threat. */
export function abcAbnormalFrom(states: readonly StepState[]): boolean {
  return states.some(
    (s) =>
      (s.step === "A" || s.step === "B" || s.step === "C") &&
      (s.visual === "threatened" || s.visual === "active_threat"),
  );
}

const RR_LOW = VITAL_BAND_RULES.find((r) => r.code === "rr_low_falling")!;

/**
 * SV-CTX-19: D "Low RR" is SUGGESTED (never auto-set) from a fresh adult RR at
 * or below the signed B number (`rr_low_falling`, "RR ≤ 8"). Pass the fresh
 * adult RR (deriveMeasureFindings().values.rr), or null.
 */
export function lowRespRateSuggested(rr: number | null): boolean {
  return rr != null && Number.isFinite(rr) && rr <= RR_LOW.value;
}

/**
 * SV-CTX-20: C "Febrile child" is SUGGESTED (never auto-set, never cleared)
 * when age < 16 and a recorded temperature is in the signed E catalog's fever
 * stage or above (`tempStage` → fever / hyperthermia, i.e. ≥ 38 °C).
 */
export function febrileChildSuggested(ageYears: number | null, tempC: number | null): boolean {
  if (ageYears == null || ageYears >= ADULT_MIN_AGE_YEARS) return false;
  const stage = tempStage(tempC);
  return stage === "fever" || stage === "hyperthermia";
}

/**
 * GATE A §4 signed co-variances — the only v2 inputs that move more than one
 * step's legacy context (enumerated and proven in tests/resus/v2/equivalence).
 * "Pregnancy: confirmed / postpartum" is one row in §4 (two input values); the
 * arrest state is D20's single arrest state feeding all five steps.
 */
export const SIGNED_COVARIANCES: readonly { input: string; steps: readonly AbcdeLetter[] }[] = [
  { input: "trauma", steps: ["A", "C", "E"] },
  { input: "spinalInjury", steps: ["A", "C"] },
  { input: "headInjury", steps: ["C", "D"] },
  { input: "allergenTrigger", steps: ["A", "B", "C"] },
  { input: "pregnancy:confirmed", steps: ["C", "D"] },
  { input: "pregnancy:postpartum", steps: ["C", "D"] },
  { input: "inArrest", steps: ["A", "B", "C", "D", "E"] },
];

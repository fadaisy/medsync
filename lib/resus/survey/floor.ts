/**
 * Resus Desk v2 — the step floor: each step's state from its OWN engine over
 * recorded ∪ vitals-derived findings (GATE A §5 "P4 root cause and fix"; D18).
 * PURE.
 *
 * Per step: the latest recorded finding set, its context merged per key with
 * the current patient context (recorded || current; the arrest keys and D's
 * abcAbnormal come from the current state only, SV-CTX-18 / D20), classified → the recorded
 * state (`assessed` = non-null). The Q13 codes from fresh adult vitals are then
 * added and the set classified again → the engine state, WORSEN-ONLY against
 * the step's signed state ladder. The visual follows the ladder: pending (no
 * state) · clear (ladder-best) · active_threat (the ADR 0049 / v1 predicates on
 * the combined set, or the arrest state) · addressed (nothing outstanding and
 * ≥ 1 performed) · threatened. Rule IDs SV-FLR-01..12.
 */
import type { ResusActionState } from "@/lib/resus/action-order";
import type { AirwayFindingSet } from "@/lib/resus/airway";
import type { BreathingFindingSet } from "@/lib/resus/breathing";
import type { CirculationFindingSet } from "@/lib/resus/circulation";
import type { DisabilityFindingSet } from "@/lib/resus/disability";
import type { ExposureFindingSet } from "@/lib/resus/exposure";
import type {
  PatientContextFlags,
  StepLocalToggles,
  StepState,
  StepVisual,
} from "@/lib/resus/model";
import type { MeasureFindings } from "@/lib/resus/survey/vitals-bands";
import type { AbcdeLetter, TimelineEvent } from "@/lib/resus/types";

import { orderResusActions, outstandingActionCount } from "@/lib/resus/action-order";
import {
  triggeredActions as airwayTriggered,
  buildAirwayActions,
  classifyAirway,
  latestAirwayAssessment,
} from "@/lib/resus/airway";
import {
  triggeredActions as breathingTriggered,
  buildBreathingActions,
  classifyBreathing,
  latestBreathingAssessment,
} from "@/lib/resus/breathing";
import {
  buildCirculationActions,
  triggeredActions as circulationTriggered,
  classifyCirculation,
  latestCirculationAssessment,
} from "@/lib/resus/circulation";
import {
  buildDisabilityActions,
  classifyDisability,
  triggeredActions as disabilityTriggered,
  gcsTotal,
  identifyNeuroSyndrome,
  isGcsFalling,
  latestDisabilityAssessment,
  mandatoryGlucoseMissing,
} from "@/lib/resus/disability";
import {
  buildExposureActions,
  classifyExposure,
  triggeredActions as exposureTriggered,
  latestExposureAssessment,
  temperatureMissing,
} from "@/lib/resus/exposure";
import { EMPTY_LOCAL } from "@/lib/resus/model";
import { airwayAction } from "@/lib/resus/reference/airway-catalog";
import { breathingAction } from "@/lib/resus/reference/breathing-catalog";
import { circulationAction } from "@/lib/resus/reference/circulation-catalog";
import { disabilityAction, GCS_AIRWAY_THRESHOLD } from "@/lib/resus/reference/disability-catalog";
import { exposureAction } from "@/lib/resus/reference/exposure-catalog";
import { STEP_PRESENTATION } from "@/lib/resus/reference/presentation";
import {
  abcAbnormalFrom,
  arrestActive,
  latestContext,
  legacyContexts,
  legacyStepContext,
  mergeContext,
} from "@/lib/resus/survey/context";
import { deriveMeasureFindings } from "@/lib/resus/survey/vitals-bands";

interface Trig {
  code: string;
  rationale: string;
  priority: number;
  emergency: boolean;
}
interface Rec {
  actionCode: string;
  state: ResusActionState;
  label: string;
}

/** The per-step engine surface the floor needs (all signed functions, unchanged). */
export interface StepAdapter<FS> {
  /** Assessment payload key ("airway") and the stored-state key ("airwayState"). */
  payloadKey: string;
  storedKey: string;
  latest: (events: readonly TimelineEvent[]) => FS | null;
  empty: () => FS;
  classify: (fs: FS) => string | null;
  /** The v1 active-threat predicate (legacyStepBar / ADR 0049), on a finding set. */
  activeThreat: (fs: FS, events: readonly TimelineEvent[]) => boolean;
  triggered: (fs: FS) => Trig[];
  recorded: (events: readonly TimelineEvent[]) => Rec[];
  catalogAction: (code: string) => { label: string; emergency?: boolean } | null;
}

export const AIRWAY_ADAPTER: StepAdapter<AirwayFindingSet> = {
  payloadKey: "airway",
  storedKey: "airwayState",
  latest: latestAirwayAssessment,
  empty: () => ({ patency: null, present: [], difficulty: [], context: {} }),
  classify: classifyAirway,
  activeThreat: (fs) => {
    const s = classifyAirway(fs);
    return s === "completely_obstructed" || s === "apnoeic_ventilate" || s === "apnoeic_arrest";
  },
  triggered: airwayTriggered,
  recorded: buildAirwayActions,
  catalogAction: airwayAction,
};

export const BREATHING_ADAPTER: StepAdapter<BreathingFindingSet> = {
  payloadKey: "breathing",
  storedKey: "breathingState",
  latest: latestBreathingAssessment,
  empty: () => ({ state: null, present: [], context: {} }),
  classify: classifyBreathing,
  activeThreat: (fs) => {
    const s = classifyBreathing(fs);
    if (s === "peri_arrest" || s === "apnoeic") return true;
    return breathingTriggered(fs).some((t) => t.priority === 0 && t.emergency);
  },
  triggered: breathingTriggered,
  recorded: buildBreathingActions,
  catalogAction: breathingAction,
};

export const CIRCULATION_ADAPTER: StepAdapter<CirculationFindingSet> = {
  payloadKey: "circulation",
  storedKey: "circulatoryState",
  latest: latestCirculationAssessment,
  empty: () => ({ state: null, present: [], context: {} }),
  classify: classifyCirculation,
  activeThreat: (fs) => {
    const s = classifyCirculation(fs);
    if (s === "peri_arrest" || s === "arrest" || s === "decompensated_shock") return true;
    return circulationTriggered(fs).some((t) => t.priority === 0 && t.emergency);
  },
  triggered: circulationTriggered,
  recorded: buildCirculationActions,
  catalogAction: circulationAction,
};

export const DISABILITY_ADAPTER: StepAdapter<DisabilityFindingSet> = {
  payloadKey: "disability",
  storedKey: "neuroState",
  latest: latestDisabilityAssessment,
  empty: () => ({
    state: null,
    gcs: null,
    avpu: null,
    glucoseMmol: null,
    present: [],
    context: {},
  }),
  classify: classifyDisability,
  activeThreat: (fs, events) => {
    const s = classifyDisability(fs);
    const total = gcsTotal(fs.gcs);
    if (
      s === "raised_icp_herniation" ||
      s === "active_seizure_status" ||
      s === "severe_impairment_coma" ||
      (total != null && total <= GCS_AIRWAY_THRESHOLD)
    )
      return true;
    if (isGcsFalling(events)) return true;
    return disabilityTriggered(fs).some(
      (t) => t.priority <= 0 && t.emergency && t.code !== "d_check_glucose",
    );
  },
  triggered: disabilityTriggered,
  recorded: buildDisabilityActions,
  catalogAction: disabilityAction,
};

export const EXPOSURE_ADAPTER: StepAdapter<ExposureFindingSet> = {
  payloadKey: "exposure",
  storedKey: "exposureState",
  latest: latestExposureAssessment,
  empty: () => ({ state: null, present: [], coreTempC: null, ample: null, context: {} }),
  classify: classifyExposure,
  activeThreat: (fs) => {
    const s = classifyExposure(fs);
    if (s === "critical_finding" || s === "temperature_extreme") return true;
    return exposureTriggered(fs).some(
      (t) => t.priority <= 0 && t.emergency && t.code !== "e_measure_temp",
    );
  },
  triggered: exposureTriggered,
  recorded: buildExposureActions,
  catalogAction: exposureAction,
};

/** One row of a step's merged action board (triggered ∪ recorded). */
export interface BoardAction {
  step: AbcdeLetter;
  code: string;
  label: string;
  rationale: string;
  emergency: boolean;
  /** Engine priority; undefined for a recorded-only action. */
  priority?: number;
  /** Recorded state; undefined = an unrecorded indicated action. */
  state?: ResusActionState;
}

export interface StepEvaluation<FS> {
  state: StepState;
  /** The latest recorded set with the merged context, or null. */
  recordedFs: FS | null;
  /** recorded ∪ derived (what the engine state, threat and actions read). */
  combined: FS;
  actions: BoardAction[];
}

/** SV-FLR-04: position on the signed ladder (best = 0); −1 = no state. */
export function ladderRank(ladder: readonly string[], s: string | null): number {
  return s == null ? -1 : ladder.indexOf(s);
}

/**
 * SV-FLR-02: the state the signed engine stored at record time (payload
 * `airwayState` etc.) — used only when today's classification of the same set
 * is null (e.g. a legacy code); a null stored state stays null.
 */
function storedState<FS>(
  step: AbcdeLetter,
  ad: StepAdapter<FS>,
  ladder: readonly string[],
  events: readonly TimelineEvent[],
): string | null {
  let latest: TimelineEvent | null = null;
  for (const e of events) {
    if (e.kind !== "assessment" || e.step !== step) continue;
    const fs = e.payload[ad.payloadKey];
    if (!fs || typeof fs !== "object") continue;
    if (!latest || e.recordedAt > latest.recordedAt) latest = e;
  }
  const v = latest?.payload[ad.storedKey];
  return typeof v === "string" && ladder.includes(v) ? v : null;
}

/** SV-FLR-01..10 for one step. */
export function evaluateStep<
  FS extends { present: string[]; context: Record<string, boolean | undefined> },
>(
  step: AbcdeLetter,
  ad: StepAdapter<FS>,
  events: readonly TimelineEvent[],
  current: Required<FS["context"]>,
  derived: readonly string[],
  inArrest: boolean,
): StepEvaluation<FS> {
  const ladder = STEP_PRESENTATION[step].ladder;
  const arrestState = events.some((e) => e.kind === "arrest_detected");
  const withCtx = (fs: FS): FS => ({
    ...fs,
    context: mergeContext(fs.context, current, arrestState),
  });
  const base = ad.latest(events);
  const recordedFs = base ? withCtx(base) : null;
  // The stored state was classified with the recorded context; once the merge
  // has dropped one of its flags (the arrest keys after ROSC, D20) it no longer applies.
  const dropped =
    base != null &&
    recordedFs != null &&
    Object.keys(recordedFs.context).some(
      (k) => base.context[k] === true && recordedFs.context[k] !== true,
    );
  const recordedState = recordedFs
    ? (ad.classify(recordedFs) ?? (dropped ? null : storedState(step, ad, ladder, events)))
    : null;
  const assessed = recordedState !== null;

  const start = recordedFs ?? withCtx(ad.empty());
  const combined: FS = { ...start, present: [...new Set([...start.present, ...derived])] };
  const combinedState = assessed || derived.length > 0 ? ad.classify(combined) : null;
  // Worsen-only: never better than the recorded state.
  const engineState =
    ladderRank(ladder, combinedState) > ladderRank(ladder, recordedState)
      ? combinedState
      : recordedState;
  const fromVitals = assessed
    ? ladderRank(ladder, engineState) > ladderRank(ladder, recordedState)
    : engineState !== null;

  // Merge triggered ∪ recorded exactly as the v1 panels do (one ordered board).
  const triggered = engineState !== null ? ad.triggered(combined) : [];
  const recorded = ad.recorded(events);
  const byCode = new Map(recorded.map((a) => [a.actionCode, a]));
  const triggeredCodes = new Set(triggered.map((t) => t.code));
  const actions = orderResusActions<BoardAction>([
    ...triggered.map((t) => ({
      step,
      code: t.code,
      label: ad.catalogAction(t.code)?.label ?? t.code,
      rationale: t.rationale,
      emergency: t.emergency,
      priority: t.priority,
      state: byCode.get(t.code)?.state,
    })),
    ...recorded
      .filter((a) => !triggeredCodes.has(a.actionCode))
      .map((a) => ({
        step,
        code: a.actionCode,
        label: a.label,
        rationale: "",
        emergency: ad.catalogAction(a.actionCode)?.emergency ?? false,
        state: a.state,
      })),
  ]);
  const outstanding = outstandingActionCount(actions);

  let visual: StepVisual;
  if (engineState === null) visual = "pending";
  else if (engineState === ladder[0]) visual = "clear";
  else if (inArrest || ad.activeThreat(combined, events)) visual = "active_threat";
  else if (outstanding === 0 && actions.some((a) => a.state === "performed")) visual = "addressed";
  else visual = "threatened";

  return {
    state: {
      step,
      engineState,
      recordedState,
      assessed,
      fromVitals,
      derivedCodes: [...derived],
      visual,
      outstanding,
    },
    recordedFs,
    combined,
    actions,
  };
}

export interface SurveyInput {
  ageYears: number | null;
  nowMs: number;
  /** The one arrest state (D20); defaults to arrestActive(events). */
  inArrest?: boolean;
  /** Patient context; defaults to latestContext(events). */
  flags?: PatientContextFlags;
  /** Current step-local toggles (recorded ones merge in per key). */
  local?: StepLocalToggles;
}

/** Engine facts the Do-now queue reads (SV-FLR-11). */
export interface SurveySignals {
  /** Fresh adult GCS (SV-VIT-01), else the latest recorded D total. */
  gcsTotal: number | null;
  gcsFalling: boolean;
  /** D's neuro-syndrome over recorded ∪ derived is opioid toxicity. */
  opioid: boolean;
  /** No E assessment, or the latest has no core temperature. */
  coreTempMissing: boolean;
  /** D's "Don't Ever Forget Glucose" trap (mandatoryGlucoseMissing). */
  glucoseMissing: boolean;
  /** An intervention is newer than the last vital (vitalsStale). */
  vitalsStale: boolean;
  /** Whole minutes since the latest vitals set (SV-DN-08 age); null = none recorded. */
  lastVitalsMin: number | null;
}

export interface Survey {
  states: StepState[];
  actions: Record<AbcdeLetter, BoardAction[]>;
  measure: MeasureFindings;
  signals: SurveySignals;
}

const INTERVENTION_KINDS: ReadonlySet<string> = new Set(["action", "drug", "fluid", "procedure"]);

/**
 * SV-FLR-12: an intervention (drug / fluid / procedure / action) is newer than
 * the last vital. A recorded state other than performed / in progress (e.g.
 * deferred, not indicated) is a decision, not an intervention.
 */
export function vitalsStale(events: readonly TimelineEvent[]): boolean {
  let lastVital = "";
  let lastIntervention = "";
  for (const e of events) {
    if (e.kind === "vital" && e.recordedAt > lastVital) lastVital = e.recordedAt;
    const st = e.payload.state;
    const given = st === undefined || st === "performed" || st === "in_progress";
    if (INTERVENTION_KINDS.has(e.kind) && given && e.recordedAt > lastIntervention)
      lastIntervention = e.recordedAt;
  }
  return lastIntervention !== "" && lastIntervention > lastVital;
}

/** SV-DN-08: whole minutes since the latest vitals set; null when none is recorded. */
export function lastVitalsMin(events: readonly TimelineEvent[], nowMs: number): number | null {
  let last = -Infinity;
  for (const e of events) if (e.kind === "vital") last = Math.max(last, Date.parse(e.recordedAt));
  return Number.isFinite(last) ? Math.max(0, Math.floor((nowMs - last) / 60_000)) : null;
}

/** The v2 survey: all five steps, their action boards, the derived findings and signals. */
export function computeSurvey(events: readonly TimelineEvent[], input: SurveyInput): Survey {
  const flags = input.flags ?? latestContext(events);
  const inArrest = input.inArrest ?? arrestActive(events);
  const local = input.local ?? EMPTY_LOCAL;
  const measure = deriveMeasureFindings(events, input);
  const base = { flags, inArrest, local, abcAbnormal: false };
  const ctx = legacyContexts(base);

  const a = evaluateStep("A", AIRWAY_ADAPTER, events, ctx.A, measure.A, inArrest);
  const b = evaluateStep("B", BREATHING_ADAPTER, events, ctx.B, measure.B, inArrest);
  const c = evaluateStep("C", CIRCULATION_ADAPTER, events, ctx.C, measure.C, inArrest);
  // SV-CTX-17: D abcAbnormal follows A/B/C's own states.
  const abcAbnormal = abcAbnormalFrom([a.state, b.state, c.state]);
  const ctxD = legacyStepContext("D", { ...base, abcAbnormal });
  const d = evaluateStep("D", DISABILITY_ADAPTER, events, ctxD, measure.D, inArrest);
  const e = evaluateStep("E", EXPOSURE_ADAPTER, events, ctx.E, [], inArrest);

  return {
    states: [a.state, b.state, c.state, d.state, e.state],
    actions: { A: a.actions, B: b.actions, C: c.actions, D: d.actions, E: e.actions },
    measure,
    signals: {
      gcsTotal: measure.gcsTotal ?? gcsTotal(d.recordedFs?.gcs ?? null),
      gcsFalling: isGcsFalling(events),
      opioid: identifyNeuroSyndrome(d.combined) === "opioid_toxicity",
      coreTempMissing: e.recordedFs === null || temperatureMissing(e.recordedFs),
      glucoseMissing: mandatoryGlucoseMissing(d.combined),
      vitalsStale: vitalsStale(events),
      lastVitalsMin: lastVitalsMin(events, input.nowMs),
    },
  };
}

/** SV-FLR-01..10: the five step states (GATE A §7 `computeStepStates`). */
export function computeStepStates(
  events: readonly TimelineEvent[],
  input: SurveyInput,
): StepState[] {
  return computeSurvey(events, input).states;
}

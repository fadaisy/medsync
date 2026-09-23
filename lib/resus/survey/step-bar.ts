import type { StepStatus } from "@/lib/resus/engine";
import type { AbcdeLetter, TimelineEvent } from "@/lib/resus/types";

import { classifyAirway, latestAirwayAssessment } from "@/lib/resus/airway";
import {
  triggeredActions as breathingTriggered,
  classifyBreathing,
  latestBreathingAssessment,
} from "@/lib/resus/breathing";
import {
  triggeredActions as circulationTriggered,
  classifyCirculation,
  latestCirculationAssessment,
} from "@/lib/resus/circulation";
import {
  classifyDisability,
  triggeredActions as disabilityTriggered,
  gcsTotal,
  isGcsFalling,
  latestDisabilityAssessment,
} from "@/lib/resus/disability";
import { deriveProgress, stepStatus } from "@/lib/resus/engine";
import {
  classifyExposure,
  triggeredActions as exposureTriggered,
  latestExposureAssessment,
} from "@/lib/resus/exposure";
import { ABCDE_LETTERS } from "@/lib/resus/types";

export interface StepBarContext {
  ageYears: number | null;
  arrestDetected: boolean;
  nowMs: number;
}

export interface StepBarState extends StepBarEntry {
  /** A classifiable findings set exists for this step. */
  assessed: boolean;
  /** The visual state was worsened by vitals-derived Measure findings. */
  fromVitals: boolean;
}

/** Phase 0: still the v1 derivation (P3/P4 regression tests fail against it). */
export function computeStepBar(
  timeline: readonly TimelineEvent[],
  ctx: StepBarContext,
): StepBarState[] {
  return legacyStepBar(timeline, ctx.arrestDetected).map((e) => ({
    ...e,
    assessed: e.visual !== "pending",
    fromVitals: false,
  }));
}

/** The step-bar's visual state (ADR 0049). */
export type StepVisual = "pending" | "clear" | "addressed" | "threatened" | "active_threat";

export interface StepBarEntry {
  step: AbcdeLetter;
  visual: StepVisual;
}

function stepVisual(status: StepStatus, activeThreat: boolean): StepVisual {
  if (status === "open") return activeThreat ? "active_threat" : "threatened";
  if (status === "clear") return "clear";
  if (status === "addressed") return "addressed";
  return "pending";
}

/**
 * v1 step bar, extracted verbatim from resus-desk.tsx (Phase 0 of the v2
 * rework) so it can be regression-tested. Known defects: P3 (vitals never
 * feed step state) and P4 (a vitals event or an unclassifiable assessment
 * marks a step "Clear"). Replaced by the v2 derivation in lib/resus/survey.
 */
export function legacyStepBar(
  timeline: readonly TimelineEvent[],
  arrestDetected: boolean,
): StepBarEntry[] {
  const progress = deriveProgress(
    timeline.map((e) => ({ kind: e.kind, step: e.step, payload: e.payload })),
  );
  const threat: Record<AbcdeLetter, () => boolean> = {
    A: () => {
      const last = latestAirwayAssessment(timeline);
      const s = last ? classifyAirway(last) : null;
      return s === "completely_obstructed" || s === "apnoeic_ventilate" || s === "apnoeic_arrest";
    },
    B: () => {
      const last = latestBreathingAssessment(timeline);
      if (!last) return false;
      const s = classifyBreathing(last);
      if (s === "peri_arrest" || s === "apnoeic") return true;
      return breathingTriggered(last).some((t) => t.priority === 0 && t.emergency);
    },
    C: () => {
      const last = latestCirculationAssessment(timeline);
      if (!last) return false;
      const s = classifyCirculation(last);
      if (s === "peri_arrest" || s === "arrest" || s === "decompensated_shock") return true;
      return circulationTriggered(last).some((t) => t.priority === 0 && t.emergency);
    },
    D: () => {
      const last = latestDisabilityAssessment(timeline);
      if (!last) return false;
      const s = classifyDisability(last);
      const total = gcsTotal(last.gcs);
      if (
        s === "raised_icp_herniation" ||
        s === "active_seizure_status" ||
        s === "severe_impairment_coma" ||
        (total != null && total <= 8)
      )
        return true;
      if (isGcsFalling(timeline)) return true;
      return disabilityTriggered(last).some(
        (t) => t.priority <= 0 && t.emergency && t.code !== "d_check_glucose",
      );
    },
    E: () => {
      const last = latestExposureAssessment(timeline);
      if (!last) return false;
      const s = classifyExposure(last);
      if (s === "critical_finding" || s === "temperature_extreme") return true;
      return exposureTriggered(last).some(
        (t) => t.priority <= 0 && t.emergency && t.code !== "e_measure_temp",
      );
    },
  };
  return ABCDE_LETTERS.map((step) => {
    const p = progress.find((x) => x.step === step)!;
    return { step, visual: stepVisual(stepStatus(p), arrestDetected || threat[step]()) };
  });
}

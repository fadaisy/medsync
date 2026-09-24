/**
 * Resus Desk v2 — shared payload builders (pure).
 *
 * The v2 desk renders a write at once (optimistic) and the server recomputes the
 * same payload before storing it, so both sides call these functions. The shapes
 * are byte-for-byte the v1 shapes (app/nurse/resus/actions.ts record*Findings /
 * set*ActionState), so every signed engine reads v2 rows exactly as it reads v1.
 */
import type { AbcdeLetter, ResusEventKind } from "@/lib/resus/types";

import { AIRWAY_ACTION_STATES, classifyAirway } from "@/lib/resus/airway";
import { classifyBreathing } from "@/lib/resus/breathing";
import { classifyCirculation, identifyShockType } from "@/lib/resus/circulation";
import {
  classifyDisability,
  gcsTotal,
  identifyNeuroSyndrome,
  mandatoryGlucoseMissing,
} from "@/lib/resus/disability";
import { classifyExposure, identifyExposureDiagnosis, tempStage } from "@/lib/resus/exposure";
import { airwayAction } from "@/lib/resus/reference/airway-catalog";
import { breathingAction } from "@/lib/resus/reference/breathing-catalog";
import { circulationAction } from "@/lib/resus/reference/circulation-catalog";
import { disabilityAction } from "@/lib/resus/reference/disability-catalog";
import { exposureAction } from "@/lib/resus/reference/exposure-catalog";

/** The action-state vocabulary (identical across A–E). */
export const ACTION_STATES = AIRWAY_ACTION_STATES;
export type ActionState = (typeof ACTION_STATES)[number];

const words = (s: string) => s.replace(/_/g, " ");

/**
 * The `assessment` payload for a step's findings set, as v1 writes it. The
 * finding set is typed loosely here (it is validated per step by the caller's
 * schema); the engines classify it.
 */
export function buildAssessmentPayload(
  step: AbcdeLetter,
  findingSet: Record<string, unknown>,
): Record<string, unknown> {
  const fs = { ...findingSet, context: findingSet.context ?? {} };
  switch (step) {
    case "A": {
      const state = classifyAirway(fs as never);
      return {
        airway: fs,
        airwayState: state,
        label: `Airway findings${state ? ` → ${words(state)}` : ""}`,
        danger:
          state === "completely_obstructed" ||
          state === "apnoeic_arrest" ||
          state === "threatened" ||
          state === "partially_obstructed",
      };
    }
    case "B": {
      const state = classifyBreathing(fs as never);
      return {
        breathing: fs,
        breathingState: state,
        label: `Breathing findings${state ? ` → ${words(state)}` : ""}`,
        danger:
          state === "apnoeic" || state === "peri_arrest" || state === "failure_decompensating",
      };
    }
    case "C": {
      const state = classifyCirculation(fs as never);
      const shockType = identifyShockType(fs as never);
      return {
        circulation: fs,
        circulatoryState: state,
        shockType,
        label: `Circulation findings${state ? ` → ${words(state)}` : ""}${shockType ? ` (${words(shockType)})` : ""}`,
        danger: state === "arrest" || state === "peri_arrest" || state === "decompensated_shock",
      };
    }
    case "D": {
      const state = classifyDisability(fs as never);
      const suspectedCause = identifyNeuroSyndrome(fs as never);
      const total = gcsTotal((fs as { gcs?: never }).gcs ?? null);
      const glucoseMissing = mandatoryGlucoseMissing(fs as never);
      return {
        disability: fs,
        neuroState: state,
        suspectedCause,
        gcsTotal: total,
        mandatoryGlucoseMissing: glucoseMissing,
        label: `Disability findings${state ? ` → ${words(state)}` : ""}${total != null ? ` (GCS ${total})` : ""}${glucoseMissing ? " — ⚠ glucose not checked" : ""}`,
        danger:
          state === "raised_icp_herniation" ||
          state === "active_seizure_status" ||
          state === "severe_impairment_coma",
      };
    }
    case "E": {
      const state = classifyExposure(fs as never);
      const diagnosis = identifyExposureDiagnosis(fs as never);
      const coreTempC = (fs as { coreTempC?: number | null }).coreTempC ?? null;
      return {
        exposure: fs,
        exposureState: state,
        suspectedDiagnosis: diagnosis,
        tempStage: tempStage(coreTempC),
        label: `Exposure findings${state ? ` → ${words(state)}` : ""}${coreTempC != null ? ` (${coreTempC} °C)` : ""}`,
        danger: state === "critical_finding" || state === "temperature_extreme",
      };
    }
  }
}

interface CatalogAction {
  code: string;
  label: string;
  tier: number;
  doseId?: string | null;
}

function catalogAction(step: AbcdeLetter, code: string): CatalogAction | null {
  const found =
    step === "A"
      ? airwayAction(code)
      : step === "B"
        ? breathingAction(code)
        : step === "C"
          ? circulationAction(code)
          : step === "D"
            ? disabilityAction(code)
            : exposureAction(code);
  return (found as CatalogAction | null | undefined) ?? null;
}

/**
 * The event kind + payload for an action-state change, as v1 writes it
 * (A and B record a dosed action as `drug`; tier 3 is a `procedure`).
 * Null when the code is not in the step's signed catalog.
 */
export function buildActionStatePayload(input: {
  step: AbcdeLetter;
  actionId: string;
  actionCode: string;
  state: ActionState;
  reason?: string | null;
}): { kind: ResusEventKind; payload: Record<string, unknown> } | null {
  const action = catalogAction(input.step, input.actionCode);
  if (!action) return null;
  const dosed = (input.step === "A" || input.step === "B") && !!action.doseId;
  const kind: ResusEventKind = dosed ? "drug" : action.tier === 3 ? "procedure" : "action";
  return {
    kind,
    payload: {
      actionId: input.actionId,
      actionCode: action.code,
      tier: action.tier,
      state: input.state,
      ...(input.step === "A" || input.step === "B" ? { doseId: action.doseId ?? null } : {}),
      reason: input.reason ?? null,
      label: `${action.label} — ${words(input.state)}`,
    },
  };
}

/** The AMPLE allergy note written alongside E findings (feeds prescribing). */
export function buildAllergyNote(substances: string[], nkda: boolean): Record<string, unknown> {
  return {
    allergyCapture: { substances: nkda ? [] : substances, nkda },
    label: nkda ? "Allergies: none known (NKDA)" : `Allergies: ${substances.join(", ")}`,
  };
}

"use client";

import type { DeskInitialData } from "./types";
import type { DeskStore } from "./use-desk";
import type { CaptureKey } from "./vitals-capture";
import type { PatientContextFlags, StepLocalToggles } from "@/lib/resus/model";
import type { Survey } from "@/lib/resus/survey/floor";
import type { AbcdeLetter } from "@/lib/resus/types";
import { createContext, useContext } from "react";

/**
 * Resus Desk v2 — the context every desk component reads (UI-BUILD-SPEC §2).
 * `ResusDeskV2` (desk.tsx) provides it: the store, the derived survey (recomputed
 * when events change and every 30 s for vitals freshness — NOT every second), the
 * patient context, and the UI commands that open sheets / dialogs / toasts.
 */

export interface ToastSpec {
  message: string;
  tone?: "info" | "warn" | "error";
  /** Shown for 10 s with an Undo button (one-tap arrest entries). */
  undo?: () => void;
  edit?: () => void;
  /** A write that was not saved: send it again. */
  retry?: () => void;
}

export interface PrescribeRequest {
  recCode: string;
  recLabel: string;
  onRecorded?: () => void;
  /** Why the one-tap fast path was blocked (shown at the top of the dialog). */
  reasons?: string[];
  doseMg?: number | null;
}

export interface DeskUi {
  activeStep: AbcdeLetter;
  setActiveStep: (s: AbcdeLetter) => void;
  /** In arrest mode: showing the paused survey instead of the console. */
  surveyTab: boolean;
  setSurveyTab: (v: boolean) => void;
  /** Step-local toggles (A gag, D low RR, E not re-covered) — per draft. */
  local: StepLocalToggles;
  setLocal: (patch: Partial<StepLocalToggles>) => void;
  openArrestConfirm: (source: "desk" | "step") => void;
  openCloseOut: (opts?: { arrestEnding?: boolean }) => void;
  openTermination: () => void;
  /** `onRecorded` runs only when the dialog records a dose (not on cancel). */
  openPrescribe: (d: PrescribeRequest) => void;
  openAmple: () => void;
  /** The vitals capture under the strip (null = closed); `focus` = first field. */
  vitalsCapture: { focus?: CaptureKey } | null;
  openVitals: (opts?: { focus?: CaptureKey }) => void;
  closeVitals: () => void;
  toast: (t: ToastSpec) => void;
  /**
   * Return to A records an unsaved E draft first (prompt §5.3: AMPLE feeds the
   * prescribing allergy check). StepPanel registers the saver while E has one.
   */
  saveDraft: () => void;
  setDraftSaver: (fn: (() => void) | null) => void;
}

export interface DeskCtxValue {
  initial: DeskInitialData;
  store: DeskStore;
  ui: DeskUi;
  ageYears: number | null;
  /** Patient context flags (latest `context` event). */
  flags: PatientContextFlags;
  /** The one patient-level arrest state (D20). */
  inArrest: boolean;
  /** computeSurvey over the active events (states, action boards, derived findings, signals). */
  survey: Survey;
  /** Allergies recorded in this resus (timeline capture) — for the Allergies chip + Do now. */
  allergiesRecorded: boolean;
}

export const DeskCtx = createContext<DeskCtxValue | null>(null);

export function useDeskCtx(): DeskCtxValue {
  const v = useContext(DeskCtx);
  if (!v) throw new Error("useDeskCtx outside ResusDeskV2");
  return v;
}

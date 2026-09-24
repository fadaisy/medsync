import type {
  ArrestContext,
  ArrestProcedure,
  CauseKey,
  CauseState,
  PatientContextFlags,
  Rhythm,
} from "@/lib/resus/model";
import type { AbcdeStep, TimelineEvent } from "@/lib/resus/types";

import { EMPTY_CONTEXT } from "@/lib/resus/model";

/** Shared fake-clock builders for the ALS engine tests (not a test file). */

export const T0 = Date.parse("2026-09-23T10:00:00.000Z");
export const sec = (s: number) => T0 + s * 1000;
export const min = (m: number) => T0 + m * 60_000;
export const MIN = 60_000;

let n = 0;
export function ev(
  kind: TimelineEvent["kind"],
  atMs: number,
  payload: Record<string, unknown> = {},
  step: AbcdeStep | null = "arrest",
): TimelineEvent {
  n += 1;
  const iso = new Date(atMs).toISOString();
  return {
    id: `ev-${String(n).padStart(6, "0")}`,
    episodeId: "ep-1",
    kind,
    step,
    recordedByUserId: null,
    recordedAt: iso,
    createdAt: iso,
    payload,
    supersedesEventId: null,
  };
}

export const declare = (atMs: number, arrestSeq = 1, extra: Record<string, unknown> = {}) =>
  ev("arrest_detected", atMs, { arrestSeq, reason: "", source: "desk", label: "", ...extra });
export const cpr = (atMs: number, arrestSeq = 1) => ev("cpr_started", atMs, { arrestSeq });
export const check = (atMs: number, rhythm: Rhythm, arrestSeq = 1, pulse?: boolean | null) =>
  ev("rhythm_check", atMs, {
    arrestSeq,
    rhythm,
    label: "",
    ...(pulse !== undefined ? { pulse } : {}),
  });
export const shock = (atMs: number, arrestSeq = 1, stacked = false) =>
  ev("shock", atMs, { arrestSeq, energyJ: null, energySource: "highest", stacked, label: "" });
export const drug = (
  atMs: number,
  drugId: string,
  drugKey: string,
  amountMg: number | null,
  route = "iv",
  arrestSeq = 1,
) => ev("drug", atMs, { arrestSeq, prescribing: { drugId, drugKey, amountMg, route } });
export const adrenaline = (atMs: number, arrestSeq = 1) =>
  drug(atMs, "adrenaline_arrest_iv", "adrenaline", 1, "iv", arrestSeq);
export const amiodarone = (atMs: number, mg: number, arrestSeq = 1) =>
  drug(atMs, "amiodarone_arrest_iv", "amiodarone", mg, "iv", arrestSeq);
export const lidocaine = (atMs: number, mg: number, arrestSeq = 1) =>
  drug(atMs, "lidocaine_arrest_iv", "lidocaine", mg, "iv", arrestSeq);
export const rosc = (atMs: number, arrestSeq = 1) =>
  ev("rosc", atMs, { arrestSeq, signs: ["pulse"], label: "" });
export const stop = (atMs: number, arrestSeq = 1) =>
  ev("resuscitation_stopped", atMs, { arrestSeq, reasons: ["persistent_asystole"], label: "" });
export const proc = (
  atMs: number,
  arrestProcedure: ArrestProcedure,
  extra: Record<string, unknown> = {},
  arrestSeq = 1,
) => ev("procedure", atMs, { arrestSeq, arrestProcedure, label: "", ...extra });
export const vital = (atMs: number, snapshot: Record<string, unknown>) =>
  ev("vital", atMs, { snapshot }, "C");
/** A vital_annotation note marking `fields` of a vital event as artefact (SV-VIT-16). */
export const artefact = (atMs: number, vitalEventId: string, fields: string[], on = true) =>
  ev("note", atMs, { noteKind: "vital_annotation", vitalEventId, fields, artefact: on }, null);
/** A survey step action state event (as `buildActionStatePayload` writes it). */
export const surveyAction = (
  atMs: number,
  step: "A" | "B" | "C" | "D",
  actionCode: string,
  state = "performed",
  actionId = `act-${actionCode}`,
) => ev("procedure", atMs, { actionId, actionCode, tier: 3, state, label: "" }, step);
export const cause = (atMs: number, c: CauseKey, state: CauseState) =>
  ev("decision", atMs, { decision: "reversible_cause", arrestSeq: 1, cause: c, state, label: "" });
export const decision = (atMs: number, payload: Record<string, unknown>) =>
  ev("decision", atMs, payload, null);
export const assess = (atMs: number, step: "A" | "B" | "C" | "D" | "E", body: object) => {
  const key = { A: "airway", B: "breathing", C: "circulation", D: "disability", E: "exposure" }[
    step
  ];
  return ev("assessment", atMs, { [key]: body }, step);
};

export function ctxOf(
  over: Partial<ArrestContext> = {},
  flags: Partial<PatientContextFlags> = {},
): ArrestContext {
  return {
    ageYears: 45,
    weightKg: 70,
    flags: { ...EMPTY_CONTEXT, ...flags },
    coreTempC: null,
    otherTempC: null,
    antiarrhythmic: "amiodarone",
    bayProfile: null,
    cprProvider: null,
    ...over,
  };
}

/** A running arrest declared at T0 with CPR started at T0. */
export const started = (seq = 1) => [declare(T0, seq), cpr(T0, seq)];

/**
 * Shared fixtures for the v2 survey-engine tests (not a test file).
 */
import type { PatientContextFlags } from "@/lib/resus/model";
import type { V2ContextInput } from "@/lib/resus/survey/context";
import type { AbcdeLetter, TimelineEvent } from "@/lib/resus/types";

import { EMPTY_CONTEXT, EMPTY_LOCAL } from "@/lib/resus/model";

export const EP = "00000000-0000-4000-8000-000000000001";
export const NOW = Date.parse("2026-09-23T17:00:00Z");

let seq = 0;
export function ev(
  kind: TimelineEvent["kind"],
  step: TimelineEvent["step"],
  minsAgo: number,
  payload: Record<string, unknown>,
): TimelineEvent {
  seq += 1;
  const at = new Date(NOW - minsAgo * 60_000).toISOString();
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    episodeId: EP,
    kind,
    step,
    recordedByUserId: null,
    recordedAt: at,
    createdAt: at,
    payload,
    supersedesEventId: null,
  };
}

export const vitals = (
  minsAgo: number,
  snapshot: Record<string, unknown>,
  extra: Record<string, unknown> = {},
) => ev("vital", "C", minsAgo, { label: "Vitals", snapshot, ...extra });

export const artefact = (
  minsAgo: number,
  vitalEventId: string,
  fields: string[],
  isArtefact = true,
) =>
  ev("note", null, minsAgo, {
    noteKind: "vital_annotation",
    vitalEventId,
    fields,
    artefact: isArtefact,
    reason: "probe off",
    label: "Artefact",
  });

const EMPTY_FS: Record<AbcdeLetter, Record<string, unknown>> = {
  A: { patency: null, present: [], difficulty: [], context: {} },
  B: { state: null, present: [], context: {} },
  C: { state: null, present: [], context: {} },
  D: { state: null, gcs: null, avpu: null, glucoseMmol: null, present: [], context: {} },
  E: { state: null, present: [], coreTempC: null, ample: null, context: {} },
};
const PAYLOAD_KEY: Record<AbcdeLetter, string> = {
  A: "airway",
  B: "breathing",
  C: "circulation",
  D: "disability",
  E: "exposure",
};

/** An assessment event for a step (partial finding set over the empty one). */
export function assess(
  step: AbcdeLetter,
  minsAgo: number,
  fs: Record<string, unknown>,
  extra: Record<string, unknown> = {},
): TimelineEvent {
  return ev("assessment", step, minsAgo, {
    [PAYLOAD_KEY[step]]: { ...EMPTY_FS[step], ...fs },
    label: `${step} findings`,
    ...extra,
  });
}

/** A recorded action-state event (the panels use the code as the action id). */
export const act = (step: AbcdeLetter, minsAgo: number, code: string, state: string) =>
  ev("action", step, minsAgo, { actionId: code, actionCode: code, state, label: code });

export const ctxEvent = (minsAgo: number, over: Partial<PatientContextFlags>) =>
  ev("context", null, minsAgo, { flags: { ...EMPTY_CONTEXT, ...over }, label: "Context" });

export const flags = (over: Partial<PatientContextFlags> = {}): PatientContextFlags => ({
  ...EMPTY_CONTEXT,
  ...over,
});

export const v2 = (over: Partial<V2ContextInput> = {}): V2ContextInput => ({
  flags: EMPTY_CONTEXT,
  inArrest: false,
  local: EMPTY_LOCAL,
  abcAbnormal: false,
  ...over,
});

/** Shocked adult: HR 130, BP 70/60 (MAP 63), SpO₂ 67 %, RR 20 (the live-desk P3 case). */
export const SHOCKED = { hr: 130, rr: 20, spo2: 67, systolicBp: 70, diastolicBp: 60 };
export const NORMAL = { hr: 80, rr: 14, spo2: 98, systolicBp: 125, diastolicBp: 80 };

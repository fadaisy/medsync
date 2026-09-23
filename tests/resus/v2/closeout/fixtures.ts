import type { LevelInput } from "@/lib/resus/closeout/level-of-care";
import type { TimelineEvent } from "@/lib/resus/types";

/** Shared timeline-event builder for the close-out suites (not a test file). */

/** A recommender input where nothing is recorded (adult). */
export const BASE: LevelInput = {
  ageYears: 50,
  stabilised: true,
  postRosc: false,
  obeysCommands: null,
  ettInSitu: false,
  niv: false,
  vasopressor: false,
  agitationDelirium: false,
  riskOfEscalation: false,
  refractoryAnaphylaxis: false,
  gcsTotal: null,
  statusEpilepticus: false,
  news2: null,
  rrtNeeded: false,
  renalSetting: false,
  bmiOver40: false,
  stemi: false,
  haemorrhage: false,
  pregnancyRelated: false,
  headInjury: false,
  nonCoronaryCause: false,
};

export const EP = "00000000-0000-4000-8000-0000000000c0";
export const NOW = Date.parse("2026-09-23T17:00:00Z");

let seq = 0;

export function ev(
  kind: TimelineEvent["kind"],
  step: TimelineEvent["step"],
  minsAgo: number,
  payload: Record<string, unknown>,
  extra: Partial<TimelineEvent> = {},
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
    ...extra,
  };
}

export const arrest = (minsAgo: number, arrestSeq = 1) =>
  ev("arrest_detected", "arrest", minsAgo, {
    arrestSeq,
    reason: "no pulse",
    source: "desk",
    label: "Arrest",
  });

export const rosc = (minsAgo: number, arrestSeq = 1) =>
  ev("rosc", "arrest", minsAgo, { arrestSeq, signs: ["pulse"], label: "ROSC" });

export const decision = (minsAgo: number, payload: Record<string, unknown>) =>
  ev("decision", null, minsAgo, { label: "Decision", ...payload });

/** A step action event (the buildXActions shape). */
export const action = (
  step: "A" | "B" | "C" | "D" | "E",
  code: string,
  state: string,
  minsAgo = 5,
) =>
  ev("action", step, minsAgo, {
    actionId: `${code}-1`,
    actionCode: code,
    state,
    label: code,
  });

export const drug = (minsAgo: number, prescribing: Record<string, unknown>) =>
  ev("drug", "C", minsAgo, { prescribing, state: "performed", label: "Drug" });

export const vitals = (minsAgo: number, snapshot: Record<string, unknown>) =>
  ev("vital", "C", minsAgo, { label: "Vitals", snapshot });

export const context = (minsAgo: number, flags: Record<string, unknown>) =>
  ev("context", "pre", minsAgo, { flags, label: "Context" });

/** A complete adult vital set scoring NEWS2 0 (RR 16, SpO₂ 97, air, SBP 120, HR 70, A, 37.0). */
export const NORMAL_VITALS = {
  rr: 16,
  spo2: 97,
  oxygen: "air",
  systolicBp: 120,
  hr: 70,
  consciousness: "A",
  temperature: 37,
};

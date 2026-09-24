import type { recordStepFindingsV2 } from "@/app/nurse/resus/_v2/actions-survey";
import type { Avpu } from "@/lib/resus/disability";
import type { StepLocalToggles } from "@/lib/resus/model";
import type { AbcdeLetter, TimelineEvent } from "@/lib/resus/types";

import { STEP_LOCAL_CONTROLS } from "@/lib/resus/reference/presentation";
import {
  AIRWAY_ADAPTER,
  BREATHING_ADAPTER,
  CIRCULATION_ADAPTER,
  DISABILITY_ADAPTER,
  EXPOSURE_ADAPTER,
} from "@/lib/resus/survey/floor";
import { ABCDE_LETTERS } from "@/lib/resus/types";

/**
 * Resus Desk v2 — the step panel's draft model (part of step-panel.tsx).
 * A draft is the recorded finding set as editable values; the panel compares
 * it with the record ("2 unsaved") and turns it back into the server's
 * `recordStepFindingsV2` input without dropping recorded fields it does not edit.
 * Drafts are held per episode + step in `stepDrafts` (below), outside React, so
 * a tab switch, a mode change or an unmount never drops them silently.
 */

export const STEP_NAME: Record<AbcdeLetter, string> = {
  A: "Airway",
  B: "Breathing",
  C: "Circulation",
  D: "Disability",
  E: "Exposure",
};

export interface StepDraft {
  /** A: patency · B–E: the overall picture (state) code. */
  headline: string | null;
  present: string[];
  /** A: difficult-airway screen flags. */
  difficulty: string[];
  /** Intubated (S7): verbal is "T" — stored and scored as verbal 1 + intubated, as v1. */
  gcs: { eye: number | null; verbal: number | null; motor: number | null; intubated: boolean };
  avpu: Avpu | null;
  glucose: string;
  coreTemp: string;
  /** This step's local toggles (recorded context until changed). */
  local: Partial<StepLocalToggles>;
}

export type Findings = Parameters<typeof recordStepFindingsV2>[0]["findings"];

export interface Seed {
  draft: StepDraft;
  /** Recorded fields the panel does not edit but must not drop on re-record. */
  carry: Record<string, unknown>;
}

const numOrNull = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (n: number | null | undefined) => (n == null ? "" : String(n));

/** "" → null; anything unparseable → NaN (counts as a change, blocks recording). */
export function parseNum(s: string): number | null {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

export function latestAssessment(
  step: AbcdeLetter,
  events: readonly TimelineEvent[],
): TimelineEvent | null {
  let latest: TimelineEvent | null = null;
  for (const e of events)
    if (
      e.kind === "assessment" &&
      e.step === step &&
      (!latest || e.recordedAt >= latest.recordedAt)
    )
      latest = e;
  return latest;
}

export function seedFor(step: AbcdeLetter, events: readonly TimelineEvent[]): Seed {
  const draft: StepDraft = {
    headline: null,
    present: [],
    difficulty: [],
    gcs: { eye: null, verbal: null, motor: null, intubated: false },
    avpu: null,
    glucose: "",
    coreTemp: "",
    local: {},
  };
  const carry: Record<string, unknown> = {};
  let ctx: Record<string, boolean | undefined> = {};
  if (step === "A") {
    const fs = AIRWAY_ADAPTER.latest(events);
    if (fs)
      Object.assign(draft, {
        headline: fs.patency,
        present: fs.present,
        difficulty: fs.difficulty,
      });
    ctx = fs?.context ?? {};
  } else if (step === "B" || step === "C") {
    const fs = (step === "B" ? BREATHING_ADAPTER : CIRCULATION_ADAPTER).latest(events);
    if (fs) Object.assign(draft, { headline: fs.state, present: fs.present });
    ctx = fs?.context ?? {};
  } else if (step === "D") {
    const fs = DISABILITY_ADAPTER.latest(events);
    if (fs) {
      const g = fs.gcs as Record<string, unknown> | null;
      Object.assign(draft, {
        headline: fs.state,
        present: fs.present,
        gcs: {
          eye: numOrNull(g?.eye),
          verbal: numOrNull(g?.verbal),
          motor: numOrNull(g?.motor),
          intubated: g?.intubated === true,
        },
        avpu: fs.avpu,
        glucose: str(fs.glucoseMmol),
      });
      carry.focalOnset = fs.focalOnset ?? null;
      carry.seizureDurationMin = fs.seizureDurationMin ?? null;
    }
    ctx = fs?.context ?? {};
  } else {
    const fs = EXPOSURE_ADAPTER.latest(events);
    if (fs)
      Object.assign(draft, {
        headline: fs.state,
        present: fs.present,
        coreTemp: str(fs.coreTempC),
      });
    carry.ample = fs?.ample ?? null;
    ctx = fs?.context ?? {};
  }
  for (const c of STEP_LOCAL_CONTROLS)
    if (c.step === step && c.toggle) draft.local[c.toggle] = ctx[c.toggle] === true;
  return { draft, carry };
}

/** How many things differ from what is recorded ("2 unsaved"). */
export function diffCount(a: StepDraft, b: StepDraft): number {
  const sym = (x: string[], y: string[]) =>
    x.filter((c) => !y.includes(c)).length + y.filter((c) => !x.includes(c)).length;
  const numDiff = (x: string, y: string) => !Object.is(parseNum(x), parseNum(y));
  let n = sym(a.present, b.present) + sym(a.difficulty, b.difficulty);
  if (a.headline !== b.headline) n++;
  for (const k of ["eye", "verbal", "motor", "intubated"] as const) if (a.gcs[k] !== b.gcs[k]) n++;
  if (a.avpu !== b.avpu) n++;
  if (numDiff(a.glucose, b.glucose)) n++;
  if (numDiff(a.coreTemp, b.coreTemp)) n++;
  for (const k of Object.keys(b.local) as (keyof StepLocalToggles)[])
    if (!!a.local[k] !== !!b.local[k]) n++;
  return n;
}

export function findingsFor(
  step: AbcdeLetter,
  d: StepDraft,
  carry: Record<string, unknown>,
): Findings {
  if (step === "A") return { patency: d.headline, present: d.present, difficulty: d.difficulty };
  if (step === "B" || step === "C") return { state: d.headline, present: d.present };
  if (step === "D") {
    const g = d.gcs;
    return {
      state: d.headline,
      present: d.present,
      gcs:
        g.eye == null && g.verbal == null && g.motor == null
          ? null
          : g.intubated
            ? { eye: g.eye, verbal: 1, motor: g.motor, intubated: true }
            : { eye: g.eye, verbal: g.verbal, motor: g.motor },
      avpu: d.avpu,
      glucoseMmol: parseNum(d.glucose),
      focalOnset: (carry.focalOnset as string | null | undefined) ?? null,
      seizureDurationMin: (carry.seizureDurationMin as number | null | undefined) ?? null,
    };
  }
  return {
    state: d.headline,
    present: d.present,
    coreTempC: parseNum(d.coreTemp),
    ample: toAmpleInput(carry.ample),
  };
}

export const inRange = (s: string, min: number, max: number) => {
  const n = parseNum(s);
  return n === null || (!Number.isNaN(n) && n >= min && n <= max);
};

export type AmpleInput = NonNullable<
  Parameters<typeof recordStepFindingsV2>[0]["findings"]["ample"]
>;

/** A stored AMPLE (v1 `past` or v2 `pastHistory`) → the server's input shape. */
export function toAmpleInput(raw: unknown): AmpleInput | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === "string" && v.trim() ? v : undefined);
  return {
    allergies: Array.isArray(a.allergies)
      ? a.allergies.filter((x): x is string => typeof x === "string")
      : [],
    medications: s(a.medications),
    pastHistory: s(a.pastHistory) ?? s(a.past),
    lastMeal: s(a.lastMeal),
    events: s(a.events),
    nkda: a.nkda === true ? true : undefined,
  };
}

/** The record a draft was started on: stable across pending → confirmed (clientEventId). */
export const baseKeyOf = (e: TimelineEvent | null): string | null =>
  e ? (e.clientEventId ?? e.id) : null;

export interface HeldDraft {
  base: string | null;
  draft: StepDraft;
}

// ponytail: in-memory per tab (like the write queue, E1) — lost on reload; the leave guards warn.
const HELD = new Map<string, HeldDraft>();
const LISTENERS = new Set<() => void>();
let version = 0;
const keyOf = (episodeId: string, step: AbcdeLetter) => `${episodeId}:${step}`;

/** Unsaved step drafts, per episode + step (R3): they outlive the panel that edits them. */
export const stepDrafts = {
  get: (episodeId: string, step: AbcdeLetter) => HELD.get(keyOf(episodeId, step)),
  set(episodeId: string, step: AbcdeLetter, held: HeldDraft | null) {
    if (held) HELD.set(keyOf(episodeId, step), held);
    else HELD.delete(keyOf(episodeId, step));
    version += 1;
    for (const l of LISTENERS) l();
  },
  subscribe(l: () => void) {
    LISTENERS.add(l);
    return () => {
      LISTENERS.delete(l);
    };
  },
  version: () => version,
};

/** The steps whose held draft differs from their latest record — for the leave guards. */
export function unsavedSteps(episodeId: string, events: readonly TimelineEvent[]): AbcdeLetter[] {
  return ABCDE_LETTERS.filter((s) => {
    const h = stepDrafts.get(episodeId, s);
    return !!h && diffCount(h.draft, seedFor(s, events).draft) > 0;
  });
}

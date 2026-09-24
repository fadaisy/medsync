import type { CloseOutDraft } from "./close-out-model";
import type { DeskCtxValue } from "./desk-context";
import type { HandoverInput } from "@/lib/resus/closeout/handover";
import type { ArrestState, CareLevel, OutcomeCode } from "@/lib/resus/model";
import type { TimelineEvent } from "@/lib/resus/types";
import type { VitalSnapshot } from "@/lib/resus/vitals";

import { news2FromVitals, news2VitalSet } from "@/lib/resus/closeout/level-of-care";
import { postRoscPins } from "@/lib/resus/closeout/post-rosc";
import { latestExposureAssessment } from "@/lib/resus/exposure";
import { refValue } from "@/lib/resus/reference/ref";
import { ADULT_MIN_AGE_YEARS } from "@/lib/resus/survey/vitals-bands";
import { reconstructTimeline } from "@/lib/resus/timeline";
import { arrestSummary, isDecision, stepLines } from "./close-out-model";
import { hhmm, TRIGGER_WORD } from "./close-out-words";

/**
 * Lane U6 — the record → SBAR input (CO-HO-02). buildSbar (lib/resus/closeout/
 * handover.ts) turns it into the deterministic draft; the leader edits it.
 * Everything here restates the record; "not recorded" stays "not recorded".
 */
export function handoverInput(a: {
  d: DeskCtxValue;
  events: readonly TimelineEvent[];
  arrest: ArrestState;
  draft: CloseOutDraft;
  outcome: OutcomeCode | null;
  suggested: CareLevel | null;
  chosen: CareLevel | null;
  outstanding: { key: string; label: string }[];
  devicesDefault: string[];
}): HandoverInput {
  const { d, events, draft } = a;
  const ep = d.store.episode;
  const reading = news2Reading(events, d.ageYears);
  let limitation: string | null = null;
  for (const e of events)
    if (isDecision(e, "treatment_limitation") && typeof e.payload.summary === "string")
      limitation = e.payload.summary;
  const trigger = TRIGGER_WORD[ep.triggerKind] ?? ep.triggerKind;
  const devices =
    draft.devices === null
      ? a.devicesDefault
      : draft.devices
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean);
  return {
    patient: {
      label: d.initial.patient.displayName ?? "Unidentified patient",
      ageYears: d.ageYears,
      sex: d.initial.patient.sex,
    },
    trigger: ep.triggerReason ? `${trigger} — ${ep.triggerReason}` : trigger,
    phase: d.store.episode.phase,
    outcome: a.outcome,
    treatmentLimitation: limitation,
    ample: latestExposureAssessment(events)?.ample ?? null,
    weightKg: null,
    steps: stepLines(events, d.survey),
    lastVitals: reading
      ? { snapshot: reading.set, atLabel: hhmm(reading.atIso), trend: null }
      : null,
    news2: reading?.news2?.total ?? null,
    arrest: arrestSummary(a.arrest),
    devices,
    outstandingActions: a.outstanding
      .filter((o) => !draft.dropped.includes(o.key))
      .map((o) => o.label),
    targets: handoverTargets(events, d.ageYears),
    pendingInvestigations: [],
    level: { suggested: a.suggested, chosen: a.chosen },
    escortNeeds: draft.escort.trim() ? [draft.escort.trim()] : [],
  };
}

/**
 * CO-BRD-02, CO-R11/12: NEWS2 and "Last vitals" come from ONE vital set — the
 * set the recommender scores (news2VitalSet: newest resus set with a NEWS2
 * parameter, artefacts out, no triage carry-in) — never the newest value per
 * field across sets, a reading nobody took. Null: no such set.
 */
export function news2Reading(
  events: readonly TimelineEvent[],
  ageYears: number | null,
): { set: VitalSnapshot; atIso: string; news2: ReturnType<typeof news2FromVitals> } | null {
  const set = news2VitalSet(events);
  if (!set) return null;
  // The set's time: the newest vital event that yields a set on its own (the same pick).
  const others = events.filter((e) => e.kind !== "vital");
  const source = reconstructTimeline(events).findLast(
    (e) => e.kind === "vital" && news2VitalSet([...others, e]) !== null,
  );
  return source ? { set, atIso: source.recordedAt, news2: news2FromVitals(set, ageYears) } : null;
}

/**
 * The post-ROSC targets the handover restates (PR-PIN-B..E). Law 7 / D13: the
 * pins are adult numbers, so a child (< 16) gets none — the survey pins and the
 * bundle withhold them the same way. Unknown age reads as adult, as there.
 */
export function handoverTargets(
  events: readonly TimelineEvent[],
  ageYears: number | null,
): string[] {
  if (!events.some((e) => e.kind === "rosc")) return [];
  if (ageYears !== null && ageYears < ADULT_MIN_AGE_YEARS)
    return ["adult targets not shown (child — D13)"];
  return (["B", "C", "D", "E"] as const).flatMap((s) => postRoscPins(s).map(refValue));
}

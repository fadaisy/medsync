import type { HandoverInput } from "@/lib/resus/closeout/handover";
import type {
  ArrestState,
  CareLevel,
  CareUnit,
  Destination,
  LevelMismatchCode,
  OutcomeCode,
} from "@/lib/resus/model";
import type { RefEntry } from "@/lib/resus/reference/ref";
import type { Survey } from "@/lib/resus/survey/floor";
import type { AbcdeLetter, TimelineEvent } from "@/lib/resus/types";

import {
  ETT_ACTION_CODES,
  NIV_ACTION_CODES,
  VASOPRESSOR_ACTION_CODES,
} from "@/lib/resus/closeout/level-of-care";
import { BREATHING_STATE_LABEL } from "@/lib/resus/reference/breathing-catalog";
import { CIRCULATORY_STATE_LABEL } from "@/lib/resus/reference/circulation-catalog";
import { DISABILITY_STATE_LABEL } from "@/lib/resus/reference/disability-catalog";
import { EXPOSURE_STATE_LABEL } from "@/lib/resus/reference/exposure-catalog";
import {
  CARE_LEVEL_RANK,
  CLOSEOUT_REF,
  NEWS2_EMERGENCY_MIN,
  NEWS2_URGENT_MIN,
  REQUIRED_CAPABILITIES,
} from "@/lib/resus/reference/levels-of-care";
import { findingLabel } from "@/lib/resus/reference/presentation";
import { PENDING_CSO } from "@/lib/resus/reference/ref";
import {
  AIRWAY_ADAPTER,
  BREATHING_ADAPTER,
  CIRCULATION_ADAPTER,
  DISABILITY_ADAPTER,
  EXPOSURE_ADAPTER,
} from "@/lib/resus/survey/floor";

/**
 * Lane U6 — the close-out sheet's pure helpers: words for codes, the
 * unit → destination / level mapping, and the record → handover-input pieces
 * (docs/clinical/resus-closeout-clinical-catalog.md §1, §4). Nothing here
 * decides: it restates the record and the signed catalog.
 */

/** Destinations a clinician picks without a registered unit. */
export const DESTINATIONS_OFFERED: readonly Destination[] = [
  "icu",
  "hdu",
  "ward",
  "theatre",
  "cath_lab",
  "labour_ward",
  "transferred",
  "discharged",
];

/** The level a destination implies when no unit is chosen (ICU = L3, HDU = L2). */
const DESTINATION_LEVEL: Partial<Record<Destination, CareLevel>> = {
  icu: "l3",
  hdu: "l2",
  ward: "ward",
};

const UNIT_DESTINATION: Record<CareUnit["unitType"], Destination> = {
  ward: "ward",
  paeds_ward: "ward",
  ed_obs: "ward",
  hdu: "hdu",
  icu: "icu",
  picu: "icu",
  nicu: "icu",
  theatre: "theatre",
  cath_lab: "cath_lab",
  labour_ward: "labour_ward",
};

export function unitDestination(u: CareUnit): Destination {
  return UNIT_DESTINATION[u.unitType];
}

/** The highest level whose required capabilities the unit declares (catalog §4). */
export function unitLevel(u: CareUnit): CareLevel | null {
  if (u.unitType === "theatre" || u.unitType === "cath_lab") return null;
  for (const l of ["l3", "l2", "l1"] as const)
    if (REQUIRED_CAPABILITIES[l].every((c) => u.capabilities.includes(c))) return l;
  return "ward";
}

/** The chosen level of care: the unit's, else the destination's. */
export function chosenLevel(
  unit: CareUnit | null,
  destination: Destination | null,
): CareLevel | null {
  if (unit) return unitLevel(unit);
  return destination ? (DESTINATION_LEVEL[destination] ?? null) : null;
}

/**
 * Below the suggestion → a reason is needed (the recommender's only rule on
 * choice). Discharge counts as the lowest level for this check.
 */
export function belowSuggestion(
  suggested: CareLevel | null,
  chosen: CareLevel | null,
  destination: Destination | null,
): boolean {
  const effective = chosen ?? (destination === "discharged" ? "ward" : null);
  return !!suggested && !!effective && CARE_LEVEL_RANK[effective] < CARE_LEVEL_RANK[suggested];
}

/** A signed entry's text, or the pending marker (Law 3). */
export function refText(e: RefEntry): string {
  return e.status === "signed" ? e.text : PENDING_CSO;
}

/** CO-NEWS-01..05: the monitoring response for a NEWS2 result. */
export function news2Response(
  n: { total: number; hasSingleParameterThree: boolean } | null,
): RefEntry | null {
  if (!n) return null;
  const id =
    n.total >= NEWS2_EMERGENCY_MIN
      ? "CO-NEWS-01"
      : n.total >= NEWS2_URGENT_MIN
        ? "CO-NEWS-02"
        : n.hasSingleParameterThree
          ? "CO-NEWS-03"
          : n.total > 0
            ? "CO-NEWS-04"
            : "CO-NEWS-05";
  return CLOSEOUT_REF[id] ?? null;
}
/* ─── The record → handover pieces ──────────────────────────────────────── */

const latestWhere = (events: readonly TimelineEvent[], match: (e: TimelineEvent) => boolean) => {
  let hit: TimelineEvent | null = null;
  for (const e of events) if (match(e) && (!hit || e.recordedAt >= hit.recordedAt)) hit = e;
  return hit;
};

export const isDecision = (e: TimelineEvent, decision: string) =>
  e.kind === "decision" && e.payload.decision === decision;

/** The latest destination decision (boarding pre-fills the close-out from it). */
export function latestDisposition(events: readonly TimelineEvent[]) {
  const e = latestWhere(events, (x) => isDecision(x, "disposition"));
  if (!e) return null;
  const p = e.payload;
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  return {
    atIso: e.recordedAt,
    destination: str(p.destination) as Destination | null,
    unitId: str(p.unitId),
    chosenLevel: str(p.chosenLevel) as CareLevel | null,
    mismatch: str(p.mismatch) as LevelMismatchCode | null,
    mismatchNote: str(p.mismatchNote),
  };
}

/** The boarding clock's start (CO-BRD-04): the latest "boarding" phase decision. */
export function boardingSince(events: readonly TimelineEvent[]): string | null {
  const e = latestWhere(events, (x) => isDecision(x, "phase") && x.payload.phase === "boarding");
  return e?.recordedAt ?? null;
}

/**
 * Died → the outcome code of the observation that led to it: the latest stop or
 * CPR-not-attempted (the start deathObservation times from) — never any
 * CPR-not-attempted anywhere in the episode.
 */
export function deathOutcome(events: readonly TimelineEvent[]): OutcomeCode {
  const start = latestWhere(
    events,
    (e) => e.kind === "resuscitation_stopped" || isDecision(e, "cpr_not_attempted"),
  );
  return start && isDecision(start, "cpr_not_attempted")
    ? "died_cpr_not_attempted"
    : "died_after_cpr";
}

const STATE_LABEL: Record<AbcdeLetter, Record<string, string>> = {
  A: {},
  B: BREATHING_STATE_LABEL,
  C: CIRCULATORY_STATE_LABEL,
  D: DISABILITY_STATE_LABEL,
  E: EXPOSURE_STATE_LABEL,
};
const ADAPTERS = {
  A: AIRWAY_ADAPTER,
  B: BREATHING_ADAPTER,
  C: CIRCULATION_ADAPTER,
  D: DISABILITY_ADAPTER,
  E: EXPOSURE_ADAPTER,
} as const;
const humanise = (code: string) => {
  const s = code.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const MAX_FINDINGS = 6;

/** Final A–E states with their recorded (and vitals-derived) finding labels. */
export function stepLines(
  events: readonly TimelineEvent[],
  survey: Survey,
): HandoverInput["steps"] {
  return survey.states.map((s) => {
    const present = ADAPTERS[s.step].latest(events)?.present ?? [];
    const codes = [...new Set([...present, ...s.derivedCodes])];
    const labels = codes.slice(0, MAX_FINDINGS).map((c) => findingLabel(s.step, c));
    if (codes.length > MAX_FINDINGS) labels.push(`+${codes.length - MAX_FINDINGS} more`);
    const word = s.engineState
      ? (STATE_LABEL[s.step][s.engineState] ?? humanise(s.engineState))
      : null;
    return {
      step: s.step,
      state: word && !s.assessed && s.fromVitals ? `${word} (from vitals; not yet assessed)` : word,
      findings: labels,
    };
  });
}

const OUTSTANDING = new Set(["indicated", "in_progress", "failed"]);
const STATE_WORD: Record<string, string> = {
  indicated: "indicated",
  in_progress: "in progress",
  failed: "failed",
};

/** Actions still open at close-out (failed + indicated + in progress), to carry forward. */
export function outstandingActions(survey: Survey): { key: string; label: string }[] {
  return (["A", "B", "C", "D", "E"] as const).flatMap((step) =>
    survey.actions[step]
      .filter((a) => OUTSTANDING.has(a.state ?? "indicated"))
      .map((a) => ({
        key: `${step}:${a.code}`,
        label: `${step} · ${a.label} (${STATE_WORD[a.state ?? "indicated"]})`,
      })),
  );
}

const DEVICE_CODES = new Set([
  ...ETT_ACTION_CODES,
  ...NIV_ACTION_CODES,
  ...VASOPRESSOR_ACTION_CODES,
]);

/** Lines, tubes, devices the record shows (editable before signing). */
export function recordDevices(survey: Survey, arrest: ArrestState | null): string[] {
  const out: string[] = [];
  if (arrest?.airway.level === "ett") out.push("Tracheal tube (ETT)");
  if (arrest?.airway.level === "sga") out.push("Supraglottic airway");
  if (arrest?.access.iv) out.push("IV access");
  if (arrest?.access.io) out.push("IO access");
  for (const step of ["A", "B", "C", "D", "E"] as const)
    for (const a of survey.actions[step])
      if (DEVICE_CODES.has(a.code) && (a.state === "performed" || a.state === "in_progress"))
        out.push(a.label);
  return [...new Set(out)];
}

/** The arrest summary line of the handover (from the ALS engine's state). */
export function arrestSummary(a: ArrestState | null): HandoverInput["arrest"] {
  if (!a || a.arrestSeq === 0) return null;
  const drug = a.antiarrhythmic.drug === "lidocaine" ? "Lidocaine" : "Amiodarone";
  return {
    firstRhythm: a.firstRhythm,
    shocks: a.shocks.count,
    drugs: [
      a.adrenaline.doses > 0 ? `Adrenaline ×${a.adrenaline.doses}` : null,
      a.antiarrhythmic.dosesGiven > 0 ? `${drug} ×${a.antiarrhythmic.dosesGiven}` : null,
    ].filter((d): d is string => d !== null),
    timeToRoscMin:
      a.rosc.atMs !== null && a.arrestAtMs !== null
        ? Math.round((a.rosc.atMs - a.arrestAtMs) / 60_000)
        : null,
    totalCprMin: Math.round(a.cprElapsedMs / 60_000),
    sustained: a.rosc.atMs !== null ? a.rosc.sustained : null,
  };
}

export type { BedStatus, CloseOutDraft, CloseOutFacts, StepProps } from "./close-out-types";

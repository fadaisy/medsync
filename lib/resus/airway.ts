import type { AirwayPatency } from "@/lib/resus/reference/airway-catalog";
import type { TimelineEvent } from "@/lib/resus/types";

import {
  AIRWAY_APNOEA_FINDINGS,
  AIRWAY_COMPLETE_FINDINGS,
  AIRWAY_PARTIAL_FINDINGS,
  AIRWAY_THREATENED_FINDINGS,
} from "@/lib/resus/reference/airway-catalog";

/**
 * Airway step engine (GATE B: finding capture + state classification) —
 * PURE + deterministic. Reasons over recorded findings; makes no clinical
 * decision and performs nothing. The findings→action engine + the
 * action-state lifecycle are added in GATE C.
 *
 * Decision-support, not autonomous: the clinician records what they find
 * and do; this surfaces the guideline-correct classification + (GATE C)
 * the matched actions. Everything derives from the immutable resus
 * timeline (the reconstructTimeline / buildResusVitals pattern), so no
 * new migration is needed.
 */

/** secure → ... → apnoeic_arrest. Null = not yet assessed. */
export const AIRWAY_STATES = [
  "secure",
  "threatened",
  "partially_obstructed",
  "completely_obstructed",
  "apnoeic_arrest",
] as const;
export type AirwayState = (typeof AIRWAY_STATES)[number];

/**
 * A recorded airway finding-set. `present` holds the look/listen/feel
 * finding codes recorded as PRESENT (absent / not-assessed simply aren't
 * listed); `difficulty` holds the difficulty-screen flags; `context`
 * carries the trauma / allergen / signs-of-life modifiers.
 */
export interface AirwayFindingSet {
  patency: AirwayPatency | null;
  present: string[];
  difficulty: string[];
  context: {
    /** Trauma / suspected C-spine — selects jaw-thrust over head-tilt. */
    trauma?: boolean;
    /** Likely allergen trigger — supports the anaphylaxis cluster. */
    allergenTrigger?: boolean;
    /** No signs of life — routes apnoea to the arrest pathway. */
    noSignsOfLife?: boolean;
  };
}

function hasAny(present: readonly string[], group: readonly string[]): boolean {
  return present.some((p) => group.includes(p));
}

/**
 * Classify the airway from a finding-set — WORST finding wins, so an
 * optimistic patency never masks a dangerous finding (e.g. "talking" but
 * stridor present → partially obstructed). Returns null when nothing has
 * been assessed.
 */
export function classifyAirway(fs: AirwayFindingSet): AirwayState | null {
  const { patency, present, context } = fs;

  // Apnoea / arrest (highest).
  if (context.noSignsOfLife) return "apnoeic_arrest";
  if (patency === "apnoeic" || hasAny(present, AIRWAY_APNOEA_FINDINGS)) return "apnoeic_arrest";

  // Complete obstruction.
  if (patency === "completely_obstructed" || hasAny(present, AIRWAY_COMPLETE_FINDINGS))
    return "completely_obstructed";

  // Partial obstruction.
  if (patency === "partially_obstructed" || hasAny(present, AIRWAY_PARTIAL_FINDINGS))
    return "partially_obstructed";

  // Threatened (patent now, but at risk). A difficulty flag alone does NOT
  // downgrade a secure airway — it changes the action plan, not the state.
  if (patency === "patent_at_risk" || hasAny(present, AIRWAY_THREATENED_FINDINGS))
    return "threatened";

  // Secure — only when there is a positive patent finding.
  if (patency === "patent_talking" || present.includes("normal_speech")) return "secure";

  return null;
}

/** Type-guard for a stored airway finding-set payload. */
function readFindingSet(payload: Record<string, unknown>): AirwayFindingSet | null {
  const a = payload.airway as Partial<AirwayFindingSet> | undefined;
  if (!a || typeof a !== "object") return null;
  return {
    patency: (a.patency as AirwayPatency | null) ?? null,
    present: Array.isArray(a.present) ? (a.present as string[]) : [],
    difficulty: Array.isArray(a.difficulty) ? (a.difficulty as string[]) : [],
    context: (a.context as AirwayFindingSet["context"]) ?? {},
  };
}

/**
 * The current airway finding-set: the most recent `assessment` event on
 * step A that carries an airway payload. Reassessment appends a new event
 * (the immutable timeline keeps the prior); the latest is current.
 */
export function latestAirwayAssessment(events: readonly TimelineEvent[]): AirwayFindingSet | null {
  let latest: { at: string; fs: AirwayFindingSet } | null = null;
  for (const e of events) {
    if (e.kind !== "assessment" || e.step !== "A") continue;
    const fs = readFindingSet(e.payload);
    if (!fs) continue;
    if (!latest || e.recordedAt > latest.at) latest = { at: e.recordedAt, fs };
  }
  return latest?.fs ?? null;
}

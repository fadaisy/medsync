import type { EpisodePhase } from "@/lib/resus/model";
import type { ResusEpisodeState, ResusEventKind, TimelineEvent } from "@/lib/resus/types";

import { idleClass } from "@/lib/resus/closeout/idle";
import { EPISODE_PHASES } from "@/lib/resus/model";
import { reconstructTimeline } from "@/lib/resus/timeline";

/**
 * Episode lifecycle v2 (docs/resus-v2-gate-a-proposal.md §1; closeout catalog
 * §5 boarding and §9 idle) — PURE.
 *
 * `state` (active | concluded | cancelled) stays the lifecycle truth; while
 * active, `phase` says which mode the page shows. This module says which
 * user actions are allowed, and which phase the timeline implies (E4
 * projection-consistency).
 */

export const LIFECYCLE_ACTIONS = [
  "end",
  "cancel",
  "board",
  "reactivate",
  "admin_close",
  "declare_arrest",
  "rosc",
  "stop",
] as const;
export type LifecycleAction = (typeof LIFECYCLE_ACTIONS)[number];

export const LIFECYCLE_RULE_IDS = {
  /** Concluded and cancelled episodes are read-only: no action. */
  readOnly: "LC-01",
  /** End resus from any active phase; mid-arrest it never blocks (opens "How did the arrest end?"). */
  end: "LC-02",
  /** Cancel (opened in error) from any active phase, reason required. */
  cancel: "LC-03",
  /** Administrative close: idle ≥ 24 h (CO-IDLE-03), in-charge / HOD only, reason required. */
  adminClose: "LC-04",
  /** Declare arrest from survey, post-ROSC (re-arrest) and boarding (deterioration, CO-BRD-03). */
  declareArrest: "LC-05",
  /** ROSC and stop resuscitation only during an arrest. */
  arrestOnly: "LC-06",
  /** Board (destination decided, no bed) from survey or post-ROSC (CO-BRD-01). */
  board: "LC-07",
  /** Re-activate only from boarding, back to the survey (CO-BRD-03). */
  reactivate: "LC-08",
  /** The timeline implies the phase: start survey; arrest → arrest; ROSC → post-ROSC; phase decision → that phase. */
  projection: "LC-09",
  /** Any other event leaves the phase unchanged. */
  unchanged: "LC-10",
} as const;

export interface AllowedAction {
  action: LifecycleAction;
  ruleId: string;
  requiresReason: boolean;
}

export interface LifecycleSnapshot {
  state: ResusEpisodeState;
  phase: EpisodePhase;
  lastActivityAtMs: number;
}

const R = LIFECYCLE_RULE_IDS;

/** Phase-specific actions (end / cancel / admin close apply to every active phase). */
const BY_PHASE: Record<EpisodePhase, [LifecycleAction, string][]> = {
  survey: [
    ["declare_arrest", R.declareArrest],
    ["board", R.board],
  ],
  arrest: [
    ["rosc", R.arrestOnly],
    ["stop", R.arrestOnly],
  ],
  post_rosc: [
    ["declare_arrest", R.declareArrest],
    ["board", R.board],
  ],
  boarding: [
    ["reactivate", R.reactivate],
    ["declare_arrest", R.declareArrest],
  ],
};

export function allowedActions(
  ep: LifecycleSnapshot,
  nowMs: number,
  actor: { canAdminClose: boolean },
): AllowedAction[] {
  if (ep.state !== "active") return [];
  const out: AllowedAction[] = BY_PHASE[ep.phase].map(([action, ruleId]) => ({
    action,
    ruleId,
    requiresReason: false,
  }));
  out.push({ action: "end", ruleId: R.end, requiresReason: false });
  out.push({ action: "cancel", ruleId: R.cancel, requiresReason: true });
  if (actor.canAdminClose && idleClass(ep.lastActivityAtMs, nowMs).class === "admin_close")
    out.push({ action: "admin_close", ruleId: R.adminClose, requiresReason: true });
  return out;
}

function isPhase(v: unknown): v is EpisodePhase {
  return typeof v === "string" && (EPISODE_PHASES as readonly string[]).includes(v);
}

/** The phase after one event (LC-09 / LC-10). */
export function phaseAfter(
  kind: ResusEventKind,
  payload: Record<string, unknown>,
  current: EpisodePhase,
): EpisodePhase {
  if (kind === "arrest_detected") return "arrest";
  if (kind === "rosc") return "post_rosc";
  if (kind === "decision" && payload.decision === "phase" && isPhase(payload.phase))
    return payload.phase;
  return current;
}

/** The phase the (current-truth, chronological) timeline implies; start = survey. */
export function projectPhase(events: readonly TimelineEvent[]): EpisodePhase {
  return reconstructTimeline(events).reduce<EpisodePhase>(
    (phase, e) => phaseAfter(e.kind, e.payload, phase),
    "survey",
  );
}

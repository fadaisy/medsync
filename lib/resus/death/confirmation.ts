import type { DeathConfirmedPayload } from "@/lib/resus/model";
import type { TimelineEvent } from "@/lib/resus/types";

import { DEATH_OBSERVATION_MS } from "@/lib/resus/reference/als-catalog";
import { reconstructTimeline } from "@/lib/resus/timeline";

/**
 * Confirmation of death after cardiorespiratory arrest — the 5-minute observation machine.
 * PURE. Catalog §10 (AoMRC 2025): observe for at least 5 minutes (ALS-DTH-01), starting when
 * CPR stops or when CPR is not attempted (ALS-DTH-02). Any return of function — recorded as a
 * re-arrest declaration or a ROSC after the start — invalidates the observation ("Signs of
 * life — resume", ALS-DTH-05); the next stop starts a fresh 5:00 and counts as a restart.
 * The desk records facts; it never confirms death by itself (ALS-DTH-07, -09).
 */

const isStart = (e: TimelineEvent) =>
  e.kind === "resuscitation_stopped" ||
  (e.kind === "decision" && e.payload.decision === "cpr_not_attempted");
const isReturn = (e: TimelineEvent) => e.kind === "arrest_detected" || e.kind === "rosc";

export interface DeathObservation {
  /** Latest "CPR stopped" / "CPR not attempted" time, or null (no observation yet). */
  startedAtMs: number | null;
  /** A return of function after the start — resume, do not confirm (ALS-DTH-05). */
  invalidated: boolean;
  elapsedMs: number;
  remainingMs: number;
  /** ≥ 5:00 observed without a return of function (ALS-DTH-01). */
  complete: boolean;
  /** Earlier observations that a return of function ended. */
  restarts: number;
}

export function deathObservation(
  events: readonly TimelineEvent[],
  nowMs: number,
): DeathObservation {
  const tl = reconstructTimeline(events);
  let startedAtMs: number | null = null;
  let invalidated = false;
  let restarts = 0;
  for (const e of tl) {
    if (isStart(e)) {
      if (startedAtMs !== null && invalidated) restarts += 1;
      startedAtMs = Date.parse(e.recordedAt);
      invalidated = false;
    } else if (startedAtMs !== null && isReturn(e)) {
      invalidated = true;
    }
  }
  const elapsedMs = startedAtMs === null || invalidated ? 0 : Math.max(0, nowMs - startedAtMs);
  return {
    startedAtMs,
    invalidated,
    elapsedMs,
    remainingMs:
      startedAtMs === null || invalidated
        ? DEATH_OBSERVATION_MS
        : Math.max(0, DEATH_OBSERVATION_MS - elapsedMs),
    complete: startedAtMs !== null && !invalidated && elapsedMs >= DEATH_OBSERVATION_MS,
    restarts,
  };
}

/**
 * The bedside checklist is complete (ALS-DTH-01 + ALS-DTH-06): the three observed criteria and
 * absent pupillary and motor responses are all confirmed. Corneal reflexes: a recorded
 * "present" (false) blocks; "not recorded" (null) is accepted because the catalog asks for it
 * "soon after an arrest" only.
 */
export function deathChecklistComplete(c: DeathConfirmedPayload["criteria"]): boolean {
  return (
    c.unconscious &&
    c.apnoea &&
    c.noCirculation &&
    c.pupilsUnreactive &&
    c.noMotorResponse &&
    c.cornealReflexesAbsent !== false
  );
}

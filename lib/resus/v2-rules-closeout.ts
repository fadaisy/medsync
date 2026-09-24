import type { OUTCOME_CODES } from "@/lib/resus/model";
import type { TimelineEvent } from "@/lib/resus/types";

import { deathObservation } from "@/lib/resus/death/confirmation";
import { CLOSEOUT_REFS } from "@/lib/resus/reference/levels-of-care";
import { arrestActive } from "@/lib/resus/survey/context";
import { reconstructTimeline } from "@/lib/resus/timeline";

/**
 * Resus Desk v2 — the write-side rules for death and close-out (part of
 * lib/resus/v2-rules.ts). PURE: data-validity checks on what is being
 * recorded, never clinical blocks.
 */

/**
 * ALS-DTH-07: one time of death per observation. The death already confirmed
 * at or after the latest "CPR stopped" / "CPR not attempted" (the desk's own
 * `confirmed` test), or null.
 */
export function priorDeathConfirmation(events: readonly TimelineEvent[]): TimelineEvent | null {
  // Only the observation's start is read, and it does not depend on the clock.
  const start = deathObservation(events, 0).startedAtMs;
  const tl = reconstructTimeline(events);
  return (
    tl.findLast(
      (e) => e.kind === "death_confirmed" && (start === null || Date.parse(e.recordedAt) >= start),
    ) ?? null
  );
}

/**
 * LC-02 / CO-UTS-08: the outcome must match the record. Once resuscitation is
 * stopped (or CPR not attempted) with no return of function since, or a death
 * is confirmed, only a death outcome fits — after the confirmation, to the
 * mortuary. A ROSC outcome needs a ROSC and NO arrest running (a re-arrest after
 * ROSC is still an arrest); "stabilised" needs no arrest running.
 */
export function closeOutcomeProblem(
  outcomeCode: (typeof OUTCOME_CODES)[number],
  destination: string,
  events: readonly TimelineEvent[],
): string | null {
  const kinds = new Set(events.map((e) => e.kind));
  const died = outcomeCode === "died_after_cpr" || outcomeCode === "died_cpr_not_attempted";
  const rosc = outcomeCode === "rosc_sustained" || outcomeCode === "rosc_not_sustained";
  const confirmed = kinds.has("death_confirmed");
  const obs = deathObservation(events, 0);
  if (died && !confirmed) return "Confirm death first (5-minute observation).";
  if (!died && confirmed) return "Death is confirmed — the outcome is a death.";
  if (!died && obs.startedAtMs !== null && !obs.invalidated)
    return "Resuscitation is stopped — confirm death, or record signs of life, before closing.";
  if (
    outcomeCode === "died_cpr_not_attempted" &&
    reconstructTimeline(events).findLast(
      (e) =>
        e.kind === "resuscitation_stopped" ||
        (e.kind === "decision" && e.payload.decision === "cpr_not_attempted"),
    )?.kind === "resuscitation_stopped"
  )
    return "CPR was attempted — the outcome is died after CPR.";
  if (rosc && !kinds.has("rosc")) return "No ROSC is recorded in this resus.";
  if ((rosc || outcomeCode === "stabilised") && arrestActive(events))
    return 'An arrest is running — record ROSC, stop resuscitation, or choose "transferred out".';
  if (died && destination !== "mortuary")
    return "After a confirmed death the destination is the mortuary.";
  return null;
}

/** ALS-REC-07: "CPR not attempted" is refused while an arrest is running (CPR has started). */
export function cprNotAttemptedProblem(events: readonly TimelineEvent[]): string | null {
  return arrestActive(events) ? "CPR has started — use Stop resuscitation." : null;
}

/** CO-ADT-11 (organ donation): refused until a hospital setting enables it — none exists yet. */
export const ORGAN_DONATION_TASK = "CO-ADT-11";

const AFTER_DEATH_TASKS = new Set(
  CLOSEOUT_REFS.filter((r) => r.id.startsWith("CO-ADT-")).map((r) => r.id),
);

/** CO-ADT-01..10: an after-death task id the signed catalog lists, or why not. */
export function afterDeathTaskProblem(taskId: string): string | null {
  if (!AFTER_DEATH_TASKS.has(taskId)) return "Unknown after-death task.";
  if (taskId === ORGAN_DONATION_TASK)
    return "Organ donation is not enabled for this hospital (CO-ADT-11).";
  return null;
}

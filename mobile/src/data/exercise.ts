export type { Activity } from "@patient-core/care-move";

export type { Effort } from "@patient-core/care-move";
export {
  ACTIVITIES,
  activityOf,
  costOf,
  exerciseUnit,
  exercisesOn,
  hasEffort,
  kcalFor,
} from "@patient-core/care-move";

export { STEP_AIM, stepsOn } from "@patient-core/log";

/**
 * Which phone totals to write: a day the phone counted more on than the log
 * holds, by at least `minStep` (so a screen left open does not write a row a
 * second). The phone's count only grows within a day, so a smaller number is
 * never written.
 */
export function stepsToSave(
  stored: ReadonlyMap<string, number>,
  phone: readonly { day: string; steps: number }[],
  minStep = 50,
): { day: string; steps: number }[] {
  return phone.filter((p) => p.steps - (stored.get(p.day) ?? 0) >= minStep);
}

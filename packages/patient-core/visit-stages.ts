/**
 * Where the patient is on the day of the visit (patient app v2 §5.5, W3). Five steps, named, never a number,
 * a count ahead or a wait (MR4, ADR 0084). Built from the appointment and the clinic floor's step
 * (lib/clinic-floor/model.ts FLOOR_STEPS), so the phone, the web, the widget and the Live Activity say the same.
 */

export const STAGES = [
  "Booked",
  "Here",
  "Waiting for the nurse",
  "With the doctor",
  "Done",
] as const;

export type FloorStep = "triage" | "line" | "called" | "with" | "tests" | "done";

export interface StageView {
  /** 0 to 4: the step the patient is on. */
  index: 0 | 1 | 2 | 3 | 4;
  /** The words for that step, which can be more exact than the strip's label. */
  label: string;
  called: boolean;
}

export function stageOf(appointmentStatus: string, floor: FloorStep | null): StageView {
  if (appointmentStatus === "completed" || floor === "done")
    return { index: 4, label: "Done", called: false };
  if (floor === "with") return { index: 3, label: "With the doctor", called: false };
  if (floor === "tests") return { index: 3, label: "Having tests", called: false };
  if (floor === "called") return { index: 3, label: "Called", called: true };
  if (floor === "line") return { index: 2, label: "Waiting for the doctor", called: false };
  if (floor === "triage") return { index: 2, label: "Waiting for the nurse", called: false };
  if (appointmentStatus === "arrived" || appointmentStatus === "in_progress")
    return { index: 1, label: "Here", called: false };
  return { index: 0, label: "Booked", called: false };
}

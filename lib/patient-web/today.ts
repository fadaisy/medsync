import type { Dose, DoseStatus, MedRow, TakeRec } from "@patient-core/medicines";
import { dayDoses, doseStatus, takeFor, toDose } from "@patient-core/medicines";

import { pendingSlotAt } from "@/lib/patient/doses";

/** Today's doses as the phone's `useMedicines` lists them. Pure; snoozes are page state, not here. */
export interface DayDose extends Dose {
  status: DoseStatus;
  medicationId: string;
  /** The take that made it "taken", for Undo. */
  takeId: string | null;
}

export interface Today {
  doses: DayDose[];
  /** Due now, the dose a tap now belongs to first (`pendingSlotAt`). */
  dueNow: DayDose[];
  taken: number;
  total: number;
}

export function today(meds: MedRow[], takes: TakeRec[], now: Date): Today {
  const day = dayDoses(meds, takes, now, now);
  const doses = day.slots.map((slot) => ({
    ...toDose(slot),
    status: doseStatus(slot, now),
    medicationId: slot.medicationId,
    takeId: slot.state === "taken" ? (takeFor(slot, takes)?.id ?? null) : null,
  }));
  const pending = pendingSlotAt(day.slots, now)?.key;
  const dueNow = doses
    .filter((d) => d.status === "due")
    .sort((a, b) => Number(b.id === pending) - Number(a.id === pending));
  return { doses, dueNow, taken: day.taken, total: day.total };
}

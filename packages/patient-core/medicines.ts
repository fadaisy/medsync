import type { MedicationRow, TakeRow, DoseSlot as WebSlot } from "../../lib/patient/doses";
import type { DoseSlot } from "./dose-slots";

import { buildDayDoses, DOSE_GRACE_MINUTES } from "../../lib/patient/doses";
import { hhmm, SLOT_WORDS, slotOf } from "./dose-slots";

/**
 * Today's doses as the patient reads them, over the web's own derivation (`lib/patient/doses.ts`). Moved
 * here verbatim from the phone's `mobile/src/data/medicines.ts` (its pure half) so the phone and the web
 * cannot disagree about a dose; the phone re-exports these once its file switches over.
 * No dose amount exists in this model (law L5): the `dose` column is never read.
 */

/** `noEntry`: past its time with nothing recorded, where a miss cannot be claimed (a guessed time). */
export type DoseStatus = "taken" | "due" | "later" | "missed" | "noEntry";

export interface Dose {
  /** The web's slot key, `${medicationId}@${HH:MM}`. */
  id: string;
  slot: DoseSlot;
  /** 24-hour "HH:MM". */
  time: string;
  medicine: string;
  instruction: string;
  takenAt: string | null;
  snoozedUntil: string | null;
  /** The slot's instant, which a take records as `scheduled_for`. */
  scheduledForIso: string;
}

const PRESCRIBED = "As your clinician prescribed";

/**
 * The phone's word for a slot: due from an hour before its time until the web's grace ends; an open slot
 * past that is the web's own "No entry" (a guessed time can never be missed).
 */
export function doseStatus(slot: Pick<WebSlot, "state" | "at">, now: Date): DoseStatus {
  if (slot.state === "taken") return "taken";
  if (slot.state === "missed") return "missed";
  const t = now.getTime();
  const at = slot.at.getTime();
  if (t < at - 60 * 60_000) return "later";
  if (t <= at + DOSE_GRACE_MINUTES * 60_000) return "due";
  return "noEntry";
}

/** One web slot to the phone's dose. Instructions follow the fixed words; the dose column never shows. */
export function toDose(slot: WebSlot, snoozedUntil: string | null = null): Dose {
  const extra = slot.instructions?.trim();
  return {
    id: slot.key,
    slot: slotOf(slot.timeLabel),
    time: slot.timeLabel,
    medicine: slot.name,
    instruction: extra ? `${PRESCRIBED} · ${extra}` : PRESCRIBED,
    takenAt: slot.state === "taken" ? (slot.takenAtLabel ?? slot.timeLabel) : null,
    snoozedUntil,
    scheduledForIso: slot.at.toISOString(),
  };
}

export interface MedRow extends MedicationRow {
  /** ISO; a medicine added on Wednesday has no doses to count on Monday. */
  createdAt: string;
}

export interface TakeRec extends TakeRow {
  id: string;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** The takes that belong to one day, filed by `coalesce(scheduled_for, taken_at)` like `listTakesForDay`. */
export function takesForDay(takes: TakeRec[], day: Date): TakeRec[] {
  const from = startOfDay(day).getTime();
  const to = addDays(day, 1).getTime();
  return takes.filter((t) => {
    const at = new Date(t.scheduledForIso ?? t.takenAtIso).getTime();
    return at >= from && at < to;
  });
}

/** The active medicines that existed by the end of `day`. */
function medsOn(meds: MedRow[], day: Date): MedRow[] {
  const end = addDays(day, 1).getTime();
  return meds.filter((m) => m.state === "active" && new Date(m.createdAt).getTime() < end);
}

export function dayDoses(meds: MedRow[], takes: TakeRec[], day: Date, now: Date) {
  return buildDayDoses({
    medications: medsOn(meds, day),
    takes: takesForDay(takes, day),
    day: startOfDay(day),
    now,
  });
}

/** Doses taken and doses scheduled on each of the six days before today and today, oldest first. */
export function weekCounts(
  meds: MedRow[],
  takes: TakeRec[],
  now: Date,
): { taken: number[]; totals: number[] } {
  const days = Array.from({ length: 7 }, (_, i) => addDays(now, i - 6));
  const built = days.map((d) => dayDoses(meds, takes, d, now));
  return { taken: built.map((b) => b.taken), totals: built.map((b) => b.total) };
}

const WHEN_ORDER: DoseSlot[] = ["morning", "midday", "evening", "night"];

/** "Morning and evening" from the clock times, in plain words. */
export function whenWords(med: MedicationRow): string {
  if (med.schedulePattern === "as_needed") return "When you need it";
  const slots = new Set((med.scheduleTimes ?? []).map((x) => slotOf(x.slice(0, 5))));
  const words = WHEN_ORDER.filter((s) => slots.has(s)).map((s) => SLOT_WORDS[s].toLowerCase());
  if (!words.length) return "No times set";
  const list =
    words.length > 1
      ? `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`
      : words[0]!;
  return list.charAt(0).toUpperCase() + list.slice(1);
}

/** The take that put a slot into "taken": its own `scheduled_for`, else the same medicine at the same minute. */
export function takeFor(slot: WebSlot, takes: TakeRec[]): TakeRec | undefined {
  const mine = takesForDay(takes, slot.at).filter((t) => t.medicationId === slot.medicationId);
  return (
    mine.find(
      (t) => t.scheduledForIso && new Date(t.scheduledForIso).getTime() === slot.at.getTime(),
    ) ?? mine.find((t) => hhmm(new Date(t.takenAtIso)) === slot.takenAtLabel)
  );
}

/** A dose's time of day: the words, the clock time a chip writes, and the slot of a clock time. Pure. */
export type DoseSlot = "morning" | "midday" | "evening" | "night";

export const SLOT_WORDS: Record<DoseSlot, string> = {
  morning: "Morning",
  midday: "Midday",
  evening: "Evening",
  night: "Night",
};

/** The clock time each time-of-day chip writes to `schedule_times` when a patient adds a medicine. */
export const SLOT_TIMES: Record<DoseSlot, string> = {
  morning: "08:00",
  midday: "13:00",
  evening: "20:00",
  night: "22:00",
};

export function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** The time-of-day word for a clock time: morning 04–11, midday 11–16, evening 16–21, night after. */
export function slotOf(timeLabel: string): DoseSlot {
  const h = Number(timeLabel.slice(0, 2));
  if (h >= 4 && h < 11) return "morning";
  if (h >= 11 && h < 16) return "midday";
  if (h >= 16 && h < 21) return "evening";
  return "night";
}

/** The pattern a set of chips writes, so the web's adherence reads it the same way. */
export function patternFor(times: string[]): string {
  if (times.length === 0) return "as_needed";
  return ["once_daily", "twice_daily", "thrice_daily"][times.length - 1] ?? "custom";
}

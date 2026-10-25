import type { ReadingLevel } from "@/lib/readings";

export {
  dayHeadline,
  lastSevenDays,
  longDate,
  shortDate,
  timelineFill,
} from "@patient-core/care-day";

/**
 * The small pure rules behind the Care screens, kept here so they can be
 * tested without rendering.
 */

/**
 * The reading page's Save button (board TReading). Disabled while there is
 * no number, unless Chest pain is picked: then it still goes for help.
 */
export function saveButton(
  level: ReadingLevel,
  chestPain: boolean,
): { disabled: boolean; help: boolean; label: string } {
  const help = level === "danger" || chestPain;
  return {
    disabled: level === "empty" && !chestPain,
    help,
    label: help ? "Save and get help" : "Save reading",
  };
}

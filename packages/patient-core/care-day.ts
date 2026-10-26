/**
 * The small pure rules behind the Care screens, moved verbatim from the phone's
 * `mobile/src/features/care/logic.ts` (all but `saveButton`, which readings already share).
 */

const COUNT_WORDS = ["None", "One", "Two", "Three", "Four", "Five", "Six"];
const word = (n: number) => COUNT_WORDS[n] ?? String(n);

/** The Medicines headline: "One down, two to go" (board TMedicines). */
export function dayHeadline(taken: number, total: number): string {
  if (total === 0) return "Nothing due today";
  if (taken >= total) return "All done for today";
  const left = total - taken;
  if (taken === 0) return `${word(left)} to go today`;
  return `${word(taken)} down, ${word(left).toLowerCase()} to go`;
}

/**
 * How far the Morning → Evening line is filled, 0–1. It creeps partway towards the next circle with each
 * dose and only reaches the end when the day is done.
 */
export function timelineFill(taken: number, total: number): number {
  if (total === 0 || taken >= total) return 1;
  return Math.max(0, taken) / (total + 1);
}

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** "Saturday 17 October". */
export const longDate = (d: Date) => `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
/** "Saturday 17 Oct". */
export const shortDate = (d: Date) =>
  `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]!.slice(0, 3)}`;

/** The seven days ending today, oldest first: the week squares, circles and chart. */
export function lastSevenDays(now: Date): { letter: string; name: string; date: number }[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6 + i);
    const name = DAYS[d.getDay()]!;
    return { letter: name[0]!, name, date: d.getDate() };
  });
}

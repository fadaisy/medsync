import { addDays } from "./stock";

/**
 * Lab Workspace v2, Reports (prompt 5.9): the period picker's presets as the URL parameters the reports page has
 * always read (`month`, or `from` and `to`; app/lab/reports/_lib/params.ts). Pure: `today` is the hospital-local
 * date key the server computed. A bookmark of the old filter form and a preset give the same report.
 */

export const PERIOD_PRESETS = [
  "today",
  "last7",
  "this_month",
  "last_month",
  "last3",
  "custom",
] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];
export interface PeriodParams {
  month?: string;
  from?: string;
  to?: string;
}

const monthOf = (day: string) => day.slice(0, 7);
const prevMonth = (month: string) => monthOf(addDays(`${month}-01`, -1));

/** A preset → its URL parameters. "custom" has none: the dates are picked. */
export function presetParams(p: PeriodPreset, today: string): PeriodParams {
  switch (p) {
    case "today":
      return { from: today, to: today };
    case "last7":
      return { from: addDays(today, -6), to: today };
    case "this_month":
      return { month: monthOf(today) };
    case "last_month":
      return { month: prevMonth(monthOf(today)) };
    case "last3":
      return { from: `${prevMonth(prevMonth(monthOf(today)))}-01`, to: today };
    case "custom":
      return {};
  }
}

/** Which preset the current parameters are (for the chip's pressed state); anything else is "custom". */
export function presetOf(
  v: { month: string; range: { from: string; to: string } | null },
  today: string,
): PeriodPreset {
  for (const p of PERIOD_PRESETS) {
    const q = presetParams(p, today);
    if (v.range ? q.from === v.range.from && q.to === v.range.to : q.month === v.month && !q.from)
      return p;
  }
  return "custom";
}

/** Two picked days in either order → a range. */
export const pickedRange = (a: string, b: string): PeriodParams =>
  a <= b ? { from: a, to: b } : { from: b, to: a };

/** The href for a period: the other parameters kept, the old period parameters replaced. */
export function periodHref(
  base: string,
  keep: Record<string, string | undefined>,
  p: PeriodParams,
): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(keep))
    if (v && k !== "month" && k !== "from" && k !== "to") q.set(k, v);
  for (const [k, v] of Object.entries(p)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

const MONTH_LONG = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const DAY_SHORT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const DAY_YEAR = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const at = (day: string) => new Date(`${day}T00:00:00Z`);

/** "October 2026" */
export const monthLong = (month: string) => MONTH_LONG.format(at(`${month}-01`));
/** "19 Oct", or "19 Oct 2025" outside today's year. */
export const dayShort = (day: string, today: string) =>
  day.slice(0, 4) === today.slice(0, 4) ? DAY_SHORT.format(at(day)) : DAY_YEAR.format(at(day));

/**
 * The chip's words: "October 2026 · to 19 Oct" while the month runs, "September 2026" once it has ended,
 * "13 Oct to 19 Oct" for a range, "19 Oct" for one day.
 */
export function periodWords(
  v: { month: string; range: { from: string; to: string } | null },
  today: string,
  words: { toDay: string; range: string },
): string {
  if (v.range)
    return v.range.from === v.range.to
      ? dayShort(v.range.from, today)
      : words.range
          .replace("{from}", dayShort(v.range.from, today))
          .replace("{to}", dayShort(v.range.to, today));
  return v.month === monthOf(today)
    ? `${monthLong(v.month)} · ${words.toDay.replace("{day}", dayShort(today, today))}`
    : monthLong(v.month);
}

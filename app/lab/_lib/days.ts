import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";

/** Lab dates as the design system writes them: `13 OCT 2026`, and 24-hour times, hospital-local. */
const DAY = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const AT_DAY = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: DEFAULT_TIME_ZONE,
});
const TIME = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: DEFAULT_TIME_ZONE,
});

/** A date key ("2026-10-13", already local) → "13 OCT 2026". */
export const dayWords = (day: string) => DAY.format(new Date(`${day}T00:00:00Z`)).toUpperCase();
/** An instant → "13 OCT 2026", hospital-local. */
export const dateWords = (at: Date) => AT_DAY.format(at).toUpperCase();
/** An instant → "08:10", hospital-local. */
export const timeWords = (at: Date) => TIME.format(at);

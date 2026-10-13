import { addDays, dayOf } from "@/lib/lab/stock";
import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";
import { dayWords } from "../../_lib/days";

/** Months as the HMIS 105 reads them ("2026-09"), hospital-local. Shared by /lab/hmis, its print and /hmis. */
const thisMonth = (now: Date) => dayOf(now, DEFAULT_TIME_ZONE).slice(0, 7);
const prev = (month: string) => addDays(`${month}-01`, -1).slice(0, 7);
const next = (month: string) => addDays(`${month}-28`, 7).slice(0, 7);

/** The month due now: the previous one (HM-13). */
export const dueMonth = (now: Date) => prev(thisMonth(now));
export const monthOptions = (now: Date, n = 12) => {
  const out = [thisMonth(now)];
  while (out.length < n) out.push(prev(out.at(-1)!));
  return out;
};
export const validMonth = (m: string | undefined, now: Date) =>
  m && monthOptions(now, 36).includes(m) ? m : dueMonth(now);
export const monthWords = (month: string) => dayWords(`${month}-01`).slice(3);
/** Due on the 7th of the following month. */
export const dueWords = (month: string) => dayWords(`${next(month)}-07`);

import type { Filters, Period } from "@/lib/lab/report-store";

import { ORDER_PRIORITIES } from "@/lib/emr/orders";
import { dayPeriod, monthPeriod } from "@/lib/lab/report-store";
import { daysBetween } from "@/lib/lab/stock";
import { monthOptions } from "../../hmis/_lib/month";

export type ReportParams = Record<string, string | undefined>;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[0-9a-f-]{36}$/;

/**
 * §5.13 filters from the query string: a month (the current one by default, QI-3) or a range of days up to a year,
 * ward or clinic, section, priority. Anything else falls back; ids are only ever compared, never trusted.
 */
export function reportParams(sp: ReportParams, now: Date) {
  const months = monthOptions(now, 36);
  const month = sp.month && months.includes(sp.month) ? sp.month : months[0]!;
  const range =
    sp.from && sp.to && DAY.test(sp.from) && DAY.test(sp.to) && daysBetween(sp.from, sp.to) >= 0
      ? daysBetween(sp.from, sp.to) <= 366
        ? { from: sp.from, to: sp.to }
        : null
      : null;
  const period: Period = range ? dayPeriod(range.from, range.to) : monthPeriod(month);
  const filters: Filters = {
    ward: sp.ward && ID.test(sp.ward) ? sp.ward : null,
    section: sp.section && ID.test(sp.section) ? sp.section : null,
    priority: ORDER_PRIORITIES.find((p) => p === sp.priority) ?? null,
  };
  const query = (extra: Record<string, string> = {}) =>
    new URLSearchParams(
      Object.entries({
        ...(range ? range : { month }),
        ward: filters.ward ?? "",
        section: filters.section ?? "",
        priority: filters.priority ?? "",
        ...extra,
      }).filter(([, v]) => v),
    ).toString();
  return { month, months, range, period, filters, query };
}

import "server-only";

import type { Filters, LabReport, ReportRow, Targets } from "./report-store";
import type { WeekPoint } from "./report-trend";
import type { EmrTx } from "@/lib/emr/db";

import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";
import { filtered, monthPeriod, reportFromRows, reportRows } from "./report-store";
import { lastMonths, statedTimes, weeklyMedianTat } from "./report-trend";

export interface ReportTrend {
  months: { month: string; rows: ReportRow[]; report: LabReport }[];
  weeks: WeekPoint[];
  stated: number[];
}

/**
 * Lab Workspace v2, Reports (5.9): the six months ending with `endMonth`, each read and counted exactly as the
 * reports page counts a month (`reportRows` as the clinical reader, then `reportFromRows` with the same filters),
 * and the weekly median turnaround over the same rows. Run inside `asClinicalReader`, so RLS decides who reads.
 */
export async function reportTrend(
  tx: EmrTx,
  o: { hospitalId: string; now: Date; targets: Targets; endMonth: string; filters: Filters },
): Promise<ReportTrend> {
  const months: ReportTrend["months"] = [];
  for (const month of lastMonths(o.endMonth)) {
    const period = monthPeriod(month);
    const rows = await reportRows(tx, period);
    months.push({
      month,
      rows,
      report: reportFromRows(
        rows,
        { hospitalId: o.hospitalId, now: o.now, targets: o.targets, ...period },
        o.filters,
      ),
    });
  }
  const all = filtered(
    months.flatMap((m) => m.rows),
    o.filters,
  );
  return {
    months,
    weeks: weeklyMedianTat(all, {
      hospitalId: o.hospitalId,
      now: o.now,
      timeZone: DEFAULT_TIME_ZONE,
      from: monthPeriod(months[0]!.month).from,
      to: monthPeriod(o.endMonth).to,
      targets: o.targets,
    }),
    stated: statedTimes(all, o.targets),
  };
}

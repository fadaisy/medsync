import "server-only";

import type { ReportParams } from "./params";
import type { LabTechScope } from "@/lib/lab-tech/scope";
import type { ReportRow } from "@/lib/lab/report-store";
import type { ReportTrend } from "@/lib/lab/report-trend-read";

import { reasonWord } from "@/components/lab/lab-report-view";
import { LAB3_REPORTS } from "@/content/lab-phase-3";
import { db } from "@/db";
import { asClinicalReader } from "@/lib/emr/db";
import {
  departmentNames,
  reportCsv,
  reportFromRows,
  reportRows,
  statedTargets,
} from "@/lib/lab/report-store";
import { reportTrend } from "@/lib/lab/report-trend-read";
import { reportParams } from "./params";

const R = LAB3_REPORTS;

/**
 * The reports page's one read (Lab Phase 3 §5.13), shared by the old page and Lab Workspace v2 so the numbers and
 * the CSV are the same bytes for the same period (S29): rows as the clinical reader, the engine over them with the
 * filters, names from the hub, and the CSV. With `trend`, the six months ending with the period (5.9).
 */
export async function loadReport(
  scope: Pick<LabTechScope, "userId" | "hospitalId">,
  sp: ReportParams,
  now: Date,
  opts: { trend?: boolean } = {},
) {
  const p = reportParams(sp, now);
  const h = scope.hospitalId;
  const meta = db.transaction((t) =>
    Promise.all([statedTargets(t as never, h), departmentNames(t as never, h)]),
  );
  const read = asClinicalReader({ userId: scope.userId, hospitalId: h }, async (tx) => {
    if (!opts.trend)
      return { rows: await reportRows(tx, p.period), trend: null as ReportTrend | null };
    const [targets] = await meta;
    const endMonth = p.range ? p.range.to.slice(0, 7) : p.month;
    const trend = await reportTrend(tx, {
      hospitalId: h,
      now,
      targets,
      endMonth,
      filters: p.filters,
    });
    const rows: ReportRow[] = p.range ? await reportRows(tx, p.period) : trend.months.at(-1)!.rows;
    return { rows, trend };
  });
  const [[targets, depts], { rows, trend }] = await Promise.all([meta, read]);
  const report = reportFromRows(rows, { hospitalId: h, now, targets, ...p.period }, p.filters);
  const names = {
    section: (id: string | null) => (id ? (depts.get(id) ?? id) : R.noSection),
    ward: (id: string | null) => (id ? (depts.get(id) ?? id) : R.noWard),
    reason: reasonWord,
  };
  const csv = reportCsv(report, { ...names, tile: (t) => R.tiles[t] });
  const wards = [...new Set(rows.map((r) => r.wardId).filter((x): x is string => !!x))];
  const sections = [...new Set(rows.map((r) => r.sectionId).filter((x): x is string => !!x))];
  return {
    p,
    report,
    names,
    targets,
    trend,
    wards,
    sections,
    csv: {
      href: `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`,
      name: `lab-reports-${p.range ? `${p.range.from}-${p.range.to}` : p.month}.csv`,
    },
  };
}

import type { SP } from "../_lib/v2-redirect";
import type { ReportParams } from "./_lib/params";
import type { Metadata } from "next";

import { LabReportView, reasonWord } from "@/components/lab/lab-report-view";
import { PageHeader } from "@/components/medsync/page-header";
import { buttonVariants } from "@/components/ui/button";
import { LAB } from "@/content/lab";
import { fill, LAB3_REPORTS } from "@/content/lab-phase-3";
import { db } from "@/db";
import { asClinicalReader } from "@/lib/emr/db";
import { ORDER_PRIORITIES, ORDER_PRIORITY_WORD } from "@/lib/emr/orders";
import { labReportsLiveFor } from "@/lib/lab/feature";
import {
  departmentNames,
  reportCsv,
  reportFromRows,
  reportRows,
  statedTargets,
} from "@/lib/lab/report-store";
import { DateField } from "../_components/v2/fields";
import { dateWords, dayWords, timeWords } from "../_lib/days";
import { labV2 } from "../_lib/places";
import { monthWords } from "../hmis/_lib/month";
import { requireQualityScope } from "../quality/_lib/scope";
import { reportParams } from "./_lib/params";
import { ReportsPlace } from "./_views/place";

export const metadata: Metadata = { title: "Lab reports · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

const R = LAB3_REPORTS;
const field =
  "border-input bg-card text-body-s focus-visible:shadow-focus min-h-11 rounded-sm border px-2 outline-none sm:min-h-9";

/**
 * /lab/reports is the Reports place's own path (gate-a §3): with Lab Workspace v2 on it is the tabbed place
 * (5.9); off, the old page exactly as before.
 */
export default async function LabReportsPage({ searchParams }: { searchParams: Promise<SP> }) {
  if ((await labV2()).live) return <ReportsPlace sp={await searchParams} />;
  return <OldReportsPage searchParams={searchParams as Promise<ReportParams>} />;
}

/**
 * Lab reports and quality indicators (Lab Phase 3 §5.13, artboard 13; labReports): filters (month or range, ward or
 * clinic, section, priority), the eight tiles, turnaround per section, rejections by reason, CSV and the as-of
 * time. Rows are read as the clinical reader through `private.lab_indicator_rows` (lab readers only, 0118), counted
 * at read time by the engine; every number opens its records (/lab/reports/records).
 */
async function OldReportsPage({ searchParams }: { searchParams: Promise<ReportParams> }) {
  const { scope } = await requireQualityScope(labReportsLiveFor);
  const now = new Date();
  const p = reportParams(await searchParams, now);
  const h = scope.hospitalId;
  const [rows, [targets, depts]] = await Promise.all([
    asClinicalReader({ userId: scope.userId, hospitalId: h }, (tx) => reportRows(tx, p.period)),
    db.transaction((t) =>
      Promise.all([statedTargets(t as never, h), departmentNames(t as never, h)]),
    ),
  ]);
  const report = reportFromRows(rows, { hospitalId: h, now, targets, ...p.period }, p.filters);
  const names = {
    section: (id: string | null) => (id ? (depts.get(id) ?? id) : R.noSection),
    ward: (id: string | null) => (id ? (depts.get(id) ?? id) : R.noWard),
    reason: reasonWord,
  };
  const csv = reportCsv(report, { ...names, tile: (t) => R.tiles[t] });
  const wards = [...new Set(rows.map((r) => r.wardId).filter((x): x is string => !!x))];
  const sections = [...new Set(rows.map((r) => r.sectionId).filter((x): x is string => !!x))];
  const period = p.range
    ? `${dayWords(p.range.from)} to ${dayWords(p.range.to)}`
    : monthWords(p.month);
  const select = (
    name: string,
    label: string,
    value: string | null,
    options: [string, string][],
  ) => (
    <label className="text-body-s flex flex-col gap-1">
      <span className="text-muted-foreground">{label}</span>
      <select name={name} defaultValue={value ?? ""} className={field}>
        <option value="">{R.filters.all}</option>
        {options.map(([v, w]) => (
          <option key={v} value={v}>
            {w}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
      <PageHeader
        place={`${scope.hospitalName} · ${LAB.place}`}
        placeInTopBar
        title={R.title}
        subline={`${period} · ${fill(R.asOf, { time: `${dateWords(now)} ${timeWords(now)}` })}`}
        right={
          <a
            href={`data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`}
            download={`lab-reports-${p.range ? `${p.range.from}-${p.range.to}` : p.month}.csv`}
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            {R.csv}
          </a>
        }
      />
      <p className="text-body-s text-muted-foreground max-w-[75ch]">{R.lede}</p>
      <form action="/lab/reports" className="flex flex-wrap items-end gap-3">
        {select(
          "month",
          R.filters.month,
          p.range ? null : p.month,
          p.months.map((m) => [m, monthWords(m)]),
        )}
        <DateField
          label={R.filters.from}
          name="from"
          defaultValue={p.range?.from}
          now={now.toISOString()}
        />
        <DateField
          label={R.filters.to}
          name="to"
          defaultValue={p.range?.to}
          now={now.toISOString()}
        />
        {select(
          "ward",
          R.filters.ward,
          p.filters.ward ?? null,
          wards.map((w) => [w, names.ward(w)]),
        )}
        {select(
          "section",
          R.filters.section,
          p.filters.section ?? null,
          sections.map((s) => [s, names.section(s)]),
        )}
        {select(
          "priority",
          R.filters.priority,
          p.filters.priority ?? null,
          ORDER_PRIORITIES.map((x) => [x, ORDER_PRIORITY_WORD[x]]),
        )}
        <button type="submit" className={buttonVariants({ variant: "secondary", size: "sm" })}>
          {R.filters.show}
        </button>
      </form>
      {p.filters.ward || p.filters.priority ? (
        <p className="text-caption text-muted-foreground">{R.notByWard}</p>
      ) : null}
      <LabReportView
        report={report}
        names={names}
        drill={(id, extra) => `/lab/reports/records?${p.query({ tile: id, ...extra })}`}
      />
    </div>
  );
}

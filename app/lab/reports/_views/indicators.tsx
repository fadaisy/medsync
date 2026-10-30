import type { ReportParams } from "../_lib/params";
import type { LabTechScope } from "@/lib/lab-tech/scope";
import type { IndicatorValue } from "@/lib/lab/indicators";
import type { TileId } from "@/lib/lab/report-store";
import type { ReactNode } from "react";
import Link from "next/link";

import { basis } from "@/components/lab/lab-report-view";
import { fill, LAB3, LAB3_REPORTS } from "@/content/lab-phase-3";
import { LABWS2_REPORTS } from "@/content/lab-workspace-v2-reports";
import { ORDER_PRIORITIES, ORDER_PRIORITY_WORD } from "@/lib/emr/orders";
import { monthLong } from "@/lib/lab/period";
import { TILES } from "@/lib/lab/report-store";
import { trendSeries } from "@/lib/lab/report-trend";
import { dayOf } from "@/lib/lab/stock";
import { formatDuration } from "@/lib/lab/turnaround";
import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";
import { ReasonBars, Sparkline, WeeklyLine } from "../_components/charts";
import { loadReport } from "../_lib/load";
import { EmptyState, KeyFigure, KeyFigureGrid, Panel } from "@/components/tide/work/kit";
import { PeriodPicker, PickChip } from "../../_components/v2/period-picker";
import { SpaceHeader } from "@/components/tide/work/space";
import { dateWords, timeWords } from "../../_lib/days";

const R = LAB3_REPORTS;
const I = LABWS2_REPORTS.indicators;
const CSV_LINK =
  "bg-card text-foreground hover:bg-ink-50 focus-visible:shadow-focus inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[13.5px] font-medium whitespace-nowrap shadow-[inset_0_0_0_1px_var(--color-ink-300)] outline-none";
const LINK = "text-primary font-medium underline-offset-4 hover:underline";

/** A tile's figure and unit, as the old tiles wrote them, in the text face (Law 7). */
function figureOf(t: TileId, v: IndicatorValue): { value: string | null; unit?: string } {
  if (v.kind === "no_data") return { value: null };
  if (t === "workload" || t === "misid_caught") return { value: v.value.toLocaleString("en-GB") };
  const n = v.value.toLocaleString("en-GB", { maximumFractionDigits: 1 });
  return t === "downtime_h" ? { value: n, unit: "h" } : { value: n, unit: "%" };
}
const words = (t: TileId, v: number | null) => {
  if (v === null) return I.sparkNoData;
  const f = figureOf(t, { kind: "value", value: v, numerator: v, denominator: null });
  return `${f.value}${f.unit ? ` ${f.unit}` : ""}`;
};

/** The period picker, the filter chips and Download CSV: the reports' one filter row (5.9). */
export function ReportFilters({
  tab,
  p,
  today,
  wards,
  sections,
  names,
  csv,
}: {
  tab: string;
  p: Awaited<ReturnType<typeof loadReport>>["p"];
  today: string;
  wards: string[];
  sections: string[];
  names: Awaited<ReturnType<typeof loadReport>>["names"];
  csv?: { href: string; name: string };
}) {
  const period = p.range ? { from: p.range.from, to: p.range.to } : { month: p.month };
  const filters = {
    ward: p.filters.ward ?? undefined,
    section: p.filters.section ?? undefined,
    priority: p.filters.priority ?? undefined,
  };
  const keep = { tab, ...period, ...filters };
  return (
    <>
      <PeriodPicker
        base="/lab/reports"
        keep={{ tab, ...filters }}
        value={{ month: p.month, range: p.range }}
        today={today}
      />
      <PickChip
        base="/lab/reports"
        keep={keep}
        param="ward"
        name={R.filters.ward}
        value={p.filters.ward ?? null}
        options={wards.map((w) => ({ value: w, label: names.ward(w) }))}
      />
      <PickChip
        base="/lab/reports"
        keep={keep}
        param="section"
        name={R.filters.section}
        value={p.filters.section ?? null}
        options={sections.map((s) => ({ value: s, label: names.section(s) }))}
      />
      <PickChip
        base="/lab/reports"
        keep={keep}
        param="priority"
        name={R.filters.priority}
        value={p.filters.priority ?? null}
        options={ORDER_PRIORITIES.map((x) => ({ value: x, label: ORDER_PRIORITY_WORD[x] }))}
      />
      {csv ? (
        <a href={csv.href} download={csv.name} className={CSV_LINK}>
          {R.csv}
        </a>
      ) : null}
    </>
  );
}

/**
 * Reports → Indicators (prompt 5.9; canvas Reports): the eight indicators as key figures with six months of
 * trend and last month beside them, the weekly median turnaround against the stated time, turnaround by
 * section, and rejected specimens by reason. Every number opens /lab/reports/records (lab roles; this place is
 * the lab's). "No data" is never 0.
 */
export async function IndicatorsView({
  scope,
  sp,
  tabs,
}: {
  scope: LabTechScope;
  sp: ReportParams;
  tabs: ReactNode;
}) {
  const now = new Date();
  const today = dayOf(now, DEFAULT_TIME_ZONE);
  const { p, report, names, trend, wards, sections, csv } = await loadReport(scope, sp, now, {
    trend: true,
  });
  const drill = (id: string, extra: Record<string, string> = {}) =>
    `/lab/reports/records?${p.query({ tile: id, ...extra })}`;
  const months = trend!.months;
  const series = trendSeries(months);
  const prev = months.at(-2)!;
  const stated = trend!.stated;

  return (
    <>
      <SpaceHeader
        tabs={tabs}
        chips={
          <ReportFilters
            tab="indicators"
            p={p}
            today={today}
            wards={wards}
            sections={sections}
            names={names}
            csv={csv}
          />
        }
        note={p.filters.ward || p.filters.priority ? R.notByWard : undefined}
      />
      <div className="flex flex-col gap-4">
        <p className="text-body-s text-muted-foreground">
          {R.lede} {fill(R.asOf, { time: `${dateWords(now)} ${timeWords(now)}` })}
        </p>
        <Panel as="div">
          <KeyFigureGrid className="xl:grid-cols-4">
            {TILES.map((t) => {
              const v = report.tiles[t];
              const f = figureOf(t, v);
              const before = prev.report.tiles[t];
              return (
                <KeyFigure
                  key={t}
                  label={R.tiles[t]}
                  value={f.value}
                  unit={f.unit}
                  noData={LAB3.noData}
                  href={v.kind === "value" ? drill(t) : undefined}
                  spark={
                    <Sparkline
                      values={series[t] ?? []}
                      label={fill(I.spark, {
                        name: R.tiles[t],
                        from: monthLong(months[0]!.month),
                        to: monthLong(months.at(-1)!.month),
                        values: (series[t] ?? []).map((x) => words(t, x)).join(", "),
                      })}
                    />
                  }
                  change={
                    before.kind === "value"
                      ? fill(I.lastMonth, {
                          month: monthLong(prev.month),
                          value: words(t, before.value),
                        })
                      : fill(I.lastMonthNoData, { month: monthLong(prev.month) })
                  }
                  sub={v.kind === "value" ? basis(t, v, report.bedside) : undefined}
                />
              );
            })}
          </KeyFigureGrid>
        </Panel>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Panel
            title={I.weekly}
            labelledBy="weekly"
            action={
              <span className="text-caption text-muted-foreground">
                {fill(I.weeklyNote, {
                  scope: p.filters.section ? names.section(p.filters.section) : I.allSections,
                })}
              </span>
            }
          >
            <WeeklyLine
              points={trend!.weeks}
              stated={stated.length === 1 ? stated[0]! : null}
              today={today}
            />
            {stated.length > 1 ? (
              <p className="text-caption text-muted-foreground">
                {fill(I.statedMixed, { times: stated.map(formatDuration).join(", ") })}
              </p>
            ) : stated.length === 0 && trend!.weeks.some((w) => w.median !== null) ? (
              <p className="text-caption text-muted-foreground">{I.statedNone}</p>
            ) : null}
          </Panel>

          <Panel title={R.rejections} labelledBy="rejections">
            {report.rejections.length === 0 ? (
              <EmptyState
                compact
                title={report.tiles.reject_pct.kind === "no_data" ? LAB3.noData : I.rejectionsNone}
              />
            ) : (
              <ReasonBars
                rows={report.rejections.map((x) => ({
                  key: x.reason,
                  label: names.reason(x.reason),
                  n: x.n,
                  href: drill("reject_pct", { reason: x.reason }),
                  aria: fill(I.reasonLine, {
                    reason: names.reason(x.reason),
                    n: x.n,
                    ward: names.ward(x.wardId),
                    wardN: x.wardN,
                  }),
                }))}
                footer={fill(I.reasonsNote, {
                  ward: names.ward(report.rejections[0]!.wardId),
                  n: report.rejections[0]!.wardN,
                })}
              />
            )}
          </Panel>
        </div>

        <Panel title={I.perSection} labelledBy="per-section">
          {report.tat.length === 0 ? (
            <EmptyState compact title={LAB3.noData} why={R.footnote} />
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {I.perSectionColumns.map((c, i) => (
                    <th
                      key={c}
                      scope="col"
                      className={`text-caption text-muted-foreground px-2 py-1.5 font-medium ${i === 1 || i === 3 ? "text-right" : "text-left"}`}
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.tat.map((t) => {
                  const name = names.section(t.sectionId);
                  return (
                    <tr key={t.sectionId ?? "none"} className="border-border text-body-s border-t">
                      <td className="px-2 py-2">{name}</td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        <Link
                          href={drill("tat", { section: t.sectionId ?? "none" })}
                          className={LINK}
                          aria-label={fill(R.open, {
                            label: `${R.turnaround}, ${name}`,
                            value: formatDuration(t.p90),
                          })}
                        >
                          {formatDuration(t.p90)}
                        </Link>
                      </td>
                      <td className="text-muted-foreground px-2 py-2">
                        {t.targets.length === 0
                          ? R.turnaroundNone
                          : t.targets.length === 1
                            ? formatDuration(t.targets[0]!)
                            : fill(R.turnaroundMixed, {
                                times: t.targets.map(formatDuration).join(", "),
                              })}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {t.n.toLocaleString("en-GB")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Panel>
        <p className="text-caption text-muted-foreground">{R.footnote}</p>
      </div>
    </>
  );
}

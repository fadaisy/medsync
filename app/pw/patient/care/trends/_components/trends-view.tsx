"use client";

import type { Metric } from "@patient-core/care-trends";
import type { SavedReading } from "@patient-core/log";
import type { SugarContext } from "@patient-core/readings";
import { useState } from "react";
import { lastSevenDays } from "@patient-core/care-day";
import {
  chartRange,
  insight,
  judge,
  METRICS,
  readingsIn,
  SUGAR_CHIPS,
  sugarDiary,
  targetBand,
  weekSeries,
} from "@patient-core/care-trends";
import { lastDays } from "@patient-core/log";
import { readingValueText } from "@patient-core/readings";
import { TrendingUpIcon } from "lucide-react";

import { SugarDiary } from "@/components/tide/care-sugar-diary";
import { WeekChart } from "@/components/tide/care-week-chart";
import { Chip, ChipRow, Segments } from "@/components/tide/controls";
import { Band, Card, ICON, SectionHead, StatusPill } from "@/components/tide/kit";
import { CARE_COPY } from "@/content/patient/care";
import { chartFinding } from "@/lib/patient-web/care-view";

const C = CARE_COPY.trends;
const TABS = (["bp", "sugar", "weight", "pulse"] as const).map((value) => ({
  value,
  label: METRICS[value].name,
}));
const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const hhmmOf = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/**
 * The four metrics, the week chart with its target lines and "Outside target" markers (S16), the sugar diary,
 * the insight band and the readings list. Every judgement is `@patient-core/care-trends` over the threshold
 * data; the chart's text alternative states the finding.
 */
export function TrendsView({ nowIso, readings }: { nowIso: string; readings: SavedReading[] }) {
  const now = new Date(nowIso);
  const [metric, setMetric] = useState<Metric>("bp");
  const [ctx, setCtx] = useState<SugarContext>("fasting");

  const m = METRICS[metric];
  const chip = SUGAR_CHIPS.find((c) => c.ctx === ctx) ?? SUGAR_CHIPS[0]!;
  const label = metric === "sugar" ? C.sugarLabel(chip.name) : m.label;
  const dates = lastDays(now);
  const series = weekSeries(readings, metric, ctx, dates);
  const band = targetBand(metric, ctx);
  const range = chartRange(m, [...series.a, ...(series.b ?? [])], band);
  const judged = series.inputs.map((i) => (i ? judge(i) : null));
  const week = lastSevenDays(now);
  const list = readingsIn(readings, metric, ctx, dates);
  const latest = list[0];
  const latestJudged = latest ? judge(latest.input) : null;
  const status =
    latestJudged?.tone === "stable" ? { ...latestJudged, word: C.inYourRange } : latestJudged;
  const said = insight(metric, series, dates);
  const found = chartFinding(series, judged, band !== null);

  return (
    <div className="flex w-full max-w-[880px] flex-col gap-5">
      <Segments
        label={C.metricLabel}
        options={TABS}
        value={metric}
        onChange={setMetric}
        className="self-start max-[760px]:w-full"
      />

      {metric === "sugar" ? (
        <div className="flex flex-col gap-2">
          <p className="text-pw-ink-2 text-[15px] font-medium">{C.whenMeasured}</p>
          <ChipRow label={C.whenMeasured}>
            {SUGAR_CHIPS.map((s) => (
              <Chip key={s.ctx} selected={s.ctx === ctx} onClick={() => setCtx(s.ctx)}>
                {s.name}
              </Chip>
            ))}
          </ChipRow>
          {band ? (
            <p className="text-pw-ink-2 text-[15px] font-medium">
              {C.target(chip.name, band.hi, m.unit)}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="grid items-start gap-5 min-[1101px]:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <Card className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-pw-ink-2 text-[13px] font-medium">{C.thisWeek(label)}</p>
                <p className="flex items-baseline gap-1.5">
                  <span className="text-[34px] leading-[38px] font-semibold tracking-[-0.03em] tabular-nums">
                    {latest ? (readingValueText(latest.input).split(" ")[0] ?? "–") : "–"}
                  </span>
                  <span className="text-pw-ink-2 text-[15px] font-medium">{m.unit}</span>
                </p>
              </div>
              {status ? <StatusPill tone={status.tone}>{status.word}</StatusPill> : null}
            </div>
            <WeekChart
              a={series.a}
              b={series.b}
              lo={range.lo}
              hi={range.hi}
              grid={range.grid}
              band={band}
              days={week.map((d, i) => (i === 6 ? "Today" : d.name.slice(0, 3)))}
              judged={judged}
              label={`${C.chartLabel(label)}. ${C.finding(found.n, found.outside)} ${said}`}
              legend={{ l1: m.l1, l2: m.l2, target: C.yourTarget, outside: C.outside }}
            />
          </Card>

          <Band className="flex items-start gap-3">
            <span className="bg-pw-band-glass grid size-9 shrink-0 place-items-center rounded-full">
              <TrendingUpIcon className="size-[18px]" {...ICON} />
            </span>
            <div className="min-w-0">
              <p className="text-[17px] leading-[22px] font-semibold">{said}</p>
              <p className="text-pw-on-band-2 text-[15px] font-medium">{C.chartOnlyYou}</p>
            </div>
          </Band>

          {metric === "sugar" ? (
            <SugarDiary
              cells={sugarDiary(readings, dates)}
              days={week.map((d) => d.name.slice(0, 3))}
              title={C.diary}
              line={C.diaryLine}
            />
          ) : null}
        </div>

        <section aria-labelledby="trend-readings" className="flex min-w-0 flex-col gap-3">
          <SectionHead id="trend-readings" title={C.readings} />
          {list.length ? (
            <Card className="p-0">
              <ul>
                {list.slice(0, 8).map((r) => {
                  const d = new Date(r.at);
                  const j = judge(r.input);
                  return (
                    <li
                      key={r.id}
                      className="border-pw-surface-3 flex items-center gap-3 border-t px-4 py-3 first:border-t-0"
                    >
                      <span className="w-14 shrink-0">
                        <span className="text-pw-ink-2 block text-[13px] font-semibold">
                          {SHORT_DAYS[d.getDay()]} {d.getDate()}
                        </span>
                        <span className="text-pw-ink-2 block text-[13px]">{hhmmOf(r.at)}</span>
                      </span>
                      <span className="min-w-0 flex-1 text-lg font-semibold tabular-nums">
                        {readingValueText(r.input).split(" ")[0]}{" "}
                        <span className="text-pw-ink-2 text-xs font-medium">{m.unit}</span>
                      </span>
                      <StatusPill tone={j.tone}>{j.word}</StatusPill>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ) : (
            <p className="text-pw-ink-2 text-[17px]">{C.none}</p>
          )}
        </section>
      </div>
    </div>
  );
}

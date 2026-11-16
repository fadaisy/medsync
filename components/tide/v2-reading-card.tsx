"use client";

import type { Metric } from "@patient-core/care-trends";
import type { SugarContext } from "@patient-core/readings";
import { useState } from "react";
import { inTargetCount, targetMarks, weekChange } from "@patient-core/reading-cards";
import { PlusIcon } from "lucide-react";

import { buttonClass, ICON, StatusPill } from "@/components/tide/kit";
import { CARE_V2_COPY } from "@/content/patient-app/care";
import { cn } from "@/lib/utils";

const C = CARE_V2_COPY.readings;

export interface DayReading {
  /** "11 Nov" */
  date: string;
  /** Sugar, weight, pulse, or blood pressure's top number; null = no reading that day (a gap). */
  value: number | null;
  /** Blood pressure's bottom number. */
  bottom?: number | null;
}

/**
 * A working chart card for Today (patient app v2 §5.7, web board 20). Header: title, status, the value shown and
 * its date, the change over a week (green toward target, amber away). A small 10-day chart: a dot per reading,
 * gaps where there is none, the target band or lines from the signed thresholds. Hover or keyboard focus on a
 * day drops a guide line and the header switches to that day. Footer: "N of 10 in target", + Log, Details.
 * Every chart has its words: the SVG carries a summary and the days are buttons screen readers can step through.
 * Out of target is amber with a word, never red (MR5).
 */
export function ReadingCard({
  metric,
  ctx,
  unit,
  days,
  weekAgo,
  weightNextStep = null,
  onLog,
  detailsHref,
}: {
  metric: Exclude<Metric, "pulse">;
  ctx: SugarContext;
  unit: string;
  days: DayReading[];
  weekAgo: number | null;
  weightNextStep?: number | null;
  onLog?: () => void;
  detailsHref?: string;
}) {
  const lastIdx = (() => {
    for (let i = days.length - 1; i >= 0; i--) if (days[i]!.value !== null) return i;
    return -1;
  })();
  const [focus, setFocus] = useState<number | null>(null);
  const shown = focus ?? lastIdx;
  const day = shown >= 0 ? days[shown]! : null;
  const marks = targetMarks(metric, ctx, weightNextStep);
  const change = weekChange(metric, ctx, weekAgo, days[lastIdx]?.value ?? null, weightNextStep);
  const count = inTargetCount(
    metric,
    ctx,
    days.map((d) => d.value),
  );
  const valueText =
    day?.value == null
      ? "—"
      : metric === "bp"
        ? `${day.value}/${day.bottom ?? "—"}`
        : String(day.value);
  const inBand = (v: number | null) => {
    if (v === null) return null;
    if (marks.band) return v >= marks.band.lo && v <= marks.band.hi;
    if (metric === "bp") return v < marks.lines[0]!.value;
    return null;
  };
  const status = inBand(day?.value ?? null);

  // Chart geometry (viewBox units).
  const W = 300,
    H = 96,
    PAD = 8;
  const vals = days
    .flatMap((d) => [d.value, d.bottom ?? null])
    .filter((v): v is number => v !== null);
  const refs = [
    ...(marks.band ? [marks.band.lo, marks.band.hi] : []),
    ...marks.lines.map((l) => l.value),
  ];
  let lo = Math.min(...vals, ...refs);
  let hi = Math.max(...vals, ...refs);
  if (!Number.isFinite(lo)) {
    lo = 0;
    hi = 1;
  }
  const span = hi - lo || 1;
  lo -= span * 0.1;
  hi += span * 0.1;
  const x = (i: number) => PAD + (i * (W - 2 * PAD)) / Math.max(days.length - 1, 1);
  const y = (v: number) => PAD + ((hi - v) * (H - 2 * PAD)) / (hi - lo);
  const summary = C.chartSummary
    .replace("{title}", C.titles[metric])
    .replace("{count}", count?.text ?? "")
    .replace("{value}", `${valueText} ${unit}`)
    .replace("{date}", days[lastIdx]?.date ?? "");

  return (
    <section className="rounded-pw-card bg-pw-surface shadow-pw-card flex min-w-0 flex-col gap-3 p-5">
      <header className="flex items-start justify-between gap-3">
        <h3 className="text-[15px] font-semibold">{C.titles[metric]}</h3>
        {status === null ? null : (
          <StatusPill tone={status ? "stable" : "caution"}>
            {status ? C.inTarget : C.outOfTarget}
          </StatusPill>
        )}
      </header>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1" aria-live="polite">
        <span className="font-pw text-[34px] leading-none font-semibold tabular-nums">
          {valueText}
        </span>
        <span className="text-pw-ink-3 text-[14px]">{unit}</span>
        {change && focus === null ? (
          <span
            className={cn(
              "text-[13px] font-semibold",
              change.tone === "good" && "text-pw-stable-text",
              change.tone === "caution" && "text-pw-caution-text",
              change.tone === "neutral" && "text-pw-ink-3",
            )}
          >
            {change.text}
          </span>
        ) : null}
        <span className="text-pw-ink-3 ms-auto text-[12px]">{day?.date ?? C.noReading}</span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="h-24 w-full" role="img" aria-label={summary}>
        {marks.band ? (
          <rect
            x={PAD}
            width={W - 2 * PAD}
            y={y(marks.band.hi)}
            height={Math.max(0, y(marks.band.lo) - y(marks.band.hi))}
            className="fill-pw-stable-tint"
          />
        ) : null}
        {marks.lines.map((l) => (
          <line
            key={l.label}
            x1={PAD}
            x2={W - PAD}
            y1={y(l.value)}
            y2={y(l.value)}
            className="stroke-pw-stable-text"
            strokeWidth={1}
            strokeDasharray={l.dashed ? "4 4" : undefined}
            opacity={0.6}
          />
        ))}
        {focus !== null ? (
          <line
            x1={x(focus)}
            x2={x(focus)}
            y1={PAD / 2}
            y2={H - PAD / 2}
            className="stroke-pw-ink-3"
            strokeWidth={1}
          />
        ) : null}
        {days.map((d, i) =>
          d.value === null ? null : (
            <g key={i}>
              <circle
                cx={x(i)}
                cy={y(d.value)}
                r={i === shown ? 5 : 3.5}
                className={
                  inBand(d.value) === false ? "fill-pw-caution-text" : "fill-pw-area-readings"
                }
              />
              {metric === "bp" && d.bottom != null ? (
                <rect
                  x={x(i) - 3.5}
                  y={y(d.bottom) - 3.5}
                  width={7}
                  height={7}
                  className="fill-pw-ink-2"
                  transform={`rotate(45 ${x(i)} ${y(d.bottom)})`}
                />
              ) : null}
            </g>
          ),
        )}
      </svg>
      <div
        className="-mt-2 grid"
        style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
      >
        {days.map((d, i) => (
          <button
            key={i}
            type="button"
            className="focus-visible:outline-pw-focus h-6 rounded focus-visible:outline-2"
            aria-label={`${d.date}: ${d.value === null ? C.noReading : `${metric === "bp" ? `${d.value}/${d.bottom ?? ""}` : d.value} ${unit}`}`}
            onMouseEnter={() => setFocus(i)}
            onMouseLeave={() => setFocus(null)}
            onFocus={() => setFocus(i)}
            onBlur={() => setFocus(null)}
          />
        ))}
      </div>
      <div className="text-pw-ink-3 -mt-2 flex justify-between text-[11px]">
        <span>{days[0]?.date}</span>
        <span>
          {marks.band
            ? `${C.target} ${marks.band.lo}–${marks.band.hi}`
            : (marks.lines[0]?.label ?? "")}
        </span>
        <span>{C.today}</span>
      </div>

      <footer className="flex items-center gap-2">
        <span className="text-pw-ink-2 mr-auto text-[13px] font-semibold">{count?.text ?? ""}</span>
        {onLog ? (
          <button type="button" onClick={onLog} className={buttonClass("soft", "s")}>
            <PlusIcon className="size-4" {...ICON} />
            {C.log}
          </button>
        ) : null}
        {detailsHref ? (
          <a href={detailsHref} className={buttonClass("outline", "s")}>
            {C.details}
          </a>
        ) : null}
      </footer>
    </section>
  );
}

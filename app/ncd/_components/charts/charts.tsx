import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * Hand-built chart primitives for the NCD dashboard (§11.4): no library. Bars at most 24px thick
 * with a 4px rounded data end and a square baseline, 2px surface gaps between stacked segments,
 * 2px lines, hairline gridlines in a recessive neutral. Every mark is focusable or a link and shows
 * its exact count, denominator and definition version on hover and on keyboard focus.
 */

export type Mark = {
  key: string;
  label: string;
  /** Count as displayed ("1–4" when suppressed). */
  text: string;
  n: number;
  pct: number | null;
  tone: string;
  tip: string;
  href?: string | null;
};

/** Hover and keyboard-focus tooltip around a mark; a link when the count opens a patient list. */
export function Tip({
  tip,
  href,
  className,
  style,
  children,
}: {
  tip: string;
  href?: string | null;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const cls = cn("group/tip focus-visible:shadow-focus relative outline-none", className);
  const bubble = (
    <span
      aria-hidden
      className="bg-popover text-popover-foreground shadow-card text-caption pointer-events-none absolute top-full left-0 z-20 mt-1 hidden w-max max-w-72 rounded-sm px-2 py-1 font-sans font-normal whitespace-normal group-hover/tip:block group-focus-visible/tip:block"
    >
      {tip}
    </span>
  );
  return href ? (
    <Link
      href={href}
      aria-label={tip}
      className={cn(cls, "underline-offset-2 hover:underline")}
      style={style}
    >
      {children}
      {bubble}
    </Link>
  ) : (
    <button
      type="button"
      aria-label={tip}
      className={cn(cls, "cursor-default text-left")}
      style={style}
    >
      {children}
      {bubble}
    </button>
  );
}

const widthOf = (n: number, total: number) => `${total > 0 ? (100 * n) / total : 0}%`;

/** Parts of a whole as one bar (§11.4). Zero parts are left out; the last drawn part takes the rounded end. */
export function StackedBar({
  marks,
  total,
  label,
  thick = "h-3.5",
}: {
  marks: Mark[];
  total: number;
  label: string;
  thick?: string;
}) {
  const shown = marks.filter((m) => m.n > 0);
  if (!shown.length)
    return (
      <div
        role="img"
        aria-label={`${label}: ${total > 0 ? "not drawn, counts from 1 to 4" : "no patients"}`}
        className={cn("bg-ink-100 w-full rounded-r-xs", thick)}
      />
    );
  return (
    <div role="group" aria-label={label} className={cn("bg-card flex w-full gap-0.5", thick)}>
      {shown.map((m, i) => (
        <Tip
          key={m.key}
          tip={m.tip}
          href={m.href}
          className={cn("block h-full min-w-1", m.tone, i === shown.length - 1 && "rounded-r-xs")}
          style={{ width: widthOf(m.n, total) }}
        />
      ))}
    </div>
  );
}

/** Legend: a swatch carries identity; the text stays in text tokens. */
export function Legend({ marks, columns = 1 }: { marks: Mark[]; columns?: 1 | 2 }) {
  return (
    <ul className={cn("text-caption grid gap-x-4 gap-y-0.5", columns === 2 && "grid-cols-2")}>
      {marks.map((m) => (
        <li key={m.key} className="flex min-w-0 items-center gap-1.5">
          <span aria-hidden className={cn("size-2.5 shrink-0 rounded-[3px]", m.tone)} />
          <span className="text-ink-700 min-w-0 flex-1 truncate" title={m.label}>
            {m.label}
          </span>
          <Tip tip={m.tip} href={m.href} className="text-foreground font-mono tabular-nums">
            {m.text}
          </Tip>
          <span className="text-muted-foreground w-9 text-right font-mono tabular-nums">
            {m.pct == null ? "" : `${m.pct}%`}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * A 12-month trend of one share on a scale shared by every row (0 to `max`). Missing or suppressed
 * months break the line.
 */
export function TrendLine({
  points,
  max,
  tip,
  height = "h-14",
  ticks,
}: {
  points: (number | null)[];
  max: number;
  tip: string;
  /** SVG height class: h-14 in rows, taller in a detail panel. */
  height?: string;
  /** One label per point (month names), shown under the line; alternate ones hide when narrow. */
  ticks?: string[];
}) {
  const W = 220;
  const H = 60;
  const x = (i: number) => (points.length > 1 ? (i * W) / (points.length - 1) : 0);
  const y = (p: number) => H - (p / max) * H;
  const runs: string[] = [];
  let run: string[] = [];
  points.forEach((p, i) => {
    if (p == null) {
      if (run.length) runs.push(run.join(" "));
      run = [];
    } else run.push(`${x(i)},${y(p)}`);
  });
  if (run.length) runs.push(run.join(" "));
  const lastI = points.findLastIndex((p) => p != null);
  const last = lastI >= 0 ? points[lastI]! : null;
  return (
    <Tip
      tip={tip}
      className="grid w-full grid-cols-[2rem_minmax(0,1fr)_2.5rem] items-stretch gap-x-1.5"
    >
      <span
        aria-hidden
        className="text-overline text-muted-foreground flex flex-col justify-between py-0 text-right font-mono tabular-nums"
      >
        <span>{max}%</span>
        <span>0%</span>
      </span>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className={cn(height, "w-full overflow-visible")}
        aria-hidden
      >
        {[0, 0.5, 1].map((f) => (
          <line
            key={f}
            x1={0}
            x2={W}
            y1={H * f}
            y2={H * f}
            className={f === 1 ? "stroke-ink-300" : "stroke-ink-150"}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {runs.map((r) =>
          r.includes(" ") ? (
            <polyline
              key={r}
              points={r}
              fill="none"
              className="stroke-teal-700"
              strokeWidth={2}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ) : null,
        )}
        {lastI >= 0 && last != null ? (
          <circle
            cx={x(lastI)}
            cy={y(last)}
            r={3}
            className="stroke-card fill-teal-700"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
      </svg>
      <span className="text-label text-foreground self-center font-mono font-semibold tabular-nums">
        {last == null ? "–" : `${last}%`}
      </span>
      {ticks?.length ? (
        <span
          aria-hidden
          className="text-muted-foreground col-start-2 flex justify-between pt-1 font-mono text-[11px] [&>span:nth-child(even)]:hidden sm:[&>span:nth-child(even)]:inline"
        >
          {ticks.map((t, i) => (
            <span key={`${t}-${i}`} className="flex w-0 justify-center whitespace-nowrap">
              {t}
            </span>
          ))}
        </span>
      ) : null}
    </Tip>
  );
}

/** A word-sized trend (no axes): the shape only, beside a figure that carries the number. */
export function Sparkline({ points, max }: { points: (number | null)[]; max: number }) {
  const W = 64;
  const H = 20;
  const pts = points
    .map((p, i) =>
      p == null
        ? null
        : `${(i * W) / Math.max(points.length - 1, 1)},${H - (p / Math.max(max, 1)) * H}`,
    )
    .filter((p): p is string => p != null);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-5 w-16 shrink-0 overflow-visible" aria-hidden>
      <line
        x1={0}
        x2={W}
        y1={H}
        y2={H}
        className="stroke-ink-200"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
      {pts.length > 1 ? (
        <polyline
          points={pts.join(" ")}
          fill="none"
          className="stroke-teal-700"
          strokeWidth={1.5}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
    </svg>
  );
}

/** Care cascade (G06): four bars as shares of registered; the last step is the leading class. */
export function Cascade({ marks, thick = "h-2.5" }: { marks: Mark[]; thick?: string }) {
  return (
    <ul className="text-caption grid grid-cols-[7.5rem_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2">
      {marks.map((m, i) => {
        const lastStep = i === marks.length - 1;
        return (
          <li key={m.key} className="contents">
            <span
              className={cn("text-ink-700 truncate", lastStep && "text-foreground font-medium")}
              title={m.label}
            >
              {m.label}
            </span>
            <span className={cn("bg-ink-50 block w-full", thick)}>
              <span
                className={cn("block h-full rounded-r-xs", lastStep ? "bg-teal-700" : "bg-ink-300")}
                style={{ width: `${m.pct ?? (i === 0 && m.n > 0 ? 100 : 0)}%` }}
              />
            </span>
            <Tip
              tip={m.tip}
              href={m.href}
              className="text-foreground text-right font-mono tabular-nums"
            >
              {m.text}
              {i > 0 && m.pct != null ? (
                <span className="text-muted-foreground"> · {m.pct}%</span>
              ) : null}
            </Tip>
          </li>
        );
      })}
    </ul>
  );
}

/** A ratio against a whole (§11.4: a meter). */
export function Meter({ mark, den }: { mark: Mark; den: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-caption flex items-baseline gap-2">
        <span className="text-foreground min-w-0 flex-1 truncate font-medium">{mark.label}</span>
        <Tip
          tip={mark.tip}
          href={mark.href}
          className="text-muted-foreground font-mono text-[11px] tabular-nums"
        >
          {mark.text} of {den}
        </Tip>
        <span className="text-foreground w-9 text-right font-mono font-semibold tabular-nums">
          {mark.pct == null ? "–" : `${mark.pct}%`}
        </span>
      </div>
      <span className="bg-iris-100 block h-2 w-full">
        <span
          className="bg-iris-solid block h-full rounded-r-xs"
          style={{ width: `${mark.pct ?? 0}%` }}
        />
      </span>
    </div>
  );
}

/** Counts by category as columns sharing one scale; every column labelled. */
export function Columns({ marks, label }: { marks: Mark[]; label: string }) {
  const max = Math.max(1, ...marks.map((m) => m.n));
  return (
    <div role="group" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1.5">
      {marks.map((m) => (
        <div key={m.key} className="flex flex-col items-center gap-1">
          <div className="border-ink-300 flex h-24 w-full flex-col items-center justify-end border-b">
            <Tip
              tip={m.tip}
              href={m.href}
              className="text-foreground mb-0.5 font-mono text-[11px] tabular-nums"
            >
              {m.text}
            </Tip>
            <span
              aria-hidden
              className={cn("block w-5 rounded-t-xs", m.tone)}
              style={{ height: `${(m.n / max) * 76}%` }}
            />
          </div>
          <span className="text-ink-700 font-mono text-[11px]">{m.label}</span>
        </div>
      ))}
    </div>
  );
}

/** A ranked list with bars relative to the largest value. */
export function RankedBars({ marks, value }: { marks: Mark[]; value: (m: Mark) => string }) {
  const max = Math.max(1, ...marks.map((m) => m.n));
  return (
    <ul className="text-caption grid grid-cols-[6rem_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1.5">
      {marks.map((m) => (
        <li key={m.key} className="contents">
          <span className="text-ink-700 truncate" title={m.label}>
            {m.label}
          </span>
          <span className="block h-2 w-full">
            <span
              className="bg-slate-solid block h-full rounded-r-xs"
              style={{ width: `${(m.n / max) * 100}%` }}
            />
          </span>
          <Tip
            tip={m.tip}
            href={m.href}
            className="text-foreground text-right font-mono tabular-nums"
          >
            {value(m)}
          </Tip>
        </li>
      ))}
    </ul>
  );
}

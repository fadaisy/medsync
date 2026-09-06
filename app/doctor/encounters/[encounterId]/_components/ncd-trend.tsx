"use client";

import type { ResultBand } from "@/lib/ncd/catalog/schema";
import type { Interpretation } from "@/lib/ncd/engine/assess";
import { useMemo, useState } from "react";
import { ActivityIcon, TrendingDownIcon, TrendingUpIcon } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { bandFor } from "@/lib/ncd/catalog/schema";

/**
 * One vital over time, read the way a chart is actually read.
 *
 * ── Switch, do not overlay ───────────────────────────────────────────────────
 * An earlier version let several vitals share the plot, each scaled to its own
 * range. It was wrong: a saturation lives at 95 and a systolic at 150, so either
 * one axis flattens the other into a straight line, or both are normalised and
 * the y-position stops meaning anything — a chart whose height is not a quantity
 * is a picture of a chart.
 *
 * So the vitals are a SWITCHER. One at a time, on its own true axis, with its
 * own bands behind it. Comparing two of them is a question about shape, and the
 * honest way to answer it is to look at one and then the other.
 *
 * ── What the crosshair is for ────────────────────────────────────────────────
 * The tooltip follows the pointer and floats at the reading, rather than sitting
 * in a panel underneath: the number belongs where the eye already is. It flips
 * to the other side of the line near the right edge so it never leaves the card.
 */

const ms = (iso: string) => new Date(iso).getTime();
const clock = (iso: string) => new Date(iso).toTimeString().slice(0, 5);
const day = (iso: string) => new Date(iso).toDateString().slice(4, 10);

/** Enough of the name to tell the vitals apart in a row of buttons. */
const short = (display: string) =>
  display
    .replace("Blood pressure — ", "")
    .replace("Oxygen saturation", "SpO₂")
    .replace("Respiratory rate", "Resp. rate")
    .replace("Temperature", "Temp.")
    .replace(/^./, (c) => c.toUpperCase());

/** Round axis labels a reader can hold in their head — 5s, 10s, 25s, never 7.3s. */
function ticks(lo: number, hi: number, count = 4): number[] {
  const raw = (hi - lo) / count || 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10;
  const start = Math.floor(lo / step) * step;
  const out: number[] = [];
  for (let v = start; v <= hi + step / 2; v += step) out.push(Math.round(v * 1000) / 1000);
  return out;
}

const LINE: Record<string, string> = {
  brand: "stroke-brand-500",
  emerald: "stroke-emerald-500",
  amber: "stroke-amber-500",
  orange: "stroke-orange-500",
  red: "stroke-red-500",
  grey: "stroke-gray-400",
};
const DOT: Record<string, string> = {
  brand: "fill-brand-500",
  emerald: "fill-emerald-500",
  amber: "fill-amber-500",
  orange: "fill-orange-500",
  red: "fill-red-500",
  grey: "fill-gray-400",
};
const STOP: Record<string, string> = {
  brand: "text-brand-500",
  emerald: "text-emerald-500",
  amber: "text-amber-500",
  orange: "text-orange-500",
  red: "text-red-500",
  grey: "text-gray-400",
};

export function NcdTrend({
  row,
  siblings,
  colorOf,
}: {
  row: Interpretation;
  /** Every tracked measure, offered in the switcher. */
  siblings: Interpretation[];
  colorOf: (band: ResultBand | undefined) => string;
}) {
  const [open, setOpen] = useState(false);
  const [showing, setShowing] = useState(row.feature);
  const [hover, setHover] = useState<number | undefined>(undefined);

  const tracked = useMemo(() => {
    const all = [row, ...siblings.filter((s) => s.feature !== row.feature)];
    return all.filter((s) => (s.series?.length ?? 0) > 1);
  }, [row, siblings]);

  const active = tracked.find((s) => s.feature === showing) ?? row;
  const series = useMemo(
    () => [...(active.series ?? [])].sort((a, b) => a.at.localeCompare(b.at)),
    [active],
  );

  if ((row.series?.length ?? 0) < 2) return null;

  const values = series.map((r) => r.value);
  const edges = active.bands
    .flatMap((b) => [b.from, b.to])
    .filter((n): n is number => n !== undefined);
  const dataLo = Math.min(...values);
  const dataHi = Math.max(...values);
  const pad = (dataHi - dataLo) * 0.25 || Math.max(dataHi * 0.08, 2);
  // Band edges just outside the data are pulled in, so "how far from normal" is
  // visible — but a band 60 units away is not allowed to squash the line flat.
  const near = edges.filter((e) => e >= dataLo - pad * 2 && e <= dataHi + pad * 2);
  const lo = Math.min(dataLo - pad, ...near);
  const hi = Math.max(dataHi + pad, ...near);

  const W = 820;
  const H = 300;
  const L = 66;
  const R = 22;
  const TOP = 18;
  const BOT = 56;
  const t0 = ms(series[0]!.at);
  const t1 = ms(series[series.length - 1]!.at);
  const x = (at: number) => L + (t1 === t0 ? 0.5 : (at - t0) / (t1 - t0)) * (W - L - R);
  const y = (v: number) => H - BOT - ((v - lo) / (hi - lo || 1)) * (H - BOT - TOP);

  const color = colorOf(active.band);
  const first = series[0]!;
  const last = series[series.length - 1]!;
  const normal = active.bands.find((b) => b.tone === "normal");
  // Five identical dates down the x-axis say nothing; the date moves to the
  // axis title and the ticks show only the clock.
  const sameDay = day(first.at) === day(last.at);
  const xLabel = (at: number) => {
    const iso = new Date(at).toISOString();
    return sameDay ? clock(iso) : `${day(iso)} ${clock(iso)}`;
  };
  const delta = Math.round((last.value - first.value) * 10) / 10;
  const pct = first.value === 0 ? 0 : Math.round(((last.value - first.value) / first.value) * 100);

  const hovered = hover !== undefined ? series.find((r) => ms(r.at) === hover) : undefined;
  const hoveredIndex = hovered ? series.indexOf(hovered) : -1;
  const prev = hoveredIndex > 0 ? series[hoveredIndex - 1] : undefined;
  const hoveredBand = hovered ? bandFor(active.bands, hovered.value) : undefined;
  const hoverPct = hovered ? x(ms(hovered.at)) / W : 0;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setShowing(row.feature);
          setOpen(true);
        }}
        className="tap text-caption text-brand-700 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-950/40 mt-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium"
      >
        <TrendingUpIcon className="size-3" aria-hidden />
        See trend
        <span className="text-muted-foreground tabular-nums">({row.series!.length})</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] w-[min(94vw,54rem)] max-w-none overflow-y-auto sm:max-w-none">
          <DialogHeader className="sr-only">
            <DialogTitle>{active.display} — trend</DialogTitle>
          </DialogHeader>

          {/* Title, and the switcher — one axis at a time, never two. */}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
            <span className="flex items-center gap-2">
              <span className="bg-brand-100 text-brand-700 dark:bg-brand-900/60 dark:text-brand-300 grid size-7 shrink-0 place-items-center rounded-lg">
                <ActivityIcon className="size-4" aria-hidden />
              </span>
              <span className="text-foreground text-body-l font-medium">{active.display}</span>
            </span>

            {tracked.length > 1 ? (
              <div className="bg-muted flex flex-wrap items-center gap-0.5 rounded-lg p-0.5">
                {tracked.map((s) => (
                  <button
                    key={s.feature}
                    type="button"
                    aria-pressed={s.feature === showing}
                    onClick={() => {
                      setShowing(s.feature);
                      setHover(undefined);
                    }}
                    className={`tap text-caption ease-expo-out rounded-md px-2.5 py-1 font-medium transition-colors duration-100 ${
                      s.feature === showing
                        ? "bg-card text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {short(s.display)}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {/* Where it is now, how far it has moved, and what that means. */}
          <div className="mt-1 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-display text-foreground text-[44px] leading-none font-medium tabular-nums">
                {last.value}
              </span>
              <span className="flex flex-col">
                <span className="text-muted-foreground text-caption">
                  {active.unit} · {series.length} readings
                </span>
                {/* Direction, not judgement: a rising saturation is good news. */}
                <span
                  className={`text-caption mt-0.5 inline-flex w-fit items-center gap-1 rounded px-1.5 py-0.5 font-medium tabular-nums ${
                    delta === 0 ? "bg-muted text-muted-foreground" : "bg-muted text-foreground"
                  }`}
                >
                  {delta > 0 ? (
                    <TrendingUpIcon className="size-3" aria-hidden />
                  ) : delta < 0 ? (
                    <TrendingDownIcon className="size-3" aria-hidden />
                  ) : null}
                  {delta > 0 ? "+" : ""}
                  {delta} ({pct > 0 ? "+" : ""}
                  {pct}%)
                </span>
              </span>
            </div>

            <span className="flex items-center gap-1.5">
              <span
                aria-hidden
                className={`h-0.5 w-4 rounded-full ${DOT[color]?.replace("fill-", "bg-")}`}
              />
              <span className="text-caption text-foreground font-medium">{active.display}</span>
              {active.band ? (
                <span className="text-caption text-muted-foreground">· {active.band.display}</span>
              ) : null}
              {normal && normal.from !== undefined && normal.to !== undefined ? (
                <span className="text-caption text-muted-foreground border-border ml-1 rounded border border-dashed px-1.5 py-0.5 tabular-nums">
                  Normal {normal.from}–{normal.to}
                </span>
              ) : null}
            </span>
          </div>

          {/* The chart, and the tooltip that floats at the reading. */}
          <div className="relative mt-2">
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="h-auto w-full cursor-crosshair"
              role="img"
              aria-label={`${active.display}: ${series.map((r) => `${r.value} at ${day(r.at)} ${clock(r.at)}`).join("; ")}`}
              onMouseLeave={() => setHover(undefined)}
              onMouseMove={(e) => {
                const box = e.currentTarget.getBoundingClientRect();
                const px = ((e.clientX - box.left) / box.width) * W;
                const at = t0 + ((px - L) / (W - L - R)) * (t1 - t0);
                const nearest = series.reduce((a, b) =>
                  Math.abs(ms(b.at) - at) < Math.abs(ms(a.at) - at) ? b : a,
                );
                setHover(ms(nearest.at));
              }}
            >
              {/*
               * No coloured wash behind the line.
               *
               * Four tinted bands stacked up the plot turned the chart into a
               * background with a line on it, and their colours competed with
               * the line’s — which is the one colour here that carries a
               * verdict. The normal range is still drawn, because “how far out
               * is this” is what the chart is for, as two grey hairlines with
               * the numbers spelled out in the legend.
               */}
              {normal ? (
                <g className="stroke-muted-foreground/35">
                  {[normal.from, normal.to].map((v) =>
                    v === undefined || v <= lo || v >= hi ? null : (
                      <line key={v} x1={L} x2={W - R} y1={y(v)} y2={y(v)} strokeDasharray="2 5" />
                    ),
                  )}
                </g>
              ) : null}

              {ticks(lo, hi).map((v) => (
                <g key={v}>
                  <line
                    x1={L}
                    x2={W - R}
                    y1={y(v)}
                    y2={y(v)}
                    className="stroke-border"
                    strokeDasharray="4 5"
                  />
                  <line x1={L - 5} x2={L} y1={y(v)} y2={y(v)} className="stroke-border" />
                  <text
                    x={L - 10}
                    y={y(v) + 4}
                    textAnchor="end"
                    className="fill-current opacity-55"
                    style={{ fontSize: 13 }}
                  >
                    {v}
                  </text>
                </g>
              ))}

              {/* The axes themselves — without them the ticks are floating text. */}
              <line x1={L} x2={L} y1={TOP} y2={H - BOT} className="stroke-border" />
              <line x1={L} x2={W - R} y1={H - BOT} y2={H - BOT} className="stroke-border" />

              {/* What each axis is measuring, said out loud. */}
              <text
                transform={`rotate(-90 16 ${(TOP + H - BOT) / 2})`}
                x={16}
                y={(TOP + H - BOT) / 2 + 4}
                textAnchor="middle"
                className="fill-current font-medium opacity-70"
                style={{ fontSize: 13 }}
              >
                {active.display}
                {active.unit ? ` (${active.unit})` : ""}
              </text>
              <text
                x={(L + W - R) / 2}
                y={H - 8}
                textAnchor="middle"
                className="fill-current font-medium opacity-70"
                style={{ fontSize: 13 }}
              >
                {sameDay ? `Time · ${day(first.at)}` : "Time"}
              </text>

              <defs>
                <linearGradient id={`fill-${active.feature}`} x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="currentColor"
                    stopOpacity={0.16}
                    className={STOP[color]}
                  />
                  <stop
                    offset="100%"
                    stopColor="currentColor"
                    stopOpacity={0}
                    className={STOP[color]}
                  />
                </linearGradient>
              </defs>

              {(() => {
                const path = series
                  .map((r, i) => `${i === 0 ? "M" : "L"}${x(ms(r.at))},${y(r.value)}`)
                  .join(" ");
                return (
                  <>
                    <path
                      d={`${path} L${x(t1)},${H - BOT} L${x(t0)},${H - BOT} Z`}
                      fill={`url(#fill-${active.feature})`}
                    />
                    <path
                      d={path}
                      fill="none"
                      strokeWidth={2.5}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      className={LINE[color]}
                    />
                  </>
                );
              })()}

              {/* A dot at every reading — this is measured data, not a curve. */}
              {series.map((r) => (
                <circle
                  key={r.at}
                  cx={x(ms(r.at))}
                  cy={y(r.value)}
                  r={hover === ms(r.at) ? 5.5 : 3}
                  strokeWidth={hover === ms(r.at) ? 2.5 : 0}
                  className={`${DOT[color]} stroke-white dark:stroke-gray-900`}
                />
              ))}

              {hovered ? (
                <line
                  x1={x(ms(hovered.at))}
                  x2={x(ms(hovered.at))}
                  y1={TOP}
                  y2={H - BOT}
                  className="stroke-muted-foreground/40"
                  strokeDasharray="3 4"
                />
              ) : null}

              {[0, 0.25, 0.5, 0.75, 1].map((f, i, all) => {
                const at = t0 + f * (t1 - t0);
                return (
                  <g key={i}>
                    <line
                      x1={x(at)}
                      x2={x(at)}
                      y1={H - BOT}
                      y2={H - BOT + 5}
                      className="stroke-border"
                    />
                    <text
                      x={x(at)}
                      y={H - BOT + 20}
                      textAnchor={i === 0 ? "start" : i === all.length - 1 ? "end" : "middle"}
                      className="fill-current opacity-55"
                      style={{ fontSize: 12 }}
                    >
                      {xLabel(at)}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/*
             * The number where the eye already is. A dot, not a bar — the rule
             * down the side of the reference tooltip is the one thing this
             * project's design system rules out.
             */}
            {hovered ? (
              <div
                className="border-border bg-card pointer-events-none absolute top-6 z-10 rounded-xl border px-3 py-2 shadow-lg"
                style={
                  hoverPct > 0.62
                    ? { right: `${(1 - hoverPct) * 100 + 1.5}%` }
                    : { left: `${hoverPct * 100 + 1.5}%` }
                }
              >
                <p className="text-foreground text-caption font-medium">
                  {day(hovered.at)}{" "}
                  <span className="text-muted-foreground font-normal">{clock(hovered.at)}</span>
                </p>
                <p className="mt-1 flex items-baseline gap-2">
                  <span
                    aria-hidden
                    className={`size-2 shrink-0 self-center rounded-full ${DOT[color]?.replace("fill-", "bg-")}`}
                  />
                  <span className="text-foreground font-mono text-[17px] font-medium tabular-nums">
                    {hovered.value}
                  </span>
                  <span className="text-muted-foreground text-[11px]">{active.unit}</span>
                  {prev ? (
                    <span className="text-caption text-muted-foreground font-medium tabular-nums">
                      {hovered.value - prev.value > 0 ? "+" : ""}
                      {Math.round((hovered.value - prev.value) * 10) / 10}
                    </span>
                  ) : null}
                </p>
                {hoveredBand ? (
                  <p className="text-caption text-muted-foreground mt-0.5 pl-4">
                    {hoveredBand.display}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* Exact, because a chart is an impression and a record is not — and
              because a screen reader gets nothing from an SVG path. */}
          <details className="border-border/60 mt-1 rounded-lg border">
            <summary className="text-caption text-muted-foreground hover:text-foreground cursor-pointer px-2.5 py-1.5">
              All {series.length} readings
            </summary>
            <ul className="divide-border/50 max-h-32 divide-y overflow-y-auto border-t">
              {[...series].reverse().map((r, i) => (
                <li
                  key={`${r.at}-${i}`}
                  className="flex items-baseline gap-2 px-2.5 py-1.5 text-[11.5px]"
                >
                  <span className="text-foreground w-[4rem] shrink-0 font-mono font-medium tabular-nums">
                    {r.value}
                  </span>
                  <span className="text-muted-foreground shrink-0 font-mono tabular-nums">
                    {day(r.at)} {clock(r.at)}
                  </span>
                  <span className="text-muted-foreground ml-auto">
                    {bandFor(active.bands, r.value)?.display ?? "—"}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        </DialogContent>
      </Dialog>
    </>
  );
}

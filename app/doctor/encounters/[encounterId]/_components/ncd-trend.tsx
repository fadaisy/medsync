"use client";

import type { ResultBand } from "@/lib/ncd/catalog/schema";
import type { Interpretation } from "@/lib/ncd/engine/assess";
import type { CaptureReading } from "@/lib/ncd/engine/evaluate";
import { useMemo, useState } from "react";
import { TrendingDownIcon, TrendingUpIcon } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { bandFor } from "@/lib/ncd/catalog/schema";

/**
 * The trend, at a size it can be read at — and with the rest of the chart beside
 * it when that is the question.
 *
 * ── The scale problem, and what is done about it ─────────────────────────────
 * Vitals do not share an axis. A saturation lives at 95, a systolic at 150, a
 * temperature at 37; plot them on one scale and the temperature is a flat line
 * along the bottom, which says nothing true about it.
 *
 * So when more than one is shown, each is scaled to ITS OWN range and the
 * surface says so. What that view answers is SHAPE — did the pulse climb while
 * the pressure fell — and shape is the question worth asking of several vitals
 * at once. Values are never inferred from the height of a line: they are read
 * off the crosshair panel and the table, where they are printed.
 *
 * The band background is drawn only for a SINGLE series, because bands belong to
 * one scale. Painting one vital's normal range behind another's line would be a
 * lie that looks like information.
 */

/** Distinct, and stable as series are toggled on and off. */
const SERIES_COLORS = [
  { line: "stroke-red-500", dot: "text-red-500", bar: "bg-red-500", id: "red" },
  { line: "stroke-sky-600", dot: "text-sky-600", bar: "bg-sky-600", id: "sky" },
  { line: "stroke-amber-500", dot: "text-amber-500", bar: "bg-amber-500", id: "amber" },
  { line: "stroke-violet-500", dot: "text-violet-500", bar: "bg-violet-500", id: "violet" },
  { line: "stroke-emerald-600", dot: "text-emerald-600", bar: "bg-emerald-600", id: "emerald" },
  { line: "stroke-orange-500", dot: "text-orange-500", bar: "bg-orange-500", id: "orange" },
];

const BAND_FILL: Record<string, string> = {
  brand: "fill-brand-500/10",
  emerald: "fill-emerald-500/10",
  amber: "fill-amber-500/10",
  orange: "fill-orange-500/12",
  red: "fill-red-500/10",
  grey: "fill-gray-500/[0.08]",
};

const ms = (iso: string) => new Date(iso).getTime();
const clock = (iso: string) => new Date(iso).toTimeString().slice(0, 5);
const day = (iso: string) => new Date(iso).toDateString().slice(4, 10);

/** The reading at or before a moment — a vital holds until it is measured again. */
function readingAt(series: CaptureReading[], at: number): CaptureReading | undefined {
  let out: CaptureReading | undefined;
  for (const r of series) if (ms(r.at) <= at && (!out || ms(r.at) > ms(out.at))) out = r;
  return out;
}

export function NcdTrend({
  row,
  siblings,
  colorOf,
}: {
  row: Interpretation;
  /** Every other tracked measure, offered for comparison. */
  siblings: Interpretation[];
  colorOf: (band: ResultBand | undefined) => string;
}) {
  const [open, setOpen] = useState(false);
  const [extra, setExtra] = useState<string[]>([]);
  const [hover, setHover] = useState<number | undefined>(undefined);

  const available = useMemo(
    () => siblings.filter((s) => s.feature !== row.feature && (s.series?.length ?? 0) > 1),
    [siblings, row.feature],
  );

  const points = useMemo(() => {
    const shown = [row, ...available.filter((s) => extra.includes(s.feature))];
    return shown.map((s, i) => {
      const series = [...(s.series ?? [])].sort((a, b) => a.at.localeCompare(b.at));
      const vals = series.map((r) => r.value);
      const lo = Math.min(...vals);
      const hi = Math.max(...vals);
      return { row: s, series, lo, hi, span: hi - lo || 1, color: SERIES_COLORS[i % 6]! };
    });
  }, [row, available, extra]);

  if ((row.series?.length ?? 0) < 2) return null;

  const times = [...new Set(points.flatMap((p) => p.series.map((r) => ms(r.at))))].sort(
    (a, b) => a - b,
  );
  const t0 = times[0]!;
  const t1 = times[times.length - 1]!;

  const W = 760;
  const H = 300;
  const L = 54;
  const R = 16;
  const TOP = 18;
  const BOT = 36;
  const x = (at: number) => L + (t1 === t0 ? 0.5 : (at - t0) / (t1 - t0)) * (W - L - R);
  const yOf = (p: (typeof points)[number], v: number) =>
    H - BOT - ((v - p.lo) / p.span) * (H - BOT - TOP);

  const only = points[0]!;
  const single = points.length === 1;
  const gridY = [0, 0.5, 1].map((f) => only.lo + f * only.span);

  const first = only.series[0]!;
  const last = only.series[only.series.length - 1]!;
  const delta = Math.round((last.value - first.value) * 10) / 10;
  const pct = first.value === 0 ? 0 : Math.round(((last.value - first.value) / first.value) * 100);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="tap text-caption text-brand-700 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-950/40 mt-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium"
      >
        <TrendingUpIcon className="size-3" aria-hidden />
        See trend
        <span className="text-muted-foreground tabular-nums">({row.series!.length})</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="sr-only">{row.display} — trend</DialogTitle>
          </DialogHeader>

          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
            <div className="flex flex-col gap-1">
              <span className="text-foreground text-body-s font-medium">{row.display}</span>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-display text-foreground text-[40px] leading-none font-medium tabular-nums">
                  {last.value}
                </span>
                <span className="text-muted-foreground text-caption">
                  {row.unit} · {only.series.length} readings
                </span>
                {/*
                 * Direction, not judgement. Up is not always bad — a saturation
                 * climbing is good news — so the arrow says which way it went and
                 * the band beneath says whether that is where it should be.
                 */}
                <span
                  className={`text-caption inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium tabular-nums ${
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
                  {pct}%) across the record
                </span>
              </div>
            </div>

            {available.length ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-caption text-muted-foreground">Compare</span>
                {available.map((s) => {
                  const at = extra.indexOf(s.feature);
                  const on = at >= 0;
                  const c = SERIES_COLORS[(at + 1) % 6]!;
                  return (
                    <button
                      key={s.feature}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setExtra((prev) =>
                          prev.includes(s.feature)
                            ? prev.filter((f) => f !== s.feature)
                            : [...prev, s.feature],
                        )
                      }
                      className={`tap text-caption ease-expo-out inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-medium ring-1 transition-colors duration-100 ring-inset ${
                        on
                          ? "bg-muted text-foreground ring-border"
                          : "text-muted-foreground ring-border/60 hover:bg-muted/60"
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`size-2 rounded-full ${on ? c.bar : "bg-muted-foreground/40"}`}
                      />
                      {s.display.replace("Blood pressure — ", "")}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="mt-1 h-auto w-full cursor-crosshair"
            role="img"
            aria-label={`${row.display}: ${only.series.map((r) => `${r.value} at ${clock(r.at)}`).join("; ")}`}
            onMouseLeave={() => setHover(undefined)}
            onMouseMove={(e) => {
              const box = e.currentTarget.getBoundingClientRect();
              const px = ((e.clientX - box.left) / box.width) * W;
              const at = t0 + ((px - L) / (W - L - R)) * (t1 - t0);
              setHover(times.reduce((a, b) => (Math.abs(b - at) < Math.abs(a - at) ? b : a)));
            }}
          >
            {single
              ? row.bands.map((b) => {
                  const top = yOf(only, Math.min(b.to ?? only.hi, only.hi));
                  const bottom = yOf(only, Math.max(b.from ?? only.lo, only.lo));
                  if (bottom - top < 1) return null;
                  return (
                    <rect
                      key={b.code}
                      x={L}
                      y={top}
                      width={W - L - R}
                      height={bottom - top}
                      className={BAND_FILL[colorOf(b)] ?? BAND_FILL.grey}
                    />
                  );
                })
              : null}

            {gridY.map((v, i) => (
              <g key={i}>
                <line
                  x1={L}
                  x2={W - R}
                  y1={yOf(only, v)}
                  y2={yOf(only, v)}
                  className="stroke-border"
                  strokeDasharray="4 4"
                />
                {/* The axis is only true when one series owns it. */}
                {single ? (
                  <text
                    x={L - 8}
                    y={yOf(only, v) + 3}
                    textAnchor="end"
                    className="fill-current text-[10px] opacity-55"
                    style={{ fontSize: 10 }}
                  >
                    {Math.round(v * 10) / 10}
                  </text>
                ) : null}
              </g>
            ))}

            <defs>
              {points.map((p) => (
                <linearGradient key={p.color.id} id={`g-${p.color.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="currentColor"
                    stopOpacity={0.2}
                    className={p.color.dot}
                  />
                  <stop
                    offset="100%"
                    stopColor="currentColor"
                    stopOpacity={0}
                    className={p.color.dot}
                  />
                </linearGradient>
              ))}
            </defs>

            {points.map((p) => {
              const path = p.series
                .map((r, i) => `${i === 0 ? "M" : "L"}${x(ms(r.at))},${yOf(p, r.value)}`)
                .join(" ");
              return (
                <g key={p.row.feature}>
                  <path
                    d={`${path} L${x(ms(p.series[p.series.length - 1]!.at))},${H - BOT} L${x(ms(p.series[0]!.at))},${H - BOT} Z`}
                    fill={`url(#g-${p.color.id})`}
                  />
                  <path
                    d={path}
                    fill="none"
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    className={p.color.line}
                  />
                </g>
              );
            })}

            {hover !== undefined ? (
              <g>
                <line
                  x1={x(hover)}
                  x2={x(hover)}
                  y1={TOP}
                  y2={H - BOT}
                  className="stroke-muted-foreground/50"
                  strokeDasharray="3 3"
                />
                {points.map((p) => {
                  const r = readingAt(p.series, hover);
                  if (!r) return null;
                  return (
                    <circle
                      key={p.row.feature}
                      cx={x(hover)}
                      cy={yOf(p, r.value)}
                      r={4.5}
                      strokeWidth={2}
                      className={`${p.color.line} fill-current ${p.color.dot} stroke-white dark:stroke-gray-900`}
                    />
                  );
                })}
              </g>
            ) : null}

            {[t0, times[Math.floor(times.length / 2)]!, t1].map((at, i) => (
              <text
                key={i}
                x={x(at)}
                y={H - 12}
                textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"}
                className="fill-current text-[10px] opacity-55"
                style={{ fontSize: 10 }}
              >
                {day(new Date(at).toISOString())} {clock(new Date(at).toISOString())}
              </text>
            ))}
          </svg>

          <div className="border-border bg-card min-h-[4.75rem] rounded-lg border p-2.5">
            {hover === undefined ? (
              <p className="text-caption text-muted-foreground">
                Move across the chart to read any moment.
                {points.length > 1
                  ? " Each series is scaled to its own range — compare the shape here, and read the values below."
                  : ""}
              </p>
            ) : (
              <>
                <p className="text-foreground text-body-s font-medium">
                  {day(new Date(hover).toISOString())}{" "}
                  <span className="text-muted-foreground font-normal">
                    {clock(new Date(hover).toISOString())}
                  </span>
                </p>
                <ul className="mt-1.5 flex flex-wrap gap-x-7 gap-y-2">
                  {points.map((p) => {
                    const r = readingAt(p.series, hover);
                    if (!r) return null;
                    const i = p.series.findIndex((s) => s.at === r.at);
                    const prev = i > 0 ? p.series[i - 1] : undefined;
                    const d = prev ? Math.round((r.value - prev.value) * 10) / 10 : undefined;
                    const band = bandFor(p.row.bands, r.value);
                    return (
                      <li key={p.row.feature} className="flex items-stretch gap-2">
                        <span
                          aria-hidden
                          className={`w-0.5 shrink-0 rounded-full ${p.color.bar}`}
                        />
                        <span className="flex flex-col">
                          <span className="text-caption text-muted-foreground">
                            {p.row.display}
                          </span>
                          <span className="flex items-baseline gap-2">
                            <span className="text-foreground font-mono text-[15px] font-medium tabular-nums">
                              {r.value}
                            </span>
                            <span className="text-muted-foreground text-[10px]">{p.row.unit}</span>
                            {d ? (
                              <span className="text-caption text-muted-foreground font-medium tabular-nums">
                                {d > 0 ? "+" : ""}
                                {d}
                              </span>
                            ) : null}
                          </span>
                          {band ? (
                            <span className="text-caption text-muted-foreground">
                              {band.display}
                            </span>
                          ) : null}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>

          {/* Exact, because a chart is an impression and a record is not — and
              because a screen reader gets nothing from an SVG path. */}
          <ul className="divide-border/50 border-border/60 max-h-32 divide-y overflow-y-auto rounded-lg border">
            {[...only.series].reverse().map((r, i) => {
              const band = bandFor(row.bands, r.value);
              return (
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
                  <span className="text-muted-foreground ml-auto">{band?.display ?? "—"}</span>
                </li>
              );
            })}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}

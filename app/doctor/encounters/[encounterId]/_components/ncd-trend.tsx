"use client";

import type { ResultBand } from "@/lib/ncd/catalog/schema";
import type { Interpretation } from "@/lib/ncd/engine/assess";
import type { CaptureReading } from "@/lib/ncd/engine/evaluate";
import { useState } from "react";
import { TrendingUpIcon } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { bandFor } from "@/lib/ncd/catalog/schema";

/**
 * The trend, at a size it can actually be read at.
 *
 * The sparkline in the row answers "is this going the right way" in a glance and
 * nothing more — which is all a table cell has room for. This answers the next
 * question: WHAT the readings were, WHEN, and which band each one fell in. The
 * bands are drawn as the background, so a line crossing out of the normal zone
 * is visible as a crossing rather than as a number the reader has to compare.
 */

const FILL: Record<string, string> = {
  brand: "fill-brand-100/60 dark:fill-brand-900/30",
  emerald: "fill-emerald-100/60 dark:fill-emerald-900/25",
  amber: "fill-amber-100/60 dark:fill-amber-900/25",
  orange: "fill-orange-100/70 dark:fill-orange-900/30",
  red: "fill-red-100/60 dark:fill-red-900/25",
  grey: "fill-gray-100/60 dark:fill-gray-800/40",
};

const DOT: Record<string, string> = {
  brand: "fill-brand-600",
  emerald: "fill-emerald-600",
  amber: "fill-amber-600",
  orange: "fill-orange-600",
  red: "fill-red-600",
  grey: "fill-gray-500",
};

const stamp = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toDateString().slice(4, 10)} ${d.toTimeString().slice(0, 5)}`;
};

export function NcdTrend({
  row,
  colorOf,
}: {
  row: Interpretation;
  /** The palette this row's table uses, so the chart matches its own table. */
  colorOf: (band: ResultBand | undefined) => string;
}) {
  const [open, setOpen] = useState(false);
  const series = row.series ?? [];
  if (series.length < 2) return null;

  const sorted: CaptureReading[] = [...series].sort((a, b) => a.at.localeCompare(b.at));
  const values = sorted.map((r) => r.value);

  // The plot covers the readings AND the band edges around them, so a band the
  // patient is sitting in is visible rather than clipped off the top.
  const edges = row.bands
    .flatMap((b) => [b.from, b.to])
    .filter((n): n is number => n !== undefined);
  const near = edges.filter(
    (e) =>
      e >= Math.min(...values) - 0.35 * (Math.max(...values) - Math.min(...values) || 10) &&
      e <= Math.max(...values) + 0.35 * (Math.max(...values) - Math.min(...values) || 10),
  );
  const lo = Math.min(...values, ...near);
  const hi = Math.max(...values, ...near);
  const pad = (hi - lo) * 0.12 || 2;
  const min = lo - pad;
  const max = hi + pad;

  const W = 560;
  const H = 220;
  const L = 46;
  const B = 28;
  const x = (i: number) => L + (i / (sorted.length - 1)) * (W - L - 12);
  const y = (v: number) => H - B - ((v - min) / (max - min || 1)) * (H - B - 12);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="tap text-caption text-brand-700 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-950/40 mt-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium"
      >
        <TrendingUpIcon className="size-3" aria-hidden />
        See trend
        <span className="text-muted-foreground tabular-nums">({sorted.length})</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {row.display}
              {row.unit ? <span className="text-muted-foreground"> · {row.unit}</span> : null}
            </DialogTitle>
            <DialogDescription>
              {sorted.length} readings from {stamp(sorted[0]!.at)} to{" "}
              {stamp(sorted[sorted.length - 1]!.at)}. Bands per {row.standard} {row.version}; every
              rule reads the latest.
            </DialogDescription>
          </DialogHeader>

          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-auto w-full"
            role="img"
            aria-label={`${row.display}: ${sorted.map((r) => `${r.value} at ${stamp(r.at)}`).join("; ")}`}
          >
            {/* The bands as the ground, so crossing out of normal reads as a crossing. */}
            {row.bands.map((b) => {
              const top = y(Math.min(b.to ?? max, max));
              const bottom = y(Math.max(b.from ?? min, min));
              if (bottom <= top) return null;
              return (
                <g key={b.code}>
                  <rect
                    x={L}
                    y={top}
                    width={W - L - 12}
                    height={bottom - top}
                    className={FILL[colorOf(b)] ?? FILL.grey}
                  />
                  <text
                    x={L + 6}
                    y={top + 12}
                    className="fill-current text-[9px] opacity-60"
                    style={{ fontSize: 9 }}
                  >
                    {b.display}
                  </text>
                </g>
              );
            })}

            {/* Axis: the two extremes and the units. More ticks would be noise. */}
            {[min, max].map((v) => (
              <text
                key={v}
                x={L - 6}
                y={y(v) + 3}
                textAnchor="end"
                className="fill-current text-[10px] opacity-60"
                style={{ fontSize: 10 }}
              >
                {Math.round(v * 10) / 10}
              </text>
            ))}

            <path
              d={sorted
                .map((r, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(r.value).toFixed(1)}`)
                .join(" ")}
              fill="none"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              className="stroke-foreground/70"
            />

            {sorted.map((r, i) => (
              <g key={`${r.at}-${i}`}>
                <circle
                  cx={x(i)}
                  cy={y(r.value)}
                  r={i === sorted.length - 1 ? 5 : 3.5}
                  className={DOT[colorOf(bandFor(row.bands, r.value))] ?? DOT.grey}
                >
                  <title>{`${r.value}${row.unit ? ` ${row.unit}` : ""} · ${stamp(r.at)}`}</title>
                </circle>
                <text
                  x={x(i)}
                  y={y(r.value) - 10}
                  textAnchor="middle"
                  className="fill-current text-[10px] font-medium"
                  style={{ fontSize: 10 }}
                >
                  {r.value}
                </text>
                <text
                  x={x(i)}
                  y={H - 10}
                  textAnchor="middle"
                  className="fill-current text-[9px] opacity-60"
                  style={{ fontSize: 9 }}
                >
                  {new Date(r.at).toTimeString().slice(0, 5)}
                </text>
              </g>
            ))}
          </svg>

          {/* The readings in full, because a chart is an impression and a record
            has to be exact — and because a screen reader gets nothing from an
            SVG path. */}
          <ul className="divide-border/50 border-border/60 max-h-40 divide-y overflow-y-auto rounded-lg border">
            {[...sorted].reverse().map((r, i) => {
              const band = bandFor(row.bands, r.value);
              return (
                <li
                  key={`${r.at}-${i}`}
                  className="flex items-baseline gap-2 px-2.5 py-1.5 text-[11.5px]"
                >
                  <span className="text-foreground w-[4.5rem] shrink-0 font-mono font-medium tabular-nums">
                    {r.value}
                  </span>
                  <span className="text-muted-foreground shrink-0 font-mono tabular-nums">
                    {stamp(r.at)}
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

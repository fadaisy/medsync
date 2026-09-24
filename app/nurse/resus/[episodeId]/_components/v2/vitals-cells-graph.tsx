"use client";

import type { GraphPoints, VitalCellSkin } from "./vitals-cells";

import { VITAL_REFERENCE } from "@/lib/resus/vital-trend";

/**
 * The hover/tap trend graph — a clean time-aware line over the resus, with the
 * NORMAL band shaded + the danger threshold(s) marked (clinical-normal, from the
 * shared `vitalBand` cutoffs). BP plots SBP + DBP as a two-line pair. Latest
 * point emphasised. Reduced-motion-safe (it appears without animation).
 */
export function VitalTrendGraph({
  seriesKey,
  label,
  unit,
  points,
  secondary,
  skin,
}: {
  seriesKey: string;
  label: string;
  unit: string;
  points: GraphPoints[];
  secondary?: { label: string; points: GraphPoints[] } | null;
  skin: VitalCellSkin;
}) {
  const all = [...points, ...(secondary?.points ?? [])];
  if (all.length < 2) {
    return <p className={skin.graphNote}>Needs ≥ 2 readings to trend.</p>;
  }
  const ref = VITAL_REFERENCE[seriesKey] ?? {};
  const w = 208;
  const h = 92;
  const padX = 6;
  const padY = 10;

  const times = all.map((p) => new Date(p.t).getTime());
  const t0 = Math.min(...times);
  const tN = Math.max(...times);
  const tSpan = tN - t0 || 1;

  const refVals = [ref.normalLow, ref.normalHigh, ref.dangerLow, ref.dangerHigh].filter(
    (n): n is number => typeof n === "number",
  );
  const lo = Math.min(...all.map((p) => p.value), ...refVals);
  const hi = Math.max(...all.map((p) => p.value), ...refVals);
  const span = hi - lo || 1;
  const x = (t: string) => padX + ((new Date(t).getTime() - t0) / tSpan) * (w - 2 * padX);
  const y = (v: number) => padY + (1 - (v - lo) / span) * (h - 2 * padY);

  const path = (pp: GraphPoints[]) =>
    pp
      .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.t).toFixed(1)},${y(p.value).toFixed(1)}`)
      .join(" ");

  // A BP series may have DBP points only (SBP marked artefact) — fall back to them.
  const primary = points.length > 0 ? points : (secondary?.points ?? []);
  const last = primary[primary.length - 1]!;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-foreground text-caption">
          {label} <span className="text-muted-foreground font-normal">{unit}</span>
        </span>
        <span className={skin.graphMeta}>{all.length} readings</span>
      </div>
      <svg
        width={w}
        height={h}
        className="overflow-visible"
        role="img"
        aria-label={`${label} trend graph`}
      >
        {/* Normal band (clinical-normal) shaded */}
        {ref.normalLow != null || ref.normalHigh != null ? (
          <rect
            x={padX}
            width={w - 2 * padX}
            y={y(ref.normalHigh ?? hi)}
            height={Math.max(0, y(ref.normalLow ?? lo) - y(ref.normalHigh ?? hi))}
            className="fill-mint-500/10"
          />
        ) : null}
        {/* Danger threshold lines */}
        {[ref.dangerLow, ref.dangerHigh]
          .filter((n): n is number => typeof n === "number")
          .map((n) => (
            <line
              key={n}
              x1={padX}
              x2={w - padX}
              y1={y(n)}
              y2={y(n)}
              className={skin.dangerLine}
              strokeWidth="1"
              strokeDasharray="3 2"
            />
          ))}
        {/* DBP (secondary) line for BP */}
        {secondary && secondary.points.length >= 2 ? (
          <path
            d={path(secondary.points)}
            fill="none"
            className="stroke-muted-foreground/50"
            strokeWidth="1.25"
          />
        ) : null}
        {/* Primary line + points */}
        <path d={path(points)} fill="none" className="stroke-foreground/70" strokeWidth="1.5" />
        {points.map((p) => (
          <circle key={p.t} cx={x(p.t)} cy={y(p.value)} r={1.6} className="fill-foreground/50" />
        ))}
        {/* Latest point emphasised */}
        <circle cx={x(last.t)} cy={y(last.value)} r={3} className="fill-foreground" />
      </svg>
      <div className={skin.graphFooter}>
        <span>now {last.value}</span>
        {secondary && secondary.points.length > 0 ? (
          <span>
            {secondary.label} {secondary.points[secondary.points.length - 1]!.value}
          </span>
        ) : null}
        {ref.normalLow != null || ref.normalHigh != null ? (
          <span className="text-teal-700">
            normal {ref.normalLow ?? "≤"}
            {ref.normalLow != null && ref.normalHigh != null ? "–" : ""}
            {ref.normalHigh ?? (ref.normalLow != null ? "+" : "")}
          </span>
        ) : null}
      </div>
    </div>
  );
}

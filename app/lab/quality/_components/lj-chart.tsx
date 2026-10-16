"use client";

import { useState } from "react";

import { QUALITY } from "../_lib/copy";

export interface LjPoint {
  id: string;
  /** "13 OCT 2026 09:10" */
  at: string;
  value: number;
  z: number;
  by: string;
  lot: string;
  rules: string[];
}

const W = 720;
const H = 260;
const PAD = { l: 64, r: 56, t: 12, b: 28 };
const LIMIT = 4;
/** ±1, 2, 3 SD differ by dash pattern as well as tone (§10). */
const LINES = [
  { k: 0, dash: undefined, label: "Mean" },
  { k: 1, dash: "2 4", label: "1 SD" },
  { k: 2, dash: "8 4", label: "2 SD" },
  { k: 3, dash: "14 4 2 4", label: "3 SD" },
] as const;

const sdWords = (z: number) => `${z >= 0 ? "+" : "−"}${Math.abs(z).toFixed(1)} SD`;

/**
 * The Levey-Jennings chart (§5.2, §10): mean and ±1, 2, 3 SD with distinct dash patterns, the points joined,
 * a point that broke a rule drawn filled. Every point is focusable and names its value, SD distance, time,
 * operator and lot; the chart has a text alternative and the same points as a table one click away. SVG from
 * tokens (currentColor), no chart library.
 */
export function LjChart({
  title,
  points,
  mean,
  sd,
  unit,
  decimals,
}: {
  title: string;
  points: LjPoint[];
  mean: number;
  sd: number;
  unit: string;
  decimals: number;
}) {
  const [focus, setFocus] = useState<number | null>(null);
  const R = QUALITY.run;
  const x = (i: number) =>
    PAD.l +
    (points.length <= 1
      ? (W - PAD.l - PAD.r) / 2
      : (i * (W - PAD.l - PAD.r)) / (points.length - 1));
  const y = (z: number) => {
    const c = Math.max(-LIMIT, Math.min(LIMIT, z));
    return PAD.t + ((LIMIT - c) * (H - PAD.t - PAD.b)) / (2 * LIMIT);
  };
  const fmt = (v: number) => v.toFixed(decimals);
  const label = (p: LjPoint) =>
    `${p.at}, ${fmt(p.value)} ${unit}, ${sdWords(p.z)}, run by ${p.by}, lot ${p.lot}${p.rules.length ? `, broke ${p.rules.join(" and ")}` : ""}`;
  const broken = points.filter((p) => p.rules.length);
  const last = points.slice(-3);
  const desc = `${title}. Target ${fmt(mean)} ${unit}, SD ${fmt(sd)}. ${
    broken.length
      ? `Rules broken: ${broken.map((p) => `${p.rules.join(" and ")} at ${p.at}`).join("; ")}.`
      : "No rule broken."
  } Last values: ${last.map((p) => `${fmt(p.value)} (${sdWords(p.z)})`).join(", ") || "none"}.`;
  const shown = focus === null ? null : points[focus];
  return (
    <figure className="flex flex-col gap-2">
      {points.length === 0 ? (
        <p className="text-body-s text-muted-foreground">{R.noRuns}</p>
      ) : (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="text-muted-foreground h-auto w-full"
          role="group"
          aria-label={title}
          aria-describedby="lj-desc"
        >
          <desc id="lj-desc">{desc}</desc>
          {LINES.flatMap((l) =>
            (l.k === 0 ? [0] : [l.k, -l.k]).map((k) => (
              <g key={k}>
                <line
                  x1={PAD.l}
                  x2={W - PAD.r}
                  y1={y(k)}
                  y2={y(k)}
                  stroke="currentColor"
                  strokeWidth={k === 0 ? 1.5 : 1}
                  strokeDasharray={l.dash}
                  opacity={k === 0 ? 0.9 : 0.6}
                />
                <text
                  x={PAD.l - 8}
                  y={y(k) + 4}
                  textAnchor="end"
                  className="fill-current text-[11px] tabular-nums"
                >
                  {fmt(mean + k * sd)}
                </text>
                <text x={W - PAD.r + 8} y={y(k) + 4} className="fill-current text-[11px]">
                  {k === 0 ? "Mean" : `${k > 0 ? "+" : "−"}${Math.abs(k)} SD`}
                </text>
              </g>
            )),
          )}
          <polyline
            points={points.map((p, i) => `${x(i)},${y(p.z)}`).join(" ")}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className="text-teal-600"
          />
          {points.map((p, i) => (
            <g key={p.id} className="text-teal-700">
              <circle
                cx={x(i)}
                cy={y(p.z)}
                r={focus === i ? 7 : 5}
                tabIndex={0}
                role="img"
                aria-label={label(p)}
                fill={p.rules.length ? "currentColor" : "var(--color-card)"}
                stroke="currentColor"
                strokeWidth={2}
                className="cursor-pointer outline-none"
                onFocus={() => setFocus(i)}
                onBlur={() => setFocus(null)}
                onMouseEnter={() => setFocus(i)}
                onMouseLeave={() => setFocus(null)}
              />
            </g>
          ))}
          {points.length ? (
            <>
              <text x={PAD.l} y={H - 8} className="fill-current text-[11px]">
                {points[0]!.at}
              </text>
              <text x={W - PAD.r} y={H - 8} textAnchor="end" className="fill-current text-[11px]">
                {points.at(-1)!.at}
              </text>
            </>
          ) : null}
        </svg>
      )}
      <p aria-live="polite" className="text-body-s min-h-5 font-mono tabular-nums">
        {shown ? label(shown) : null}
      </p>
      <figcaption className="text-caption text-muted-foreground">{R.caption}</figcaption>
      <details className="text-body-s">
        <summary className="min-h-11 cursor-pointer font-medium text-teal-700 sm:min-h-0">
          {R.table}
        </summary>
        <div className="overflow-x-auto pt-2">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr className="text-caption text-muted-foreground border-b">
                {R.tableColumns.map((c) => (
                  <th key={c} scope="col" className="py-1.5 pr-3 font-medium">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.id} className="border-b">
                  <td className="py-1.5 pr-3">{p.at}</td>
                  <td className="py-1.5 pr-3 text-right font-mono tabular-nums">{fmt(p.value)}</td>
                  <td className="py-1.5 pr-3 text-right font-mono tabular-nums">{sdWords(p.z)}</td>
                  <td className="py-1.5 pr-3">{p.rules.join(" · ") || R.noneBroken}</td>
                  <td className="py-1.5 pr-3">{p.by}</td>
                  <td className="py-1.5 pr-3 font-mono">{p.lot}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

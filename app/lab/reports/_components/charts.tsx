import type { WeekPoint } from "@/lib/lab/report-trend";
import type { ReactNode } from "react";
import Link from "next/link";

import { fill } from "@/content/lab-workspace-v2";
import { LABWS2_REPORTS } from "@/content/lab-workspace-v2-reports";
import { dayShort } from "@/lib/lab/period";
import { formatDuration } from "@/lib/lab/turnaround";

/**
 * Reports' hand-built SVG charts (prompt 5.9, Law 12: no chart library). Marks in the Tide cascade tone, the
 * latest point in lagoon (the "now" mark), every chart with a text alternative. No colour carries a state.
 */

const I = LABWS2_REPORTS.indicators;

/** Six months as a line; a month with no data is a gap, never a 0. */
export function Sparkline({
  values,
  label,
}: {
  values: readonly (number | null)[];
  label: string;
}) {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length === 0) return null;
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  const x = (i: number) => 2 + (i * 80) / Math.max(1, values.length - 1);
  const y = (v: number) => (hi === lo ? 15 : 27 - ((v - lo) / (hi - lo)) * 24);
  const runs: string[][] = [[]];
  values.forEach((v, i) => {
    if (v === null) runs.push([]);
    else runs.at(-1)!.push(`${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  });
  const last = values.length - 1;
  return (
    <svg viewBox="0 0 84 30" role="img" aria-label={label} className="h-[30px] w-[84px] shrink-0">
      {runs
        .filter((r) => r.length > 1)
        .map((r, i) => (
          <polyline
            key={i}
            points={r.join(" ")}
            fill="none"
            strokeWidth="1.75"
            className="stroke-tide-cascade-3"
          />
        ))}
      {values.map((v, i) =>
        v === null ? null : (
          <circle
            key={i}
            cx={x(i)}
            cy={y(v)}
            r={i === last ? 3 : 1.5}
            className={i === last ? "fill-tide-lagoon stroke-card" : "fill-tide-cascade-3"}
            strokeWidth={i === last ? 1.5 : 0}
          />
        ),
      )}
    </svg>
  );
}

const STEPS = [5, 10, 15, 20, 30, 60, 120, 240, 480, 720, 1440, 2880];

/** The weekly median turnaround as a line, with the stated time as a reference when one time applies. */
export function WeeklyLine({
  points,
  stated,
  today,
}: {
  points: readonly WeekPoint[];
  stated: number | null;
  today: string;
}) {
  const nums = points.flatMap((p) => (p.median === null ? [] : [p.median]));
  if (nums.length === 0) return <p className="text-body-s text-muted-foreground">{I.chartEmpty}</p>;
  const all = stated === null ? nums : [...nums, stated];
  const step =
    STEPS.find((s) => Math.ceil(Math.max(...all) / s) - Math.floor(Math.min(...all) / s) <= 6) ??
    2880;
  const lo = Math.floor(Math.min(...all) / step) * step;
  const hi = Math.max(lo + step, Math.ceil(Math.max(...all) / step) * step);
  const L = 44,
    R = 712,
    T = 16,
    B = 160;
  const x = (i: number) => L + (i * (R - L)) / Math.max(1, points.length - 1);
  const y = (v: number) => B - ((v - lo) / (hi - lo)) * (B - T);
  const ticks: number[] = [];
  for (let v = lo; v <= hi; v += step) ticks.push(v);
  const runs: string[][] = [[]];
  points.forEach((p, i) => {
    if (p.median === null) runs.push([]);
    else runs.at(-1)!.push(`${x(i).toFixed(1)},${y(p.median).toFixed(1)}`);
  });
  const lastI = points.findLastIndex((p) => p.median !== null);
  const every = Math.max(1, Math.ceil(points.length / 7));
  const summary = fill(I.chartSummary, {
    from: dayShort(points[0]!.week, today),
    to: dayShort(points.at(-1)!.week, today),
    min: Math.round(Math.min(...nums)),
    max: Math.round(Math.max(...nums)),
    last: Math.round(points[lastI]!.median!),
  });
  return (
    <figure className="flex flex-col gap-2">
      <svg
        viewBox="0 0 720 190"
        role="img"
        aria-label={summary}
        className="h-auto w-full text-[11px]"
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={R} y1={y(t)} y2={y(t)} className="stroke-ink-100" strokeWidth="1" />
            <text
              x={L - 8}
              y={y(t) + 3}
              textAnchor="end"
              className="fill-muted-foreground tabular-nums"
            >
              {t}
            </text>
          </g>
        ))}
        {stated !== null ? (
          <g>
            <line
              x1={L}
              x2={R}
              y1={y(stated)}
              y2={y(stated)}
              className="stroke-foreground"
              strokeWidth="1.25"
              strokeDasharray="4 3"
            />
            <text x={R} y={y(stated) - 6} textAnchor="end" className="fill-foreground">
              {fill(I.stated, { time: formatDuration(stated) })}
            </text>
          </g>
        ) : null}
        {runs
          .filter((r) => r.length > 1)
          .map((r, i) => (
            <polyline
              key={i}
              points={r.join(" ")}
              fill="none"
              strokeWidth="2"
              className="stroke-tide-cascade-3"
            />
          ))}
        {points.map((p, i) =>
          p.median === null ? null : (
            <circle
              key={p.week}
              cx={x(i)}
              cy={y(p.median)}
              r={i === lastI ? 5 : 3.5}
              strokeWidth="2"
              className={
                i === lastI ? "fill-tide-lagoon stroke-card" : "fill-tide-cascade-3 stroke-card"
              }
            />
          ),
        )}
        {points.map((p, i) =>
          i % every === 0 || i === points.length - 1 ? (
            <text
              key={p.week}
              x={x(i)}
              y={178}
              textAnchor="middle"
              className="fill-muted-foreground"
            >
              {dayShort(p.week, today)}
            </text>
          ) : null,
        )}
        <text
          x={x(lastI) - 8}
          y={y(points[lastI]!.median!) + 18}
          textAnchor="end"
          className="fill-foreground font-semibold tabular-nums"
        >
          {Math.round(points[lastI]!.median!)}
        </text>
      </svg>
      <details className="text-body-s">
        <summary className="text-primary w-fit cursor-pointer underline-offset-4 hover:underline">
          {I.viewTable}
        </summary>
        <table className="mt-2 w-full max-w-md border-collapse">
          <thead>
            <tr>
              {I.weekColumns.map((c, i) => (
                <th
                  key={c}
                  scope="col"
                  className={`text-caption text-muted-foreground px-2 py-1.5 font-medium ${i ? "text-right" : "text-left"}`}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.week} className="border-border border-t">
                <td className="px-2 py-1.5">{dayShort(p.week, today)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {p.median === null ? (
                    <span className="text-muted-foreground">{I.noDataCell}</span>
                  ) : (
                    Math.round(p.median)
                  )}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {p.n.toLocaleString("en-GB")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/** Rejected specimens by reason as bars, most first; each bar opens its specimens (lab roles). */
export function ReasonBars({
  rows,
  footer,
}: {
  rows: readonly { key: string; label: string; n: number; href: string; aria: string }[];
  footer?: ReactNode;
}) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <div className="flex flex-col gap-1.5">
      <ul className="flex flex-col gap-1">
        {rows.map((r) => (
          <li key={r.key}>
            <Link
              href={r.href}
              aria-label={r.aria}
              className="hover:bg-muted focus-visible:shadow-focus rounded-tide-row grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-3 px-2 py-1.5 outline-none"
            >
              <span className="text-body-s truncate">{r.label}</span>
              <span className="bg-tide-sunken h-2.5 overflow-hidden rounded-full" aria-hidden>
                <span
                  className="bg-tide-cascade-3 block h-full rounded-full"
                  style={{ width: `${(r.n / max) * 100}%` }}
                />
              </span>
              <span className="text-body-s font-semibold tabular-nums">
                {r.n.toLocaleString("en-GB")}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {footer ? <p className="text-caption text-muted-foreground">{footer}</p> : null}
    </div>
  );
}

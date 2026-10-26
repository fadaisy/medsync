import type { Judgement } from "@patient-core/care-trends";

import { cn } from "@/lib/utils";

const W = 322;
const H = 176;
const X0 = 40;
const X1 = 300;
const Y0 = 12;
const Y1 = 146;

/**
 * The week chart on Health trends (§5.4 `WeekChart`; the phone's features/care/week-chart.tsx), hand-built
 * SVG: seven days, the grid, one or two lines and a point for each day with a reading. The target is two
 * dashed lines from the threshold data (`targetBand`, L7); weight has none. A point the thresholds put
 * outside the target is an amber marker with a ring, and the legend says "Outside target" in words (L4).
 * Red stays off the chart: a danger reading is named in the readings list. The SVG's name states the
 * chart's finding (S16), so it never relies on the picture.
 */
export function WeekChart({
  a,
  b,
  lo,
  hi,
  grid,
  band,
  days,
  judged,
  label,
  legend,
}: {
  a: (number | null)[];
  b?: (number | null)[];
  lo: number;
  hi: number;
  grid: number[];
  band: { lo: number; hi: number } | null;
  days: string[];
  judged: (Judgement | null)[];
  /** The text alternative: what the chart is and what it shows. */
  label: string;
  legend: { l1: string; l2?: string; target: string; outside: string };
}) {
  const y = (v: number) => Y0 + (1 - (v - lo) / (hi - lo || 1)) * (Y1 - Y0);
  const x = (i: number) => X0 + (i * (X1 - X0)) / Math.max(1, a.length - 1);
  // A day with no reading is a gap: the line joins the days that have one.
  const path = (vs: (number | null)[]) =>
    vs
      .flatMap((v, i) => (v === null ? [] : [[x(i), y(v)] as const]))
      .map(([px, py], k) => `${k ? "L" : "M"}${px} ${py}`)
      .join(" ");
  const outside = (j: Judgement | null) => j?.tone === "caution" || j?.tone === "critical";
  const lines = band ? [band.hi, band.lo].filter((v) => v >= lo && v <= hi) : [];
  const lastLogged = a.reduce<number>((n, v, i) => (v === null ? n : i), -1);

  return (
    <figure className="flex flex-col gap-3">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="h-auto w-full">
        {grid.map((g) => (
          <g key={`g${g}`}>
            <line
              x1={30}
              x2={316}
              y1={y(g)}
              y2={y(g)}
              strokeWidth={1}
              className="stroke-pw-surface-3"
            />
            <text x={24} y={y(g) + 3} textAnchor="end" fontSize={10} className="fill-pw-ink-3">
              {String(g)}
            </text>
          </g>
        ))}
        {lines.map((v, k) => (
          <g key={`t${v}`}>
            <line
              x1={30}
              x2={316}
              y1={y(v)}
              y2={y(v)}
              strokeWidth={1.5}
              strokeDasharray="5 4"
              className="stroke-pw-accent-text"
            />
            {k === 0 ? (
              <text
                x={316}
                y={y(v) - 4}
                textAnchor="end"
                fontSize={10}
                fontWeight={600}
                className="fill-pw-accent-text"
              >
                {legend.target}
              </text>
            ) : null}
          </g>
        ))}
        {b ? (
          <path
            d={path(b)}
            fill="none"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="stroke-pw-cascade-2"
          />
        ) : null}
        <path
          d={path(a)}
          fill="none"
          strokeWidth={2.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="stroke-pw-ink"
        />
        {[
          ...a.map((v, i) => ({ v, i, s: "a" })),
          ...(b ?? []).map((v, i) => ({ v, i, s: "b" })),
        ].map(({ v, i, s }) =>
          v === null ? null : (
            <g key={`${s}${i}`}>
              {outside(judged[i] ?? null) ? (
                <circle
                  cx={x(i)}
                  cy={y(v)}
                  r={8.5}
                  fill="none"
                  strokeWidth={1.5}
                  className="stroke-pw-caution-text"
                />
              ) : null}
              <circle
                cx={x(i)}
                cy={y(v)}
                r={s === "b" ? 3.5 : i === lastLogged ? 6 : 4.5}
                strokeWidth={2}
                className={cn(
                  "stroke-pw-surface",
                  outside(judged[i] ?? null)
                    ? "fill-pw-caution-text"
                    : s === "b"
                      ? "fill-pw-cascade-2"
                      : i === lastLogged
                        ? "fill-pw-accent"
                        : "fill-pw-ink",
                )}
              />
            </g>
          ),
        )}
        {days.map((d, i) => (
          <text
            key={`d${i}`}
            x={x(i)}
            y={170}
            textAnchor="middle"
            fontSize={11}
            fontWeight={i === days.length - 1 ? 700 : 500}
            className="fill-pw-ink-2"
          >
            {d}
          </text>
        ))}
      </svg>
      <figcaption
        aria-hidden
        className="text-pw-ink-2 flex flex-wrap gap-x-4 gap-y-2 text-[13px] font-medium"
      >
        <Key cls="bg-pw-ink" line>
          {legend.l1}
        </Key>
        {legend.l2 ? (
          <Key cls="bg-pw-cascade-2" line>
            {legend.l2}
          </Key>
        ) : null}
        {band ? (
          <Key cls="border-pw-accent-text border-t-2 border-dashed" line>
            {legend.target}
          </Key>
        ) : null}
        {band ? <Key cls="bg-pw-caution-text">{legend.outside}</Key> : null}
      </figcaption>
    </figure>
  );
}

function Key({ cls, line, children }: { cls: string; line?: boolean; children: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn(line ? "h-[3px] w-4 rounded-sm" : "size-2.5 rounded-full", cls)} />
      {children}
    </span>
  );
}

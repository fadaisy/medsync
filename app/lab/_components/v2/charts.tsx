import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Lab Workspace v2 charts (Section 7): hand-built SVG, tokens only, each with a text alternative that states
 * its main finding; the larger ones carry a "view as table" disclosure (a native <details>, no script). Marks
 * differ by shape or lightness as well as hue (Section 10). No red, no green.
 */

/** Seven points, oldest first; gaps (null) break the line. The last point is a dot. */
export function Sparkline({
  points,
  label,
  className,
}: {
  points: readonly (number | null)[];
  label: string;
  className?: string;
}) {
  const W = 72;
  const H = 26;
  const vals = points.filter((p): p is number => p !== null);
  if (vals.length < 2) return null;
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const x = (i: number) => (i / (points.length - 1)) * (W - 4) + 2;
  const y = (v: number) => (hi === lo ? H / 2 : H - 3 - ((v - lo) / (hi - lo)) * (H - 6));
  const segs: string[] = [];
  let cur = "";
  points.forEach((p, i) => {
    if (p === null) {
      if (cur) segs.push(cur);
      cur = "";
    } else cur += `${cur ? "L" : "M"}${x(i).toFixed(1)},${y(p).toFixed(1)}`;
  });
  if (cur) segs.push(cur);
  const last = points.length - 1;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      role="img"
      aria-label={label}
      className={cn("shrink-0", className)}
    >
      {segs.map((d) => (
        <path
          key={d}
          d={d}
          fill="none"
          stroke="var(--tide-cascade-3)"
          strokeWidth={1.6}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
      {points[last] !== null ? (
        <circle cx={x(last)} cy={y(points[last]!)} r={2.6} fill="var(--tide-navy-900)" />
      ) : null}
    </svg>
  );
}

/** Three-part bar on navy: to receive, to result, preliminary; legend in words with counts. */
export function StageBar({ parts }: { parts: readonly { label: string; n: number }[] }) {
  const total = parts.reduce((a, p) => a + p.n, 0);
  const fills = ["var(--tide-cascade-next)", "var(--tide-lagoon)", "var(--tide-on-band-2)"];
  return (
    <div className="flex flex-col gap-2">
      <div className="bg-tide-navy-700 flex h-3 w-full overflow-hidden rounded-full" aria-hidden>
        {total > 0
          ? parts.map((p, i) =>
              p.n ? (
                <span
                  key={p.label}
                  style={{ width: `${(p.n / total) * 100}%`, background: fills[i] }}
                  className="h-full border-r-2 border-[var(--tide-navy-900)] last:border-r-0"
                />
              ) : null,
            )
          : null}
      </div>
      <ul className="text-tide-on-band-2 flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
        {parts.map((p, i) => (
          <li key={p.label} className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: fills[i] }} />
            {p.label}
            <strong className="text-tide-on-band font-semibold tabular-nums">{p.n}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Received (bars) and released (line with square marks) per hour; the current hour drawn lighter as partial;
 * a dashed "now" line; the peak labelled.
 */
export function HourlyFlowChart({
  hours,
  labels,
  alt,
  table,
}: {
  hours: readonly { hour: number; received: number; released: number; partial: boolean }[];
  labels: { received: string; released: string; now: string; viewTable: string };
  alt: string;
  table: ReactNode;
}) {
  const W = 640;
  const H = 180;
  const P = { l: 28, r: 12, t: 16, b: 24 };
  const max = Math.max(4, ...hours.flatMap((h) => [h.received, h.released]));
  const step = Math.ceil(max / 4);
  const top = step * 4;
  const bw = (W - P.l - P.r) / Math.max(hours.length, 1);
  const x = (i: number) => P.l + i * bw;
  const y = (v: number) => H - P.b - (v / top) * (H - P.t - P.b);
  const peak = hours.reduce((b, h, i) => (h.received > (hours[b]?.received ?? -1) ? i : b), 0);
  const line = hours
    .map((h, i) => `${i ? "L" : "M"}${(x(i) + bw / 2).toFixed(1)},${y(h.released).toFixed(1)}`)
    .join("");
  return (
    <figure className="flex flex-col gap-2">
      <div className="text-caption text-ink-600 flex gap-4" aria-hidden>
        <span className="inline-flex items-center gap-1.5">
          <span className="bg-tide-cascade-2 size-2.5 rounded-[3px]" />
          {labels.received}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="bg-tide-lagoon-pressed size-2 rotate-45" />
          {labels.released}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={alt}>
        {[0, 1, 2, 3, 4].map((k) => (
          <g key={k}>
            <line
              x1={P.l}
              x2={W - P.r}
              y1={y(k * step)}
              y2={y(k * step)}
              stroke="var(--color-ink-200)"
            />
            <text
              x={P.l - 6}
              y={y(k * step) + 4}
              textAnchor="end"
              fontSize={10}
              fill="var(--color-ink-500)"
            >
              {k * step}
            </text>
          </g>
        ))}
        {hours.map((h, i) => (
          <g key={h.hour}>
            <rect
              x={x(i) + bw * 0.18}
              width={bw * 0.64}
              y={y(h.received)}
              height={Math.max(0, H - P.b - y(h.received))}
              rx={3}
              fill="var(--tide-cascade-2)"
              opacity={h.partial ? 0.45 : 1}
            />
            <text
              x={x(i) + bw / 2}
              y={H - 8}
              textAnchor="middle"
              fontSize={10}
              fill="var(--color-ink-500)"
            >
              {String(h.hour).padStart(2, "0")}
            </text>
          </g>
        ))}
        {hours[peak] && hours[peak]!.received > 0 ? (
          <text
            x={x(peak) + bw / 2}
            y={y(hours[peak]!.received) - 4}
            textAnchor="middle"
            fontSize={10}
            fontWeight={600}
            fill="var(--color-ink-900)"
          >
            {hours[peak]!.received}
          </text>
        ) : null}
        <path d={line} fill="none" stroke="var(--tide-lagoon-pressed)" strokeWidth={2} />
        {hours.map((h, i) => (
          <rect
            key={h.hour}
            x={x(i) + bw / 2 - 3}
            y={y(h.released) - 3}
            width={6}
            height={6}
            transform={`rotate(45 ${x(i) + bw / 2} ${y(h.released)})`}
            fill="var(--tide-lagoon-pressed)"
          />
        ))}
        {hours.length ? (
          <g>
            <line
              x1={x(hours.length - 1) + bw * 0.82}
              x2={x(hours.length - 1) + bw * 0.82}
              y1={P.t - 6}
              y2={H - P.b}
              stroke="var(--tide-navy-900)"
              strokeDasharray="3 3"
            />
            <text
              x={x(hours.length - 1) + bw * 0.82 - 4}
              y={P.t - 6}
              textAnchor="end"
              fontSize={10}
              fill="var(--color-ink-700)"
            >
              {labels.now}
            </text>
          </g>
        ) : null}
      </svg>
      <details className="text-caption text-muted-foreground">
        <summary className="text-primary cursor-pointer">{labels.viewTable}</summary>
        {table}
      </details>
    </figure>
  );
}

/** A histogram of minutes with the median marked by a dashed line and its words. */
export function Histogram({
  counts,
  buckets,
  medianIndex,
  medianLabel,
  alt,
  axis,
}: {
  counts: readonly number[];
  buckets: readonly string[];
  medianIndex: number | null;
  medianLabel: string | null;
  alt: string;
  axis: string;
}) {
  const W = 420;
  const H = 170;
  const P = { l: 8, r: 8, t: 22, b: 34 };
  const max = Math.max(1, ...counts);
  const bw = (W - P.l - P.r) / counts.length;
  const y = (v: number) => H - P.b - (v / max) * (H - P.t - P.b);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={alt}>
      {counts.map((c, i) => (
        <g key={buckets[i]}>
          <rect
            x={P.l + i * bw + 3}
            width={bw - 6}
            y={y(c)}
            height={Math.max(0, H - P.b - y(c))}
            rx={3}
            fill="var(--tide-cascade-3)"
          />
          {c > 0 ? (
            <text
              x={P.l + i * bw + bw / 2}
              y={y(c) - 4}
              textAnchor="middle"
              fontSize={10}
              fill="var(--color-ink-700)"
            >
              {c}
            </text>
          ) : null}
          <text
            x={P.l + i * bw + bw / 2}
            y={H - P.b + 13}
            textAnchor="middle"
            fontSize={9.5}
            fill="var(--color-ink-500)"
          >
            {buckets[i]}
          </text>
        </g>
      ))}
      {medianIndex !== null && medianLabel ? (
        <g>
          <line
            x1={P.l + medianIndex * bw + bw / 2}
            x2={P.l + medianIndex * bw + bw / 2}
            y1={P.t - 10}
            y2={H - P.b}
            stroke="var(--tide-navy-900)"
            strokeDasharray="3 3"
          />
          <text
            x={P.l + medianIndex * bw + bw / 2 + 4}
            y={P.t - 4}
            fontSize={10}
            fontWeight={600}
            fill="var(--color-ink-900)"
          >
            {medianLabel}
          </text>
        </g>
      ) : null}
      <text x={W / 2} y={H - 4} textAnchor="middle" fontSize={10} fill="var(--color-ink-500)">
        {axis}
      </text>
    </svg>
  );
}

/** A bullet bar: the value as a bar on a fixed scale (0 to `max`), its number beside it. */
export function BulletBar({
  value,
  max,
  label,
}: {
  value: number | null;
  max: number;
  label: string;
}) {
  const w = value === null ? 0 : Math.min(1, value / max);
  return (
    <span className="flex items-center gap-2">
      <span
        aria-hidden
        className="bg-tide-sunken relative h-2 w-24 shrink-0 overflow-hidden rounded-full"
      >
        <span
          className="bg-tide-cascade-2 absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${w * 100}%` }}
        />
      </span>
      <span className="text-body-s tabular-nums">{label}</span>
    </span>
  );
}

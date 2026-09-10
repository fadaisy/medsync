/**
 * The Probe Lab's two chart primitives.
 *
 * Small, plain SVG. The bench's traces use a canvas because they redraw every
 * frame over a year of data; the lab draws a few dozen points when something
 * changes and never animates, so an SVG the screen reader and the colour audit
 * can both see is worth more than the frames.
 */

import type { LayerBand } from "./labModel.ts";

export type Line = {
  key: string;
  label: string;
  colour: string;
  /** Points in chart units. */
  points: Array<{ x: number; y: number }>;
  dash?: string;
  /** A note the legend shows after the label, such as a scale factor. */
  note?: string;
};

type Props = {
  lines: Line[];
  xLabel: string;
  yLabel: string;
  /** Layer boundaries to shade behind the lines, for a profile through a stack. */
  bands?: LayerBand[];
  height?: number;
  /** Force the y range rather than fitting it. */
  yMax?: number;
  logY?: boolean;
  caption?: string;
};

const PAD = { left: 54, right: 10, top: 8, bottom: 28 };
const WIDTH = 520;

function niceCeiling(value: number): number {
  if (!(value > 0)) return 1;
  const power = Math.pow(10, Math.floor(Math.log10(value)));
  const scaled = value / power;
  const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return step * power;
}

export function Chart({
  lines,
  xLabel,
  yLabel,
  bands,
  height = 150,
  yMax,
  logY = false,
  caption,
}: Props) {
  const all = lines.flatMap((l) => l.points);
  if (all.length === 0) return null;

  const xMin = Math.min(...all.map((p) => p.x));
  const xMax = Math.max(...all.map((p) => p.x));
  const rawMax = yMax ?? Math.max(...all.map((p) => p.y));
  const top = yMax ?? niceCeiling(rawMax);
  const positive = all.map((p) => p.y).filter((y) => y > 0);
  const floor = logY ? Math.max(Math.min(...positive), top * 1e-6) : 0;

  const plotWidth = WIDTH - PAD.left - PAD.right;
  const plotHeight = height - PAD.top - PAD.bottom;

  const sx = (x: number): number =>
    PAD.left + (xMax === xMin ? 0 : ((x - xMin) / (xMax - xMin)) * plotWidth);
  const sy = (y: number): number => {
    if (!logY) return PAD.top + plotHeight - (Math.max(y, 0) / top) * plotHeight;
    const clamped = Math.max(y, floor);
    const span = Math.log10(top) - Math.log10(floor);
    return PAD.top + plotHeight - ((Math.log10(clamped) - Math.log10(floor)) / span) * plotHeight;
  };

  const ticks = logY ? [floor, Math.sqrt(floor * top), top] : [0, top / 2, top];

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        className="w-full"
        role="img"
        aria-label={`${yLabel} against ${xLabel}. ${lines.map((l) => l.label).join(", ")}.`}
      >
        {bands?.map((band, i) => (
          <g key={band.name}>
            <rect
              x={sx(band.fromMicron)}
              y={PAD.top}
              width={Math.max(sx(band.toMicron) - sx(band.fromMicron), 0)}
              height={plotHeight}
              fill={i % 2 === 0 ? "#ffffff08" : "transparent"}
            />
            <line
              x1={sx(band.toMicron)}
              x2={sx(band.toMicron)}
              y1={PAD.top}
              y2={PAD.top + plotHeight}
              stroke="#24304a"
              strokeWidth={1}
            />
          </g>
        ))}

        {ticks.map((value) => (
          <g key={value}>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={sy(value)}
              y2={sy(value)}
              stroke="#24304a"
              strokeWidth={1}
            />
            <text
              x={PAD.left - 6}
              y={sy(value) + 3}
              textAnchor="end"
              fontSize={9}
              fill="#9aa4b2"
              fontFamily="var(--font-mono, monospace)"
            >
              {formatTick(value)}
            </text>
          </g>
        ))}

        {lines.map((line) => (
          <polyline
            key={line.key}
            fill="none"
            stroke={line.colour}
            strokeWidth={1.6}
            strokeDasharray={line.dash}
            strokeLinejoin="round"
            points={line.points.map((p) => `${sx(p.x).toFixed(2)},${sy(p.y).toFixed(2)}`).join(" ")}
          />
        ))}

        <text
          x={PAD.left + plotWidth / 2}
          y={height - 6}
          textAnchor="middle"
          fontSize={9}
          fill="#9aa4b2"
        >
          {xLabel}
        </text>
        <text
          x={13}
          y={PAD.top + plotHeight / 2}
          textAnchor="middle"
          fontSize={9}
          fill="#9aa4b2"
          transform={`rotate(-90 13 ${PAD.top + plotHeight / 2})`}
        >
          {yLabel}
        </text>
      </svg>

      <figcaption className="text-micro text-muted mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
        {lines.map((line) => (
          <span key={line.key} className="inline-flex items-center gap-1">
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: line.colour }}
            />
            {line.label}
            {line.note ? <span className="text-muted"> {line.note}</span> : null}
          </span>
        ))}
        {caption ? <span className="basis-full pt-0.5">{caption}</span> : null}
      </figcaption>
    </figure>
  );
}

function formatTick(value: number): string {
  if (value === 0) return "0";
  const magnitude = Math.abs(value);
  if (magnitude >= 1000 || magnitude < 0.01) return value.toExponential(0);
  if (magnitude >= 10) return value.toFixed(0);
  if (magnitude >= 1) return value.toFixed(1);
  return value.toFixed(3);
}

/** Layer names printed under a profile chart, in order. */
export function LayerKey({ bands }: { bands: LayerBand[] }) {
  return (
    <p className="text-micro text-muted mt-1">
      {bands
        .filter((b) => b.toMicron - b.fromMicron > 0.01)
        .map(
          (b) =>
            `${b.name} ${(b.toMicron - b.fromMicron).toFixed(b.toMicron - b.fromMicron < 10 ? 1 : 0)} um`,
        )
        .join("  /  ")}
    </p>
  );
}

import type { Spark } from "@/lib/lab/qc-spark";

import { LABWS2_QUALITY } from "@/content/lab-workspace-v2-quality";
import { SPARK_LIMIT, sparkCounts } from "@/lib/lab/qc-spark";
import { cn } from "@/lib/utils";
import { timeWords } from "../../_lib/days";

/**
 * Quality charts (prompt Section 7): `MiniLJ`, the last runs of one QC item in SD from target, and
 * `MonthsOfStockBar`, months of stock with the minimum marked. Hand-built SVG from tokens (currentColor), each
 * with a text alternative; nothing is said by colour alone (amber points are also triangles).
 */

const S = LABWS2_QUALITY.spark;
const W = 132;
const H = 36;
const PAD = 4;
const RANGE = 3;
/** Levels differ by line pattern as well as tone. */
const LEVEL_LINE = [
  { dash: undefined, tone: "text-ink-700" },
  { dash: "4 2", tone: "text-ink-500" },
  { dash: "1 2", tone: "text-ink-500" },
] as const;

const sdWords = (z: number) => `${z >= 0 ? "+" : "−"}${Math.abs(z).toFixed(1)} SD`;

export function sparkText(spark: Spark): string {
  if (!spark.runs) return S.none;
  const parts = [S.summary(spark.runs)];
  for (const c of sparkCounts(spark)) {
    const name = S.level(c.level);
    const last = c.beyond.at(-1);
    parts.push(
      last
        ? S.beyond(name, c.beyond.length, `${sdWords(last.z)} at ${timeWords(last.at)}`)
        : S.within(name),
    );
    if (c.targetChanges) parts.push(S.changed(name, c.targetChanges));
  }
  return parts.join(" ");
}

export function MiniLJ({ spark, className }: { spark: Spark; className?: string }) {
  if (!spark.runs) return <span className="text-caption text-muted-foreground">{S.none}</span>;
  const x = (i: number) =>
    PAD + (spark.runs <= 1 ? (W - 2 * PAD) / 2 : (i * (W - 2 * PAD)) / (spark.runs - 1));
  const y = (z: number) => {
    const c = Math.max(-RANGE, Math.min(RANGE, z));
    return PAD + ((RANGE - c) * (H - 2 * PAD)) / (2 * RANGE);
  };
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      role="img"
      aria-label={sparkText(spark)}
      className={cn("text-ink-300 block shrink-0 overflow-visible", className)}
    >
      <line
        x1={PAD}
        x2={W - PAD}
        y1={y(0)}
        y2={y(0)}
        stroke="currentColor"
        strokeWidth={1}
        opacity={0.6}
      />
      {[SPARK_LIMIT, -SPARK_LIMIT].map((k) => (
        <line
          key={k}
          x1={PAD}
          x2={W - PAD}
          y1={y(k)}
          y2={y(k)}
          stroke="currentColor"
          strokeWidth={1}
          strokeDasharray="3 3"
        />
      ))}
      {spark.series.map((s, si) => {
        const line = LEVEL_LINE[si % LEVEL_LINE.length]!;
        return (
          <g key={s.level} className={line.tone}>
            {s.segments.map((seg, k) =>
              seg.length > 1 ? (
                <polyline
                  key={k}
                  points={seg.map((p) => `${x(p.i)},${y(p.z)}`).join(" ")}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeDasharray={line.dash}
                />
              ) : null,
            )}
            {s.segments
              .flat()
              .map((p) =>
                p.beyond ? (
                  <path
                    key={p.runId}
                    d={`M${x(p.i)},${y(p.z) - 4} L${x(p.i) + 4},${y(p.z) + 3} L${x(p.i) - 4},${y(p.z) + 3} Z`}
                    className="text-amber-600"
                    fill="currentColor"
                  />
                ) : (
                  <circle
                    key={p.runId}
                    cx={x(p.i)}
                    cy={y(p.z)}
                    r={2}
                    fill="var(--color-card)"
                    stroke="currentColor"
                    strokeWidth={1.25}
                  />
                ),
              )}
          </g>
        );
      })}
    </svg>
  );
}

const B = LABWS2_QUALITY.stockBar;
const round = (n: number) => String(Math.round(n * 10) / 10);

/**
 * Months of stock as a bar with the minimum marked (prompt 5.7); the number is always beside it as text. The bar
 * stays ink: below minimum is said in words by the status column, never by colour alone.
 */
export function MonthsOfStockBar({
  name,
  months,
  minMonths,
  maxMonths,
  width = 120,
}: {
  name: string;
  months: number | null;
  minMonths: number | null;
  maxMonths: number | null;
  width?: number;
}) {
  if (months === null)
    return <span className="text-body-s text-muted-foreground">{B.notEnough}</span>;
  const finite = Number.isFinite(months);
  const scale = Math.max(maxMonths ?? 0, finite ? months : 0, minMonths ?? 0, 1);
  const px = (m: number) => Math.min(width, (m / scale) * width);
  const text = finite ? B.months(round(months)) : B.noUse;
  return (
    <span className="flex items-center gap-2">
      <svg
        viewBox={`0 0 ${width} 14`}
        width={width}
        height={14}
        role="img"
        aria-label={B.label(
          name,
          finite ? round(months) : B.noUse,
          minMonths === null ? null : round(minMonths),
        )}
        className="block shrink-0"
      >
        <rect x={0} y={4} width={width} height={6} rx={3} className="fill-ink-150" />
        <rect
          x={0}
          y={4}
          width={finite ? px(months) : width}
          height={6}
          rx={3}
          className="fill-ink-500"
        />
        {minMonths !== null ? (
          <rect
            x={Math.max(0, px(minMonths) - 1)}
            y={0}
            width={2}
            height={14}
            className="fill-foreground"
          />
        ) : null}
      </svg>
      <span className="text-body-s tabular-nums">{text}</span>
    </span>
  );
}

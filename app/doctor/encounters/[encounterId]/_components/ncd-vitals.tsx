"use client";

import type { Feature } from "@/lib/ncd/catalog/schema";
import type { Interpretation } from "@/lib/ncd/engine/assess";
import type { CaptureMap, CaptureSeries } from "@/lib/ncd/engine/evaluate";
import { useState } from "react";
import { PlusIcon, TrendingUpIcon } from "lucide-react";

import { isSeries, latestReading } from "@/lib/ncd/engine/evaluate";

/**
 * Vitals: the reading, what it means, and where it is heading.
 *
 * ── Why this is not the banded matrix ────────────────────────────────────────
 * The glucose tables render as a grid because their bands run one way — normal,
 * intermediate, diabetes — so a column can mean the same thing in every row. A
 * pulse does not: it scores on BOTH sides of normal, and a saturation is worse
 * the LOWER it goes. A column headed "Raised" would be a lie above a saturation.
 *
 * So each vital gets a row of its own: the value, the band it fell in, and its
 * trend. The colours are the same vocabulary as the tables; only the layout
 * differs, because the data does.
 *
 * ── A vital is a number and a time ───────────────────────────────────────────
 * 160 an hour ago and 132 now is a different patient from one who has sat at 160
 * all morning. Recording a second reading starts a series and the sparkline
 * appears; every rule still reads the latest, because the current state of the
 * patient is what a criterion is about.
 */

const TONE_CHIP: Record<string, string> = {
  low: "bg-amber-50 text-amber-900 ring-amber-300 dark:bg-amber-950/50 dark:text-amber-200 dark:ring-amber-800",
  normal:
    "bg-brand-50 text-brand-900 ring-brand-300 dark:bg-brand-950/50 dark:text-brand-100 dark:ring-brand-800",
  intermediate:
    "bg-emerald-50 text-emerald-900 ring-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-200 dark:ring-emerald-800",
  diagnostic:
    "bg-red-50 text-red-900 ring-red-300 dark:bg-red-950/50 dark:text-red-100 dark:ring-red-800",
};

const TONE_LINE: Record<string, string> = {
  low: "stroke-amber-500",
  normal: "stroke-brand-500",
  intermediate: "stroke-emerald-500",
  diagnostic: "stroke-red-500",
};

const seriesOf = (v: CaptureMap[string]): CaptureSeries =>
  v?.state === "recorded" && isSeries(v.value) ? v.value : [];

/** The text a single-measure field shows: its number, or nothing at all. */
const numberInput = (v: CaptureMap[string]): string =>
  v?.state === "recorded" && typeof v.value === "number" ? String(v.value) : "";

const hhmm = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toTimeString().slice(0, 5);
};

/**
 * The trend, at the size it is actually read at.
 *
 * Deliberately not a charting library: this is six points beside a number, and
 * an axis, a legend and a tooltip layer would take more room than the data. Each
 * point carries its own value and time in the title, so hovering says what it is
 * without any of that.
 */
function Sparkline({ series, tone }: { series: CaptureSeries; tone: string }) {
  if (series.length < 2) return null;
  const sorted = [...series].sort((a, b) => a.at.localeCompare(b.at));
  const values = sorted.map((r) => r.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const w = 84;
  const h = 22;
  const x = (i: number) => (sorted.length === 1 ? w / 2 : (i / (sorted.length - 1)) * w);
  const y = (v: number) => h - ((v - min) / span) * (h - 4) - 2;
  const d = sorted.map(
    (r, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(r.value).toFixed(1)}`,
  );

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="shrink-0 overflow-visible"
      role="img"
      aria-label={`Trend: ${sorted.map((r) => `${r.value} at ${hhmm(r.at)}`).join(", ")}`}
    >
      <path
        d={d.join(" ")}
        fill="none"
        strokeWidth={1.5}
        className={`${TONE_LINE[tone] ?? "stroke-gray-400"}`}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {sorted.map((r, i) => (
        <circle
          key={`${r.at}-${i}`}
          cx={x(i)}
          cy={y(r.value)}
          r={i === sorted.length - 1 ? 2.4 : 1.6}
          className={`${TONE_LINE[tone] ?? "stroke-gray-400"} fill-current`}
        >
          <title>{`${r.value} · ${hhmm(r.at)}`}</title>
        </circle>
      ))}
    </svg>
  );
}

export function NcdVitals({
  rows,
  values,
  features,
  onSet,
}: {
  rows: Interpretation[];
  values: CaptureMap;
  /** The catalog entry per row — what a measure IS decides how it is captured. */
  features: Map<string, Feature>;
  onSet: (code: string, v: CaptureMap[string]) => void;
}) {
  const [adding, setAdding] = useState<string | undefined>(undefined);
  const [draft, setDraft] = useState("");
  if (!rows.length) return null;

  const addReading = (code: string) => {
    const n = Number(draft);
    if (!Number.isFinite(n) || draft.trim() === "") return;
    const next: CaptureSeries = [
      ...seriesOf(values[code]),
      { value: n, at: new Date().toISOString() },
    ];
    onSet(code, { state: "recorded", value: next });
    setDraft("");
    setAdding(undefined);
  };

  return (
    <section className="border-border bg-card overflow-hidden rounded-xl border shadow-xs">
      <header className="border-border/60 bg-muted/40 flex flex-wrap items-baseline gap-x-2 border-b px-3.5 py-2">
        <h4 className="text-foreground text-body-s font-medium">Measurements</h4>
        <span className="text-caption text-muted-foreground">
          each reading is kept, so the trend is visible; every rule reads the latest
        </span>
      </header>

      <ul className="divide-border/50 divide-y">
        {rows.map((row) => {
          const feature = features.get(row.feature);
          const series = seriesOf(values[row.feature]);
          const latest = latestReading(series);
          const tone = row.band?.tone ?? "normal";
          // Three kinds of measure, and they are captured differently. A
          // computed value has no input at all — offering one would invite a
          // number that disagrees with the two it comes from.
          const isComputed = Boolean(feature?.computed);
          const trends = feature?.valueType === "series";
          const trending = trends && series.length > 1;
          return (
            <li
              key={row.feature}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-2"
            >
              <span className="flex min-w-0 flex-[1_1_9rem] flex-col">
                <span className="text-body-s text-foreground font-medium">{row.display}</span>
                {row.unit ? (
                  <span className="text-muted-foreground font-mono text-[10px]">{row.unit}</span>
                ) : null}
              </span>

              {/* The value, and what determined the reading beside it. */}
              <span className="flex shrink-0 items-baseline gap-1.5">
                <span className="text-foreground font-mono text-[14px] font-medium tabular-nums">
                  {row.value ?? "—"}
                </span>
                {latest ? (
                  <span className="text-muted-foreground text-caption">{hhmm(latest.at)}</span>
                ) : null}
              </span>

              {/*
               * The interpretation, and — on hover — the number and the moment
               * that produced it, plus the rule it fell under. A colour that
               * cannot say why it is that colour is a colour nobody trusts.
               */}
              {row.band ? (
                <span
                  title={[
                    `${row.display} ${row.value}${row.unit ? ` ${row.unit}` : ""}`,
                    latest ? `measured ${hhmm(latest.at)}` : undefined,
                    bandRule(row),
                    `${row.standard} ${row.version}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  className={`text-caption shrink-0 cursor-help rounded px-1.5 py-0.5 font-medium ring-1 ring-inset ${
                    TONE_CHIP[tone] ?? ""
                  }`}
                >
                  {row.band.display}
                </span>
              ) : (
                <span className="text-caption text-muted-foreground/70 shrink-0 italic">
                  {row.state === "unavailable" ? "not available here" : "not measured"}
                </span>
              )}

              {trending ? <Sparkline series={series} tone={tone} /> : null}

              <span className="ml-auto flex shrink-0 items-center gap-1.5">
                {isComputed ? (
                  <span className="text-caption text-muted-foreground/70 italic">
                    from {(feature?.computed?.from ?? []).length} measurements
                  </span>
                ) : !trends ? (
                  /* Measured once, not tracked: a plain field. */
                  <input
                    inputMode="decimal"
                    value={numberInput(values[row.feature])}
                    placeholder="—"
                    aria-label={row.display}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === "") return onSet(row.feature, undefined);
                      const n = Number(raw);
                      if (Number.isFinite(n)) onSet(row.feature, { state: "recorded", value: n });
                    }}
                    className="border-input bg-card focus-visible:border-brand-500 w-[5.5rem] rounded-md border px-2 py-1 text-right font-mono text-[12px] tabular-nums outline-none"
                  />
                ) : adding === row.feature ? (
                  <>
                    <input
                      autoFocus
                      inputMode="decimal"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") addReading(row.feature);
                        if (e.key === "Escape") setAdding(undefined);
                      }}
                      aria-label={`New ${row.display}`}
                      className="border-input bg-card focus-visible:border-brand-500 w-[5rem] rounded-md border px-2 py-1 text-right font-mono text-[12px] tabular-nums outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => addReading(row.feature)}
                      className="tap bg-brand-600 hover:bg-brand-700 text-caption rounded-md px-2 py-1 font-medium text-white"
                    >
                      Save
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setAdding(row.feature);
                      setDraft("");
                    }}
                    className="tap text-caption text-brand-700 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-950/40 inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium"
                  >
                    {series.length ? (
                      <TrendingUpIcon className="size-3" aria-hidden />
                    ) : (
                      <PlusIcon className="size-3" aria-hidden />
                    )}
                    {series.length ? "Measure again" : "Record"}
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      {rows.some((r) => r.note) ? (
        <ul className="border-border/60 space-y-1 border-t px-3.5 py-2">
          {rows
            .filter((r) => r.note)
            .map((r) => (
              <li key={r.feature} className="text-muted-foreground text-[11px] leading-snug">
                <span className="text-foreground/80 font-medium">{r.display}:</span> {r.note}
              </li>
            ))}
        </ul>
      ) : null}
    </section>
  );
}

/** "≥ 130 and < 150" — the rule the value fell under, said back. */
function bandRule(row: Interpretation): string | undefined {
  const b = row.band;
  if (!b) return undefined;
  const u = row.unit ? ` ${row.unit}` : "";
  if (b.from === undefined && b.to !== undefined) return `rule: < ${b.to}${u}`;
  if (b.from !== undefined && b.to === undefined) return `rule: ≥ ${b.from}${u}`;
  if (b.from !== undefined && b.to !== undefined) return `rule: ≥ ${b.from} and < ${b.to}${u}`;
  return undefined;
}

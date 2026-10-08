"use client";

import type { MonthSlice, PubCount, PubPart } from "@/lib/ncdreg/read/dashboard";
import type { KeyboardEvent, ReactNode } from "react";
import Link from "next/link";
import { useId, useRef, useState } from "react";

import { ViewSwitcher } from "@/components/medsync/view-switcher";
import { cn } from "@/lib/utils";
import { isNeutralClass, outcomeTone } from "../../_components/charts/tones";

/**
 * The selected condition as three linked modules (§11.4; dataviz method): a trend with a crosshair
 * that picks the month, and the outcome breakdown and care cascade of that month. Each module has
 * its own Chart / Table switch. Counts hidden for this viewer (F6) arrive as text only ("1–4") and
 * are never drawn. Compare overlays the other conditions as quiet context lines; the one pointed
 * at is emphasised by weight, dash and a direct label, never by hue (no categorical palette).
 */
export type InsightOther = { code: string; label: string; points: (number | null)[] };

const MOTION =
  "duration-[var(--duration-reveal)] ease-[var(--ease-expo-out)] motion-reduce:transition-none";

export function ConditionInsight({
  label,
  outcomeLabel,
  months,
  monthLabels,
  max,
  others,
}: {
  label: string;
  outcomeLabel: string;
  months: MonthSlice[];
  monthLabels: string[];
  max: number;
  others: InsightOther[];
}) {
  const last = months.length - 1;
  const [sel, setSel] = useState(last);
  const slice = months[sel]!;
  const prev = sel > 0 ? months[sel - 1]! : null;
  const showing = (
    <span className="text-caption text-muted-foreground flex items-center gap-2">
      {monthLabels[sel]}
      {sel !== last ? (
        <button
          type="button"
          onClick={() => setSel(last)}
          className="text-foreground focus-visible:shadow-focus rounded-xs underline underline-offset-4 outline-none"
        >
          Back to latest
        </button>
      ) : (
        <span>(latest)</span>
      )}
    </span>
  );
  return (
    <div className="flex flex-col gap-4">
      <TrendModule
        label={label}
        outcomeLabel={outcomeLabel}
        months={months}
        monthLabels={monthLabels}
        max={max}
        others={others}
        sel={sel}
        onSelect={setSel}
      />
      <div className="grid gap-4 xl:grid-cols-2">
        <BreakdownModule label={label} slice={slice} prev={prev} showing={showing} />
        <CascadeModule slice={slice} showing={showing} />
      </div>
    </div>
  );
}

/* ─── module chrome ───────────────────────────────────────────────────── */

type ViewMode = "chart" | "table";

function Module({
  title,
  aside,
  controls,
  view,
  onView,
  children,
}: {
  title: string;
  aside?: ReactNode;
  controls?: ReactNode;
  view: ViewMode;
  onView: (v: ViewMode) => void;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="border-border bg-card flex min-w-0 flex-col gap-3 rounded-lg border p-4"
    >
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h4 className="text-label text-foreground font-medium">{title}</h4>
          {aside}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {controls}
          <ViewSwitcher
            label={`${title}: view`}
            value={view}
            onChange={onView}
            options={[
              { value: "chart", label: "Chart" },
              { value: "table", label: "Table" },
            ]}
          />
        </div>
      </header>
      {children}
    </section>
  );
}

const Count = ({ c, className }: { c: PubCount; className?: string }) =>
  c.href ? (
    <Link
      href={c.href}
      className={cn(
        "focus-visible:shadow-focus rounded-xs font-mono tabular-nums underline-offset-4 outline-none hover:underline",
        className,
      )}
    >
      {c.text}
    </Link>
  ) : (
    <span className={cn("font-mono tabular-nums", className)}>{c.text}</span>
  );

const pctText = (p: number | null) => (p == null ? "–" : `${p}%`);

/* ─── trend ───────────────────────────────────────────────────────────── */

function runsOf(points: (number | null)[], x: (i: number) => number, y: (p: number) => number) {
  const runs: string[] = [];
  let run: string[] = [];
  points.forEach((p, i) => {
    if (p == null) {
      if (run.length > 1) runs.push(run.join(" "));
      run = [];
    } else run.push(`${x(i)},${y(p)}`);
  });
  if (run.length > 1) runs.push(run.join(" "));
  return runs;
}

function TrendModule({
  label,
  outcomeLabel,
  months,
  monthLabels,
  max,
  others,
  sel,
  onSelect,
}: {
  label: string;
  outcomeLabel: string;
  months: MonthSlice[];
  monthLabels: string[];
  max: number;
  others: InsightOther[];
  sel: number;
  onSelect: (i: number) => void;
}) {
  const [view, setView] = useState<ViewMode>("chart");
  const [compare, setCompare] = useState(false);
  const [focusOther, setFocusOther] = useState<string | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const plot = useRef<HTMLDivElement>(null);
  const tipId = useId();
  const n = months.length;
  const points = months.map((m) => m.pct);
  const W = 1000;
  const H = 300;
  const x = (i: number) => (n > 1 ? (i * W) / (n - 1) : 0);
  const y = (p: number) => H - (Math.min(p, max) / max) * H;
  const xPct = (i: number) => (n > 1 ? (100 * i) / (n - 1) : 0);
  const yPct = (p: number) => 100 - (100 * Math.min(p, max)) / max;
  const at = hover ?? sel;
  const shownOthers = compare ? others : [];
  const emphasised = shownOthers.find((o) => o.code === focusOther) ?? null;

  const indexAt = (e: { clientX: number }) => {
    const r = plot.current?.getBoundingClientRect();
    if (!r || n < 2) return 0;
    const f = Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1);
    return Math.round(f * (n - 1));
  };
  const onKey = (e: KeyboardEvent) => {
    const to =
      e.key === "ArrowRight"
        ? Math.min(sel + 1, n - 1)
        : e.key === "ArrowLeft"
          ? Math.max(sel - 1, 0)
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? n - 1
              : null;
    if (to == null) return;
    e.preventDefault();
    onSelect(to);
  };

  // End labels: this condition and the emphasised comparison, nudged apart when they would collide.
  const endLabels = [
    { key: "self", text: pctText(points.at(-1) ?? null), p: points.at(-1) ?? null, strong: true },
    ...(emphasised
      ? [
          {
            key: emphasised.code,
            text: `${emphasised.label} ${pctText(emphasised.points.at(-1) ?? null)}`,
            p: emphasised.points.at(-1) ?? null,
            strong: false,
          },
        ]
      : []),
  ]
    .filter((l) => l.p != null)
    .map((l) => ({ ...l, top: yPct(l.p!) }))
    .sort((a, b) => a.top - b.top);
  for (let i = 1; i < endLabels.length; i++)
    if (endLabels[i]!.top - endLabels[i - 1]!.top < 9)
      endLabels[i]!.top = endLabels[i - 1]!.top + 9;

  const tipLeft = xPct(at) > 60;
  const atSlice = months[at]!;
  const controls = others.length ? (
    <button
      type="button"
      aria-pressed={compare}
      onClick={() => {
        setCompare((c) => !c);
        setFocusOther(null);
      }}
      className={cn(
        "text-label focus-visible:shadow-focus h-7 rounded-md border px-2.5 outline-none",
        compare
          ? "border-ink-400 bg-ink-100 text-foreground"
          : "border-border text-ink-700 hover:bg-ink-50",
      )}
    >
      Compare conditions
    </button>
  ) : null;

  return (
    <Module
      title={`${outcomeLabel}, past 12 months`}
      aside={
        <span className="text-caption text-muted-foreground">
          {label} · scale 0 to {max}%, shared by every condition · point at or step through a month
        </span>
      }
      controls={controls}
      view={view}
      onView={setView}
    >
      {compare ? (
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label="Emphasise a condition"
        >
          {others.map((o) => (
            <button
              key={o.code}
              type="button"
              aria-pressed={focusOther === o.code}
              onClick={() => setFocusOther((f) => (f === o.code ? null : o.code))}
              onPointerEnter={() => setFocusOther(o.code)}
              className={cn(
                "text-caption focus-visible:shadow-focus inline-flex h-6 items-center gap-1.5 rounded-sm border px-2 outline-none",
                focusOther === o.code
                  ? "border-ink-500 text-foreground"
                  : "border-ink-200 text-ink-700 hover:border-ink-400",
              )}
            >
              <svg aria-hidden className="h-2 w-4" viewBox="0 0 16 8">
                <line
                  x1={0}
                  x2={16}
                  y1={4}
                  y2={4}
                  className={focusOther === o.code ? "stroke-ink-700" : "stroke-ink-300"}
                  strokeWidth={2}
                  strokeDasharray={focusOther === o.code ? "4 3" : undefined}
                />
              </svg>
              {o.label}
            </button>
          ))}
        </div>
      ) : null}

      {view === "table" ? (
        <TrendTable label={label} months={months} monthLabels={monthLabels} others={shownOthers} />
      ) : (
        <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_7rem] gap-x-2">
          <div
            aria-hidden
            className="text-overline text-muted-foreground relative font-mono tabular-nums"
          >
            {[max, Math.round(max / 2), 0].map((t, i) => (
              <span
                key={t}
                className="absolute right-0 -translate-y-1/2"
                style={{ top: `${i * 50}%` }}
              >
                {t}%
              </span>
            ))}
          </div>
          <div
            ref={plot}
            role="slider"
            tabIndex={0}
            aria-label={`${outcomeLabel}, month shown in the breakdown and cascade`}
            aria-valuemin={0}
            aria-valuemax={n - 1}
            aria-valuenow={sel}
            aria-valuetext={`${monthLabels[sel]}: ${pctText(points[sel] ?? null)}`}
            aria-describedby={tipId}
            onKeyDown={onKey}
            onPointerMove={(e) => setHover(indexAt(e))}
            onPointerLeave={() => setHover(null)}
            onClick={(e) => onSelect(indexAt(e))}
            className="focus-visible:shadow-focus relative h-48 cursor-crosshair rounded-xs outline-none sm:h-56"
          >
            {/* the selected month */}
            <div
              aria-hidden
              className={cn("bg-ink-50 absolute inset-y-0 transition-[left]", MOTION)}
              style={{ left: `calc(${xPct(sel)}% - 0.75rem)`, width: "1.5rem" }}
            />
            <svg
              aria-hidden
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="none"
              className="absolute inset-0 h-full w-full overflow-visible"
            >
              {[0, 0.5, 1].map((f) => (
                <line
                  key={f}
                  x1={0}
                  x2={W}
                  y1={H * f}
                  y2={H * f}
                  className={f === 1 ? "stroke-ink-300" : "stroke-ink-150"}
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {shownOthers
                .filter((o) => o.code !== emphasised?.code)
                .flatMap((o) =>
                  runsOf(o.points, x, y).map((r) => (
                    <polyline
                      key={`${o.code}-${r}`}
                      points={r}
                      fill="none"
                      className="stroke-ink-300"
                      strokeWidth={1}
                      vectorEffect="non-scaling-stroke"
                    />
                  )),
                )}
              {emphasised
                ? runsOf(emphasised.points, x, y).map((r) => (
                    <polyline
                      key={`em-${r}`}
                      points={r}
                      fill="none"
                      className="stroke-ink-700"
                      strokeWidth={2}
                      strokeDasharray="6 4"
                      vectorEffect="non-scaling-stroke"
                    />
                  ))
                : null}
              {runsOf(points, x, y).map((r) => (
                <polyline
                  key={`self-${r}`}
                  points={r}
                  fill="none"
                  className="stroke-teal-700"
                  strokeWidth={2.5}
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </svg>
            {/* points: the selected one solid, the rest small rings */}
            {points.map((p, i) =>
              p == null ? null : (
                <span
                  key={i}
                  aria-hidden
                  className={cn(
                    "absolute -translate-x-1/2 -translate-y-1/2 rounded-full",
                    i === sel
                      ? "ring-card size-3 bg-teal-700 ring-2"
                      : "bg-card size-2 ring-1 ring-teal-700",
                  )}
                  style={{ left: `${xPct(i)}%`, top: `${yPct(p)}%` }}
                />
              ),
            )}
            {/* crosshair and readout */}
            {hover != null ? (
              <span
                aria-hidden
                className="bg-ink-400 pointer-events-none absolute inset-y-0 w-px"
                style={{ left: `${xPct(hover)}%` }}
              />
            ) : null}
            <div
              id={tipId}
              role="status"
              className={cn(
                "border-border bg-popover text-caption shadow-popover pointer-events-none absolute top-1 z-10 min-w-44 rounded-md border px-3 py-2",
                hover == null && "sr-only",
              )}
              style={
                tipLeft
                  ? { right: `calc(${100 - xPct(at)}% + 0.75rem)` }
                  : { left: `calc(${xPct(at)}% + 0.75rem)` }
              }
            >
              <p className="text-muted-foreground mb-1">{monthLabels[at]}</p>
              <p className="flex items-center gap-2">
                <span aria-hidden className="h-0.5 w-3 bg-teal-700" />
                <strong className="text-foreground font-mono font-semibold tabular-nums">
                  {pctText(atSlice.pct)}
                </strong>
                <span className="text-ink-700">
                  {label} · {atSlice.distribution[0]?.count.text ?? "–"} of {atSlice.den.text}
                </span>
              </p>
              {shownOthers
                .map((o) => ({ o, p: o.points[at] ?? null }))
                .sort((a, b) => (b.p ?? -1) - (a.p ?? -1))
                .map(({ o, p }) => (
                  <p key={o.code} className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className={cn(
                        "h-0.5 w-3",
                        o.code === emphasised?.code ? "bg-ink-700" : "bg-ink-300",
                      )}
                    />
                    <strong className="text-foreground font-mono font-semibold tabular-nums">
                      {pctText(p)}
                    </strong>
                    <span className="text-ink-700">{o.label}</span>
                  </p>
                ))}
            </div>
          </div>
          <div aria-hidden className="relative">
            {endLabels.map((l) => (
              <span
                key={l.key}
                className={cn(
                  "text-caption absolute left-0 -translate-y-1/2 truncate font-mono tabular-nums",
                  l.strong ? "text-foreground font-semibold" : "text-ink-700",
                )}
                style={{ top: `${l.top}%`, maxWidth: "7rem" }}
              >
                {l.text}
              </span>
            ))}
          </div>
          <div
            aria-hidden
            className="text-muted-foreground col-start-2 flex justify-between pt-1.5 font-mono text-[11px] [&>span:nth-child(even)]:hidden sm:[&>span:nth-child(even)]:flex"
          >
            {monthLabels.map((t, i) => (
              <span
                key={`${t}-${i}`}
                className={cn(
                  "flex w-0 justify-center whitespace-nowrap",
                  i === sel && "text-foreground font-semibold",
                )}
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      )}
    </Module>
  );
}

function TrendTable({
  label,
  months,
  monthLabels,
  others,
}: {
  label: string;
  months: MonthSlice[];
  monthLabels: string[];
  others: InsightOther[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="text-caption w-full">
        <thead>
          <tr className="text-muted-foreground border-ink-150 border-b text-left">
            <th scope="col" className="py-1.5 pr-3 font-medium">
              Month
            </th>
            <th scope="col" className="py-1.5 pr-3 text-right font-medium">
              {label}
            </th>
            <th scope="col" className="py-1.5 pr-3 text-right font-medium">
              Count of patients
            </th>
            {others.map((o) => (
              <th key={o.code} scope="col" className="py-1.5 pr-3 text-right font-medium">
                {o.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {months.map((m, i) => (
            <tr key={m.month} className="border-ink-100 border-b last:border-b-0">
              <th scope="row" className="py-1.5 pr-3 text-left font-normal">
                {monthLabels[i]}
              </th>
              <td className="py-1.5 pr-3 text-right font-mono tabular-nums">{pctText(m.pct)}</td>
              <td className="py-1.5 pr-3 text-right">
                <Count c={m.distribution[0]!.count} /> of <Count c={m.den} />
              </td>
              {others.map((o) => (
                <td key={o.code} className="py-1.5 pr-3 text-right font-mono tabular-nums">
                  {pctText(o.points[i] ?? null)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── outcome breakdown ───────────────────────────────────────────────── */

/** Change in percentage points against the month before: an arrow and a word, never colour. */
function Delta({ now, before }: { now: number | null; before: number | null | undefined }) {
  if (now == null || before == null) return <span className="text-muted-foreground">–</span>;
  const d = now - before;
  if (d === 0) return <span className="text-muted-foreground">no change</span>;
  return (
    <span className="text-ink-700 tabular-nums">
      {d > 0 ? "▲" : "▼"} {Math.abs(d)} pt{Math.abs(d) === 1 ? "" : "s"}
    </span>
  );
}

function BreakdownModule({
  label,
  slice,
  prev,
  showing,
}: {
  label: string;
  slice: MonthSlice;
  prev: MonthSlice | null;
  showing: ReactNode;
}) {
  const [view, setView] = useState<ViewMode>("chart");
  const [hot, setHot] = useState<string | null>(null);
  const keys = slice.distribution.map((d) => d.key);
  const total = slice.den.value ?? 0;
  const drawn = slice.distribution.filter((d) => d.count.value != null && d.count.value > 0);
  const before = (k: string) => prev?.distribution.find((d) => d.key === k)?.pct;
  return (
    <Module title="Outcome at the latest visit" aside={showing} view={view} onView={setView}>
      {view === "table" ? (
        <PartsTable parts={slice.distribution} prev={prev} first="Outcome" />
      ) : (
        <div className="flex flex-col gap-3">
          {drawn.length && total > 0 ? (
            <div
              role="group"
              aria-label={`${label}: outcome at the latest visit`}
              className="flex h-6 w-full gap-0.5"
            >
              {drawn.map((d, i) => (
                <Segment
                  key={d.key}
                  part={d}
                  tone={outcomeTone(d.key, keys)}
                  width={(100 * d.count.value!) / total}
                  last={i === drawn.length - 1}
                  hot={hot}
                  onHot={setHot}
                  version={slice.version}
                  den={slice.den.text}
                />
              ))}
            </div>
          ) : (
            <div
              role="img"
              aria-label={total > 0 ? "Not drawn: counts from 1 to 4" : "No patients this month"}
              className="bg-ink-100 h-6 w-full rounded-r-xs"
            />
          )}
          <ul className="text-caption flex flex-col">
            {slice.distribution.map((d) => (
              <li
                key={d.key}
                onPointerEnter={() => setHot(d.key)}
                onPointerLeave={() => setHot(null)}
                className={cn(
                  "grid grid-cols-[0.75rem_minmax(0,1fr)_auto_2.75rem_4.5rem] items-center gap-x-2 rounded-xs px-1 py-1",
                  hot === d.key && "bg-ink-50",
                )}
              >
                <span
                  aria-hidden
                  className={cn("size-2.5 rounded-[3px]", outcomeTone(d.key, keys))}
                />
                <span
                  className={cn(
                    "truncate",
                    isNeutralClass(d.key) ? "text-ink-600" : "text-ink-800",
                  )}
                >
                  {d.label}
                </span>
                <Count c={d.count} className="text-foreground" />
                <span className="text-muted-foreground text-right font-mono tabular-nums">
                  {pctText(d.pct)}
                </span>
                <span className="text-right">
                  <Delta now={d.pct} before={before(d.key)} />
                </span>
              </li>
            ))}
          </ul>
          <p className="text-caption text-muted-foreground">
            Of <Count c={slice.den} /> patients · change against the month before · definition{" "}
            {slice.version}
          </p>
        </div>
      )}
    </Module>
  );
}

function Segment({
  part,
  tone,
  width,
  last,
  hot,
  onHot,
  version,
  den,
}: {
  part: PubPart;
  tone: string;
  width: number;
  last: boolean;
  hot: string | null;
  onHot: (k: string | null) => void;
  version: string;
  den: string;
}) {
  const tip = `${part.label}: ${part.count.text} of ${den}${part.pct == null ? "" : ` (${part.pct}%)`} · definition ${version}`;
  const cls = cn(
    "block h-full min-w-1 outline-none transition-[width,opacity] focus-visible:shadow-focus",
    MOTION,
    tone,
    last && "rounded-r-xs",
    hot && hot !== part.key && "opacity-40",
  );
  const handlers = {
    onPointerEnter: () => onHot(part.key),
    onPointerLeave: () => onHot(null),
    onFocus: () => onHot(part.key),
    onBlur: () => onHot(null),
  };
  return part.count.href ? (
    <Link
      href={part.count.href}
      title={tip}
      aria-label={tip}
      className={cls}
      style={{ width: `${width}%` }}
      {...handlers}
    />
  ) : (
    <button
      type="button"
      title={tip}
      aria-label={tip}
      className={cls}
      style={{ width: `${width}%` }}
      {...handlers}
    />
  );
}

function PartsTable({
  parts,
  prev,
  first,
}: {
  parts: PubPart[];
  prev: MonthSlice | null;
  first: string;
}) {
  return (
    <table className="text-caption w-full">
      <thead>
        <tr className="text-muted-foreground border-ink-150 border-b text-left">
          <th scope="col" className="py-1.5 pr-3 font-medium">
            {first}
          </th>
          <th scope="col" className="py-1.5 pr-3 text-right font-medium">
            Patients
          </th>
          <th scope="col" className="py-1.5 pr-3 text-right font-medium">
            Share
          </th>
          {prev ? (
            <th scope="col" className="py-1.5 text-right font-medium">
              Month before
            </th>
          ) : null}
        </tr>
      </thead>
      <tbody>
        {parts.map((p) => (
          <tr key={p.key} className="border-ink-100 border-b last:border-b-0">
            <th scope="row" className="py-1.5 pr-3 text-left font-normal">
              {p.label}
            </th>
            <td className="py-1.5 pr-3 text-right">
              <Count c={p.count} />
            </td>
            <td className="py-1.5 pr-3 text-right font-mono tabular-nums">{pctText(p.pct)}</td>
            {prev ? (
              <td className="py-1.5 text-right font-mono tabular-nums">
                {pctText(
                  prev.distribution.find((d) => d.key === p.key)?.pct ??
                    prev.cascade.find((d) => d.key === p.key)?.pct ??
                    null,
                )}
              </td>
            ) : null}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ─── care cascade ────────────────────────────────────────────────────── */

function CascadeModule({ slice, showing }: { slice: MonthSlice; showing: ReactNode }) {
  const [view, setView] = useState<ViewMode>("chart");
  const steps = slice.cascade;
  return (
    <Module title="Care cascade · share of registered" aside={showing} view={view} onView={setView}>
      {view === "table" ? (
        <PartsTable parts={steps} prev={null} first="Step" />
      ) : (
        <ol className="text-caption flex flex-col">
          {steps.map((s, i) => {
            const lastStep = i === steps.length - 1;
            const before = i > 0 ? steps[i - 1]! : null;
            const drop =
              before?.count.value != null && s.count.value != null
                ? before.count.value - s.count.value
                : null;
            const width = s.pct ?? (i === 0 && (s.count.value ?? 0) > 0 ? 100 : 0);
            return (
              <li key={s.key} className="flex flex-col">
                {before ? (
                  <span className="text-muted-foreground flex items-center gap-1.5 py-1 pl-2">
                    <span aria-hidden>↳</span>
                    {drop == null
                      ? "Change not shown (counts from 1 to 4)"
                      : drop === 0
                        ? "No one lost at this step"
                        : `${drop.toLocaleString("en-GB")} fewer${before.count.value ? ` (${Math.round((100 * drop) / before.count.value)}% of the step before)` : ""}`}
                  </span>
                ) : null}
                <div className="grid grid-cols-[8rem_minmax(0,1fr)_auto] items-center gap-x-2">
                  <span
                    className={cn(
                      "truncate",
                      lastStep ? "text-foreground font-medium" : "text-ink-700",
                    )}
                  >
                    {s.label}
                  </span>
                  <span className="bg-ink-50 block h-4 w-full">
                    <span
                      className={cn(
                        "block h-full rounded-r-xs transition-[width]",
                        MOTION,
                        lastStep ? "bg-teal-700" : "bg-ink-300",
                      )}
                      style={{ width: `${width}%` }}
                    />
                  </span>
                  <span className="text-right">
                    <Count c={s.count} className="text-foreground" />
                    {i > 0 && s.pct != null ? (
                      <span className="text-muted-foreground font-mono tabular-nums">
                        {" "}
                        · {s.pct}%
                      </span>
                    ) : null}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Module>
  );
}

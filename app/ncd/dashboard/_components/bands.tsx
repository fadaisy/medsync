import type { InsightOther } from "./condition-insight";
import type { Mark } from "@/app/ncd/_components/charts/charts";
import type { IndicatorResult } from "@/lib/ncdreg/indicators/engine";
import type { Cell, ConditionRow, DashboardBoard, View } from "@/lib/ncdreg/read/dashboard";
import type { ConditionModule } from "@/lib/ncdreg/standard/types";
import type { ReactNode } from "react";

import {
  Columns,
  Legend,
  Meter,
  RankedBars,
  Sparkline,
  StackedBar,
  Tip,
} from "@/app/ncd/_components/charts/charts";
import { CARE_BAND_TONES, KIDNEY_TONES, outcomeTone } from "@/app/ncd/_components/charts/tones";
import { outcomeClasses } from "@/lib/ncdreg/indicators/engine";
import {
  careBandLabels,
  cell,
  classLabel,
  eventLabel,
  indicatorLabel,
  line,
  monthLabel,
  pctOf,
} from "@/lib/ncdreg/read/dashboard";
import { cn } from "@/lib/utils";
import { ConditionExplorer } from "./condition-explorer";
import { ConditionInsight } from "./condition-insight";
import { CountCell } from "./indicator-table";

/** A suppressed count (F6) is never drawn: its length would give it away. */
const drawn = (c: Cell) => (c.suppressed ? 0 : c.n);
const tipOf = (label: string, c: Cell, den: Cell | null, r: IndicatorResult | undefined) =>
  `${label}: ${c.text}${den ? ` of ${den.text}` : ""} · definition ${r?.version ?? ""}`;

function Card({
  title,
  sub,
  hint,
  children,
  className,
}: {
  title: string;
  sub?: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-card border-border flex min-w-0 flex-col gap-2.5 rounded-lg border px-4 py-3 shadow-xs",
        className,
      )}
    >
      <div>
        <h3 className="text-heading-s text-foreground font-medium">{title}</h3>
        {sub ? <p className="text-caption text-muted-foreground">{sub}</p> : null}
      </div>
      {children}
      {hint ? <p className="text-muted-foreground mt-auto text-[11px]">{hint}</p> : null}
    </div>
  );
}

function Figure({
  label,
  value,
  suffix,
  basis,
  tip,
  href,
}: {
  label: string;
  value: string;
  suffix?: string;
  basis: ReactNode;
  tip: string;
  href?: string | null;
}) {
  return (
    <div className="border-ink-150 flex min-w-0 flex-col gap-1 border-b px-4 py-3 sm:border-r sm:border-b-0">
      <span className="text-overline text-muted-foreground uppercase">{label}</span>
      <Tip
        tip={tip}
        href={href}
        className="text-stat text-foreground w-fit font-mono font-medium tabular-nums"
      >
        {value}
        {suffix ? <span className="text-ink-500 text-body-m">{suffix}</span> : null}
      </Tip>
      <span className="text-caption text-muted-foreground">{basis}</span>
    </div>
  );
}

/* ─── band 1 ──────────────────────────────────────────────────────────── */

export function HeadlineStrip({
  b,
  catalogue,
}: {
  b: DashboardBoard;
  catalogue: readonly ConditionModule[];
}) {
  const R = b.results;
  const v = b.view;
  const c01 = cell(v, R.C01?.num, "C01", "num", R.C01?.ids.num);
  const c03 = cell(v, R.C03?.num, "C03", "num", R.C03?.ids.num);
  const c02 = cell(v, R.C02?.num, "C02", "num", R.C02?.ids.num);
  const c12 = line(v, "C12", R.C12, "num", indicatorLabel("C12"));
  const c15 = line(v, "C15", R.C15, "num", indicatorLabel("C15"));
  const prev = b.prevC01;
  const diffSafe = prev != null && !c01.suppressed && (v.canDrill || prev === 0 || prev > 4);
  const diff = diffSafe ? c01.n - prev : null;
  const prevMonth = monthLabel(b.trendMonths[10] ?? b.month);
  const h12 = R.H12;
  const bands = careBandLabels(catalogue);
  const h12den = cell(v, h12?.den, "H12", "den", h12?.ids.den);
  const bandMarks: Mark[] = Object.keys(bands).map((k, i) => {
    const l = line(v, "H12", h12, k, bands[k as keyof typeof bands]);
    return {
      key: k,
      label: l.label,
      text: l.num.text,
      n: drawn(l.num),
      pct: l.pct,
      tone: CARE_BAND_TONES[i]!,
      tip: tipOf(l.label, l.num, h12den, h12),
      href: l.num.href,
    };
  });
  return (
    <div className="bg-card border-border grid overflow-hidden rounded-lg border shadow-xs sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,2.4fr)]">
      <Figure
        label="Under care"
        value={c01.text}
        tip={tipOf(indicatorLabel("C01"), c01, null, R.C01)}
        href={c01.href}
        basis={
          diff == null
            ? "Visit in the past 12 months"
            : diff === 0
              ? `Same as ${prevMonth}`
              : `${Math.abs(diff).toLocaleString("en-GB")} ${diff > 0 ? "more" : "fewer"} than ${prevMonth}`
        }
      />
      <Figure
        label={`New in ${monthLabel(b.month)}`}
        value={c03.text}
        tip={tipOf(indicatorLabel("C03"), c03, null, R.C03)}
        href={c03.href}
        basis={
          <>
            <CountCell c={c02} /> registered in all
          </>
        }
      />
      <Figure
        label="Lost to follow-up"
        value={c12.pct == null ? c12.num.text : String(c12.pct)}
        suffix={c12.pct == null ? undefined : "%"}
        tip={tipOf(c12.label, c12.num, c12.den, R.C12)}
        href={c12.num.href}
        basis={
          <>
            <CountCell c={c12.num} /> with no visit in 12 months
          </>
        }
      />
      <Figure
        label="Back after a call"
        value={c15.pct == null ? c15.num.text : String(c15.pct)}
        suffix={c15.pct == null ? undefined : "%"}
        tip={tipOf(c15.label, c15.num, c15.den, R.C15)}
        href={c15.num.href}
        basis={
          <>
            <CountCell c={c15.num} /> of {c15.den ? <CountCell c={c15.den} /> : "0"} called, within
            15 days
          </>
        }
      />
      <div className="flex min-w-0 flex-col gap-2 px-4 py-3 sm:col-span-2 lg:col-span-1">
        <span className="text-overline text-muted-foreground uppercase">
          Care bands · share of <CountCell c={h12den} />
        </span>
        <StackedBar
          marks={h12den.suppressed ? [] : bandMarks}
          total={h12den.n}
          label="Care bands"
          thick="h-5"
        />
        <Legend marks={bandMarks} columns={2} />
      </div>
    </div>
  );
}

/* ─── band 2 ──────────────────────────────────────────────────────────── */

export function ConditionRows({ b, focus }: { b: DashboardBoard; focus?: string }) {
  if (!b.rows.length)
    return (
      <p className="text-body-s text-muted-foreground px-5 py-6">
        No condition is enabled for this hospital.
      </p>
    );
  return (
    <ConditionExplorer
      initial={focus}
      items={b.rows.map((r) => ({
        code: r.code,
        label: r.label,
        rail: <ConditionRail r={r} max={b.trendMax} />,
        panel: (
          <ConditionPanel
            r={r}
            max={b.trendMax}
            months={b.trendMonths}
            others={b.rows
              .filter((o) => o.code !== r.code)
              .map((o) => ({ code: o.code, label: o.label, points: o.trend.map((t) => t.pct) }))}
          />
        ),
      }))}
    />
  );
}

const ClinicianTag = () => (
  <span
    className="text-ink-600 border-ink-200 inline-flex h-5 items-center rounded-xs border px-1.5 text-[11px] font-normal"
    title="Recorded by the clinician, not measured"
  >
    Clinician-recorded
  </span>
);

/** The rail entry: phrasing content only (it sits inside the tab button). */
function ConditionRail({ r, max }: { r: ConditionRow; max: number }) {
  const underCare = r.cascade.find((c) => c.key === "under_care")?.cell.text ?? "–";
  return (
    <span className="flex flex-col gap-1.5">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-label text-foreground truncate font-medium">{r.label}</span>
        <span className="text-heading-s text-foreground font-mono font-medium tabular-nums">
          {r.leading.pct == null ? r.leading.num.text : `${r.leading.pct}%`}
        </span>
      </span>
      <span className="flex items-center gap-2">
        <span className="bg-ink-100 block h-1.5 flex-1 overflow-hidden rounded-full">
          <span
            className="block h-full rounded-full bg-teal-700"
            style={{ width: `${r.leading.pct ?? 0}%` }}
          />
        </span>
        <Sparkline points={r.trend.map((t) => t.pct)} max={max} />
      </span>
      <span className="text-caption text-muted-foreground truncate">
        {underCare} under care · {r.outcomeLabel.toLowerCase()}
        {r.clinicianRecorded ? " · clinician-recorded" : ""}
      </span>
    </span>
  );
}

/** The selected condition at full size: the headline figure, then three linked interactive modules. */
function ConditionPanel({
  r,
  max,
  months,
  others,
}: {
  r: ConditionRow;
  max: number;
  months: string[];
  others: InsightOther[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="text-heading-m text-foreground flex flex-wrap items-center gap-2 font-medium">
            {r.label}
            {r.clinicianRecorded ? <ClinicianTag /> : null}
          </h3>
          <span className="text-body-s text-muted-foreground">
            {r.outcomeLabel} at the latest visit · <CountCell c={r.leading.num} /> of{" "}
            <CountCell c={r.leading.den} /> patients
          </span>
        </div>
        <Tip
          tip={r.distribution[0]!.tip}
          href={r.leading.num.href}
          className="text-display-s text-foreground w-fit font-mono font-medium tabular-nums"
        >
          {r.leading.pct == null ? r.leading.num.text : r.leading.pct}
          {r.leading.pct == null ? null : <span className="text-ink-500 text-heading-s">%</span>}
        </Tip>
      </header>
      <ConditionInsight
        label={r.label}
        outcomeLabel={r.outcomeLabel}
        months={r.months}
        monthLabels={months.map(monthLabel)}
        max={max}
        others={others}
      />
    </div>
  );
}

/* ─── band 3 ──────────────────────────────────────────────────────────── */

export function CompactCards({
  b,
  catalogue,
  glycaemicLabel,
}: {
  b: DashboardBoard;
  catalogue: readonly ConditionModule[];
  glycaemicLabel: string;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Screening b={b} glycaemicLabel={glycaemicLabel} />
      <Cohorts b={b} catalogue={catalogue} />
      <Kidney b={b} />
      <Events b={b} />
    </div>
  );
}

const SCREENING: [string, string][] = [
  ["H01", "HbA1c tested"],
  ["H02", "Kidney review"],
  ["H03", "Eye examination"],
  ["H04", "Foot examination"],
  ["H06", "Statin on list, age 40+"],
];

function Screening({ b, glycaemicLabel }: { b: DashboardBoard; glycaemicLabel: string }) {
  return (
    <Card
      title="Complication screening"
      sub="Done in the past 12 months"
      hint={`Of patients with ${glycaemicLabel.toLowerCase()} under care, except kidney review: everyone under care whose condition calls for it.`}
    >
      <div className="flex flex-col gap-2">
        {SCREENING.map(([code, label]) => {
          const r = b.results[code];
          const l = line(b.view, code, r, "num", label);
          return (
            <Meter
              key={code}
              den={l.den?.text ?? "0"}
              mark={{
                key: code,
                label,
                text: l.num.text,
                n: l.num.n,
                pct: l.pct,
                tone: "",
                tip: tipOf(indicatorLabel(code), l.num, l.den, r),
                href: l.num.href,
              }}
            />
          );
        })}
      </div>
    </Card>
  );
}

function Cohorts({ b, catalogue }: { b: DashboardBoard; catalogue: readonly ConditionModule[] }) {
  const v: View = b.view;
  const groups = b.enabledModules
    .filter((m) => m.outcome_classification.kind === "rule")
    .map((m) => ({ m, key: `C16.${m.code}`, r: b.results[`C16.${m.code}`] }))
    .filter((g) => g.r);
  return (
    <Card
      title="Quarterly cohorts"
      sub="Outcome one quarter after registering"
      hint="Darkest: the module's in-range class. Lighter: not in range. Grey: not recorded, then no visit."
    >
      <div className="flex min-h-0 flex-col gap-2.5 xl:max-h-44 xl:overflow-y-auto">
        {groups.length === 0 ? (
          <p className="text-caption text-muted-foreground">No rule-based condition is enabled.</p>
        ) : null}
        {groups.map(({ m, key, r }) => {
          const { leading } = outcomeClasses(catalogue.find((x) => x.code === m.code) ?? m);
          const order = [leading, "other", "not_recorded", "no_visit"];
          const quarters = Object.keys(r!.parts ?? {})
            .filter((k) => k.endsWith(":cohort"))
            .map((k) => k.slice(0, -7));
          return (
            <div key={m.code} className="flex flex-col gap-1.5">
              <h4 className="text-caption text-foreground font-medium">{m.label}</h4>
              {quarters.map((q) => {
                const den = cell(
                  v,
                  r!.parts?.[`${q}:cohort`],
                  key,
                  `${q}:cohort`,
                  r!.ids[`${q}:cohort`],
                );
                const marks: Mark[] = order.map((k) => {
                  const num = cell(
                    v,
                    r!.parts?.[`${q}:${k}`],
                    key,
                    `${q}:${k}`,
                    r!.ids[`${q}:${k}`],
                  );
                  const label =
                    k === leading
                      ? classLabel(m, k)
                      : k === "other"
                        ? "Not in range"
                        : classLabel(m, k);
                  return {
                    key: k,
                    label,
                    text: num.text,
                    n: drawn(num),
                    pct: num.suppressed || den.suppressed ? null : pctOf(num.n, den.n),
                    tone: outcomeTone(k, order),
                    tip: tipOf(`${q.slice(5)} ${q.slice(0, 4)}, ${label}`, num, den, r),
                    href: num.href,
                  };
                });
                return (
                  <div key={q} className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-2">
                    <span className="text-caption text-ink-700">
                      {q.slice(5)} {q.slice(0, 4)}
                      <span className="text-muted-foreground block text-[11px]">
                        <CountCell c={den} /> registered
                      </span>
                    </span>
                    <StackedBar
                      marks={den.suppressed ? [] : marks}
                      total={den.n}
                      label={`${m.label}, cohort ${q}`}
                      thick="h-4"
                    />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

const G_CATS = ["G1", "G2", "G3a", "G3b", "G4", "G5"];
const A_CATS = ["A1", "A2", "A3"];

function Kidney({ b }: { b: DashboardBoard }) {
  const r = b.results.H07;
  const v = b.view;
  const den = cell(v, r?.den, "H07", "den", r?.ids.den);
  const marks: Mark[] = G_CATS.map((g, i) => {
    const num = cell(v, r?.parts?.[g], "H07", g, r?.ids[g]);
    return {
      key: g,
      label: g,
      text: num.text,
      n: drawn(num),
      pct: null,
      tone: KIDNEY_TONES[i]!,
      tip: tipOf(`Kidney category ${g}`, num, den, r),
      href: num.href,
    };
  });
  return (
    <Card
      title="Kidney function categories"
      sub={
        <>
          <CountCell c={den} /> reviewed in 12 months · from eGFR
        </>
      }
      hint="From the latest result. Not a diagnosis."
    >
      <Columns marks={marks} label="Kidney categories G1 to G5, from eGFR" />
      <p className="text-caption text-ink-700 flex flex-wrap gap-x-3">
        {A_CATS.map((a) => {
          const num = cell(v, r?.parts?.[a], "H07", a, r?.ids[a]);
          return (
            <span key={a}>
              <span className="font-mono">{a}</span>{" "}
              <Tip
                tip={tipOf(`Albuminuria category ${a}`, num, den, r)}
                href={num.href}
                className="text-foreground font-mono tabular-nums"
              >
                {num.text}
              </Tip>
            </span>
          );
        })}
      </p>
    </Card>
  );
}

function Events({ b }: { b: DashboardBoard }) {
  const r = b.results.H08;
  const v = b.view;
  const den = cell(v, r?.den, "H08", "den", r?.ids.den);
  const marks: Mark[] = Object.keys(r?.parts ?? {})
    .filter((k) => !k.includes(":"))
    .map((k) => {
      const num = cell(v, r?.parts?.[k], "H08", k, r?.ids[k]);
      const rate = num.suppressed || den.suppressed ? null : (r?.rates?.[k] ?? null);
      return {
        key: k,
        label: eventLabel(k),
        text: num.text,
        n: rate ?? 0,
        pct: rate,
        tone: "",
        tip: `${eventLabel(k)}: ${num.text} events, ${rate ?? "–"} per 1,000 of ${den.text} under care · definition ${r?.version ?? ""}`,
        href: num.href,
      };
    })
    .sort((a, b2) => b2.n - a.n)
    .slice(0, 6);
  return (
    <Card title="Events in 12 months" sub="Per 1,000 under care · count after the dot">
      {marks.length ? (
        <RankedBars marks={marks} value={(m) => `${m.pct ?? "–"} · ${m.text}`} />
      ) : (
        <p className="text-caption text-muted-foreground">
          No events recorded in the past 12 months.
        </p>
      )}
    </Card>
  );
}

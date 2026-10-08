/**
 * The dashboard and monthly-report presenter (F1–F7, §11.3 item 8). Every figure comes from
 * `computeIndicators` over ONE loaded dataset (the month and its 12-month trend), or from a signed
 * snapshot's stored results. This file turns results into display cells: suppression (F6), drill-down
 * links (F2) and percentages. It never names a condition: modules come from the catalogue.
 */
import "server-only";

import type { NcdContext } from "../context";
import type { Dataset } from "../indicators/dataset";
import type { Filters, IndicatorReport, IndicatorResult } from "../indicators/engine";
import type { CareBand } from "../standard/calculations";
import type { ConditionModule } from "../standard/types";
import { and, eq } from "drizzle-orm";

import { ncdIndicatorSnapshot } from "@/db/schema";
import { users } from "@/db/schema/users";
import { authorize, can } from "../context";
import { withNcd } from "../db";
import { addMonths, computeIndicators, monthEnd, outcomeClasses } from "../indicators/engine";
import { loadDataset } from "../indicators/load";
import { enabledModules } from "../indicators/snapshot";
import { CLASS_LABELS, RULE_CLASS_PHRASES } from "../standard/classifications";
import { ADMISSION_REASON, EVENT_TYPE, NOT_OBTAINED_REASON } from "../standard/code-lists";
import {
  HOSPITAL_PARAMS,
  INDICATOR_DEFINITION_VERSION,
  indicatorByCode,
} from "../standard/indicators";
import { identities, logAccess } from "./views";

/* ─── pure: suppression, scales, ordering ─────────────────────────────── */

/**
 * F6: in a view for a role without drill-down, a count from 1 to 4 is hidden, unless every person in
 * it is synthetic. Ids must be the full list behind the count; a snapshot (no ids) is never exempt.
 */
export function isSuppressed(
  n: number,
  ids: readonly string[],
  isSynthetic: (id: string) => boolean,
  canDrill: boolean,
): boolean {
  if (canDrill || n < 1 || n > 4) return false;
  return !(ids.length >= n && ids.every(isSynthetic));
}

export const SUPPRESSED_TEXT = "1–4";

/** One shared percentage scale for the trend rows (§11.4): from 0 to the next 10 above the highest share. */
export function sharedTrendMax(series: readonly (readonly (number | null)[])[]): number {
  const top = Math.max(0, ...series.flat().filter((v): v is number => v != null));
  return Math.min(100, Math.max(10, Math.ceil(top / 10) * 10));
}

/** Rows ordered by patients under care (G02), most first; ties keep catalogue order. */
export function orderByUnderCare<M extends { code: string }>(
  modules: readonly M[],
  results: Readonly<Record<string, { num?: number }>>,
): M[] {
  const g02 = (c: string) => results[`G02.${c}`]?.num ?? 0;
  return [...modules].sort((a, b) => g02(b.code) - g02(a.code));
}

export const pctOf = (num: number, den: number) => (den > 0 ? Math.round((100 * num) / den) : null);

/* ─── cells ───────────────────────────────────────────────────────────── */

export type Cell = { n: number; text: string; suppressed: boolean; href: string | null };
export type Line = {
  label: string;
  num: Cell;
  den: Cell | null;
  pct: number | null;
  note?: string;
};
export type View = {
  month: string;
  /** Holds drill_down: nothing is suppressed for this viewer. */
  canDrill: boolean;
  /** Counts open their patient list (the dashboard, not the printed report). */
  links: boolean;
  isSynthetic: (id: string) => boolean;
  /** Query string of the active filters, carried into drill-down links. */
  filterQuery: string;
};

const fmt = (n: number) => n.toLocaleString("en-GB");

export function cell(
  v: View,
  n: number | undefined,
  key: string,
  part: string,
  ids?: readonly string[],
): Cell {
  const count = n ?? 0;
  const suppressed = isSuppressed(count, ids ?? [], v.isSynthetic, v.canDrill);
  const href =
    v.links && v.canDrill && count > 0 && ids
      ? `/ncd/dashboard/patients?${new URLSearchParams({ code: key, part, month: v.month })}${v.filterQuery ? `&${v.filterQuery}` : ""}`
      : null;
  return { n: count, text: suppressed ? SUPPRESSED_TEXT : fmt(count), suppressed, href };
}

/** A part of a result as a line: count, its denominator, and a percentage unless either is suppressed. */
export function line(
  v: View,
  key: string,
  r: IndicatorResult | undefined,
  part: string,
  label: string,
  denPart = "den",
): Line {
  const num = cell(v, part === "num" ? r?.num : r?.parts?.[part], key, part, r?.ids[part]);
  const denN = r?.den;
  const den = denN == null ? null : cell(v, denN, key, denPart, r?.ids[denPart]);
  return {
    label,
    num,
    den,
    pct: den && !num.suppressed && !den.suppressed ? pctOf(num.n, den.n) : null,
  };
}

/* ─── labels ──────────────────────────────────────────────────────────── */

export function classLabel(m: ConditionModule, cls: string): string {
  const oc = m.outcome_classification;
  return (
    (oc.kind === "rule" ? RULE_CLASS_PHRASES[oc.classification]?.[cls] : undefined) ??
    CLASS_LABELS[cls] ??
    cls
  );
}

/** Care-band labels built from the catalogue labels of the two band modules. */
export function careBandLabels(catalogue: readonly ConditionModule[]): Record<CareBand, string> {
  const label = (c: string) => catalogue.find((m) => m.code === c)?.label ?? c;
  return {
    hypertension_only: `${label(HOSPITAL_PARAMS.bp_module)} only`,
    diabetes_only: `${label(HOSPITAL_PARAMS.glycaemic_module)} only`,
    both_without_complications: "Both, no complications",
    either_with_complications: "With complications",
  };
}

export const eventLabel = (code: string) =>
  EVENT_TYPE.codes.find((c) => c.code === code)?.label ?? code.replace(/_/g, " ");

export const monthLabel = (m: string) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
export const monthLong = (m: string) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

/** The last complete month at `today` (the default reporting month). */
export const lastCompleteMonth = (today: string) => addMonths(today.slice(0, 7), -1);

/* ─── filters ─────────────────────────────────────────────────────────── */

const AGE_BANDS = ["18_29", "30_49", "50_69", "70_plus"] as const;
const CARE_BANDS: readonly CareBand[] = [
  "hypertension_only",
  "diabetes_only",
  "both_without_complications",
  "either_with_complications",
];
export const AGE_BAND_LABELS: Record<(typeof AGE_BANDS)[number], string> = {
  "18_29": "18 to 29",
  "30_49": "30 to 49",
  "50_69": "50 to 69",
  "70_plus": "70 and above",
};

type Params = Record<string, string | string[] | undefined>;
const one = (p: Params, k: string) => {
  const v = p[k];
  return typeof v === "string" && v ? v : null;
};

export function parseMonth(raw: string | null, today: string): string {
  const max = today.slice(0, 7);
  return raw && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) && raw <= max ? raw : lastCompleteMonth(today);
}

export function parseFilters(p: Params, catalogue: readonly ConditionModule[]): Filters {
  const condition = one(p, "condition");
  const sex = one(p, "sex");
  const ageBand = one(p, "age");
  const careBand = one(p, "band");
  return {
    condition: condition && catalogue.some((m) => m.code === condition) ? condition : null,
    sex: sex === "female" || sex === "male" ? sex : null,
    ageBand: AGE_BANDS.find((a) => a === ageBand) ?? null,
    district: one(p, "district"),
    careBand: CARE_BANDS.find((b) => b === careBand) ?? null,
  };
}

export function filterQuery(f: Filters): string {
  const q = new URLSearchParams();
  if (f.condition) q.set("condition", f.condition);
  if (f.sex) q.set("sex", f.sex);
  if (f.ageBand) q.set("age", f.ageBand);
  if (f.district) q.set("district", f.district);
  if (f.careBand) q.set("band", f.careBand);
  return q.toString();
}

/* ─── the board ───────────────────────────────────────────────────────── */

export type Segment = { key: string; label: string; cell: Cell; pct: number | null; tip: string };

/**
 * A count safe to send to the browser: a suppressed count (F6) carries its text ("1–4") and no
 * number, so the interactive charts can never leak it through the page payload.
 */
export type PubCount = { value: number | null; text: string; href: string | null };
export const pub = (c: Cell): PubCount => ({
  value: c.suppressed ? null : c.n,
  text: c.text,
  href: c.href,
});
export type PubPart = { key: string; label: string; count: PubCount; pct: number | null };
/** One month of a condition, for the time-linked charts. */
export type MonthSlice = {
  month: string;
  /** Leading-class share; null when hidden or no denominator. */
  pct: number | null;
  den: PubCount;
  distribution: PubPart[];
  cascade: PubPart[];
  version: string;
};
export type ConditionRow = {
  code: string;
  label: string;
  outcomeLabel: string;
  clinicianRecorded: boolean;
  leading: { num: Cell; den: Cell; pct: number | null };
  classes: string[];
  leadingClass: string;
  distribution: Segment[];
  trend: { month: string; pct: number | null }[];
  cascade: Segment[];
  /** The 12 months of the trend, each with its own distribution and cascade (sanitised). */
  months: MonthSlice[];
};

type Computed = {
  report: IndicatorReport;
  trend: IndicatorReport[];
  ds: Dataset;
  enabled: Set<string>;
};

async function compute(ctx: NcdContext, month: string, filters: Filters): Promise<Computed> {
  const [ds, enabled] = await Promise.all([loadDataset(ctx), enabledModules(ctx)]);
  // ponytail: 12 full engine runs over one dataset; compute only the G04 slice if this gets slow.
  const trend = Array.from({ length: 12 }, (_, i) => {
    const m = addMonths(month, i - 11);
    return computeIndicators(ds, {
      month: m,
      asOf: monthEnd(m) > ctx.today ? ctx.today : undefined,
      catalogue: ctx.catalogue,
      enabled,
      filters,
    });
  });
  return { report: trend[11]!, trend, ds, enabled };
}

const tipOf = (label: string, c: Cell, den: Cell | null, version: string) =>
  `${label}: ${c.text}${den ? ` of ${den.text}` : ""} · definition ${version}`;

export async function dashboardBoard(ctx: NcdContext, month: string, filters: Filters) {
  authorize(ctx, "aggregate_view", "report_view");
  const { report, trend, ds, enabled } = await compute(ctx, month, filters);
  const synthetic = new Set(ds.persons.filter((p) => p.isSynthetic).map((p) => p.id));
  const v: View = {
    month,
    canDrill: can(ctx, "drill_down"),
    links: true,
    isSynthetic: (id) => synthetic.has(id),
    filterQuery: filterQuery(filters),
  };
  const R = report.results;
  const modules = orderByUnderCare(
    ctx.catalogue.filter((m) => enabled.has(m.code)),
    R,
  );

  const rows: ConditionRow[] = modules.map((m) => {
    const key = `G04.${m.code}`;
    const g04 = R[key];
    const { classes, leading } = outcomeClasses(m);
    const ordered = [leading, ...classes.filter((c) => c !== leading), "not_recorded", "no_visit"];
    const den = cell(v, g04?.den, key, "den", g04?.ids.den);
    const segs = ordered.map((cls): Segment => {
      const l = line(v, key, g04, cls, classLabel(m, cls));
      return {
        key: cls,
        label: l.label,
        cell: l.num,
        pct: l.pct,
        tip: tipOf(l.label, l.num, den, g04?.version ?? INDICATOR_DEFINITION_VERSION),
      };
    });
    const lead = segs[0]!;
    const g06key = `G06.${m.code}`;
    const g06 = R[g06key];
    const steps: [string, string][] = [
      ["registered", "Registered"],
      ["under_care", "Under care"],
      ["visit_3_months", "Seen in 3 months"],
      ["leading_class", classLabel(m, leading)],
    ];
    const g06den = cell(v, g06?.den, g06key, "den", g06?.ids.den);
    // Each trend month with its own distribution and cascade; drill-down links open that month.
    const months = trend.map((t): MonthSlice => {
      const vm = { ...v, month: t.month };
      const r4 = t.results[key];
      const r6 = t.results[g06key];
      const dist = ordered.map((cls) => line(vm, key, r4, cls, classLabel(m, cls)));
      return {
        month: t.month,
        pct: dist[0]!.pct,
        den: pub(cell(vm, r4?.den, key, "den", r4?.ids.den)),
        distribution: ordered.map((cls, i) => ({
          key: cls,
          label: dist[i]!.label,
          count: pub(dist[i]!.num),
          pct: dist[i]!.pct,
        })),
        cascade: steps.map(([part, label]) => {
          const l = line(vm, g06key, r6, part, label);
          return { key: part, label, count: pub(l.num), pct: l.pct };
        }),
        version: r4?.version ?? INDICATOR_DEFINITION_VERSION,
      };
    });
    return {
      months,
      code: m.code,
      label: m.label,
      outcomeLabel: m.outcome_label,
      clinicianRecorded: m.outcome_classification.kind === "clinician_recorded",
      leading: { num: lead.cell, den, pct: lead.pct },
      classes,
      leadingClass: leading,
      distribution: segs,
      trend: trend.map((t) => {
        const r = t.results[key];
        const n = r?.parts?.[leading] ?? 0;
        const hidden =
          isSuppressed(n, r?.ids[leading] ?? [], v.isSynthetic, v.canDrill) ||
          isSuppressed(r?.den ?? 0, r?.ids.den ?? [], v.isSynthetic, v.canDrill);
        return { month: t.month, pct: hidden ? null : pctOf(n, r?.den ?? 0) };
      }),
      cascade: steps.map(([part, label]) => {
        const l = line(v, g06key, g06, part, label);
        return {
          key: part,
          label,
          cell: l.num,
          pct: l.pct,
          tip: tipOf(label, l.num, g06den, g06?.version ?? INDICATOR_DEFINITION_VERSION),
        };
      }),
    };
  });

  const prevC01 = trend[10]?.results.C01?.num;
  const districts = [
    ...new Set(ds.persons.map((p) => p.district).filter((d): d is string => !!d)),
  ].sort();
  return {
    month,
    view: v,
    results: R,
    rows,
    trendMax: sharedTrendMax(rows.map((r) => r.trend.map((t) => t.pct))),
    trendMonths: trend.map((t) => t.month),
    prevC01: prevC01 ?? null,
    districts,
    enabledModules: modules,
    syntheticOnScreen: synthetic.size > 0,
  };
}
export type DashboardBoard = Awaited<ReturnType<typeof dashboardBoard>>;

/* ─── F2 drill-down ───────────────────────────────────────────────────── */

export async function drillDown(
  ctx: NcdContext,
  o: { code: string; part: string; month: string; filters: Filters },
) {
  authorize(ctx, "drill_down");
  const [ds, enabled] = await Promise.all([loadDataset(ctx), enabledModules(ctx)]);
  const report = computeIndicators(ds, {
    month: o.month,
    asOf: monthEnd(o.month) > ctx.today ? ctx.today : undefined,
    catalogue: ctx.catalogue,
    enabled,
    filters: o.filters,
  });
  const r = report.results[o.code];
  const ids = r?.ids[o.part] ?? [];
  const unique = [...new Set(ids)];
  await logAccess(ctx, "drilldown", null, {
    code: o.code,
    part: o.part,
    month: o.month,
    count: ids.length,
  });
  const who = await identities(ctx, unique);
  const people = unique
    .map((id) => who.get(id))
    .filter((p): p is NonNullable<typeof p> => !!p)
    .sort((a, b) => a.name.localeCompare(b.name));
  return { result: r ?? null, count: ids.length, people };
}

/* ─── F5 monthly report ───────────────────────────────────────────────── */

/** The month's snapshot (signed first, then the real one), with the signer's name. */
export async function snapshotState(ctx: NcdContext, month: string) {
  const snaps = await withNcd(
    ctx,
    "app",
    (tx) =>
      tx
        .select()
        .from(ncdIndicatorSnapshot)
        .where(
          and(
            eq(ncdIndicatorSnapshot.facilityId, ctx.facilityId),
            eq(ncdIndicatorSnapshot.month, `${month}-01`),
          ),
        ),
    ctx.db,
  );
  const snap =
    snaps.find((x) => x.signedAt) ?? snaps.find((x) => !x.isSynthetic) ?? snaps[0] ?? null;
  if (!snap?.signedAt) return { snap, signed: null };
  const { db } = await import("@/db");
  const [u] = snap.signedBy
    ? await db
        .select({ fullName: users.fullName, email: users.email })
        .from(users)
        .where(eq(users.id, snap.signedBy))
    : [];
  return {
    snap,
    signed: { by: u?.fullName ?? u?.email ?? "the registry lead", at: snap.signedAt },
  };
}

export async function monthlyReport(ctx: NcdContext, month: string) {
  authorize(ctx, "report_view", "aggregate_view", "report_sign");
  const { snap, signed } = await snapshotState(ctx, month);
  let results: Record<string, IndicatorResult>;
  let isSynthetic: (id: string) => boolean = () => false;
  let enabled: Set<string>;
  if (signed && snap) {
    // A signed month reads its stored results: immutable, no person ids.
    results = (snap.results as unknown as IndicatorReport).results;
    enabled = new Set(
      Object.keys(results)
        .filter((k) => k.startsWith("G01."))
        .map((k) => k.slice(4)),
    );
  } else {
    const [ds, en] = await Promise.all([loadDataset(ctx), enabledModules(ctx)]);
    const report = computeIndicators(ds, {
      month,
      asOf: monthEnd(month) > ctx.today ? ctx.today : undefined,
      catalogue: ctx.catalogue,
      enabled: en,
    });
    const syn = new Set(ds.persons.filter((p) => p.isSynthetic).map((p) => p.id));
    isSynthetic = (id) => syn.has(id);
    results = report.results;
    enabled = en;
  }
  const view: View = {
    month,
    canDrill: can(ctx, "drill_down"),
    links: false,
    isSynthetic,
    filterQuery: "",
  };
  return {
    view,
    results,
    modules: orderByUnderCare(
      ctx.catalogue.filter((m) => enabled.has(m.code)),
      results,
    ),
    signed,
    definitionVersion: Object.values(results)[0]?.version ?? INDICATOR_DEFINITION_VERSION,
  };
}

/** Label of an indicator from the standard. */
export const indicatorLabel = (code: string) => indicatorByCode.get(code)?.label ?? code;

/* ─── the Table view and the monthly report: every indicator, num and den ─ */

export type TableRow = { key: string; code: string; label: string; version: string; lines: Line[] };
export type TableSection = { title: string; rows: TableRow[] };

const quarterLabel = (q: string) => `${q.slice(5)} ${q.slice(0, 4)}`;

function partLabel(
  code: string,
  part: string,
  m: ConditionModule | undefined,
  bands: Record<string, string>,
): string {
  if (code === "G04" && m) return classLabel(m, part);
  if (code === "G06")
    return (
      {
        registered: "Registered",
        under_care: "Under care",
        visit_3_months: "Seen in 3 months",
        leading_class: m ? classLabel(m, outcomeClasses(m).leading) : part,
      }[part] ?? part
    );
  if (code === "H05") return part.replace(/^below_(\d+)_(\d+)$/, "Below $1/$2");
  if (code === "H08") {
    const [type, reason] = part.split(":");
    return reason
      ? `${eventLabel(type!)}: ${ADMISSION_REASON.codes.find((c) => c.code === reason)?.label ?? reason}`
      : eventLabel(part);
  }
  if (code === "H09")
    return NOT_OBTAINED_REASON.codes.find((c) => c.code === part)?.label ?? part.replace(/_/g, " ");
  if (code === "H12") return bands[part] ?? part;
  return part;
}

export function tableSections(
  v: View,
  results: Readonly<Record<string, IndicatorResult>>,
  modules: readonly ConditionModule[],
  catalogue: readonly ConditionModule[],
): TableSection[] {
  const bands = careBandLabels(catalogue);
  const row = (key: string, label?: string): TableRow | null => {
    const r = results[key];
    if (!r) return null;
    const m = r.condition ? catalogue.find((x) => x.code === r.condition) : undefined;
    const lines: Line[] = [];
    if (r.num != null) lines.push(line(v, key, r, "num", "Patients"));
    if (r.code === "C16") {
      for (const q of Object.keys(r.parts ?? {})
        .filter((k) => k.endsWith(":cohort"))
        .map((k) => k.slice(0, -7))) {
        const den = cell(v, r.parts?.[`${q}:cohort`], key, `${q}:cohort`, r.ids[`${q}:cohort`]);
        lines.push({ label: `Registered ${quarterLabel(q)}`, num: den, den: null, pct: null });
        for (const k of Object.keys(r.parts ?? {}).filter(
          (x) => x.startsWith(`${q}:`) && !x.endsWith(":cohort"),
        )) {
          const part = k.slice(q.length + 1);
          const num = cell(v, r.parts?.[k], key, k, r.ids[k]);
          const lab =
            m && part === outcomeClasses(m).leading
              ? classLabel(m, part)
              : part === "other"
                ? "Not in range"
                : (CLASS_LABELS[part] ?? part);
          lines.push({
            label: lab,
            num,
            den,
            pct: num.suppressed || den.suppressed ? null : pctOf(num.n, den.n),
          });
        }
      }
    } else
      for (const part of Object.keys(r.parts ?? {}))
        lines.push({
          ...line(v, key, r, part, partLabel(r.code, part, m, bands)),
          note: r.rates?.[part] != null ? `${r.rates[part]} per 1,000` : undefined,
        });
    if (!lines.length && r.den != null)
      lines.push({
        label: "Denominator",
        num: cell(v, r.den, key, "den", r.ids.den),
        den: null,
        pct: null,
      });
    return {
      key,
      code: r.code,
      label: label ?? `${indicatorLabel(r.code)}${m ? `, ${m.label}` : ""}`,
      version: r.version,
      lines,
    };
  };
  const keep = (xs: (TableRow | null)[]) => xs.filter((x): x is TableRow => !!x);
  const coreConditional = Object.keys(results)
    .filter((k) => /^C(0[4-9]|1[01])$/.test(k))
    .sort();
  const nr = Object.keys(results).filter((k) => k.startsWith("not_recorded."));
  return [
    {
      title: "Facility",
      rows: keep(["C01", "C02", "C03", "C12", "C13", "C14", "C15"].map((k) => row(k))),
    },
    {
      title: "Control at latest visit (HEARTS360)",
      rows: keep([
        ...coreConditional.map((k) => row(k)),
        ...nr.map((k) => {
          const m = catalogue.find((x) => x.code === k.slice(13));
          return row(k, `Not recorded at latest visit${m ? `, ${m.label}` : ""}`);
        }),
      ]),
    },
    ...modules.map((m) => ({
      title: m.label,
      rows: keep(
        ["G01", "G02", "G03", "G04", "G05", "G06", "C16"].map((c) => row(`${c}.${m.code}`)),
      ),
    })),
    {
      title: "Hospital",
      rows: keep(
        ["H01", "H02", "H03", "H04", "H05", "H06", "H07", "H08", "H09", "H10", "H11", "H12"].map(
          (k) => row(k),
        ),
      ),
    },
  ].filter((s) => s.rows.length);
}

import "server-only";

import type { IndicatorInput, IndicatorValue } from "./indicators";
import type { EmrTx } from "@/lib/emr/db";
import { and, eq, sql } from "drizzle-orm";

import { diagnosticOfferings, hospitalDepartments } from "@/db/schema";
import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";
import { computeIndicators, count, NO_DATA, pct } from "./indicators";
import { addDays, endOfDay } from "./stock";
import { parseStatedTat, releasedTurnaround } from "./turnaround";

/**
 * Lab reports and quality indicators on the database (Lab Phase 3 Step 10, §5.13, §6.12 QI-1..QI-4; 0118). The
 * source rows are one SQL definition (`private.lab_indicator_source`), read two ways: with their records for lab
 * readers (`lab_indicator_rows`, then the pure engine and the drill-down), and as numbers only for the In-Charge,
 * the focal person and the hospital admin (`lab_indicator_counts`, Law 10). Both run as the clinical reader, so RLS
 * and the definer functions decide who gets what. Computed at read time for any period (QI-3; no month cache, P13).
 */

const TZ = DEFAULT_TIME_ZONE;

/** §5.13's eight tiles, in the canvas's order. */
export const TILES = [
  "workload",
  "late_pct",
  "reject_pct",
  "crit_ack_in_time",
  "qc_reject_pct",
  "misid_caught",
  "corrected_pct",
  "downtime_h",
] as const;
export type TileId = (typeof TILES)[number];
/** What a number opens: a tile, or the turnaround of one section. */
export type DrillId = TileId | "tat";

export type RowKind =
  | "released"
  | "specimen"
  | "identity"
  | "critical"
  | "qc_run"
  | "device"
  | "breakdown";
export interface ReportRow {
  kind: RowKind;
  ref: string;
  orderId: string | null;
  patientUserId: string | null;
  restricted: boolean;
  deviceId: string | null;
  sectionId: string | null;
  wardId: string | null;
  priority: string | null;
  testCode: string | null;
  at: Date | null;
  receivedAt: Date | null;
  dueAt: Date | null;
  doneAt: Date | null;
  flag: boolean;
  bedside: boolean;
  reason: string | null;
  label: string | null;
}
export interface Filters {
  ward?: string | null;
  section?: string | null;
  priority?: string | null;
}
export interface Period {
  from: Date;
  to: Date;
}
export type Targets = Record<string, number>;

export interface LabReport {
  from: Date;
  to: Date;
  asOf: Date;
  tiles: Record<TileId, IndicatorValue>;
  bedside: number;
  /** Turnaround per section (receipt to release), only sections with a receipt time. */
  tat: { sectionId: string | null; n: number; p90: number; targets: number[] }[];
  /** Rejected specimens by reason, most first, with the ward or clinic most affected. */
  rejections: { reason: string; n: number; wardId: string | null; wardN: number }[];
}

/** A month ("2026-10") or a range of days, hospital-local, as [from, to). */
export const monthPeriod = (month: string): Period => {
  const next = addDays(`${month}-28`, 7).slice(0, 7);
  return {
    from: endOfDay(addDays(`${month}-01`, -1), TZ),
    to: endOfDay(addDays(`${next}-01`, -1), TZ),
  };
};
export const dayPeriod = (fromDay: string, toDay: string): Period => ({
  from: endOfDay(addDays(fromDay, -1), TZ),
  to: endOfDay(toDay, TZ),
});

const iso = (d: Date) => d.toISOString();
const rowsOf = <T>(raw: unknown): T[] =>
  Array.isArray(raw) ? (raw as T[]) : ((raw as { rows?: T[] }).rows ?? []);
const when = (v: unknown) => (v == null ? null : new Date(v as string));

/** QI-4: the source rows with their records. Empty for anyone who is not a lab reader (RLS, 0118). */
export async function reportRows(tx: EmrTx, p: Period): Promise<ReportRow[]> {
  const raw = await tx.execute(
    sql`SELECT * FROM private.lab_indicator_rows(${iso(p.from)}::timestamptz, ${iso(p.to)}::timestamptz)`,
  );
  return rowsOf<Record<string, unknown>>(raw).map((r) => ({
    kind: r.kind as RowKind,
    ref: r.ref as string,
    orderId: (r.order_id as string | null) ?? null,
    patientUserId: (r.patient_user_id as string | null) ?? null,
    restricted: !!r.restricted,
    deviceId: (r.device_id as string | null) ?? null,
    sectionId: (r.section_id as string | null) ?? null,
    wardId: (r.ward_id as string | null) ?? null,
    priority: (r.priority as string | null) ?? null,
    testCode: (r.test_code as string | null) ?? null,
    at: when(r.at),
    receivedAt: when(r.received_at),
    dueAt: when(r.due_at),
    doneAt: when(r.done_at),
    flag: !!r.flag,
    bedside: !!r.bedside,
    reason: (r.reason as string | null) ?? null,
    label: (r.label as string | null) ?? null,
  }));
}

/** The lab's stated turnaround per test, in minutes, where the hub states one unambiguous figure (TA-*). */
export async function statedTargets(tx: EmrTx, hospitalId: string): Promise<Targets> {
  const rows = await tx
    // Lab test menu v2 (TM-3): keyed by the test; the minutes the menu stores win over the words.
    .select({
      code: diagnosticOfferings.code,
      stated: diagnosticOfferings.statedTat,
      minutes: diagnosticOfferings.statedTurnaroundMinutes,
    })
    .from(diagnosticOfferings)
    .where(
      and(eq(diagnosticOfferings.hospitalId, hospitalId), eq(diagnosticOfferings.kind, "lab")),
    );
  return Object.fromEntries(
    rows.flatMap((r) => {
      const m = r.minutes ?? parseStatedTat(r.stated);
      return m === null ? [] : [[r.code, m]];
    }),
  );
}

/** Department names for sections and wards (hub configuration, not patient data). */
export async function departmentNames(tx: EmrTx, hospitalId: string) {
  const rows = await tx
    .select({ id: hospitalDepartments.id, name: hospitalDepartments.name })
    .from(hospitalDepartments)
    .where(eq(hospitalDepartments.hospitalId, hospitalId));
  return new Map(rows.map((r) => [r.id, r.name]));
}

/* ─── The lab's view: rows → engine ─────────────────────────────────── */

/** QC runs, machines and breakdowns have no ward or priority; a section filter still applies to them. */
const PER_ORDER: readonly RowKind[] = ["released", "specimen", "identity", "critical"];
export const filtered = (rows: readonly ReportRow[], f: Filters) =>
  rows.filter(
    (r) =>
      (!f.section || r.sectionId === f.section) &&
      (!PER_ORDER.includes(r.kind) ||
        ((!f.ward || r.wardId === f.ward) && (!f.priority || r.priority === f.priority))),
  );

const late = (r: ReportRow, targets: Targets) => {
  const t = r.testCode ? targets[r.testCode] : undefined;
  return !!releasedTurnaround(r.receivedAt, r.at!, t ? { minutes: t, source: "facility" } : null)
    ?.lateBy;
};

/** QI-4: the records behind each number: the denominator's rows, and which of them the numerator counts. */
export const DRILL: Record<
  DrillId,
  {
    kind: RowKind;
    where?: (r: ReportRow, t: Targets) => boolean;
    hit: (r: ReportRow, t: Targets) => boolean;
  }
> = {
  workload: { kind: "released", hit: () => true },
  late_pct: {
    kind: "released",
    where: (r, t) => !!r.receivedAt && !!r.testCode && t[r.testCode] !== undefined,
    hit: late,
  },
  reject_pct: { kind: "specimen", hit: (r) => r.flag },
  crit_ack_in_time: { kind: "critical", where: (r) => !!r.dueAt, hit: (r) => r.flag },
  qc_reject_pct: { kind: "qc_run", hit: (r) => r.flag },
  misid_caught: { kind: "identity", hit: (r) => r.flag },
  corrected_pct: { kind: "released", hit: (r) => r.flag },
  downtime_h: { kind: "breakdown", hit: () => true },
  tat: { kind: "released", where: (r) => !!r.receivedAt, hit: () => true },
};
export const drillRows = (rows: readonly ReportRow[], id: DrillId, t: Targets) =>
  rows.filter((r) => r.kind === DRILL[id].kind && (DRILL[id].where?.(r, t) ?? true));

function input(
  rows: readonly ReportRow[],
  o: { hospitalId: string; now: Date; targets: Targets } & Period,
): IndicatorInput {
  const of = (k: RowKind) => rows.filter((r) => r.kind === k);
  const h = o.hospitalId;
  return {
    hospitalId: h,
    from: o.from,
    to: o.to,
    now: o.now,
    timeZone: TZ,
    released: of("released").map((r) => ({
      hospitalId: h,
      releasedAt: r.at!,
      receivedAt: r.receivedAt,
      targetMinutes: (r.testCode && o.targets[r.testCode]) || null,
      amended: r.flag,
    })),
    specimens: of("specimen").map((r) => ({ hospitalId: h, receivedAt: r.at!, rejected: r.flag })),
    identityChecks: of("identity").map((r) => ({ hospitalId: h, at: r.at!, mismatch: r.flag })),
    criticalAlerts: of("critical").map((r) => ({
      hospitalId: h,
      sentAt: r.at!,
      dueAt: r.dueAt,
      acknowledgedAt: r.doneAt,
    })),
    qcRuns: of("qc_run").map((r) => ({
      hospitalId: h,
      runAt: r.at!,
      decision: r.reason as "accepted" | "warning" | "rejected",
    })),
    // Not tiles on this page: they live where their facts are kept (the EQA and stock pages).
    inHouseTests: [],
    testsWithIqc: [],
    eqaRounds: [],
    eqaCoverage: [],
    stockItems: [],
    stockTxs: [],
    devices: of("device").map((r) => ({ hospitalId: h, id: r.ref })),
    breakdowns: of("breakdown").map((r) => ({
      hospitalId: h,
      deviceId: r.deviceId!,
      since: r.at!,
      backAt: r.doneAt,
    })),
  };
}

type Group = { reason: string | null; wardId: string | null; n: number };
/** Rejections by reason (most first) and, for each, the ward or clinic with the most (ties: first by id). */
function byReason(groups: readonly Group[]): LabReport["rejections"] {
  const out = new Map<string, LabReport["rejections"][number]>();
  const sorted = [...groups].sort(
    (a, b) => b.n - a.n || String(a.wardId).localeCompare(String(b.wardId)),
  );
  for (const g of sorted) {
    const reason = g.reason ?? "not_recorded";
    const r = out.get(reason);
    if (r) r.n += g.n;
    else out.set(reason, { reason, n: g.n, wardId: g.wardId, wardN: g.n });
  }
  return [...out.values()].sort((a, b) => b.n - a.n || a.reason.localeCompare(b.reason));
}

/** §5.13 for lab readers: the eight tiles, turnaround per section and rejections, over the filtered rows. */
export function reportFromRows(
  all: readonly ReportRow[],
  o: { hospitalId: string; now: Date; targets: Targets } & Period,
  f: Filters = {},
): LabReport {
  const rows = filtered(all, f);
  const values = computeIndicators(input(rows, o)).values;
  const sections = new Map<string | null, ReportRow[]>();
  for (const r of rows)
    if (r.kind === "released" && r.receivedAt)
      sections.set(r.sectionId, [...(sections.get(r.sectionId) ?? []), r]);
  const tat = [...sections].map(([sectionId, list]) => {
    const v = computeIndicators(input(list, o)).values.tat_p90;
    const targets = [
      ...new Set(list.flatMap((r) => (r.testCode && o.targets[r.testCode]) || [])),
    ].sort((a, b) => a - b);
    return { sectionId, n: list.length, p90: v.kind === "value" ? v.value : 0, targets };
  });
  const groups = new Map<string, Group>();
  for (const r of rows.filter((x) => x.kind === "specimen" && x.flag)) {
    const k = `${r.reason}|${r.wardId}`;
    const g = groups.get(k) ?? { reason: r.reason, wardId: r.wardId, n: 0 };
    g.n++;
    groups.set(k, g);
  }
  return {
    from: o.from,
    to: o.to,
    asOf: o.now,
    tiles: Object.fromEntries(TILES.map((t) => [t, values[t]])) as Record<TileId, IndicatorValue>,
    bedside: rows.filter((r) => r.kind === "released" && r.bedside).length,
    tat,
    rejections: byReason([...groups.values()]),
  };
}

/* ─── The aggregates view: numbers only (Law 10) ─────────────────────── */

interface Counts {
  released: number;
  bedside: number;
  corrected: number;
  withTarget: number;
  late: number;
  tat: {
    sectionId: string | null;
    n: number;
    p90: number | null;
    targets: number[];
    total: boolean;
  }[];
  specimens: number;
  rejected: number;
  rejections: Group[];
  checks: number;
  mismatches: number;
  alerts: number;
  inTime: number;
  ackMedian: number | null;
  runs: number;
  runsRejected: number;
  devices: number;
  downtime: Record<string, number>;
}

/**
 * §5.13 for the hospital admin, the In-Charge and the focal person: the same tiles from
 * `private.lab_indicator_counts`, which returns numbers only. Null when the reader may not see them.
 */
export async function reportFromCounts(
  tx: EmrTx,
  o: { now: Date; targets: Targets } & Period,
): Promise<LabReport | null> {
  const raw = await tx.execute(
    sql`SELECT private.lab_indicator_counts(${iso(o.from)}::timestamptz, ${iso(o.to)}::timestamptz,
          ${iso(o.now)}::timestamptz, ${JSON.stringify(o.targets)}::jsonb) AS c`,
  );
  const c = rowsOf<{ c: Counts | string | null }>(raw)[0]?.c;
  if (!c) return null;
  const k = (typeof c === "string" ? JSON.parse(c) : c) as Counts;
  const crit = pct(k.inTime, k.alerts);
  const hours = Object.values(k.downtime).reduce((s, v) => s + Number(v), 0);
  return {
    from: o.from,
    to: o.to,
    asOf: o.now,
    tiles: {
      workload: count(k.released, k.released),
      late_pct: pct(k.late, k.withTarget),
      reject_pct: pct(k.rejected, k.specimens),
      crit_ack_in_time:
        crit.kind === "value" && k.ackMedian !== null
          ? { ...crit, medianMinutes: Number(k.ackMedian) }
          : crit,
      qc_reject_pct: pct(k.runsRejected, k.runs),
      misid_caught: count(k.mismatches, k.checks),
      corrected_pct: pct(k.corrected, k.released),
      downtime_h:
        k.devices === 0
          ? NO_DATA
          : {
              kind: "value",
              value: hours,
              numerator: hours,
              denominator: null,
              by: Object.fromEntries(Object.entries(k.downtime).map(([d, h]) => [d, Number(h)])),
            },
    },
    bedside: k.bedside,
    tat: k.tat
      .filter((t) => !t.total && t.n > 0)
      .map((t) => ({
        sectionId: t.sectionId,
        n: t.n,
        p90: Number(t.p90),
        targets: [...t.targets].sort((a, b) => a - b),
      })),
    rejections: byReason(k.rejections),
  };
}

/* ─── CSV (aggregates only) ──────────────────────────────────────────── */

const cell = (v: string | number | null) => {
  const s = v === null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};
const num = (v: IndicatorValue) =>
  v.kind === "no_data"
    ? ["no_data", "", ""]
    : [v.numerator, v.denominator, Math.round(v.value * 100) / 100];

/** "Download CSV": every number on the page with its period and as-of time; no records, no patients. */
export function reportCsv(
  r: LabReport,
  names: {
    tile: (t: TileId) => string;
    section: (id: string | null) => string;
    reason: (c: string) => string;
    ward: (id: string | null) => string;
  },
): string {
  const period = [iso(r.from), iso(r.to), iso(r.asOf)];
  const lines = [
    ["measure", "name", "numerator", "denominator", "value", "from", "to", "as_of"],
    ...TILES.map((t) => [t, names.tile(t), ...num(r.tiles[t]), ...period]),
    ...r.tat.map((t) => ["tat_p90_min", names.section(t.sectionId), t.n, "", t.p90, ...period]),
    ...r.rejections.map((x) => [
      "rejected",
      `${names.reason(x.reason)} (most from ${names.ward(x.wardId)}: ${x.wardN})`,
      x.n,
      "",
      x.n,
      ...period,
    ]),
  ];
  return lines.map((l) => l.map(cell).join(",")).join("\n") + "\n";
}

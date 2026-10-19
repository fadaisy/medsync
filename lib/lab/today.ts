import type { QcStatus } from "./qc";
import type { ReportRow, Targets } from "./report-store";
import type { WorklistRow } from "./worklist";

/**
 * Today (Lab Workspace v2 prompt 5.2, 6.1, Appendix B as adopted in gate-a §6; ADR 0346). Pure: `todaySnapshot`
 * turns rows that existing engines and the 0118 indicator source already define into every figure on the page.
 * `now` is injected; there is no clock and no database here. Nothing clinical is decided: late is the turnaround
 * engine's `lateBy`, a critical is an alert the lab already raised, QC status is the QC engine's.
 *
 *   - Received: 0118 "specimen" rows (received or rejected, first event), as HMIS 10.7 reads them.
 *   - Released: 0118 "released" rows (first final, in-house, downtime form times), bedside excluded.
 *   - Turnaround: receipt to first release in minutes over Released with a receipt time; median nearest-rank.
 *   - Past stated time: Released whose own test has a stated time and took longer. No stated time is never late.
 *   - Criticals: 0118 "critical" rows; acknowledged = has an acknowledgement; median minutes to it.
 *   - Rejected: specimen rows flagged rejected ÷ Received, with the most frequent reason.
 *   - Comparison: the same window on the same weekday 7 days earlier, cut at the same clock time.
 */

export type Period = "today" | "week" | "month";
export const PERIOD_DAYS: Record<Period, number> = { today: 1, week: 7, month: 28 };

/** TD-5 buckets, minutes. */
export const BUCKETS = [15, 30, 45, 60, 90, 120, 180] as const;
export const BUCKET_LABELS = [
  "<15",
  "15–30",
  "30–45",
  "45–60",
  "60–90",
  "90–120",
  "120–180",
  ">180",
] as const;

/** Severity for the section's QC pill (gate-a §1, CSO): the worst status of the section's QC items is shown. */
export const QC_SEVERITY: readonly QcStatus[] = [
  "failed",
  "not_run_in_window",
  "warning",
  "provisional_target",
  "passed",
  "no_plan",
];
export function worstQc(statuses: readonly QcStatus[]): QcStatus | null {
  let best: QcStatus | null = null;
  for (const s of statuses)
    if (best === null || QC_SEVERITY.indexOf(s) < QC_SEVERITY.indexOf(best)) best = s;
  return best;
}

export interface Figures {
  received: number;
  released: number;
  /** null: no released result with a receipt time ("No data"). */
  tatMedian: number | null;
  /** Released past their own test's stated time, and how many released had a stated time. */
  late: number;
  withStated: number;
  criticals: number;
  criticalsAcked: number;
  ackMedian: number | null;
  rejected: number;
  topReason: string | null;
}

export interface Change {
  /** null: no earlier data in that window. */
  before: number | null;
}

export interface SectionLine {
  sectionId: string | null;
  inLab: number;
  released: number;
  lateNow: number;
  tatMedian: number | null;
  past: number;
  rejected: number;
  qc: QcStatus | null;
}

export interface TodaySnapshot {
  asOf: Date;
  compareDay: Date;
  period: Period;
  hero: {
    inLab: number;
    toReceive: number;
    toResult: number;
    preliminary: number;
    outAtPartners: number;
    /** Minutes the longest-waiting in-lab specimen has waited (worklist clock), null when nothing waits. */
    oldestMinutes: number | null;
    lateNow: number;
    pace: { kind: "keeping" | "growing"; since: Date } | null;
  };
  figures: Figures;
  /** Same window one week earlier (today) or the previous window (7 and 28 days). */
  before: Figures | null;
  /** Seven points, oldest first, same weekday at the same clock time (today only). null where no data. */
  spark: Record<
    keyof Pick<Figures, "received" | "released" | "tatMedian" | "late" | "criticals" | "rejected">,
    (number | null)[]
  > | null;
  hours: { hour: number; received: number; released: number; partial: boolean }[];
  histogram: number[];
  /** Released excluded from turnaround: referred never appear (in-house only); bedside counted here. */
  bedsideExcluded: number;
  sections: SectionLine[];
  totals: SectionLine;
}

export interface TodayInput {
  now: Date;
  timeZone: string;
  period: Period;
  /** Only this section (`"none"` = no section), or every section. */
  section: string | null;
  /** 0118 rows covering at least [start of the day 7 weeks back, now] (today) or 2 periods back. */
  rows: readonly ReportRow[];
  targets: Targets;
  /** The worklist as computed now (computeWorklist rows: stage, clock, sectionId). */
  worklist: readonly Pick<WorklistRow, "stage" | "clock" | "sectionId">[];
  outAtPartners: number;
  sections: readonly { id: string; name: string }[];
  /** QC status per QC item with its section (device's section). */
  qc: readonly { sectionId: string | null; status: QcStatus }[];
  /** Lab opening hour for the per-hour chart (local); earlier events widen it. */
  openingHour?: number;
}

const MIN = 60_000;
const DAY = 86_400_000;

function localParts(d: Date, timeZone: string) {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => Number(f.find((p) => p.type === t)?.value);
  return { y: get("year"), mo: get("month"), d: get("day"), h: get("hour"), mi: get("minute") };
}

/** The start of the local day of `d` (zones without daylight saving, as the lab's zone is). */
export function localDayStart(d: Date, timeZone: string): Date {
  const p = localParts(d, timeZone);
  const asUtc = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi);
  const offset = asUtc - Math.floor(d.getTime() / MIN) * MIN;
  return new Date(Date.UTC(p.y, p.mo - 1, p.d) - offset);
}

export const localHour = (d: Date, timeZone: string) => localParts(d, timeZone).h;

export function median(xs: readonly number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.ceil(s.length / 2) - 1]!;
}

const inWin = (at: Date | null, from: Date, to: Date) => !!at && at >= from && at < to;
const sectionMatch = (r: { sectionId: string | null }, section: string | null) =>
  section === null ? true : section === "none" ? r.sectionId === null : r.sectionId === section;

/** Every Appendix B figure over one window and one section. */
export function figuresFor(
  rows: readonly ReportRow[],
  targets: Targets,
  from: Date,
  to: Date,
  section: string | null,
): Figures {
  const mine = rows.filter((r) => sectionMatch(r, section) && inWin(r.at, from, to));
  const spec = mine.filter((r) => r.kind === "specimen");
  const rel = mine.filter((r) => r.kind === "released" && !r.bedside);
  const tats = rel.flatMap((r) =>
    r.receivedAt ? [Math.round((r.at!.getTime() - r.receivedAt.getTime()) / MIN)] : [],
  );
  let late = 0;
  let withStated = 0;
  for (const r of rel) {
    const t = r.testCode ? targets[r.testCode] : undefined;
    if (t === undefined || !r.receivedAt) continue;
    withStated++;
    if ((r.at!.getTime() - r.receivedAt.getTime()) / MIN > t) late++;
  }
  const cri = mine.filter((r) => r.kind === "critical");
  const acked = cri.filter((r) => r.doneAt);
  const rej = spec.filter((r) => r.flag);
  const reasons = new Map<string, number>();
  for (const r of rej) if (r.reason) reasons.set(r.reason, (reasons.get(r.reason) ?? 0) + 1);
  const topReason =
    [...reasons.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
  return {
    received: spec.length,
    released: rel.length,
    tatMedian: median(tats),
    late,
    withStated,
    criticals: cri.length,
    criticalsAcked: acked.length,
    ackMedian: median(acked.map((r) => Math.round((r.doneAt!.getTime() - r.at!.getTime()) / MIN))),
    rejected: rej.length,
    topReason,
  };
}

/** True when any row exists in the window: an empty earlier window is "No earlier data", never 0 (TD-2). */
const hasData = (rows: readonly ReportRow[], from: Date, to: Date) =>
  rows.some((r) => inWin(r.at, from, to));

export function todaySnapshot(i: TodayInput): TodaySnapshot {
  const { now, timeZone: tz, rows, targets, section } = i;
  const dayStart = localDayStart(now, tz);
  const days = PERIOD_DAYS[i.period];
  const from = i.period === "today" ? dayStart : new Date(dayStart.getTime() - (days - 1) * DAY);
  const figures = figuresFor(rows, targets, from, now, section);

  // Comparison: today against the same weekday a week earlier at the same clock time; longer periods against
  // the window just before.
  const shift = i.period === "today" ? 7 * DAY : days * DAY;
  const bFrom = new Date(from.getTime() - shift);
  const bTo = new Date(now.getTime() - shift);
  const before = hasData(rows, bFrom, bTo) ? figuresFor(rows, targets, bFrom, bTo, section) : null;

  let spark: TodaySnapshot["spark"] = null;
  if (i.period === "today") {
    const pts = [6, 5, 4, 3, 2, 1, 0].map((k) => {
      const f = new Date(dayStart.getTime() - k * 7 * DAY);
      const t = new Date(now.getTime() - k * 7 * DAY);
      return hasData(rows, f, t) || k === 0 ? figuresFor(rows, targets, f, t, section) : null;
    });
    spark = {
      received: pts.map((p) => p?.received ?? null),
      released: pts.map((p) => p?.released ?? null),
      tatMedian: pts.map((p) => p?.tatMedian ?? null),
      late: pts.map((p) => p?.late ?? null),
      criticals: pts.map((p) => p?.criticals ?? null),
      rejected: pts.map((p) => p?.rejected ?? null),
    };
  }

  // Hero: the worklist now (the stages, the clock and late are the worklist's and the turnaround engine's).
  const wl = i.worklist.filter((r) => sectionMatch(r, section));
  const waits = wl.map((r) =>
    r.clock.kind === "not_received" ? r.clock.sinceCollection : r.clock.elapsed,
  );
  const lateNow = wl.filter((r) => r.clock.kind === "running" && r.clock.lateBy !== null).length;

  // Per hour, today: received and first released per local hour from opening to now; the current hour partial.
  const today = rows.filter((r) => sectionMatch(r, section) && inWin(r.at, dayStart, now));
  const nowHour = localHour(now, tz);
  const firstHour = Math.min(
    i.openingHour ?? 7,
    nowHour,
    ...today
      .filter((r) => r.kind === "specimen" || r.kind === "released")
      .map((r) => localHour(r.at!, tz)),
  );
  const hours: TodaySnapshot["hours"] = [];
  for (let h = firstHour; h <= nowHour; h++)
    hours.push({
      hour: h,
      received: today.filter((r) => r.kind === "specimen" && localHour(r.at!, tz) === h).length,
      released: today.filter(
        (r) => r.kind === "released" && !r.bedside && localHour(r.at!, tz) === h,
      ).length,
      partial: h === nowHour,
    });

  // TD-4: keeping pace when released ≥ received in each of the last two complete hours.
  const complete = hours.filter((h) => !h.partial);
  let pace: TodaySnapshot["hero"]["pace"] = null;
  if (complete.length >= 2) {
    const last2 = complete.slice(-2);
    const at = (h: number) => new Date(dayStart.getTime() + h * 3_600_000);
    const keeps = (h: (typeof complete)[number]) => h.released >= h.received;
    // The start of the run the last complete hour belongs to (keeping), or of the latest growing run.
    const runStart = (end: number, ok: (h: (typeof complete)[number]) => boolean) => {
      let k = end;
      while (k > 0 && ok(complete[k - 1]!)) k--;
      return complete[k]!.hour;
    };
    if (last2.every(keeps))
      pace = { kind: "keeping", since: at(runStart(complete.length - 1, keeps)) };
    else {
      const end = complete.map(keeps).lastIndexOf(false);
      pace = { kind: "growing", since: at(runStart(end, (h) => !keeps(h))) };
    }
  }

  // TD-5 histogram over the turnaround population of the period.
  const rel = rows.filter(
    (r) =>
      r.kind === "released" &&
      !r.bedside &&
      r.receivedAt &&
      sectionMatch(r, section) &&
      inWin(r.at, from, now),
  );
  const histogram = new Array(BUCKETS.length + 1).fill(0) as number[];
  for (const r of rel) {
    const m = (r.at!.getTime() - r.receivedAt!.getTime()) / MIN;
    const b = BUCKETS.findIndex((x) => m < x);
    histogram[b === -1 ? BUCKETS.length : b]! += 1;
  }
  const bedsideExcluded = rows.filter(
    (r) => r.kind === "released" && r.bedside && sectionMatch(r, section) && inWin(r.at, from, now),
  ).length;

  // TD-6: one line per section of the hospital (and "No section" when anything has none); totals are the sums
  // of the same rules, so they equal the hero and the key figures.
  const ids: (string | null)[] = [...i.sections.map((s) => s.id)];
  const hasNone =
    i.worklist.some((r) => r.sectionId === null) ||
    rows.some((r) => r.sectionId === null && inWin(r.at, from, now) && r.kind !== "qc_run");
  if (hasNone) ids.push(null);
  const shown =
    section === null
      ? ids
      : ids.filter((id) => (section === "none" ? id === null : id === section));
  const line = (sid: string | null | undefined): SectionLine => {
    const key = sid === undefined ? section : sid === null ? "none" : sid;
    const f = figuresFor(rows, targets, from, now, key);
    const w = i.worklist.filter((r) => sectionMatch(r, key));
    return {
      sectionId: sid ?? null,
      inLab: w.length,
      released: f.released,
      lateNow: w.filter((r) => r.clock.kind === "running" && r.clock.lateBy !== null).length,
      tatMedian: f.tatMedian,
      past: f.late,
      rejected: f.rejected,
      qc: worstQc(i.qc.filter((q) => sectionMatch(q, key)).map((q) => q.status)),
    };
  };

  return {
    asOf: now,
    compareDay: new Date(now.getTime() - shift),
    period: i.period,
    hero: {
      inLab: wl.length,
      toReceive: wl.filter((r) => r.stage === "to_receive").length,
      toResult: wl.filter((r) => r.stage === "to_result").length,
      preliminary: wl.filter((r) => r.stage === "preliminary").length,
      outAtPartners: i.outAtPartners,
      oldestMinutes: waits.length ? Math.max(...waits) : null,
      lateNow,
      pace,
    },
    figures,
    before,
    spark,
    hours,
    histogram,
    bedsideExcluded,
    sections: shown.map((s) => line(s)),
    totals: line(undefined),
  };
}

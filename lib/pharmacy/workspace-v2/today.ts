import type { ReviewLane, ReviewStage } from "@/lib/pharmacy/queue";
import { computeReviewQueue, servesRow } from "@/lib/pharmacy/queue";
import {
  localDateKey,
  localWeekdayAndMinutes,
  startOfLocalDay,
} from "@/supabase/functions/_shared/slots";

/**
 * Today (GATE A §6, D-PW-11): the read model behind /pharmacy/today. Pure: plain rows from `today-read.ts` plus
 * `now` in, figures out. Days and hours are local in the time zone passed (DEFAULT_TIME_ZONE in the app). Lateness
 * is never decided here: a stage is late only by the queue's own divider (`earlier`, written before today).
 */

const DAY_MS = 86_400_000;

export interface QueueIn {
  key: string;
  origin: "window" | "ward";
  stage: ReviewStage;
  lane: ReviewLane;
  reasons: readonly string[];
  writtenAt: string;
  queriedSince: string | null;
  earlier: boolean;
}

export interface PointIn {
  id: string;
  name: string;
  serves: string;
  liveAt: Date | string | null;
  switchedOffAt: Date | string | null;
}

export interface TodayRows {
  queue: readonly QueueIn[];
  /** Prescriptions in scope written in the window (each its origin). */
  arrivals: readonly { origin: "window" | "ward"; at: string }[];
  handovers: readonly { pointId: string; at: string }[];
  /** `owed` and `buying_outside` line events. */
  notOnShelf: readonly { pointId: string | null; at: string; kind: string }[];
  stockouts: readonly { pointId: string; medicineId: string; startedAt: string; endedAt: string | null }[];
  /** VEN `V` medicine ids; null while no national list is imported ("Not set"). */
  vital: ReadonlySet<string> | null;
  /** Flagged look-backs; `open` while no "looked" row follows. */
  lookBacks: readonly { pointId: string | null; at: string; open: boolean }[];
  differences: readonly { pointId: string; recordedAt: string; closedAt: string | null }[];
  /** Refill lines in the "to prepare" tab now (no history exists); null when refills are off ("No data"). */
  refills: readonly { pointId: string | null }[] | null;
}

export const STAGE_ORDER: readonly ReviewStage[] = ["to_review", "ready", "queried", "awaiting_cosign"];

export interface Figure {
  /** null: "No data" or, for vital, "Not set". */
  value: number | null;
  /** Seven local days, oldest first, today last; null when there is no history. */
  week: number[] | null;
  /** Today against the same weekday last week; null: "No earlier data". */
  change: number | null;
}

export type PointState = "live" | "notLive" | "off";

export interface PointLine {
  id: string;
  name: string;
  queue: number;
  supplied: number;
  vitalOut: number | null;
  state: PointState;
}

const ms = (x: string | Date) => new Date(x).getTime();
const min = (xs: number[]) => (xs.length ? Math.min(...xs) : null);

export const pointState = (p: Pick<PointIn, "liveAt" | "switchedOffAt">): PointState =>
  p.switchedOffAt ? "off" : p.liveAt ? "live" : "notLive";

/** Eight local day keys, oldest first: the same weekday last week, then the seven bars ending today. */
export function dayKeys(now: Date, timeZone: string): string[] {
  return Array.from({ length: 8 }, (_, i) => localDateKey(new Date(now.getTime() - (7 - i) * DAY_MS), timeZone));
}

// ponytail: day ends by key + 1 day of ms; exact for Africa/Kampala (no DST). Use endOfLocalDay for a DST zone.
function dayEnds(now: Date, timeZone: string): number[] {
  const end = startOfLocalDay(now, timeZone).getTime() + DAY_MS;
  return Array.from({ length: 8 }, (_, i) => Math.min(end - (7 - i) * DAY_MS, now.getTime()));
}

function series(keys: readonly string[], ats: readonly string[], timeZone: string): number[] {
  const n = new Map<string, number>();
  for (const a of ats) {
    const k = localDateKey(new Date(a), timeZone);
    n.set(k, (n.get(k) ?? 0) + 1);
  }
  return keys.map((k) => n.get(k) ?? 0);
}

const dayFigure = (s: number[]): Figure => ({ value: s[7]!, week: s.slice(1), change: s[7]! - s[0]! });

export function todayFigures(
  rows: TodayRows,
  o: { points: readonly PointIn[]; scope: "all" | string; now: Date; timeZone: string },
) {
  const { now, timeZone } = o;
  const ids = new Set(o.points.map((p) => p.id));
  const point = o.scope === "all" ? null : (o.points.find((p) => p.id === o.scope) ?? null);
  /** A row belongs to the scope: its point, or (all) any of the viewer's points or none recorded. */
  const at = (pointId: string | null) =>
    point ? pointId === point.id : pointId === null || ids.has(pointId);

  const q = computeReviewQueue(rows.queue, { lane: "all", stage: "all", serves: point?.serves ?? null });
  const inScope = [...q.today, ...q.earlier];
  const stages = STAGE_ORDER.map((stage) => {
    const here = inScope.filter((r) => r.stage === stage);
    const since = here.map((r) => ms(stage === "queried" ? (r.queriedSince ?? r.writtenAt) : r.writtenAt));
    const oldest = min(since);
    return {
      stage,
      n: q.stageCounts[stage],
      oldestMin: oldest === null ? null : Math.max(0, Math.floor((now.getTime() - oldest) / 60_000)),
      late: here.some((r) => r.earlier),
    };
  });

  const todayKey = localDateKey(now, timeZone);
  const hourOf = (a: string) => Math.floor(localWeekdayAndMinutes(new Date(a), timeZone).minutesOfDay / 60);
  const isToday = (a: string) => localDateKey(new Date(a), timeZone) === todayKey && ms(a) <= now.getTime();
  const arrived = rows.arrivals
    .filter((a) => isToday(a.at) && servesRow(point?.serves ?? null, a.origin))
    .map((a) => hourOf(a.at));
  const supplied = rows.handovers.filter((h) => at(h.pointId) && isToday(h.at)).map((h) => hourOf(h.at));
  const nowHour = hourOf(now.toISOString());
  const first = Math.min(8, nowHour, ...arrived, ...supplied);
  const hours = Array.from({ length: Math.max(0, nowHour - first + 1) }, (_, i) => {
    const hour = first + i;
    return {
      hour,
      arrived: arrived.filter((h) => h === hour).length,
      supplied: supplied.filter((h) => h === hour).length,
      partial: hour === nowHour,
    };
  });

  const keys = dayKeys(now, timeZone);
  const ends = dayEnds(now, timeZone);
  const vitalAt = (pointOk: (id: string) => boolean, t: number) =>
    rows.vital === null
      ? null
      : new Set(
          rows.stockouts
            .filter(
              (s) =>
                pointOk(s.pointId) &&
                rows.vital!.has(s.medicineId) &&
                ms(s.startedAt) < t &&
                (s.endedAt === null || ms(s.endedAt) >= t),
            )
            .map((s) => `${s.pointId}:${s.medicineId}`),
        ).size;
  const vitalSeries = ends.map((t) => vitalAt(at, t));

  const shelf = rows.notOnShelf.filter((e) => at(e.pointId));
  const flagged = rows.lookBacks.filter((l) => at(l.pointId));
  const diffs = rows.differences.filter((d) => at(d.pointId));
  const figures = {
    supplied: dayFigure(series(keys, rows.handovers.filter((h) => at(h.pointId)).map((h) => h.at), timeZone)),
    notOnShelf: dayFigure(series(keys, shelf.map((e) => e.at), timeZone)),
    boughtOutside: series(keys, shelf.filter((e) => e.kind === "buying_outside").map((e) => e.at), timeZone)[7]!,
    vitalOut:
      rows.vital === null
        ? ({ value: null, week: null, change: null } satisfies Figure)
        : ({
            value: vitalSeries[7]!,
            week: vitalSeries.slice(1) as number[],
            change: vitalSeries[7]! - vitalSeries[0]!,
          } satisfies Figure),
    lookBack: {
      value: flagged.filter((l) => l.open).length,
      week: series(keys, flagged.map((l) => l.at), timeZone).slice(1),
      change: null,
    } satisfies Figure,
    controlled: {
      value: diffs.filter((d) => d.closedAt === null).length,
      week: series(keys, diffs.map((d) => d.recordedAt), timeZone).slice(1),
      change: null,
    } satisfies Figure,
    refills: {
      value: rows.refills ? rows.refills.filter((r) => at(r.pointId)).length : null,
      week: null,
      change: null,
    } satisfies Figure,
  };

  const points: PointLine[] = o.points.map((p) => ({
    id: p.id,
    name: p.name,
    queue: computeReviewQueue(rows.queue, { lane: "all", stage: "all", serves: p.serves }).total,
    supplied: rows.handovers.filter((h) => h.pointId === p.id && isToday(h.at)).length,
    vitalOut: vitalAt((id) => id === p.id, now.getTime()),
    state: pointState(p),
  }));

  return { waiting: q.total, stages, hours, figures, points };
}

export type TodayFigures = ReturnType<typeof todayFigures>;


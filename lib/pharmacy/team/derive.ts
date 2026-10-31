/**
 * Team (rework PRD §6.6, prototype productivity.js `TeamView`): workload and quality per person and shift, and
 * prescriptions per hour of the day. Pure. Everyone sees their own row; the in-charge sees all (TECH-SPEC §5).
 */
export type Shift = "day" | "night";

export interface TeamEvent {
  userId: string;
  who: string;
  at: string;
  type: "rx" | "mv" | "count";
  late: boolean;
  noWitness: boolean;
  matched: boolean | null;
}

export interface RosterLine {
  userId: string;
  shift: "day" | "night" | "call";
  dateFrom: string;
  dateTo: string;
}

/** Signed handovers and closed cases from Controls, per person, when those tables are in use. */
export interface Extras {
  handovers: Map<string, number>;
  cases: Map<string, { closed: number; owned: number }>;
}

export interface TeamRow {
  userId: string;
  who: string;
  shift: Shift;
  rx: number;
  hours: number | null;
  perHour: number | null;
  countsMatched: number;
  countLines: number;
  late: number;
  noWitness: number;
  handovers: number | null;
  cases: { closed: number; owned: number } | null;
}

const HOUR = 3_600_000;
/** Kampala hour of day (UTC+3). */
export const hourOf = (iso: string) => new Date(new Date(iso).getTime() + 3 * HOUR).getUTCHours();
export const shiftOf = (iso: string, dayStarts: number, nightStarts: number): Shift => {
  const h = hourOf(iso);
  return h >= dayStarts && h < nightStarts ? "day" : "night";
};

/** Hours on the roster per person and shift between two dates (inclusive). On call counts as day and night hours. */
export function rosterHours(
  lines: readonly RosterLine[],
  from: string,
  to: string,
  hours: { day: number; night: number; call: number },
) {
  const out = new Map<string, number>();
  const days = (a: string, b: string) =>
    Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000) + 1);
  for (const l of lines) {
    const n = days(l.dateFrom > from ? l.dateFrom : from, l.dateTo < to ? l.dateTo : to);
    if (!n) continue;
    const add = (s: Shift, h: number) =>
      out.set(`${l.userId}|${s}`, (out.get(`${l.userId}|${s}`) ?? 0) + n * h);
    if (l.shift === "call") {
      add("day", hours.day);
      add("night", hours.call - hours.day);
    } else add(l.shift, hours[l.shift]);
  }
  return out;
}

export function teamRows(
  events: readonly TeamEvent[],
  hours: Map<string, number>,
  extras: Extras | null,
  o: { dayStarts: number; nightStarts: number },
): TeamRow[] {
  const rows = new Map<string, TeamRow>();
  for (const e of events) {
    const shift = shiftOf(e.at, o.dayStarts, o.nightStarts);
    const k = `${e.userId}|${shift}`;
    const r =
      rows.get(k) ??
      ({
        userId: e.userId,
        who: e.who,
        shift,
        rx: 0,
        hours: hours.get(k) ?? null,
        perHour: null,
        countsMatched: 0,
        countLines: 0,
        late: 0,
        noWitness: 0,
        handovers: extras ? (extras.handovers.get(e.userId) ?? 0) : null,
        cases: extras ? (extras.cases.get(e.userId) ?? { closed: 0, owned: 0 }) : null,
      } satisfies TeamRow);
    if (e.type === "rx") r.rx += 1;
    if (e.type === "count") {
      r.countLines += 1;
      if (e.matched) r.countsMatched += 1;
    }
    if (e.late) r.late += 1;
    if (e.noWitness) r.noWitness += 1;
    rows.set(k, r);
  }
  return [...rows.values()]
    .map((r) => ({ ...r, perHour: r.hours ? Math.round((r.rx / r.hours) * 10) / 10 : null }))
    .sort((a, b) => b.rx - a.rx || a.who.localeCompare(b.who));
}

/** Prescriptions handed over per hour of the day, averaged over `days`. */
export function perHourOfDay(rxAt: readonly string[], days: number): number[] {
  const out = Array.from({ length: 24 }, () => 0);
  for (const at of rxAt) out[hourOf(at)]! += 1;
  return out.map((n) => Math.round((n / Math.max(1, days)) * 10) / 10);
}

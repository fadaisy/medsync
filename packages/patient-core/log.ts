import type { ReadingInput, SugarContext } from "./readings";

import { SUGAR_CONTEXT_WORDS } from "./readings";

/**
 * The patient's own log, `personal_health_logs` (ADR 0342), read the way the phone reads it: the calendar
 * helpers, readings from rows, mood, water and minutes moved. Moved here verbatim from the phone's pure
 * halves of `mobile/src/data/{health-log,readings,mood,activity}.ts`; the phone re-exports these once its
 * files switch over. Days are the reader's own clock, as on the phone and `lib/patient/doses.ts`.
 */

export type LogKind =
  | "bp"
  | "glucose"
  | "weight"
  | "pulse"
  | "mood"
  | "water"
  | "activity"
  | "steps"
  | "exercise"
  | "meal"
  | "symptom"
  | "note"
  | "spo2"
  | "temperature"
  | "other";

export interface LogRow {
  id: string;
  kind: LogKind;
  /** ISO instant. */
  recordedAt: string;
  v1: number | null;
  v2: number | null;
  unit: string | null;
  note: string | null;
}

/* ─── calendar ─────────────────────────────────────────────────────────── */

/** "2026-10-17" in the reader's own zone. */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The latest row of `kind` on each day, by `dayKey`. Rows come newest first. */
export function latestByDay(rows: LogRow[], kind: LogKind): Map<string, LogRow> {
  const out = new Map<string, LogRow>();
  for (const r of rows) {
    if (r.kind !== kind) continue;
    const k = dayKey(new Date(r.recordedAt));
    if (!out.has(k)) out.set(k, r);
  }
  return out;
}

/** The seven days ending today, oldest first. */
export function lastDays(now: Date, n = 7): Date[] {
  return Array.from(
    { length: n },
    (_, i) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - (n - 1) + i),
  );
}

/* ─── readings ─────────────────────────────────────────────────────────── */

export interface SavedReading {
  id: string;
  input: ReadingInput;
  at: string;
  feel: string[];
}

const MGDL_PER_MMOL = 18.016;
const KG_PER_LB = 0.45359237;
const round1 = (n: number) => Math.round(n * 10) / 10;

/** `key:value` tokens in a note, split on ";". */
function noteTokens(note: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (note ?? "").split(";")) {
    const m = /^\s*([a-z]+):(.*)$/.exec(part);
    if (m) out[m[1]!] = m[2]!.trim();
  }
  return out;
}

const isContext = (v: string | undefined): v is SugarContext =>
  !!v && Object.prototype.hasOwnProperty.call(SUGAR_CONTEXT_WORDS, v);

/** A row (the phone's or the web's) to a reading, or null for a row that is not one. */
export function rowToReading(row: LogRow): SavedReading | null {
  const tokens = noteTokens(row.note);
  const feel = tokens.feel ? tokens.feel.split(",").filter(Boolean) : [];
  const base = { id: row.id, at: row.recordedAt, feel };
  if (row.v1 === null) return null;
  switch (row.kind) {
    case "bp":
      if (row.v2 === null) return null;
      return { ...base, input: { kind: "bp", top: row.v1, bottom: row.v2 } };
    case "glucose": {
      const mmol = row.unit === "mg/dL" ? round1(row.v1 / MGDL_PER_MMOL) : row.v1;
      const context = isContext(tokens.context) ? tokens.context : "random";
      return { ...base, input: { kind: "sugar", value: mmol, context } };
    }
    case "weight": {
      const kg = row.unit === "lb" ? round1(row.v1 * KG_PER_LB) : row.v1;
      return { ...base, input: { kind: "weight", value: kg } };
    }
    case "pulse":
      return { ...base, input: { kind: "pulse", value: row.v1 } };
    default:
      return null;
  }
}

export function readingsFrom(rows: LogRow[]): SavedReading[] {
  return rows.flatMap((r) => {
    const reading = rowToReading(r);
    return reading ? [reading] : [];
  });
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const hhmmOf = (d: Date) =>
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/** "today 07:40", "yesterday 20:10", "Saturday 07:12", "3 Oct". */
export function whenWords(iso: string, now: Date): string {
  const d = new Date(iso);
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const ago = Math.round((day(now) - day(d)) / 86_400_000);
  if (ago === 0) return `today ${hhmmOf(d)}`;
  if (ago === 1) return `yesterday ${hhmmOf(d)}`;
  if (ago < 7) return `${DAYS[d.getDay()]} ${hhmmOf(d)}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/* ─── mood ─────────────────────────────────────────────────────────────── */

export type Mood = "good" | "okay" | "low" | "none";
export type DayMood = Exclude<Mood, "none">;

/** Kind 'mood': value 1 not well, 2 okay, 3 good (migration 0170). */
export const MOOD_VALUE: Record<DayMood, number> = { low: 1, okay: 2, good: 3 };

export function moodOf(row: LogRow): DayMood | null {
  return row.v1 === 1 ? "low" : row.v1 === 2 ? "okay" : row.v1 === 3 ? "good" : null;
}

/** Each day's mood (or "none"), for the given days in order. */
export function moodsFor(rows: LogRow[], days: Date[]): Mood[] {
  const byDay = latestByDay(rows, "mood");
  return days.map((d) => {
    const row = byDay.get(dayKey(d));
    return (row && moodOf(row)) ?? "none";
  });
}

/** The days of this month so far, the 1st first, today last. */
export function monthDays(now: Date): Date[] {
  return Array.from(
    { length: now.getDate() },
    (_, i) => new Date(now.getFullYear(), now.getMonth(), i + 1),
  );
}

/** Share of good, okay and not-well days for each month of this year so far, in percent; null for none. */
export function yearMix(rows: LogRow[], now: Date): ([number, number, number] | null)[] {
  const counts = Array.from({ length: now.getMonth() + 1 }, () => ({ good: 0, okay: 0, low: 0 }));
  for (const [key, row] of latestByDay(rows, "mood")) {
    const [y, m] = key.split("-").map(Number);
    const mood = moodOf(row);
    const c = m ? counts[m - 1] : undefined;
    if (y === now.getFullYear() && mood && c) c[mood]++;
  }
  return counts.map((c) => {
    const n = c.good + c.okay + c.low;
    if (!n) return null;
    const pct = (x: number) => Math.round((x / n) * 100);
    return [pct(c.good), pct(c.okay), pct(c.low)];
  });
}

export function countMoods(days: Mood[]): Record<DayMood, number> {
  const out: Record<DayMood, number> = { good: 0, okay: 0, low: 0 };
  for (const d of days) if (d !== "none") out[d]++;
  return out;
}

/* ─── move and water ───────────────────────────────────────────────────── */

/** A common adult goal (150 minutes of brisk walking a week), not one set for this patient. */
export const DAY_GOAL = 30;
export const GLASSES = 8;
/** A common daily step aim for adults (Paluch AE et al., Lancet Public Health 2022), not this patient's target. */
export const STEP_AIM = 7000;

/** Each day's step total: the latest 'steps' row of the day (the phone's counter only grows). */
export function stepsOn(rows: LogRow[], days: Date[]): number[] {
  const latest = latestByDay(rows, "steps");
  return days.map((d) => latest.get(dayKey(d))?.v1 ?? 0);
}

/** Glasses today: the latest water row of the day, or none. */
export function waterOn(rows: LogRow[], day: Date): number {
  return latestByDay(rows, "water").get(dayKey(day))?.v1 ?? 0;
}

/** Minutes moved on each of the given days: quick walks ('activity') and logged activities ('exercise'). */
export function minutesOn(rows: LogRow[], days: Date[]): number[] {
  const sums = new Map<string, number>();
  for (const r of rows)
    if ((r.kind === "activity" || r.kind === "exercise") && r.v1 !== null) {
      const k = dayKey(new Date(r.recordedAt));
      sums.set(k, (sums.get(k) ?? 0) + r.v1);
    }
  return days.map((d) => sums.get(dayKey(d)) ?? 0);
}

import type { LogRow, NewLog } from "@/data/health-log";
import type { ReadingInput, ReadingKind, SugarContext } from "@/lib/readings";
import type { SaveResult } from "@/offline/outbox";

import { addLog, useHealthLog } from "@/data/health-log";
import { track } from "@/lib/analytics";
import { readingValueText, SUGAR_CONTEXT_WORDS } from "@/lib/readings";

/**
 * Readings the patient logs, in `personal_health_logs` (ADR 0342). Only the
 * patient can read them: no clinician sees this table, and a danger reading
 * alerts nobody, so the screens send the patient to Help instead.
 *
 * Row shapes, the same as the web's `/patient/track` form:
 * - bp      → kind 'bp', value 1 the top number, value 2 the bottom, 'mmHg'
 * - sugar   → kind 'glucose', 'mmol/L'; the time of day goes in the note as
 *             `context:fasting`. The web lets a patient pick mg/dL, so a
 *             mg/dL row is converted when read.
 * - weight  → kind 'weight', 'kg' (a web row in lb is converted)
 * - pulse   → kind 'pulse', 'bpm' (needs migration 0170)
 * The "How do you feel?" chips ride in the same row's note as
 * `feel:dizzy,head`: one reading stays one row, and the web shows the note
 * under the value.
 */
export interface SavedReading {
  id: string;
  input: ReadingInput;
  at: string;
  feel: string[];
}

const MGDL_PER_MMOL = 18.016;
const KG_PER_LB = 0.45359237;
const round1 = (n: number) => Math.round(n * 10) / 10;

const DB_KIND: Record<ReadingKind, NewLog["kind"]> = {
  bp: "bp",
  sugar: "glucose",
  weight: "weight",
  pulse: "pulse",
};

/** `key:value` tokens in a note, split on ";". */
function noteTokens(note: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (note ?? "").split(";")) {
    const m = /^\s*([a-z]+):(.*)$/.exec(part);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

const isContext = (v: string | undefined): v is SugarContext =>
  !!v && Object.prototype.hasOwnProperty.call(SUGAR_CONTEXT_WORDS, v);

/** A reading to the row it is saved as. */
export function readingToRow(input: ReadingInput, feel: string[] = []): NewLog {
  const tokens = [
    input.kind === "sugar" ? `context:${input.context}` : null,
    feel.length ? `feel:${feel.join(",")}` : null,
  ].filter(Boolean);
  const note = tokens.length ? tokens.join("; ") : null;
  if (input.kind === "bp")
    return { kind: "bp", v1: input.top, v2: input.bottom, unit: "mmHg", note };
  const unit = input.kind === "sugar" ? "mmol/L" : input.kind === "weight" ? "kg" : "bpm";
  return { kind: DB_KIND[input.kind], v1: input.value, unit, note };
}

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

/** The "Last time" line under the number: the patient's own last reading of this kind. */
export function lastTimeLine(readings: SavedReading[], kind: ReadingKind, now: Date): string {
  const last = readings.find((r) => r.input.kind === kind);
  if (!last) return "No reading of this kind yet";
  const ctx = last.input.kind === "sugar" ? ` · ${SUGAR_CONTEXT_WORDS[last.input.context]}` : "";
  return `${readingValueText(last.input)}${ctx} · ${whenWords(last.at, now)}`;
}

export type StartValues = Record<"top" | "bottom" | "sugar" | "weight" | "pulse", string>;

/** A fresh form starts from the patient's last reading of each kind, or empty: never an invented number. */
export function startValues(readings: SavedReading[]): StartValues {
  const out: StartValues = { top: "", bottom: "", sugar: "", weight: "", pulse: "" };
  for (const r of [...readings].reverse()) {
    const i = r.input;
    if (i.kind === "bp") {
      out.top = String(i.top ?? "");
      out.bottom = String(i.bottom ?? "");
    } else out[i.kind] = String(i.value ?? "");
  }
  return out;
}

export const readingsRepo = {
  /** Save. `entry` and `taps` feed the "two taps or fewer" metric. */
  save(
    input: ReadingInput,
    opts: { entry: "sheet" | "page"; taps: number; feel?: string[] },
  ): Promise<SaveResult> {
    track("reading_saved", { entry: opts.entry, taps: opts.taps, kind: input.kind });
    return addLog(readingToRow(input, opts.feel ?? []));
  },
};

/** Real readings, newest first, with the log's loading state. */
export function useReadings() {
  const log = useHealthLog();
  return { ...log, readings: readingsFrom(log.rows) };
}

/** Real readings, newest first. */
export function useSavedReadings(): SavedReading[] {
  return useReadings().readings;
}

import type { ReadingInput, ReadingKind, ReadingLevel, SugarContext } from "@patient-core/readings";
import {
  checkReading,
  parseReading,
  readingValueText,
  SUGAR_CONTEXT_WORDS,
} from "@patient-core/readings";

/**
 * Log a reading on the web: the small pure rules around `checkReading` (which stays the one classifier, in
 * `@patient-core/readings`). Ported from the phone where the phone keeps them outside patient-core:
 * `mobile/src/data/readings.ts` (row shape, start values, "Last time"), `features/care/logic.ts` (`saveButton`)
 * and `features/safety/danger.ts` (`readingFromParams`). They belong in patient-core; until they move, the
 * phone's copies and these must say the same thing.
 */

export type StartValues = Record<"top" | "bottom" | "sugar" | "weight" | "pulse", string>;

export interface SavedReading {
  input: ReadingInput;
  at: string;
}

/** A row of `personal_health_logs` as `listRecentReadings` returns it. */
export interface LogRowLike {
  kind: string;
  recordedAtIso: string;
  numericValue1: string | number | null;
  numericValue2: string | number | null;
  unit: string | null;
  note: string | null;
}

const MGDL_PER_MMOL = 18.016;
const KG_PER_LB = 0.45359237;
const round1 = (n: number) => Math.round(n * 10) / 10;
const num = (v: string | number | null) => (v === null ? null : Number(v));

/** The form from typed values. */
export function readingInput(
  kind: ReadingKind,
  values: StartValues,
  context: SugarContext,
): ReadingInput {
  if (kind === "bp")
    return { kind, top: parseReading(values.top), bottom: parseReading(values.bottom) };
  if (kind === "sugar") return { kind, value: parseReading(values.sugar), context };
  return { kind, value: parseReading(values[kind]) };
}

/** The live check band: the level and the words under the number. Empty reads as the stepper hint. */
export function readingBand(input: ReadingInput): {
  level: ReadingLevel;
  text: string;
  selfCare?: string;
} {
  const c = checkReading(input);
  return {
    level: c.level,
    text: c.level === "empty" ? "Type your number, or use − and +" : c.text,
    selfCare: c.selfCare,
  };
}

/** The Save button (phone `saveButton`): disabled while empty unless Chest pain is picked, which still helps. */
export function saveButton(
  level: ReadingLevel,
  chestPain: boolean,
): { disabled: boolean; help: boolean; label: string } {
  const help = level === "danger" || chestPain;
  return {
    disabled: level === "empty" && !chestPain,
    help,
    label: help ? "Save and get help" : "Save reading",
  };
}

/** The recheck wait: 15 minutes after something sweet for a low sugar, else 5 (Step 3). */
export const recheckMinutes = (input: ReadingInput) => (checkReading(input).selfCare ? 15 : 5);

/** A reading to the row it is saved as (phone `readingToRow`): context and feelings ride in the note. */
export function readingToRow(input: ReadingInput, feel: string[] = []) {
  const tokens = [
    input.kind === "sugar" ? `context:${input.context}` : null,
    feel.length ? `feel:${feel.join(",")}` : null,
  ].filter(Boolean);
  const note = tokens.length ? tokens.join("; ") : null;
  if (input.kind === "bp")
    return { kind: "bp", v1: input.top, v2: input.bottom, unit: "mmHg", note };
  const kind = input.kind === "sugar" ? "glucose" : input.kind;
  const unit = input.kind === "sugar" ? "mmol/L" : input.kind === "weight" ? "kg" : "bpm";
  return { kind, v1: input.value, v2: null, unit, note };
}

/** A log row (the phone's or the web's) to a reading, or null (phone `rowToReading`). */
export function rowToReading(row: LogRowLike): SavedReading | null {
  const v1 = num(row.numericValue1);
  const v2 = num(row.numericValue2);
  if (v1 === null) return null;
  const at = row.recordedAtIso;
  const ctx = /(?:^|;)\s*context:([a-z]+)/.exec(row.note ?? "")?.[1];
  switch (row.kind) {
    case "bp":
      return v2 === null ? null : { at, input: { kind: "bp", top: v1, bottom: v2 } };
    case "glucose": {
      const value = row.unit === "mg/dL" ? round1(v1 / MGDL_PER_MMOL) : v1;
      const context = ctx && ctx in SUGAR_CONTEXT_WORDS ? (ctx as SugarContext) : "random";
      return { at, input: { kind: "sugar", value, context } };
    }
    case "weight":
      return {
        at,
        input: { kind: "weight", value: row.unit === "lb" ? round1(v1 * KG_PER_LB) : v1 },
      };
    case "pulse":
      return { at, input: { kind: "pulse", value: v1 } };
    default:
      return null;
  }
}

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

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const hhmm = (d: Date) =>
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/** "today 07:40", "yesterday 20:10", "Saturday 07:12", "3 Oct". */
export function whenWords(iso: string, now: Date): string {
  const d = new Date(iso);
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const ago = Math.round((day(now) - day(d)) / 86_400_000);
  if (ago === 0) return `today ${hhmm(d)}`;
  if (ago === 1) return `yesterday ${hhmm(d)}`;
  if (ago < 7) return `${DAYS[d.getDay()]} ${hhmm(d)}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** The "Last time" line: the patient's own last reading of this kind. Readings come newest first. */
export function lastTimeLine(readings: SavedReading[], kind: ReadingKind, now: Date): string {
  const last = readings.find((r) => r.input.kind === kind);
  if (!last) return "No reading of this kind yet";
  const ctx = last.input.kind === "sugar" ? ` · ${SUGAR_CONTEXT_WORDS[last.input.context]}` : "";
  return `${readingValueText(last.input)}${ctx} · ${whenWords(last.at, now)}`;
}

export { hhmm };

import type { NewLog } from "@/data/health-log";
import type { ReadingInput, ReadingKind } from "@/lib/readings";
import type { SaveResult } from "@/offline/outbox";
import type { SavedReading } from "@patient-core/log";
import { readingsFrom, whenWords } from "@patient-core/log";

import { addLog, useHealthLog } from "@/data/health-log";
import { track } from "@/lib/analytics";
import { readingValueText, SUGAR_CONTEXT_WORDS } from "@/lib/readings";

export type { SavedReading } from "@patient-core/log";
export { readingsFrom, rowToReading, whenWords } from "@patient-core/log";

const DB_KIND: Record<ReadingKind, NewLog["kind"]> = {
  bp: "bp",
  sugar: "glucose",
  weight: "weight",
  pulse: "pulse",
};

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

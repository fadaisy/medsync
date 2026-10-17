import type { LogRow } from "@/data/health-log";

import { fromDb, mergeRows } from "@/data/health-log";
import { lastTimeLine, readingToRow, rowToReading, startValues, whenWords } from "@/data/readings";

const row = (r: Partial<LogRow>): LogRow => ({
  id: "1",
  kind: "bp",
  recordedAt: "2026-10-17T05:00:00.000Z",
  v1: null,
  v2: null,
  unit: null,
  note: null,
  ...r,
});

describe("reading → row", () => {
  it("blood pressure: top and bottom in mmHg", () => {
    expect(readingToRow({ kind: "bp", top: 138, bottom: 86 })).toEqual({
      kind: "bp",
      v1: 138,
      v2: 86,
      unit: "mmHg",
      note: null,
    });
  });
  it("sugar: glucose in mmol/L with the time of day and feelings in the note", () => {
    expect(
      readingToRow({ kind: "sugar", value: 7.1, context: "fasting" }, ["dizzy", "head"]),
    ).toEqual({
      kind: "glucose",
      v1: 7.1,
      unit: "mmol/L",
      note: "context:fasting; feel:dizzy,head",
    });
  });
  it("weight in kg and pulse in bpm", () => {
    expect(readingToRow({ kind: "weight", value: 85.5 })).toMatchObject({
      kind: "weight",
      unit: "kg",
    });
    expect(readingToRow({ kind: "pulse", value: 74 })).toMatchObject({
      kind: "pulse",
      unit: "bpm",
    });
  });
});

describe("row → reading", () => {
  it("round-trips the phone's own rows", () => {
    const saved = readingToRow({ kind: "sugar", value: 6.2, context: "bedtime" }, ["fine"]);
    const back = rowToReading(
      row({ kind: "glucose", v1: saved.v1, unit: saved.unit, note: saved.note }),
    );
    expect(back?.input).toEqual({ kind: "sugar", value: 6.2, context: "bedtime" });
    expect(back?.feel).toEqual(["fine"]);
  });
  it("converts a web glucose row in mg/dL, and calls an untimed one 'another time'", () => {
    expect(rowToReading(row({ kind: "glucose", v1: 126, unit: "mg/dL" }))?.input).toEqual({
      kind: "sugar",
      value: 7,
      context: "random",
    });
    expect(
      rowToReading(row({ kind: "glucose", v1: 5.4, unit: "mmol/L", note: "after lunch" }))?.input,
    ).toEqual({
      kind: "sugar",
      value: 5.4,
      context: "random",
    });
  });
  it("converts a web weight in lb", () => {
    expect(rowToReading(row({ kind: "weight", v1: 200, unit: "lb" }))?.input).toEqual({
      kind: "weight",
      value: 90.7,
    });
  });
  it("skips rows that are not readings, or have no number", () => {
    expect(rowToReading(row({ kind: "mood", v1: 3 }))).toBeNull();
    expect(rowToReading(row({ kind: "bp", v1: 120, v2: null }))).toBeNull();
    expect(rowToReading(row({ kind: "note", note: "felt fine" }))).toBeNull();
  });
  it("reads PostgREST numerics given as strings", () => {
    const r = fromDb({
      id: "x",
      kind: "bp",
      recorded_at: "2026-10-17T05:00:00Z",
      numeric_value_1: "142",
      numeric_value_2: "88.0",
      unit: "mmHg",
      note: null,
    });
    expect(rowToReading(r)?.input).toEqual({ kind: "bp", top: 142, bottom: 88 });
  });
});

describe("words and start values", () => {
  const now = new Date(2026, 9, 17, 12, 0);
  it("says when, in plain words", () => {
    expect(whenWords(new Date(2026, 9, 17, 7, 40).toISOString(), now)).toBe("today 07:40");
    expect(whenWords(new Date(2026, 9, 16, 20, 10).toISOString(), now)).toBe("yesterday 20:10");
    expect(whenWords(new Date(2026, 9, 1, 8, 0).toISOString(), now)).toBe("1 Oct");
  });
  it("a new patient starts empty, never from an invented number", () => {
    expect(startValues([])).toEqual({ top: "", bottom: "", sugar: "", weight: "", pulse: "" });
    expect(lastTimeLine([], "bp", now)).toBe("No reading of this kind yet");
  });
  it("starts from the latest reading of each kind", () => {
    const newest = {
      id: "a",
      at: now.toISOString(),
      feel: [],
      input: { kind: "bp" as const, top: 130, bottom: 80 },
    };
    const older = {
      id: "b",
      at: now.toISOString(),
      feel: [],
      input: { kind: "bp" as const, top: 150, bottom: 95 },
    };
    expect(startValues([newest, older])).toMatchObject({ top: "130", bottom: "80" });
  });
  it("merges queued rows behind server rows, once each, newest first", () => {
    const a = row({ id: "a", recordedAt: "2026-10-17T06:00:00Z" });
    const b = row({ id: "b", recordedAt: "2026-10-17T07:00:00Z" });
    expect(mergeRows([a], [a, b]).map((r) => r.id)).toEqual(["b", "a"]);
  });
});

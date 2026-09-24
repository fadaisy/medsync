import { describe, expect, it } from "vitest";

import { artefactFields, deriveMeasureFindings } from "@/lib/resus/survey/vitals-bands";
import { artefact, assess, NOW, SHOCKED, vitals } from "./survey-fixtures";

/** GATE A §5 — adults only, fresh only, artefact excluded, one GCS (SV-VIT-01, -14..16). */

const run = (tl: Parameters<typeof deriveMeasureFindings>[0], ageYears: number | null = 40) =>
  deriveMeasureFindings(tl, { ageYears, nowMs: NOW });
const gcs = (eye: number, verbal: number, motor: number) => ({ gcs: { eye, verbal, motor } });

describe("SV-VIT-14 — adults only", () => {
  it("SV-VIT-14: age 15 derives nothing", () => {
    const m = run([vitals(2, SHOCKED)], 15);
    expect([...m.A, ...m.B, ...m.C, ...m.D]).toEqual([]);
    expect(m.sourceEventId).toBeNull();
  });
  it("SV-VIT-14: unknown age derives nothing", () => {
    expect(run([vitals(2, SHOCKED)], null).C).toEqual([]);
  });
  it("SV-VIT-14: age 16 derives", () => {
    expect(run([vitals(2, SHOCKED)], 16).C).toContain("hypotension");
  });
});

describe("SV-VIT-15 — fresh only", () => {
  it("SV-VIT-15: a reading 15 min old is fresh", () => {
    expect(run([vitals(15, { hr: 130 })]).C).toEqual(["tachycardia"]);
  });
  it("SV-VIT-15: a reading 16 min old is stale", () => {
    expect(run([vitals(16, { hr: 130 })]).C).toEqual([]);
  });
  it("SV-VIT-15: the carried-in triage reading never derives, even when recent", () => {
    expect(run([vitals(1, { hr: 130 }, { carriedFromTriage: true })]).C).toEqual([]);
  });
  it("SV-VIT-15: the latest value per field wins; an older fresh field still counts", () => {
    const tl = [vitals(10, { hr: 130, rr: 32 }), vitals(2, { hr: 80 })];
    const m = run(tl);
    expect(m.C).toEqual([]);
    expect(m.B).toEqual(["rr_raised", "rr_very_high"]);
  });
  it("SV-VIT-15: sourceEventId / ageMin name the OLDEST reading used (never look fresher)", () => {
    // Tachycardia comes from the 10-min HR: "from vitals · 3 min" would misstate it.
    const a = vitals(10, { hr: 130 });
    const b = vitals(3, { rr: 30 });
    const m = run([a, b]);
    expect(m.sourceEventId).toBe(a.id);
    expect(m.ageMin).toBe(10);
  });
  it("SV-VIT-15: a newer glucose-only reading does not make a 14-min hypotension look 1 min old", () => {
    const bp = vitals(14, { systolicBp: 85, diastolicBp: 50 });
    const m = run([bp, vitals(1, { glucose: 6 })]);
    expect(m.C).toContain("hypotension");
    expect([m.sourceEventId, m.ageMin]).toEqual([bp.id, 14]);
  });
  it("SV-VIT-15: no fresh reading → null source and age", () => {
    const m = run([vitals(40, { hr: 130 })]);
    expect([m.sourceEventId, m.ageMin, m.gcsTotal]).toEqual([null, null, null]);
  });
});

describe("SV-VIT-16 — artefact", () => {
  it("SV-VIT-16: an SpO₂ annotated artefact is excluded (it stays in the record)", () => {
    const v = vitals(3, { spo2: 67 });
    expect(run([v, artefact(2, v.id, ["spo2"])]).B).toEqual([]);
  });
  it("SV-VIT-16: the latest annotation per (event, field) wins — un-marking restores", () => {
    const v = vitals(4, { spo2: 67 });
    const tl = [v, artefact(3, v.id, ["spo2"]), artefact(1, v.id, ["spo2"], false)];
    expect(run(tl).B).toEqual(["spo2_lt92"]);
  });
  it("SV-VIT-16: an artefact falls back to the previous fresh value of that field", () => {
    const old = vitals(8, { spo2: 97 });
    const v = vitals(3, { spo2: 67 });
    expect(run([old, v, artefact(2, v.id, ["spo2"])]).values.spo2).toBe(97);
  });
  it("SV-VIT-16: an artefact SBP removes hypotension, MAP, SI and pulse pressure", () => {
    const v = vitals(3, SHOCKED);
    const m = run([v, artefact(2, v.id, ["systolicBp"])]);
    expect(m.C).toEqual(["tachycardia"]);
    expect(m.values.map).toBeUndefined();
  });
  it("SV-VIT-16: only the annotated event's field is excluded", () => {
    const other = vitals(9, { hr: 60 });
    const v = vitals(3, { hr: 130 });
    expect(run([other, v, artefact(2, other.id, ["hr"])]).C).toEqual(["tachycardia"]);
  });
  it("SV-VIT-16: an artefact O₂ status blocks the on-air rule", () => {
    const v = vitals(3, { spo2: 93, oxygen: "air" });
    expect(run([v, artefact(2, v.id, ["oxygen"])]).B).toEqual([]);
  });
  it("SV-VIT-16: artefactFields ignores ordinary notes", () => {
    const n = { ...artefact(1, "x", ["hr"]), payload: { label: "note" } };
    expect(artefactFields([n]).size).toBe(0);
  });
});

describe("SV-VIT-01 — one GCS (vitals or D components, the newer)", () => {
  it("SV-VIT-01: a fresh D assessment GCS 7 (E2 V2 M3) derives A gcs_le8", () => {
    const m = run([assess("D", 2, gcs(2, 2, 3))]);
    expect(m.A).toEqual(["gcs_le8"]);
    expect(m.gcsTotal).toBe(7);
  });
  it("SV-VIT-01: a newer vitals GCS 14 beats an older D total 7", () => {
    const m = run([assess("D", 6, gcs(2, 2, 3)), vitals(2, { gcs: 14 })]);
    expect(m.A).toEqual([]);
    expect(m.gcsTotal).toBe(14);
  });
  it("SV-VIT-01: a newer D total 8 beats an older vitals GCS 14", () => {
    const m = run([vitals(6, { gcs: 14 }), assess("D", 1, gcs(2, 2, 4))]);
    expect(m.A).toEqual(["gcs_le8"]);
  });
  it("SV-VIT-01: a D assessment older than 15 min is not used", () => {
    expect(run([assess("D", 20, gcs(1, 1, 1))]).A).toEqual([]);
  });
  it("SV-VIT-01: an intubated verbal scores 1 (the engine's gcsTotal)", () => {
    const m = run([assess("D", 2, { gcs: { eye: 3, verbal: 5, motor: 4, intubated: true } })]);
    expect(m.gcsTotal).toBe(8);
    expect(m.A).toEqual(["gcs_le8"]);
  });
});

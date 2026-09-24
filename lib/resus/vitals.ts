import type { TimelineEvent } from "@/lib/resus/types";
import type { DerivedMetrics } from "@/lib/triage/types";

import { computeDerivedMetrics } from "@/lib/triage/scoring/derived";

/**
 * Resus continuous monitoring (GATE D) — PURE.
 *
 * Reconstructs the live trend + the latest snapshot + the derived metrics
 * from the timeline's `vital` events (each carries a snapshot in
 * payload.snapshot). Because it derives from the immutable record, the
 * trend is reproducible for the debrief. Derived metrics reuse the triage
 * scorer's computeDerivedMetrics — one source of truth for the formulae
 * (shock index, MAP, pulse pressure, qSOFA), no duplication/drift.
 */

export interface VitalSnapshot {
  hr?: number | null;
  rr?: number | null;
  spo2?: number | null;
  systolicBp?: number | null;
  diastolicBp?: number | null;
  temperature?: number | null;
  glucose?: number | null;
  gcs?: number | null;
  etco2?: number | null;
  urineOutput?: number | null;
  consciousness?: "A" | "C" | "V" | "P" | "U" | null;
  oxygen?: "air" | "oxygen" | null;
  /** v2: supplemental O₂ device and flow (NEWS2 needs air vs O₂). */
  o2Device?: string | null;
  o2FlowLpm?: number | null;
}

/** The numeric vitals that get a trend series + their display metadata. */
export const TREND_VITALS = [
  { key: "hr", label: "HR", unit: "/min" },
  { key: "rr", label: "RR", unit: "/min" },
  { key: "spo2", label: "SpO₂", unit: "%" },
  { key: "systolicBp", label: "SBP", unit: "mmHg" },
  { key: "diastolicBp", label: "DBP", unit: "mmHg" },
  { key: "temperature", label: "Temp", unit: "°C" },
  { key: "glucose", label: "Glucose", unit: "mmol/L" },
  { key: "etco2", label: "EtCO₂", unit: "kPa" },
] as const satisfies ReadonlyArray<{ key: keyof VitalSnapshot; label: string; unit: string }>;

export interface TrendPoint {
  t: string;
  value: number;
}
export interface TrendSeries {
  key: string;
  label: string;
  unit: string;
  points: TrendPoint[];
}

export interface ResusVitalsView {
  latest: VitalSnapshot;
  derived: DerivedMetrics;
  series: TrendSeries[];
  /** Number of vital snapshots recorded. */
  count: number;
  /** ISO of the most recent vital snapshot, or null. */
  lastAt: string | null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Map a triage `vitals_snapshot` (the raw TriageVitals stored on a
 * triage_record) into a resus VitalSnapshot, so the triage vitals can be
 * carried into the resus as the first reading. Returns null when there is
 * nothing measured to carry (a rapid-Red snapshot is `{rapid:true}`).
 */
export function vitalsFromTriageSnapshot(snapshot: unknown): VitalSnapshot | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const s = snapshot as Record<string, unknown>;
  if (s.rapid === true) return null;

  const out: VitalSnapshot = {};
  const numericMap: Record<string, keyof VitalSnapshot> = {
    respiratoryRate: "rr",
    spo2: "spo2",
    systolicBp: "systolicBp",
    diastolicBp: "diastolicBp",
    pulse: "hr",
    temperature: "temperature",
    bloodGlucose: "glucose",
  };
  for (const [src, dest] of Object.entries(numericMap)) {
    const v = num(s[src]);
    if (v !== null) (out as Record<string, unknown>)[dest] = v;
  }
  if (s.consciousness && typeof s.consciousness === "string")
    out.consciousness = s.consciousness as VitalSnapshot["consciousness"];
  if (s.oxygen === "air" || s.oxygen === "oxygen") out.oxygen = s.oxygen;

  return Object.keys(out).length > 0 ? out : null;
}

export function buildResusVitals(events: readonly TimelineEvent[]): ResusVitalsView {
  const snapshots = events
    .filter((e) => e.kind === "vital")
    .map((e) => ({
      t: e.recordedAt,
      snap: ((e.payload as { snapshot?: Record<string, unknown> }).snapshot ?? {}) as Record<
        string,
        unknown
      >,
    }))
    .sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));

  // Latest = most recent non-null value per field.
  const latest: VitalSnapshot = {};
  for (const { snap } of snapshots) {
    for (const { key } of TREND_VITALS) {
      const v = num(snap[key]);
      if (v !== null) (latest as Record<string, unknown>)[key] = v;
    }
    if (snap.consciousness)
      latest.consciousness = snap.consciousness as VitalSnapshot["consciousness"];
    if (snap.oxygen) latest.oxygen = snap.oxygen as VitalSnapshot["oxygen"];
    if (typeof snap.o2Device === "string") latest.o2Device = snap.o2Device;
    const flow = num(snap.o2FlowLpm);
    if (flow !== null) latest.o2FlowLpm = flow;
  }

  // Per-vital trend series (only vitals with at least one point).
  const series: TrendSeries[] = [];
  for (const { key, label, unit } of TREND_VITALS) {
    const points: TrendPoint[] = [];
    for (const { t, snap } of snapshots) {
      const v = num(snap[key]);
      if (v !== null) points.push({ t, value: v });
    }
    if (points.length > 0) series.push({ key, label, unit, points });
  }

  // Derived trend series (shock index, MAP) computed per snapshot — plotting
  // the existing derived data, no new maths. (Pulse pressure is NOT trended as a
  // line: its "narrow" interpretation is SBP-relative, so a context-free pulse-
  // pressure value/graph would drop that flag — it stays a flag-toned chip.)
  const siPoints: TrendPoint[] = [];
  const mapPoints: TrendPoint[] = [];
  for (const { t, snap } of snapshots) {
    const d = computeDerivedMetrics({
      pulse: num(snap.hr),
      systolicBp: num(snap.systolicBp),
      diastolicBp: num(snap.diastolicBp),
      respiratoryRate: num(snap.rr),
      consciousness: (snap.consciousness as VitalSnapshot["consciousness"]) ?? null,
      bloodGlucose: num(snap.glucose),
    });
    if (d.shockIndex !== null) siPoints.push({ t, value: Math.round(d.shockIndex * 100) / 100 });
    if (d.meanArterialPressure !== null)
      mapPoints.push({ t, value: Math.round(d.meanArterialPressure) });
  }
  if (siPoints.length > 0)
    series.push({ key: "shockIndex", label: "Shock index", unit: "", points: siPoints });
  if (mapPoints.length > 0)
    series.push({ key: "meanArterialPressure", label: "MAP", unit: "mmHg", points: mapPoints });

  const derived = computeDerivedMetrics({
    pulse: latest.hr ?? null,
    systolicBp: latest.systolicBp ?? null,
    diastolicBp: latest.diastolicBp ?? null,
    respiratoryRate: latest.rr ?? null,
    consciousness: latest.consciousness ?? null,
    bloodGlucose: latest.glucose ?? null,
  });

  return {
    latest,
    derived,
    series,
    count: snapshots.length,
    lastAt: snapshots.length > 0 ? snapshots[snapshots.length - 1]!.t : null,
  };
}

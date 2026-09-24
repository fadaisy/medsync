/**
 * Resus Desk v2 — the vitals floor: vitals-derived Measure findings (GATE A §5
 * SV-VIT-01..16; decision D18). PURE.
 *
 * Returns only the Q13 codes, from the numbers printed in their signed catalog
 * entries: adults only (≥ 16 y; unknown age → nothing), fresh only (recorded in
 * this episode ≤ 15 min ago; the carried-in triage reading never derives), and
 * a value annotated artefact is excluded. The numbers live in ONE table below,
 * each beside its rule ID and catalog code, so the CSO can audit them; the
 * test suite asserts every number appears in its catalog label.
 */
import type { TimelineEvent } from "@/lib/resus/types";

import { gcsTrend } from "@/lib/resus/disability";
import { ADULT_MIN_AGE_YEARS } from "@/lib/resus/reference/als-catalog";
import { GCS_AIRWAY_THRESHOLD } from "@/lib/resus/reference/disability-catalog";
import { SHOCK_INDEX } from "@/lib/triage/constants";
import { computeDerivedMetrics } from "@/lib/triage/scoring/derived";

/** SV-VIT-14: derivation is for adults only (age ≥ 16) — the one signed constant (als-catalog). */
export { ADULT_MIN_AGE_YEARS };
/** SV-VIT-15: a reading is fresh for 15 minutes (D18). */
export const FRESH_WINDOW_MIN = 15;

export type VitalBandField =
  | "gcs"
  | "rr"
  | "spo2"
  | "hr"
  | "systolicBp"
  | "map"
  | "shockIndex"
  | "pulsePressure"
  | "glucose";

export interface VitalBandRule {
  rule: string;
  step: "A" | "B" | "C" | "D";
  /** The signed catalog code derived. */
  code: string;
  field: VitalBandField;
  op: "≥" | "≤" | ">" | "<";
  value: number;
  /** The number exactly as printed in the catalog label ("RR ≥ 25"). */
  shown: string;
  /** SV-VIT-06: only when the reading's O₂ is recorded as air. */
  onAirOnly?: boolean;
}

/**
 * The CSO audit table. Each `op shown` string appears verbatim in the code's
 * signed catalog label (tests/resus/v2/vitals-bands.test.ts asserts it).
 * Pulse pressure is evaluated by the triage scorer's `pulsePressureFlag`
 * (< 25 % of SBP, PULSE_PRESSURE_NARROW_FRACTION); SI by its value against
 * SHOCK_INDEX (the same numbers).
 */
export const VITAL_BAND_RULES: readonly VitalBandRule[] = [
  {
    rule: "SV-VIT-01",
    step: "A",
    code: "gcs_le8",
    field: "gcs",
    op: "≤",
    value: GCS_AIRWAY_THRESHOLD,
    shown: "8",
  },
  { rule: "SV-VIT-02", step: "B", code: "rr_raised", field: "rr", op: "≥", value: 25, shown: "25" },
  {
    rule: "SV-VIT-03",
    step: "B",
    code: "rr_very_high",
    field: "rr",
    op: "≥",
    value: 30,
    shown: "30",
  },
  {
    rule: "SV-VIT-04",
    step: "B",
    code: "rr_low_falling",
    field: "rr",
    op: "≤",
    value: 8,
    shown: "8",
  },
  {
    rule: "SV-VIT-05",
    step: "B",
    code: "spo2_lt92",
    field: "spo2",
    op: "<",
    value: 92,
    shown: "92",
  },
  {
    rule: "SV-VIT-06",
    step: "B",
    code: "spo2_lt94",
    field: "spo2",
    op: "<",
    value: 94,
    shown: "94",
    onAirOnly: true,
  },
  {
    rule: "SV-VIT-07",
    step: "C",
    code: "tachycardia",
    field: "hr",
    op: ">",
    value: 100,
    shown: "100",
  },
  {
    rule: "SV-VIT-08",
    step: "C",
    code: "bradycardia",
    field: "hr",
    op: "<",
    value: 60,
    shown: "60",
  },
  {
    rule: "SV-VIT-09",
    step: "C",
    code: "hypotension",
    field: "systolicBp",
    op: "≤",
    value: 90,
    shown: "90",
  },
  {
    rule: "SV-VIT-09",
    step: "C",
    code: "hypotension",
    field: "map",
    op: "<",
    value: 65,
    shown: "65",
  },
  {
    rule: "SV-VIT-10",
    step: "C",
    code: "shock_index_high",
    field: "shockIndex",
    op: ">",
    value: SHOCK_INDEX.OCCULT_SHOCK_GT,
    shown: "0.9",
  },
  {
    rule: "SV-VIT-11",
    step: "C",
    code: "shock_index_severe",
    field: "shockIndex",
    op: "≥",
    value: SHOCK_INDEX.SHOCK_GTE,
    shown: "1.0",
  },
  {
    rule: "SV-VIT-12",
    step: "C",
    code: "narrow_pulse_pressure",
    field: "pulsePressure",
    op: "<",
    value: 25,
    shown: "25",
  },
  {
    rule: "SV-VIT-13",
    step: "D",
    code: "hypoglycaemia",
    field: "glucose",
    op: "<",
    value: 3.0,
    shown: "3.0",
  },
];

export interface MeasureFindings {
  A: string[];
  B: string[];
  C: string[];
  D: string[];
  /**
   * SV-VIT-15: the OLDEST event whose value is in `values` (vital or D
   * assessment), so one "from vitals · N min" label never makes a code or a
   * value look fresher than the reading behind it.
   */
  sourceEventId: string | null;
  /** Whole minutes since that event. */
  ageMin: number | null;
  /** SV-VIT-01's GCS: the newer of vitals GCS and the D components total. */
  gcsTotal: number | null;
  /** The fresh, non-artefact values the rules were evaluated on (evidence lines). */
  values: Partial<Record<VitalBandField, number>>;
}

export function emptyMeasureFindings(): MeasureFindings {
  return {
    A: [],
    B: [],
    C: [],
    D: [],
    sourceEventId: null,
    ageMin: null,
    gcsTotal: null,
    values: {},
  };
}

/** Does value `v` meet `op t` (a VITAL_BAND_RULES row)? */
export function passes(v: number, op: VitalBandRule["op"], t: number): boolean {
  if (op === "≥") return v >= t;
  if (op === "≤") return v <= t;
  if (op === ">") return v > t;
  return v < t;
}

const MINUTE_MS = 60_000;
/** The raw snapshot fields a rule reads (lib/resus/vitals.ts VitalSnapshot keys). */
const SNAPSHOT_FIELDS = [
  "gcs",
  "rr",
  "spo2",
  "hr",
  "systolicBp",
  "diastolicBp",
  "glucose",
] as const;
type SnapshotField = (typeof SNAPSHOT_FIELDS)[number];

interface Reading {
  value: number;
  atMs: number;
  eventId: string;
}

/**
 * SV-VIT-16: the (vital event, field) pairs currently annotated artefact. The
 * latest annotation per pair wins, so a later `artefact: false` restores it.
 */
export function artefactFields(events: readonly TimelineEvent[]): Set<string> {
  const latest = new Map<string, { at: string; artefact: boolean }>();
  for (const e of events) {
    const p = e.payload;
    if (e.kind !== "note" || p.noteKind !== "vital_annotation") continue;
    if (typeof p.vitalEventId !== "string" || !Array.isArray(p.fields)) continue;
    for (const f of p.fields) {
      if (typeof f !== "string") continue;
      const k = `${p.vitalEventId}:${f}`;
      const held = latest.get(k);
      if (!held || e.recordedAt >= held.at)
        latest.set(k, { at: e.recordedAt, artefact: p.artefact === true });
    }
  }
  return new Set([...latest].filter(([, v]) => v.artefact).map(([k]) => k));
}

/**
 * SV-VIT-01..16: the Q13 codes that the fresh, adult, non-artefact vitals
 * derive. Per field the latest usable value among the fresh vital events wins;
 * MAP, shock index and pulse pressure come from the triage scorer
 * (computeDerivedMetrics — one formula source) over ONE reading: MAP and pulse
 * pressure from the newest fresh event with a usable SBP and DBP, the shock
 * index from the newest with a usable HR and SBP — never halves of different
 * readings (a number nobody measured). GCS is the newer of the vitals GCS and
 * the latest D assessment's component total (both must be fresh).
 */
export function deriveMeasureFindings(
  events: readonly TimelineEvent[],
  opts: { ageYears: number | null; nowMs: number },
): MeasureFindings {
  const out = emptyMeasureFindings();
  const { ageYears, nowMs } = opts;
  if (ageYears == null || !Number.isFinite(ageYears) || ageYears < ADULT_MIN_AGE_YEARS) return out;
  const fresh = (atMs: number) =>
    Number.isFinite(atMs) && nowMs - atMs <= FRESH_WINDOW_MIN * MINUTE_MS;

  const artefact = artefactFields(events);
  const latest: Partial<Record<SnapshotField, Reading>> = {};
  // SV-VIT-09/10/12: the pairs behind MAP / pulse pressure and the shock index.
  let bp: { sbp: Reading; dbp: Reading } | null = null;
  let si: { hr: Reading; sbp: Reading } | null = null;
  let spo2Oxygen: unknown = null;
  const vitals = events
    .filter((e) => e.kind === "vital" && e.payload.carriedFromTriage !== true)
    .sort((a, b) => (a.recordedAt < b.recordedAt ? -1 : a.recordedAt > b.recordedAt ? 1 : 0));
  for (const e of vitals) {
    const atMs = Date.parse(e.recordedAt);
    const snap = e.payload.snapshot;
    if (!fresh(atMs) || !snap || typeof snap !== "object") continue;
    const s = snap as Record<string, unknown>;
    const here: Partial<Record<SnapshotField, Reading>> = {};
    for (const f of SNAPSHOT_FIELDS) {
      const v = s[f];
      if (typeof v !== "number" || !Number.isFinite(v) || artefact.has(`${e.id}:${f}`)) continue;
      here[f] = latest[f] = { value: v, atMs, eventId: e.id };
      // SV-VIT-06: the O₂ status that applies is the one recorded with this SpO₂.
      if (f === "spo2") spo2Oxygen = artefact.has(`${e.id}:oxygen`) ? null : s.oxygen;
    }
    if (here.systolicBp && here.diastolicBp) bp = { sbp: here.systolicBp, dbp: here.diastolicBp };
    if (here.hr && here.systolicBp) si = { hr: here.hr, sbp: here.systolicBp };
  }

  const lastD = gcsTrend(events).at(-1);
  if (lastD) {
    const atMs = Date.parse(lastD.at);
    const ev = events.find(
      (e) => e.kind === "assessment" && e.step === "D" && e.recordedAt === lastD.at,
    );
    if (ev && fresh(atMs) && (!latest.gcs || atMs >= latest.gcs.atMs))
      latest.gcs = { value: lastD.total, atMs, eventId: ev.id };
  }

  const pair = computeDerivedMetrics({
    systolicBp: bp?.sbp.value ?? null,
    diastolicBp: bp?.dbp.value ?? null,
  });
  const shock = computeDerivedMetrics({
    pulse: si?.hr.value ?? null,
    systolicBp: si?.sbp.value ?? null,
  });
  const values: MeasureFindings["values"] = {};
  const used: Reading[] = [];
  for (const f of ["gcs", "rr", "spo2", "hr", "systolicBp", "glucose"] as const) {
    const r = latest[f];
    if (r) {
      values[f] = r.value;
      used.push(r);
    }
  }
  if (bp && pair.meanArterialPressure != null && pair.pulsePressure != null) {
    values.map = pair.meanArterialPressure;
    values.pulsePressure = pair.pulsePressure;
    used.push(bp.sbp);
  }
  if (si && shock.shockIndex != null) {
    values.shockIndex = shock.shockIndex;
    used.push(si.sbp);
  }

  for (const r of VITAL_BAND_RULES) {
    const v = values[r.field];
    const hit =
      r.field === "pulsePressure"
        ? pair.pulsePressureFlag === "narrow"
        : v != null && passes(v, r.op, r.value) && (!r.onAirOnly || spo2Oxygen === "air");
    if (hit && !out[r.step].includes(r.code)) out[r.step].push(r.code);
  }

  const oldest = used.reduce<Reading | null>((m, r) => (!m || r.atMs < m.atMs ? r : m), null);
  out.sourceEventId = oldest?.eventId ?? null;
  out.ageMin = oldest ? Math.max(0, Math.floor((nowMs - oldest.atMs) / MINUTE_MS)) : null;
  out.gcsTotal = latest.gcs?.value ?? null;
  out.values = values;
  return out;
}

/**
 * What the monitoring-chart views render (ADR 0189, MONITORING-CHARTS.md §3–4): precomputed and
 * serialisable, dates as ISO strings, so the views stay pure and render from a fixture. Built from
 * the record by lib/emr/charts/build.ts; read by lib/emr/read/monitoring.ts.
 *
 * Blank is not zero: a value MedSync has no entry for is `null`, never 0. Nothing here flags a
 * value; reference lines and bands carry their label and source.
 */
import type { FluidKind } from "./fluids";
import type { ChartKind } from "./rules";

/** Where a point came from: the clerking (or triage) set draws as an ink dot, nursing entries teal. */
export type Origin = "clerking" | "nursing";

export const EMPTY_GRAPH_TEXT = "No entries yet. The first nursing entry starts the graph.";
export const URINE_REFERENCE_LABEL = "KDIGO oliguria threshold, to verify";
export const NO_WEIGHT_TEXT =
  "No weight in the vitals, so the urine output reference line is not drawn.";

export interface MonitoringPayload {
  charts: MonitoringChartCard[];
  /** The latest weight in the vitals (ADR 0188); null when none is recorded. */
  weight: { kg: number; at: string; source: string } | null;
  /** The chart day's start (local midnight until a hospital setting exists). */
  dayStart: string;
  now: string;
}

interface CardBase {
  id: string;
  name: string;
  /** What opened it, in words: "Ringer's lactate 1000 mL over 8 h". */
  openedByLabel: string;
  /** The rule that fired, in words: "An IV fluid prescription placed". */
  rule: string;
  /** "Hourly", "4-hourly", …; null when the plan set none. */
  frequency: string | null;
  measureUrine: boolean;
  openedAt: string;
  closedAt: string | null;
}

export type MonitoringChartCard =
  | (CardBase & { kind: "fluid_balance"; body: FluidBalanceBody })
  | (CardBase & { kind: "observations"; body: ObservationsBody })
  | (CardBase & { kind: "temperature"; body: TemperatureBody })
  | (CardBase & { kind: "glucose"; body: GlucoseBody })
  | (CardBase & { kind: "mar"; body: MarBody });

export type MonitoringChartBody = MonitoringChartCard["body"];

/* ─── Fluid balance ──────────────────────────────────────────────── */

/** One running fluid: its planned rate comes from the prescription (volume ÷ time). */
export interface FluidIvLine {
  /** The prescription id, or "other" for IV in recorded without one. */
  key: string;
  label: string;
  volumeMl: number | null;
  overMinutes: number | null;
  mlPerHour: number | null;
  /** On a gravity set; null on a pump or without a giving set. */
  dropsPerMinute: number | null;
  dropsPerMl: 20 | 60 | null;
  purpose: string | null;
}

export interface FluidHourRow {
  start: string;
  /** mL per IV line key; a key missing from the record is not recorded. */
  ivIn: Record<string, number>;
  ivInTotal: number | null;
  oralIn: number | null;
  urineOut: number | null;
  /** Urine recorded as not measured in this hour (and nothing measured). */
  urineNotMeasured: boolean;
  otherOut: number | null;
  totalIn: number | null;
  totalOut: number | null;
  /** Running balance to the end of this hour, recorded entries only; null in a gap. */
  running: number | null;
  /** No entry at all in this hour. */
  gap: boolean;
  /** The hour now under way: blank because it is not over, not because it was missed. */
  inProgress: boolean;
}

export interface FluidEntryView {
  id: string;
  kind: FluidKind;
  volumeMl: number | null;
  measured: boolean;
  /** oral | ng; vomit | drain | stool | other. */
  routeDetail: string | null;
  prescriptionId: string | null;
  effectiveAt: string;
  recordedAt: string;
  /** This entry corrects an earlier one. */
  corrects: boolean;
}

export interface FluidBalanceBody {
  kind: "fluid_balance";
  stepHours: 1 | 4;
  ivLines: FluidIvLine[];
  hours: FluidHourRow[];
  summary: {
    totalIn: number;
    totalOut: number;
    net: number;
    /** Hours with measured urine below the reference line; null without a weight. */
    hoursBelowReference: number | null;
    hoursRecorded: number;
  };
  urineReference: { mlPerHour: number; mlPerKgPerHour: number; label: string } | null;
  /** The entries that stand (corrections applied, entered-in-error withdrawn), newest first. */
  entries: FluidEntryView[];
}

/* ─── Observations and NEWS2 ─────────────────────────────────────── */

/** An RCP 2017 response band, its label taken from the signed CO-NEWS entry. */
export interface News2Band {
  from: number;
  /** Inclusive top; null for the open band (7 and above). */
  to: number | null;
  label: string;
  refId: string;
  /** The emergency-response band: the only one drawn in the critical tint. */
  emergency: boolean;
}

export interface News2Point {
  at: string;
  total: number;
  origin: Origin;
}

export interface VitalPoint {
  at: string;
  value: number;
  origin: Origin;
}

export interface VitalStrip {
  key: "rr" | "spo2" | "sbp" | "pulse" | "temp";
  label: string;
  unit: string;
  points: VitalPoint[];
}

export interface ObservationsBody {
  kind: "observations";
  news2: News2Point[];
  /** Sets with at least one NEWS2 input but not all of them: no score is worked out. */
  incompleteSets: number;
  bands: News2Band[];
  bandSource: string;
  strips: VitalStrip[];
  consciousness: { at: string; value: "A" | "C" | "V" | "P" | "U"; origin: Origin }[];
}

/* ─── Temperature and glucose ────────────────────────────────────── */

export interface TemperaturePoint {
  at: string;
  value: number;
  /** Core (rectal, oesophageal, bladder) or peripheral / site not recorded. */
  site: "core" | "peripheral";
  /** The site as recorded ("axillary", "rectal"); null when not recorded. */
  siteLabel: string | null;
  origin: Origin;
}

export interface ReferenceLine {
  value: number;
  label: string;
}

export interface TemperatureBody {
  kind: "temperature";
  points: TemperaturePoint[];
  reference: ReferenceLine;
}

export interface GlucoseBody {
  kind: "glucose";
  points: VitalPoint[];
  reference: ReferenceLine;
}

/* ─── Medicine administration record ─────────────────────────────── */

export type MarCellState = "due" | "given" | "delayed" | "omitted" | "awaiting_cosign" | "running";

export interface MarCell {
  /** The due time, or the time given when a dose matched no due time. */
  at: string;
  state: MarCellState;
  /** The words the cell shows: "Due", "Given 08:05", "Omitted (patient refused)". */
  word: string;
  /** A second line when there is one ("Given 08:05" under "Awaiting co-sign"). */
  detail: string | null;
}

export interface MarRow {
  prescriptionId: string;
  label: string;
  /** Route and how often, in words. */
  detail: string;
  fluid: boolean;
  cells: MarCell[];
  /** Said when the row has no schedule to draw ("As needed", "From the next drug round"). */
  note: string | null;
}

export interface MarBody {
  kind: "mar";
  rows: MarRow[];
}

export type { ChartKind };

import { SHOCK_INDEX } from "@/lib/triage/constants";

/**
 * Resus vitals TREND — presentation read-model (PURE). Surfaces the serial
 * vitals the resus already records as previous→current + a clinically-coloured
 * direction, and supplies the reference bands the hover graph shades.
 *
 * DISPLAY ONLY — it reuses the resus board's EXISTING per-vital classification
 * (the `vitalTone` cutoffs, relocated here as the single source) and the triage
 * scorer's existing derived thresholds (SHOCK_INDEX, MAP ≥ 65). It invents NO
 * new thresholds and changes nothing about capture, the derived-metric maths,
 * the interpretation, or the engine.
 */

export type VitalBand = "normal" | "borderline" | "abnormal" | "critical" | "missing";

/** Severity order — higher = clinically worse. `missing` is not comparable. */
const BAND_SEVERITY: Record<Exclude<VitalBand, "missing">, number> = {
  normal: 0,
  borderline: 1,
  abnormal: 2,
  critical: 3,
};

/**
 * The per-vital clinical band — the resus board's EXISTING classification
 * (verbatim from the former `vitalTone`), plus derived-metric bands that reuse
 * the triage scorer's existing thresholds. One source so the cell tone, the
 * trend direction, and the graph reference bands all agree. NOT new thresholds.
 */
export function vitalBand(key: string, v: number | null | undefined): VitalBand {
  if (v == null || !Number.isFinite(v)) return "missing";
  switch (key) {
    case "hr":
      return v <= 40 || v >= 131 ? "critical" : v < 50 || v > 110 ? "abnormal" : "normal";
    case "rr":
      return v <= 8 || v >= 25 ? "critical" : v > 20 ? "abnormal" : "normal";
    case "spo2":
      return v < 92 ? "critical" : v < 94 ? "borderline" : "normal";
    case "systolicBp":
      return v <= 90 ? "critical" : v < 100 ? "abnormal" : "normal";
    case "temperature":
      return v < 35 || v >= 39.1 ? "abnormal" : "normal";
    case "glucose":
      return v < 4 ? "critical" : v > 11 ? "borderline" : "normal";
    // Derived — reuse the triage scorer's existing thresholds (no new numbers).
    case "shockIndex":
      return v >= SHOCK_INDEX.SHOCK_GTE
        ? "critical"
        : v > SHOCK_INDEX.OCCULT_SHOCK_GT
          ? "abnormal"
          : "normal";
    case "meanArterialPressure":
      return v < 65 ? "abnormal" : "normal";
    // No existing danger band (DBP / EtCO₂) — neutral by design (don't invent).
    default:
      return "normal";
  }
}

/**
 * Reference bands for the hover graph — DERIVED from the same `vitalBand`
 * cutoffs (clinical-normal, respecting the scores-0-≠-normal discipline since
 * these are the resus clinical cutoffs, not NEWS2-0). Bounds left undefined are
 * open (no shaded edge). Same numbers as `vitalBand`; nothing invented.
 */
export interface VitalReference {
  normalLow?: number;
  normalHigh?: number;
  dangerLow?: number;
  dangerHigh?: number;
}
export const VITAL_REFERENCE: Record<string, VitalReference> = {
  hr: { normalLow: 50, normalHigh: 110, dangerLow: 40, dangerHigh: 131 },
  rr: { normalLow: 9, normalHigh: 20, dangerLow: 8, dangerHigh: 25 },
  spo2: { normalLow: 94, dangerLow: 92 },
  systolicBp: { normalLow: 100, dangerLow: 90 },
  temperature: { normalLow: 35, normalHigh: 39.1, dangerLow: 35, dangerHigh: 39.1 },
  glucose: { normalLow: 4, normalHigh: 11, dangerLow: 4 },
  shockIndex: { normalHigh: 0.9, dangerHigh: 1.0 },
  meanArterialPressure: { normalLow: 65, dangerLow: 65 },
};

export type RawDirection = "up" | "down" | "same";
export type ClinicalDirection = "improving" | "deteriorating" | "neutral";

export interface VitalTrend {
  current: number;
  previous: number | null;
  /** current − previous (rounded), or null with < 2 readings. */
  delta: number | null;
  /** Raw numeric direction (the arrow glyph), or null with < 2 readings. */
  rawDirection: RawDirection | null;
  /** Clinically good/bad for THIS vital (the arrow colour), or null with < 2. */
  clinicalDirection: ClinicalDirection | null;
  currentBand: VitalBand;
  /** True only when there are ≥ 2 readings (an arrow/delta is shown). */
  hasTrend: boolean;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Within an UNCHANGED non-normal band, colour by movement toward/away from the
 * failing danger edge — a still-abnormal value that is worsening must not read
 * as a calm neutral arrow. Uses the EXISTING danger edges (VITAL_REFERENCE);
 * invents nothing.
 */
function intraBandDirection(
  key: string,
  previous: number,
  current: number,
  band: VitalBand,
): ClinicalDirection {
  if (band === "normal" || band === "missing") return "neutral";
  const ref = VITAL_REFERENCE[key];
  if (!ref) return "neutral";
  const lowFail = ref.normalLow != null && current < ref.normalLow;
  const highFail = ref.normalHigh != null && current > ref.normalHigh;
  if (lowFail) return current < previous ? "deteriorating" : "improving";
  if (highFail) return current > previous ? "deteriorating" : "improving";
  return "neutral";
}

/**
 * Compute the previous→current trend for a vital from its ordered points.
 * `rawDirection` is the numeric move (the arrow); `clinicalDirection` compares
 * the previous vs current clinical BAND (a worse band = deteriorating, a better
 * band = improving, same band = neutral) — so a rising SpO₂ reads as improving
 * and a falling SpO₂ as deteriorating, by clinical meaning not raw direction.
 */
export function vitalTrend(key: string, points: readonly { value: number }[]): VitalTrend | null {
  if (points.length === 0) return null;
  const current = points[points.length - 1]!.value;
  const currentBand = vitalBand(key, current);
  if (points.length < 2) {
    return {
      current,
      previous: null,
      delta: null,
      rawDirection: null,
      clinicalDirection: null,
      currentBand,
      hasTrend: false,
    };
  }
  const previous = points[points.length - 2]!.value;
  const rawDirection: RawDirection =
    current > previous ? "up" : current < previous ? "down" : "same";

  let clinicalDirection: ClinicalDirection = "neutral";
  if (rawDirection !== "same") {
    const prevBand = vitalBand(key, previous);
    const cs = currentBand === "missing" ? -1 : BAND_SEVERITY[currentBand];
    const ps = prevBand === "missing" ? -1 : BAND_SEVERITY[prevBand];
    if (cs > ps) clinicalDirection = "deteriorating";
    else if (cs < ps) clinicalDirection = "improving";
    // Same band: calm if normal; else by movement toward/away from the danger edge.
    else clinicalDirection = intraBandDirection(key, previous, current, currentBand);
  }

  return {
    current,
    previous,
    delta: round2(current - previous),
    rawDirection,
    clinicalDirection,
    currentBand,
    hasTrend: true,
  };
}

/** Screen-reader sentence for a cell (so non-visual users get the trend). */
export function vitalTrendLabel(label: string, unit: string, t: VitalTrend): string {
  const u = unit ? ` ${unit}` : "";
  if (!t.hasTrend || t.previous == null || t.rawDirection == null) {
    return `${label} ${t.current}${u}, first reading`;
  }
  const dir = t.rawDirection === "up" ? "up" : t.rawDirection === "down" ? "down" : "unchanged";
  const clin =
    t.clinicalDirection === "improving"
      ? "improving"
      : t.clinicalDirection === "deteriorating"
        ? "deteriorating"
        : "no band change";
  return `${label} ${t.current}${u}, ${dir} from ${t.previous}, ${clin}`;
}

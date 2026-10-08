import type { Spo2Scale } from "@/lib/triage/types";

import DATA from "@/data/clerking/vital-classification.v1.json";

/**
 * Standard (non-NEWS2) classification of one adult vital sign, from
 * data/clerking/vital-classification.v1.json (draft, awaiting the CSO). Every cut-off lives in the
 * data file with its source; this file only walks the bands. Adults only: under 18 or age unknown
 * gives null (paediatric norms are out of scope), and blood pressure is not classified in
 * pregnancy. Pure.
 */

export type VitalTone = "normal" | "caution" | "critical";
export interface VitalClass {
  label: string;
  tone: VitalTone;
  /** The scheme the label comes from ("ACC/AHA 2017", "RCP NEWS2"…). */
  scheme: string;
}
export type BpScheme = keyof typeof DATA.bp.schemes;
export const BP_SCHEMES = Object.entries(DATA.bp.schemes).map(([id, s]) => ({
  id: id as BpScheme,
  label: s.short,
}));
export const DEFAULT_BP_SCHEME = DATA.bp.default as BpScheme;

export type VitalKind = "bp" | "pulse" | "rr" | "spo2" | "temp" | "glucose";
export interface VitalCtx {
  ageYears: number | null;
  pregnant?: boolean | null;
  bpScheme?: BpScheme;
  spo2Scale?: Spo2Scale;
  oxygen?: "air" | "oxygen" | null;
}
type Bp = { sbp: number; dbp: number };

interface Band {
  label: string | null;
  tone: string;
  from?: number;
  above?: number;
}
const bandOf = (bands: readonly Band[], n: number) =>
  bands.findLast(
    (b, i) =>
      i === 0 || (b.from !== undefined && n >= b.from) || (b.above !== undefined && n > b.above),
  )!;
const out = (b: { label: string | null; tone: string }, scheme: string): VitalClass | null =>
  b.label ? { label: b.label, tone: b.tone as VitalTone, scheme } : null;

interface Cat {
  label: string;
  tone: string;
  systolicFrom?: number;
  systolicAbove?: number;
  diastolicFrom?: number;
  diastolicAbove?: number;
}
/** Each axis reaches its highest category; the reading takes the higher of the two. */
function bpClass({ sbp, dbp }: Bp, scheme: BpScheme): VitalClass {
  const s = DATA.bp.schemes[scheme];
  const cats = s.categories as Cat[];
  const reach = (n: number, from?: number, above?: number) =>
    (from !== undefined && n >= from) || (above !== undefined && n > above);
  const rank = (axis: (c: Cat) => boolean) => cats.findLastIndex((c, i) => i === 0 || axis(c));
  const at = Math.max(
    rank((c) => reach(sbp, c.systolicFrom, c.systolicAbove)),
    rank((c) => reach(dbp, c.diastolicFrom, c.diastolicAbove)),
  );
  const q = "qualifier" in s ? s.qualifier : null;
  const isolated = q && sbp >= q.systolicFrom && dbp < q.diastolicBelow;
  return {
    label: isolated ? `${cats[at]!.label} (${q.label})` : cats[at]!.label,
    tone: cats[at]!.tone as VitalTone,
    scheme: s.name,
  };
}

export function classifyVital(
  kind: VitalKind,
  value: number | string | Bp | null,
  ctx: VitalCtx,
): VitalClass | null {
  if (ctx.ageYears === null || ctx.ageYears < 18 || value === null) return null;
  if (kind === "bp") {
    if (typeof value !== "object" || ctx.pregnant) return null;
    return bpClass(value, ctx.bpScheme ?? DEFAULT_BP_SCHEME);
  }
  if (kind === "glucose" && typeof value === "string") {
    const m = DATA.glucose.meter[value.trim().toUpperCase() as "HI" | "LO"];
    if (m) return out(m, DATA.glucose.name);
  }
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n)) return null;
  switch (kind) {
    case "pulse":
      return out(bandOf(DATA.pulse.bands, n), DATA.pulse.name);
    case "rr":
      return out(bandOf(DATA.respiratoryRate.bands, n), DATA.respiratoryRate.name);
    case "temp":
      return out(bandOf(DATA.temperature.bands, n), DATA.temperature.name);
    case "glucose":
      return out(bandOf(DATA.glucose.bands, n), DATA.glucose.name);
    case "spo2": {
      if (ctx.spo2Scale !== "scale2")
        return out(bandOf(DATA.spo2.scale1.bands, n), DATA.spo2.scale1.name);
      const s2 = DATA.spo2.scale2;
      const b = bandOf(s2.bands, n);
      return out(b.above !== undefined && ctx.oxygen === "air" ? s2.aboveOnAir : b, s2.name);
    }
    default:
      return null;
  }
}

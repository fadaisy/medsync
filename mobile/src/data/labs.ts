import type { IconName } from "@/components/tide/icon";

import { flag } from "@/lib/flags";

/**
 * Lab results. Demo data until Gate CG (law L2): the values are the boards'
 * (TLabs, TCare, TChat), behind the shape a real repository will fill.
 *
 * Each result carries its own bound ("Target below 2.6"), because a lab
 * prints its reference range beside the value. The ranges are illustrative
 * and pending CSO sign-off; the screen says so.
 */
export const LABS_NOTE = "Illustrative. Ranges pending CSO sign-off.";

/**
 * `target`: a treatment target your team set ("Above target" when missed).
 * `best`, `healthy`, `normal`: a reference range ("A little high" when out).
 */
export type LabBoundKind = "target" | "best" | "healthy" | "normal";
export interface LabBound {
  dir: "below" | "above";
  limit: number;
  kind: LabBoundKind;
}

export interface LabRow {
  type: "row";
  id: string;
  name: string;
  value: number;
  unit: string;
  bound: LabBound;
  /** The ends of the range bar. */
  scale: { min: number; max: number };
}

/** Normal results folded into one chip row. */
export interface LabFold {
  type: "fold";
  id: string;
  title: string;
  word: string;
  items: string[];
}

export interface LabPanel {
  id: string;
  title: string;
  sub: string;
  icon: IconName;
  items: (LabRow | LabFold)[];
  /** One plain line on what the panel means. */
  meaning: string;
}

export type LabTone = "stable" | "caution";
export interface LabStatus {
  tone: LabTone;
  word: string;
}

const KIND_WORD: Record<LabBoundKind, string> = {
  target: "Target",
  best: "Best",
  healthy: "Healthy",
  normal: "Normal",
};

/** "Target below 2.6", "Healthy above 60". */
export function boundText(b: LabBound): string {
  return `${KIND_WORD[b.kind]} ${b.dir} ${b.limit}`;
}

/** Whether a value is inside its bound. The limit itself is outside ("below 2.6" excludes 2.6). */
export function inBound(value: number, b: LabBound): boolean {
  return b.dir === "below" ? value < b.limit : value > b.limit;
}

/**
 * The word and tone for one result (law L4: amber and green always with a
 * word). Inside: "Normal" for a normal range, "Good" otherwise. Outside a
 * target: "Above target" / "Below target"; outside a reference range:
 * "A little high" / "A little low".
 */
export function labStatus(value: number, b: LabBound): LabStatus {
  if (inBound(value, b)) return { tone: "stable", word: b.kind === "normal" ? "Normal" : "Good" };
  const high = b.dir === "below";
  if (b.kind === "target") return { tone: "caution", word: high ? "Above target" : "Below target" };
  return { tone: "caution", word: high ? "A little high" : "A little low" };
}

/** The panel's pill: any result out of range is "Needs attention". */
export function panelStatus(items: (LabRow | LabFold)[]): LabStatus {
  const out = items.some((i) => i.type === "row" && !inBound(i.value, i.bound));
  return out
    ? { tone: "caution", word: "Needs attention" }
    : { tone: "stable", word: "All normal" };
}

/** The healthy span of a bound on its scale, for `RangeBar`. */
export function goodSpan(r: LabRow): { goodFrom: number; goodTo: number } {
  return r.bound.dir === "below"
    ? { goodFrom: r.scale.min, goodTo: r.bound.limit }
    : { goodFrom: r.bound.limit, goodTo: r.scale.max };
}

export const HBA1C = {
  value: 7.8,
  unit: "%",
  history: [9.2, 8.9, 8.6, 7.8],
  months: ["Jan", "Apr", "Jul", "Oct"],
  monthNames: ["January", "April", "July", "October"],
  bound: { dir: "below", limit: 7, kind: "target" } as LabBound,
  meaning: "Improving. Nearly at target.",
};

export const LDL: LabRow = {
  type: "row",
  id: "ldl",
  name: "LDL · bad",
  value: 3.1,
  unit: "mmol/L",
  bound: { dir: "below", limit: 2.6, kind: "target" },
  scale: { min: 0, max: 5 },
};

export const EGFR: LabRow = {
  type: "row",
  id: "egfr",
  name: "eGFR",
  value: 86,
  unit: "mL/min",
  bound: { dir: "above", limit: 60, kind: "healthy" },
  scale: { min: 0, max: 120 },
};

export const PANELS: LabPanel[] = [
  {
    id: "lipids",
    title: "Lipid profile",
    sub: "Cholesterol · fasting",
    icon: "heart",
    items: [
      LDL,
      {
        type: "row",
        id: "hdl",
        name: "HDL · good",
        value: 1.3,
        unit: "mmol/L",
        bound: { dir: "above", limit: 1.2, kind: "best" },
        scale: { min: 0, max: 3 },
      },
      {
        type: "row",
        id: "tg",
        name: "Triglycerides",
        value: 1.9,
        unit: "mmol/L",
        bound: { dir: "below", limit: 1.7, kind: "best" },
        scale: { min: 0, max: 4 },
      },
      {
        type: "row",
        id: "total",
        name: "Total",
        value: 5.4,
        unit: "mmol/L",
        bound: { dir: "below", limit: 5.0, kind: "best" },
        scale: { min: 0, max: 10 },
      },
    ],
    meaning: "Above target. Your doctor will discuss it Fri 23.",
  },
  {
    id: "kidney",
    title: "Kidney tests (RFTs)",
    sub: "Kidney function",
    icon: "flask",
    items: [
      EGFR,
      {
        type: "fold",
        id: "salts",
        title: "Salts and wastes",
        word: "All normal",
        items: ["Creatinine 88", "Urea 5.2", "Potassium 4.4", "Sodium 139"],
      },
      {
        type: "row",
        id: "albumin",
        name: "Urine albumin",
        value: 2.1,
        unit: "mg/mmol",
        bound: { dir: "below", limit: 3, kind: "normal" },
        scale: { min: 0, max: 10 },
      },
    ],
    meaning: "Kidneys working well. Checked yearly.",
  },
];

/** The board's numbers for the summary tiles and the Care hub preview. */
const SUMMARY = {
  needReview: 2,
  healthy: 8,
  releasedOn: "Wed 14 Oct",
  visit: "Fri 23",
  healthyLine: "Kidneys (eGFR 86), HDL, salts, urea",
};

export const labsRepo = { demo: !flag("mobileClinicalData") };

export function useLabsSummary(): {
  needReview: number;
  healthy: number;
  releasedOn: string;
  visit: string;
  hba1c: { value: number; history: number[]; target: number };
  ldl: { value: number; target: number };
  healthyLine: string;
} {
  return {
    ...SUMMARY,
    hba1c: { value: HBA1C.value, history: HBA1C.history, target: HBA1C.bound.limit },
    ldl: { value: LDL.value, target: LDL.bound.limit },
  };
}

import SUBTYPES from "@/data/clerking/dx-subtypes.v1.json";
import { stageScaleOf } from "./relations-catalogue";

/**
 * Severity as a stage on the same condition, never a new diagnosis (D-REL-14, ADR 0220): anaemia by
 * haemoglobin (WHO 2024), CKD by eGFR and albuminuria (KDIGO 2024), AKI by creatinine against a
 * baseline (KDIGO 2012), community-acquired pneumonia by CURB-65 (CRB-65 without urea). Recomputed
 * whenever a result changes. Blank is never negative: a missing input gives "insufficient" with the
 * inputs that would settle it, never the lowest band. The BP grade is the hypertension pack's
 * (D-HTN-05) and is not computed here. Pure.
 */

export interface StageInputs {
  ageYears: number | null;
  sex: "male" | "female" | null;
  /** true, false, or null when not recorded (a woman 12–50 with null gets no anaemia stage). */
  pregnant: boolean | null;
  gestationWeeks?: number | null;
  hbGPerL?: number | null;
  egfr?: number | null;
  acrMgPerMmol?: number | null;
  creatinineUmol?: number | null;
  baselineCreatinineUmol?: number | null;
  /** New confusion (ACVPU C or worse, or AMTS ≤ 8). */
  confusion?: boolean | null;
  ureaMmol?: number | null;
  rr?: number | null;
  sbp?: number | null;
  dbp?: number | null;
}

export type Stage =
  | { scale: string; code: string; words: string; source: string }
  | { scale: string; insufficient: string[] };

type Band = { none: string; mild: string; moderate: string; severe: string; group: string };
const ANAEMIA = (SUBTYPES as unknown as { stages: Record<string, { rows: Band[] }> }).stages[
  "dx.anaemia"
]!.rows;

/** "≥105", "95–104", "<70" → a test on a value (g/L). */
function inRange(spec: string, v: number): boolean {
  const s = spec.replace(/\s/g, "");
  if (s.startsWith("≥")) return v >= Number(s.slice(1));
  if (s.startsWith("<")) return v < Number(s.slice(1));
  const [lo, hi] = s.split(/[–-]/).map(Number);
  return v >= lo! && v <= hi!;
}

function anaemiaGroup(i: StageInputs): Band | string {
  const a = i.ageYears;
  if (a === null) return "age";
  if (a < 0.5) return "age (under 6 months is not in the WHO table)";
  if (i.sex === "female" && a >= 12 && a <= 50 && i.pregnant === null) return "pregnancy status";
  if (i.pregnant) {
    const w = i.gestationWeeks;
    if (w === null || w === undefined) return "gestation";
    return ANAEMIA[w < 14 ? 6 : w < 28 ? 7 : 8]!;
  }
  if (a < 2) return ANAEMIA[0]!;
  if (a < 5) return ANAEMIA[1]!;
  if (a < 12) return ANAEMIA[2]!;
  if (a < 15) return ANAEMIA[3]!;
  if (i.sex === null) return "sex";
  // ruling STG-01: the 15–65 rows also apply from 65 (WHO 2024 Table 3 as read gives no older rows).
  return i.sex === "female" ? ANAEMIA[4]! : ANAEMIA[5]!;
}

function anaemia(i: StageInputs): Stage {
  const scale = "Anaemia severity (WHO 2024)";
  const need: string[] = [];
  if (i.hbGPerL === null || i.hbGPerL === undefined) need.push("haemoglobin");
  const g = anaemiaGroup(i);
  if (typeof g === "string") need.push(g);
  if (need.length || typeof g === "string") return { scale, insufficient: need };
  const v = i.hbGPerL!;
  const code = (["severe", "moderate", "mild", "none"] as const).find((k) => inRange(g[k], v))!;
  return {
    scale,
    code,
    words: code === "none" ? "not anaemic by WHO cut-off" : code,
    source: `WHO 2024, Table 3 (${g.group})`,
  };
}

function ckd(i: StageInputs): Stage {
  const scale = "CKD category (KDIGO 2024)";
  if (i.egfr === null || i.egfr === undefined) return { scale, insufficient: ["eGFR"] };
  const e = i.egfr;
  const g =
    e >= 90 ? "G1" : e >= 60 ? "G2" : e >= 45 ? "G3a" : e >= 30 ? "G3b" : e >= 15 ? "G4" : "G5";
  const r = i.acrMgPerMmol;
  const a = r === null || r === undefined ? null : r < 3 ? "A1" : r <= 30 ? "A2" : "A3";
  return {
    scale,
    code: a ? `${g}${a}` : g,
    words: a ? `${g} ${a}` : `${g} (albuminuria not recorded)`,
    source: "KDIGO 2024",
  };
}

function aki(i: StageInputs): Stage {
  const scale = "AKI stage (KDIGO 2012)";
  const need = [
    ...(i.creatinineUmol == null ? ["creatinine"] : []),
    ...(i.baselineCreatinineUmol == null ? ["baseline creatinine"] : []),
  ];
  if (need.length) return { scale, insufficient: need };
  const c = i.creatinineUmol!;
  const ratio = c / i.baselineCreatinineUmol!;
  const rise = c - i.baselineCreatinineUmol!;
  const stage =
    ratio >= 3 || c >= 353.6 ? "3" : ratio >= 2 ? "2" : ratio >= 1.5 || rise >= 26.5 ? "1" : null;
  if (!stage) return { scale, insufficient: ["a rise meeting KDIGO (creatinine criteria only)"] };
  return {
    scale,
    code: stage,
    words: `stage ${stage}`,
    source: "KDIGO 2012 (creatinine criteria)",
  };
}

function curb65(i: StageInputs): Stage {
  const parts: [string, boolean | null][] = [
    ["confusion", i.confusion ?? null],
    ["respiratory rate", i.rr == null ? null : i.rr >= 30],
    [
      "blood pressure",
      i.sbp == null && i.dbp == null ? null : (i.sbp ?? 999) < 90 || (i.dbp ?? 999) <= 60,
    ],
    ["age", i.ageYears == null ? null : i.ageYears >= 65],
  ];
  const urea = i.ureaMmol == null ? null : i.ureaMmol > 7;
  const missing = parts.filter(([, v]) => v === null).map(([k]) => k);
  if (missing.length) return { scale: "CURB-65", insufficient: missing };
  const score = parts.filter(([, v]) => v).length + (urea ? 1 : 0);
  const name = urea === null ? "CRB-65" : "CURB-65";
  return {
    scale: name,
    code: String(score),
    words: `${name} ${score}${urea === null ? " (urea not recorded)" : ""}`,
    source: "BTS (Lim et al., Thorax 2003)",
  };
}

/** The stage of a diagnosis from the record, or null when it has no scale here. */
export function stageOf(dx: string, i: StageInputs): Stage | null {
  const scale = stageScaleOf(dx)?.id;
  if (scale === "dx.anaemia") return anaemia(i);
  if (scale === "dx.ckd") return ckd(i);
  if (scale === "dx.aki") return aki(i);
  if (scale === "dx.pneumonia" || dx === "dx.pneumonia_community") return curb65(i);
  return null; // hypertension: the hypertension pack's; TB resistance: from the Xpert result (Phase 4)
}

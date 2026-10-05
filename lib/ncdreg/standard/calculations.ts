/**
 * §5.4 calculations. Pure functions; every stored result keeps the formula version it was made with.
 * None of these categories is a diagnosis: screens show them as "category from latest result".
 */
import { STANDARD_VERSION } from "./code-lists";
import { FULL_ROLES } from "./conditions";

const V = { status: "draft", effective_from: "2026-10-05" } as const;

export const FORMULAS = {
  bmi: { ...V, id: "bmi", version: "bmi-1", text: "weight kg ÷ (height m)², 1 dp" },
  visit_bp: {
    ...V,
    id: "visit_bp",
    version: "visit-bp-mean-1",
    text: "mean of readings, each component rounded",
  },
  glucose_unit: {
    ...V,
    id: "glucose_unit",
    version: "glucose-mgdl-1",
    text: "mg/dL ÷ 18.016, 1 dp",
  },
  creatinine_unit: { ...V, id: "creatinine_unit", version: "creat-mgdl-1", text: "mg/dL × 88.4" },
  hba1c_ifcc: {
    ...V,
    id: "hba1c_ifcc",
    version: "hba1c-ifcc-1",
    text: "round((% − 2.15) × 10.929)",
  },
  egfr: { ...V, id: "egfr", version: "ckd-epi-2021-cr", text: "2021 CKD-EPI creatinine equation" },
  kdigo_g: {
    ...V,
    id: "kdigo_g",
    version: "kdigo-g-1",
    text: "G1 ≥90; G2 60–89; G3a 45–59; G3b 30–44; G4 15–29; G5 <15",
  },
  kdigo_a: {
    ...V,
    id: "kdigo_a",
    version: "kdigo-a-1",
    text: "ACR mg/mmol: A1 <3; A2 3–30; A3 >30. Dipstick: none",
  },
  foot_risk: {
    ...V,
    id: "foot_risk",
    version: "iwgdf-0-3-1",
    text: "0–3 from sensation, pulses, deformity, history",
  },
  htn_grade: {
    ...V,
    id: "htn_grade",
    version: "htn-grade-1",
    text: "Three grades; awaits UCG 2023 confirmation",
  },
  care_band: {
    ...V,
    id: "care_band",
    version: "care-band-1",
    text: "Four bands; complication rule is draft",
  },
  status: {
    ...V,
    id: "status",
    version: "status-1",
    text: "died > withdrawn > transferred > LTFU > overdue > active",
  },
} as const;
export const STANDARD_CALC_VERSION = STANDARD_VERSION;

const round1 = (x: number) => Math.round(x * 10) / 10;

export function bmi(weightKg: number, heightCm: number): number {
  const m = heightCm / 100;
  return round1(weightKg / (m * m));
}

export type BpReading = readonly [number, number];

/** "120/80" → [120, 80]; anything else → null. */
export function parseBp(text: string): BpReading | null {
  const m = /^\s*(\d{2,3})\s*\/\s*(\d{2,3})\s*$/.exec(text);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

export function visitBp(readings: readonly BpReading[]): BpReading | null {
  if (readings.length === 0) return null;
  const s = readings.reduce((a, r) => a + r[0], 0) / readings.length;
  const d = readings.reduce((a, r) => a + r[1], 0) / readings.length;
  return [Math.round(s), Math.round(d)];
}

export const glucoseMgdlToMmol = (mgdl: number) => round1(mgdl / 18.016);
export const creatinineMgdlToUmol = (mgdl: number) => Math.round(mgdl * 88.4 * 10) / 10;
export const hba1cMmolMol = (percent: number) => Math.round((percent - 2.15) * 10.929);

/** 2021 CKD-EPI creatinine equation; creatinine in µmol/L. */
export function egfr(creatinineUmolL: number, ageYears: number, sex: "female" | "male"): number {
  const scr = creatinineUmolL / 88.4;
  const female = sex === "female";
  const k = female ? 0.7 : 0.9;
  const a = female ? -0.241 : -0.302;
  const v =
    142 *
    Math.min(scr / k, 1) ** a *
    Math.max(scr / k, 1) ** -1.2 *
    0.9938 ** ageYears *
    (female ? 1.012 : 1);
  return Math.round(v);
}

export type KdigoG = "G1" | "G2" | "G3a" | "G3b" | "G4" | "G5";
export function kdigoG(egfrValue: number): KdigoG {
  if (egfrValue >= 90) return "G1";
  if (egfrValue >= 60) return "G2";
  if (egfrValue >= 45) return "G3a";
  if (egfrValue >= 30) return "G3b";
  if (egfrValue >= 15) return "G4";
  return "G5";
}

export type KdigoA = "A1" | "A2" | "A3";
/** From ACR only; a dipstick result maps to no A category in 0.1 (sign-off register). */
export function kdigoA(acrMgMmol: number | null): KdigoA | null {
  if (acrMgMmol == null) return null;
  if (acrMgMmol < 3) return "A1";
  if (acrMgMmol <= 30) return "A2";
  return "A3";
}

export type FootInput = {
  loss_of_protective_sensation: boolean;
  absent_pulses: boolean;
  deformity: boolean;
  previous_ulcer: boolean;
  current_ulcer?: boolean;
  amputation: "none" | "minor" | "major";
  /** A dialysis-start event or eGFR category G5. */
  end_stage_kidney_disease: boolean;
};
export function footRisk(f: FootInput): 0 | 1 | 2 | 3 {
  const lops = f.loss_of_protective_sensation;
  const pad = f.absent_pulses;
  if (!lops && !pad) return 0;
  if (f.previous_ulcer || f.amputation !== "none" || f.end_stage_kidney_disease) return 3;
  if ((lops && pad) || f.deformity) return 2;
  return 1;
}

/** Versioned threshold table, `draft` until checked against the Uganda Clinical Guidelines 2023. */
export const HTN_GRADE_TABLE = {
  ...V,
  id: "htn_grade",
  version: "htn-grade-1",
  note: "Draft. Awaits confirmation against the Uganda Clinical Guidelines 2023.",
  grades: [
    { grade: 3, systolic: 180, diastolic: 110 },
    { grade: 2, systolic: 160, diastolic: 100 },
    { grade: 1, systolic: 140, diastolic: 90 },
  ],
} as const;
/** Grade from the latest reading; null below grade 1. Feeds no indicator and is not the outcome class. */
export function htnGrade(bp: BpReading): 1 | 2 | 3 | null {
  for (const g of HTN_GRADE_TABLE.grades)
    if (bp[0] >= g.systolic || bp[1] >= g.diastolic) return g.grade;
  return null;
}

export type CareBand =
  | "hypertension_only"
  | "diabetes_only"
  | "both_without_complications"
  | "either_with_complications";

/** The draft complication rule (§5.4). Condition codes are named here, inside the standard. */
export const CARE_BAND_RULE = {
  ...V,
  version: "care-band-1",
  complication_registrations: ["chronic_kidney_disease", "heart_failure", "cardiovascular_disease"],
  complication_events: [
    "stroke",
    "acute_coronary_syndrome",
    "heart_failure_new",
    "dialysis_start",
    "foot_ulcer_new",
    "amputation_minor",
    "amputation_major",
  ],
} as const;

export type CareBandInput = {
  registrations: readonly string[];
  knownCvd: readonly string[];
  eventTypes: readonly string[];
  latestKidney: { egfr: number | null; kdigoA: KdigoA | null } | null;
  latestEyes: { retinopathy_grade: string | null; macular_oedema: string | null } | null;
  latestFeet: { risk: number | null; current_ulcer: boolean; amputation: string } | null;
};

export function careBand(p: CareBandInput): CareBand | null {
  const dm = p.registrations.includes(FULL_ROLES.glycaemic);
  const ht = p.registrations.includes(FULL_ROLES.bp);
  if (!dm && !ht) return null;
  const k = p.latestKidney;
  const e = p.latestEyes;
  const f = p.latestFeet;
  const complicated =
    p.registrations.some((r) =>
      (CARE_BAND_RULE.complication_registrations as readonly string[]).includes(r),
    ) ||
    p.knownCvd.length > 0 ||
    p.eventTypes.some((t) =>
      (CARE_BAND_RULE.complication_events as readonly string[]).includes(t),
    ) ||
    (k != null && ((k.egfr != null && k.egfr < 60) || k.kdigoA === "A2" || k.kdigoA === "A3")) ||
    (e != null &&
      ((e.retinopathy_grade != null &&
        !["no_apparent_retinopathy", "ungradable"].includes(e.retinopathy_grade)) ||
        e.macular_oedema === "present")) ||
    (f != null && ((f.risk ?? 0) >= 2 || f.current_ulcer || f.amputation !== "none"));
  if (complicated) return "either_with_complications";
  if (dm && ht) return "both_without_complications";
  return dm ? "diabetes_only" : "hypertension_only";
}

export type PatientStatus =
  | "died"
  | "withdrawn"
  | "transferred_out"
  | "lost_to_follow_up"
  | "overdue"
  | "active";

export type StatusInput = {
  asOf: string; // ISO date
  firstRegistered: string;
  events: readonly { type: string; date: string }[];
  visitDates: readonly string[]; // closed, valid visits
  /** Appointment dates still pending (not cancelled). */
  appointmentDates: readonly string[];
};

const addMonths = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
};

export function patientStatus(p: StatusInput): PatientStatus {
  const evs = p.events.filter((e) => e.date <= p.asOf);
  if (evs.some((e) => e.type === "death")) return "died";
  if (evs.some((e) => e.type === "withdrawal")) return "withdrawn";
  const visits = p.visitDates.filter((d) => d <= p.asOf);
  const lastTransfer = evs
    .filter((e) => e.type === "transfer_out")
    .map((e) => e.date)
    .sort()
    .at(-1);
  if (lastTransfer && !visits.some((v) => v > lastTransfer)) return "transferred_out";
  const yearAgo = addMonths(p.asOf, -12);
  if (p.firstRegistered <= yearAgo && !visits.some((v) => v > yearAgo)) return "lost_to_follow_up";
  if (p.appointmentDates.some((a) => a < p.asOf && !visits.some((v) => v >= a))) return "overdue";
  return "active";
}

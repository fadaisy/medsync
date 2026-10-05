/**
 * §5.5 validation as data. Hard blocks refuse a write; confirm ranges ask the user to confirm and
 * never block; consistency rules raise a query on the registry lead's list, never an alert.
 */
import { FULL_ROLES } from "./conditions";

const V = { version: "validation-1", status: "draft", effective_from: "2026-10-05" } as const;

export const HARD_BLOCKS = {
  ...V,
  rules: [
    { id: "adult_only", text: "Age under 18 at registration" },
    { id: "non_negative", text: "Negative or non-numeric values" },
    { id: "no_future_dates", text: "Future dates" },
    { id: "no_visit_after_death", text: "A visit dated after a recorded death" },
    {
      id: "no_visit_before_registration",
      text: "A visit before the registration date unless flagged historical",
    },
  ],
} as const;

/** Confirm, never block. Units are the stored units. */
export const CONFIRM_RANGES = {
  ...V,
  ranges: {
    systolic: [60, 300],
    diastolic: [30, 200],
    weight_kg: [20, 300],
    height_cm: [100, 220],
    glucose_mmol: [1.0, 60.0],
    hba1c_percent: [3.0, 20.0],
    creatinine_umol: [20, 2500],
    acr_mg_mmol: [0, 1000],
    total_cholesterol: [1, 20],
    ldl: [0.3, 15],
  } as Record<string, readonly [number, number]>,
} as const;

export type ConfirmField = keyof typeof CONFIRM_RANGES.ranges;

/** Values outside their plausible range, plus systolic not above diastolic. */
export function needsConfirmation(
  values: Partial<Record<string, number | null | undefined>>,
): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(values)) {
    const r = CONFIRM_RANGES.ranges[k];
    if (r && v != null && (v < r[0] || v > r[1])) out.push(k);
  }
  if (values.systolic != null && values.diastolic != null && values.systolic <= values.diastolic)
    out.push("systolic_not_above_diastolic");
  return out;
}

export const ADULT_AGE = 18;

export const CONSISTENCY_RULES = {
  ...V,
  rules: [
    { id: "type_1_without_insulin", text: "Type 1 diabetes with no insulin on the medicine list" },
    { id: "diagnosis_before_birth", text: "Diagnosis year before birth year" },
    { id: "pregnancy_male", text: "Pregnancy event for a male patient" },
    { id: "duplicate_registration", text: "Two registrations of the same condition" },
    {
      id: "weight_change_20pct",
      text: "Weight change above 20% between visits less than 90 days apart",
    },
    { id: "same_day_duplicate_visit", text: "Two visits for the same patient on the same date" },
    {
      id: "merge_duplicate_registration",
      text: "Merged persons both held a registration for the same condition",
    },
  ],
} as const;
export type ConsistencyRuleId = (typeof CONSISTENCY_RULES.rules)[number]["id"];

export type ConsistencyInput = {
  sex: "female" | "male";
  birthYear: number;
  registrations: readonly { condition: string; subtype: string; diagnosisYear: number }[];
  /** Medicine ATC classes at the latest closed visit. */
  latestMedicineAtc: readonly string[] | null;
  eventTypes: readonly string[];
  visits: readonly { date: string; weightKg: number | null }[];
};

const INSULIN_ATC = "A10A";

/** Returns the ids of every consistency rule the person currently breaks. */
export function consistencyFindings(p: ConsistencyInput): ConsistencyRuleId[] {
  const out: ConsistencyRuleId[] = [];
  const t1 = p.registrations.some(
    (r) => r.condition === FULL_ROLES.glycaemic && r.subtype === "type_1",
  );
  if (t1 && p.latestMedicineAtc && !p.latestMedicineAtc.some((a) => a.startsWith(INSULIN_ATC)))
    out.push("type_1_without_insulin");
  if (p.registrations.some((r) => r.diagnosisYear < p.birthYear))
    out.push("diagnosis_before_birth");
  if (p.sex === "male" && p.eventTypes.includes("pregnancy")) out.push("pregnancy_male");
  const codes = p.registrations.map((r) => r.condition);
  if (new Set(codes).size !== codes.length) out.push("duplicate_registration");
  const vs = p.visits
    .filter((v) => v.weightKg != null)
    .sort((a, b) => a.date.localeCompare(b.date));
  for (const [i, cur] of vs.entries()) {
    const prev = vs[i - 1];
    if (!prev) continue;
    const days = (Date.parse(cur.date) - Date.parse(prev.date)) / 86_400_000;
    const a = prev.weightKg as number;
    const b = cur.weightKg as number;
    if (days < 90 && Math.abs(b - a) / a > 0.2) {
      out.push("weight_change_20pct");
      break;
    }
  }
  const dates = p.visits.map((v) => v.date);
  if (new Set(dates).size !== dates.length) out.push("same_day_duplicate_visit");
  return out;
}

/** A2 duplicate tiers and the name-similarity measure: versioned data, draft (sign-off register). */
export const DUPLICATE_RULES = {
  ...V,
  version: "dup-tiers-1",
  name_similarity:
    "names normalised (lower case, accents and punctuation stripped, doubled letters collapsed, final h dropped); similar when some token pair has Jaro-Winkler at or above the threshold",
  similar_name_threshold: 0.9,
  possible_listed: 5,
  birth_year_band: 2,
} as const;

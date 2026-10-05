/**
 * §6 indicator definitions as data. The engine (lib/ncdreg/indicators) reads these; the definitions
 * that concern one condition name it here, inside the standard, and nowhere else.
 */
import { FULL_ROLES } from "./conditions";

export const INDICATOR_DEFINITION_VERSION = "ind-0.1.0-draft";
const V = {
  version: INDICATOR_DEFINITION_VERSION,
  status: "draft",
  effective_from: "2026-10-05",
} as const;

export type IndicatorKind = "count" | "rate" | "distribution" | "per_1000" | "cascade" | "cohort";

export type IndicatorDef = {
  code: string;
  family: "C" | "G" | "H";
  label: string;
  numerator: string;
  denominator: string;
  kind: IndicatorKind;
  /** C-indicators locked to HEARTS360 name the module they read here. */
  condition?: string;
  /** Classes the numerator counts, for outcome indicators. */
  classes?: readonly string[];
  /** On the one-screen dashboard (F3) or table/report only. */
  dashboard: boolean;
  version: string;
  status: "draft" | "approved";
  effective_from: string;
};

const d = (o: Omit<IndicatorDef, keyof typeof V>): IndicatorDef => ({ ...V, ...o });
const HT = FULL_ROLES.bp;
const DM = FULL_ROLES.glycaemic;

export const CORE_INDICATORS: readonly IndicatorDef[] = [
  d({
    code: "C01",
    family: "C",
    label: "Patients under care",
    numerator:
      "Registered, with at least 1 visit in the past 12 months; excluding died, and transferred out or withdrawn from the event date",
    denominator: "Count",
    kind: "count",
    dashboard: true,
  }),
  d({
    code: "C02",
    family: "C",
    label: "Cumulative registered",
    numerator: "All registered, excluding died",
    denominator: "Count",
    kind: "count",
    dashboard: false,
  }),
  d({
    code: "C03",
    family: "C",
    label: "New registrations",
    numerator: "Registered in the month",
    denominator: "Count",
    kind: "count",
    dashboard: true,
  }),
  d({
    code: "C04",
    family: "C",
    label: "Blood pressure below 140/90",
    numerator:
      "Visit blood pressure below 140 and below 90 at the latest visit in the past 3 months",
    denominator: "Hypertension patients under care, registered before the past 3 months",
    kind: "rate",
    condition: HT,
    classes: ["in_range"],
    dashboard: true,
  }),
  d({
    code: "C05",
    family: "C",
    label: "Blood pressure 140/90 or above",
    numerator: "140 or above, or 90 or above, at the latest visit in the past 3 months",
    denominator: "Same as C04",
    kind: "rate",
    condition: HT,
    classes: ["not_in_range"],
    dashboard: true,
  }),
  d({
    code: "C06",
    family: "C",
    label: "No visit in past 3 months, hypertension",
    numerator: "No visit in the past 3 months",
    denominator: "Same as C04",
    kind: "rate",
    condition: HT,
    classes: ["no_visit"],
    dashboard: true,
  }),
  d({
    code: "C07",
    family: "C",
    label: "Blood sugar in range",
    numerator:
      "Fasting glucose below 7.0 mmol/L or HbA1c below 7.0% at the latest visit in the past 3 months",
    denominator: "Diabetes patients under care, registered before the past 3 months",
    kind: "rate",
    condition: DM,
    classes: ["in_range"],
    dashboard: true,
  }),
  d({
    code: "C08",
    family: "C",
    label: "Blood sugar moderately raised",
    numerator: "Fasting glucose 7.0 to 11.0 mmol/L or HbA1c 7.0 to 8.9%",
    denominator: "Same as C07",
    kind: "rate",
    condition: DM,
    classes: ["moderately_raised"],
    dashboard: true,
  }),
  d({
    code: "C09",
    family: "C",
    label: "Blood sugar very raised",
    numerator: "Fasting glucose 11.1 mmol/L or above, or HbA1c 9.0% or above",
    denominator: "Same as C07",
    kind: "rate",
    condition: DM,
    classes: ["very_raised"],
    dashboard: true,
  }),
  d({
    code: "C10",
    family: "C",
    label: "Blood sugar not classifiable",
    numerator: "Latest visit in the past 3 months has only random or after-meal glucose",
    denominator: "Same as C07",
    kind: "rate",
    condition: DM,
    classes: ["not_classifiable"],
    dashboard: true,
  }),
  d({
    code: "C11",
    family: "C",
    label: "No visit in past 3 months, diabetes",
    numerator: "No visit in the past 3 months",
    denominator: "Same as C07",
    kind: "rate",
    condition: DM,
    classes: ["no_visit"],
    dashboard: true,
  }),
  d({
    code: "C12",
    family: "C",
    label: "Lost to follow-up at 12 months",
    numerator: "No visit in the past 12 months (never counted within 12 months of registration)",
    denominator: "Cumulative registered, excluding died",
    kind: "rate",
    dashboard: true,
  }),
  d({
    code: "C13",
    family: "C",
    label: "Overdue patients",
    numerator:
      "Appointment date passed with no visit, on the 1st of the month; excluding removed from the list and no phone number",
    denominator: "Patients under care",
    kind: "rate",
    dashboard: false,
  }),
  d({
    code: "C14",
    family: "C",
    label: "Overdue patients called",
    numerator: "Unique overdue patients called in the month",
    denominator: "C13 numerator",
    kind: "rate",
    dashboard: false,
  }),
  d({
    code: "C15",
    family: "C",
    label: "Returned to care",
    numerator: "Visit within 15 days of the first call in the month",
    denominator: "C14 numerator",
    kind: "rate",
    dashboard: true,
  }),
  d({
    code: "C16",
    family: "C",
    label: "Quarterly cohort outcome",
    numerator:
      "Leading class, not in it, or no visit, at the latest visit in the following quarter",
    denominator: "Patients registered in the quarter",
    kind: "cohort",
    dashboard: true,
  }),
];

export const GENERIC_INDICATORS: readonly IndicatorDef[] = [
  d({
    code: "G01",
    family: "G",
    label: "Registered",
    numerator: "Registrations of the condition, excluding died",
    denominator: "Count",
    kind: "count",
    dashboard: false,
  }),
  d({
    code: "G02",
    family: "G",
    label: "Under care",
    numerator: "G01 with at least 1 visit in the past 12 months, with the exclusions of C01",
    denominator: "Count",
    kind: "count",
    dashboard: true,
  }),
  d({
    code: "G03",
    family: "G",
    label: "New registrations",
    numerator: "Registered for the condition in the month",
    denominator: "Count",
    kind: "count",
    dashboard: false,
  }),
  d({
    code: "G04",
    family: "G",
    label: "Outcome at latest visit",
    numerator:
      "Patients in each outcome class at the latest visit in the past 3 months, plus not recorded and no visit",
    denominator: "Patients under care for the condition, registered before the past 3 months",
    kind: "distribution",
    dashboard: true,
  }),
  d({
    code: "G05",
    family: "G",
    label: "Lost to follow-up at 12 months",
    numerator: "No visit in the past 12 months",
    denominator: "G01",
    kind: "rate",
    dashboard: false,
  }),
  d({
    code: "G06",
    family: "G",
    label: "Care cascade",
    numerator:
      "Registered; under care; visit in past 3 months; leading class at latest visit in past 3 months",
    denominator: "Each step as a percentage of G01",
    kind: "cascade",
    dashboard: true,
  }),
];

export const HOSPITAL_INDICATORS: readonly IndicatorDef[] = [
  d({
    code: "H01",
    family: "H",
    label: "HbA1c tested",
    numerator: "At least 1 HbA1c result in the past 12 months",
    denominator: "Diabetes patients under care",
    kind: "rate",
    condition: DM,
    dashboard: true,
  }),
  d({
    code: "H02",
    family: "H",
    label: "Kidney review done",
    numerator: "Creatinine and a urine protein test in the past 12 months",
    denominator:
      "Patients under care holding a registration whose module lists the kidney component",
    kind: "rate",
    dashboard: true,
  }),
  d({
    code: "H03",
    family: "H",
    label: "Eye examination done",
    numerator: "Eye component with examined = yes in the past 12 months",
    denominator: "Diabetes patients under care",
    kind: "rate",
    condition: DM,
    dashboard: true,
  }),
  d({
    code: "H04",
    family: "H",
    label: "Foot examination done",
    numerator: "Foot component recorded in the past 12 months",
    denominator: "Diabetes patients under care",
    kind: "rate",
    condition: DM,
    dashboard: true,
  }),
  d({
    code: "H05",
    family: "H",
    label: "Blood pressure controlled in diabetes",
    numerator:
      "Below 140/90, and separately below 130/80, at the latest visit in the past 3 months",
    denominator: "Diabetes patients under care, registered before the past 3 months",
    kind: "rate",
    condition: DM,
    dashboard: false,
  }),
  d({
    code: "H06",
    family: "H",
    label: "Statin on medicine list",
    numerator: "Statin present at the latest visit in the past 12 months",
    denominator: "Diabetes patients under care aged 40 or above",
    kind: "rate",
    condition: DM,
    dashboard: true,
  }),
  d({
    code: "H07",
    family: "H",
    label: "Kidney category distribution",
    numerator: "Patients in each G category and each A category",
    denominator: "Patients with a kidney review in the past 12 months",
    kind: "distribution",
    dashboard: true,
  }),
  d({
    code: "H08",
    family: "H",
    label: "Event rates",
    numerator: "Events in the past 12 months, by type and by admission reason",
    denominator: "Per 1,000 patients under care at the as-of date",
    kind: "per_1000",
    dashboard: true,
  }),
  d({
    code: "H09",
    family: "H",
    label: "Medicines not obtained in full",
    numerator: "Visits with partial or none, by reason",
    denominator: "Visits where medicines obtained is not not-applicable",
    kind: "rate",
    dashboard: false,
  }),
  d({
    code: "H10",
    family: "H",
    label: "Completeness",
    numerator: "Visits with all applicable every-visit core fields present",
    denominator: "All non-historical visits in the month",
    kind: "rate",
    dashboard: false,
  }),
  d({
    code: "H11",
    family: "H",
    label: "Same-day entry",
    numerator: "Visits entered on the visit date",
    denominator: "All non-historical visits in the month",
    kind: "rate",
    dashboard: false,
  }),
  d({
    code: "H12",
    family: "H",
    label: "Care band distribution",
    numerator: "Patients in each of the four bands",
    denominator: "Patients under care with a diabetes or hypertension registration",
    kind: "distribution",
    dashboard: true,
  }),
];

export const ALL_INDICATORS: readonly IndicatorDef[] = [
  ...CORE_INDICATORS,
  ...GENERIC_INDICATORS,
  ...HOSPITAL_INDICATORS,
];
export const indicatorByCode = new Map(ALL_INDICATORS.map((i) => [i.code, i]));

/** Parameters the hospital indicators need, kept here so the engine names no condition. */
export const HOSPITAL_PARAMS = {
  glycaemic_module: DM,
  bp_module: HT,
  bp_thresholds_in_diabetes: [
    [140, 90],
    [130, 80],
  ] as const,
  statin_atc_prefix: "C10AA",
  statin_min_age: 40,
  care_band_modules: [DM, HT],
} as const;

/** §6 windows. Months are calendar months, evaluated in the facility time zone. */
export const WINDOWS = {
  ...V,
  recent_months: 3,
  year_months: 12,
  returned_days: 15,
  cohort_lag_quarters: 1,
} as const;

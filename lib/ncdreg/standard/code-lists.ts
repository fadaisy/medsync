/**
 * NCDReg 0.1 code lists (§5.2, §5.3). All `draft`; external codes (ICD, ATC, LOINC) are candidates
 * from the build prompt, `verified: false` until checked against their source catalogues.
 */
import type { Code, CodeList } from "./types";

export const STANDARD_VERSION = "0.1.0-draft";
const V = { version: STANDARD_VERSION, status: "draft", effective_from: "2026-10-05" } as const;

const c = (code: string, label: string): Code => ({ code, label });
const list = (
  id: string,
  label: string,
  codes: Code[],
  extra: Partial<CodeList> = {},
): CodeList => ({
  ...V,
  id,
  label,
  codes,
  ...extra,
});

export const REPORTING_UNITS = list("reporting_unit", "Reporting unit", [
  c("ncd_clinic", "NCD clinic"),
  c("medical_ward", "Medical ward"),
  c("dialysis_unit", "Dialysis unit"),
  c("other", "Other"),
]);

export const SEX = list("sex", "Sex", [c("female", "Female"), c("male", "Male")]);

export const WHERE_FIRST_DIAGNOSED = list("where_first_diagnosed", "Where first diagnosed", [
  c("this_facility", "This facility"),
  c("other_facility", "Another facility"),
  c("unknown", "Unknown"),
]);

export const REFERRAL_SOURCE = list("referral_source", "Referral source", [
  c("self", "Self"),
  c("outpatients", "Outpatients"),
  c("ward", "Ward"),
  c("other_facility", "Another facility"),
  c("community_screening", "Community screening"),
  c("other", "Other"),
]);

export const TOBACCO = list("tobacco", "Tobacco", [
  c("never", "Never"),
  c("former", "Former"),
  c("current", "Current"),
]);
export const ALCOHOL = list("alcohol", "Alcohol", [
  c("none", "None"),
  c("occasional", "Occasional"),
  c("regular", "Regular"),
]);
export const KNOWN_CVD = list("known_cvd", "Known cardiovascular disease", [
  c("stroke", "Stroke"),
  c("ischaemic_heart_disease", "Ischaemic heart disease"),
  c("heart_failure", "Heart failure"),
  c("peripheral_arterial_disease", "Peripheral arterial disease"),
]);

export const VISIT_TYPE = list("visit_type", "Visit type", [
  c("scheduled", "Scheduled"),
  c("unscheduled", "Unscheduled"),
  c("refill_only", "Refill only"),
  c("remote", "Remote"),
]);
export const GLUCOSE_TYPE = list("glucose_type", "Glucose type", [
  c("fasting", "Fasting"),
  c("random", "Random"),
  c("post_meal", "After meal"),
]);
export const GLUCOSE_METHOD = list("glucose_method", "Glucose method", [
  c("capillary", "Capillary"),
  c("laboratory", "Laboratory"),
]);
export const MISSED_DOSES = list("missed_doses", "Missed doses in the past 7 days", [
  c("none", "None"),
  c("1_to_2_days", "1 to 2 days"),
  c("3_or_more_days", "3 or more days"),
  c("not_asked", "Not asked"),
]);
export const HYPOGLYCAEMIA = list("hypoglycaemia", "Hypoglycaemia since last visit", [
  c("none", "None"),
  c("mild_self_treated", "Mild, self-treated"),
  c("severe_needed_help", "Severe, needed help"),
  c("not_asked", "Not asked"),
]);
export const MEDICINES_OBTAINED = list("medicines_obtained", "Medicines obtained", [
  c("full", "In full"),
  c("partial", "In part"),
  c("none", "None"),
  c("not_applicable", "Not applicable"),
]);
export const NOT_OBTAINED_REASON = list("not_obtained_reason", "Reason not obtained in full", [
  c("stock_out", "Stock-out"),
  c("cost", "Cost"),
  c("other", "Other"),
]);
export const DISPOSITION = list("disposition", "Disposition", [
  c("transfer_out", "Transfer out"),
  c("discharged_to_primary_care", "Discharged to primary care"),
]);

export const URINE_TEST = list("urine_test", "Urine test", [
  c("acr", "Albumin-to-creatinine ratio"),
  c("dipstick", "Dipstick protein"),
]);
export const DIPSTICK = list("dipstick", "Dipstick protein", [
  c("negative", "Negative"),
  c("trace", "Trace"),
  c("1+", "1+"),
  c("2+", "2+"),
  c("3+", "3+"),
]);
export const EYE_METHOD = list("eye_method", "Eye examination method", [
  c("dilated_fundoscopy", "Dilated fundoscopy"),
  c("fundus_photograph", "Fundus photograph"),
  c("other", "Other"),
]);
export const RETINOPATHY_GRADE = list("retinopathy_grade", "Retinopathy grade, worse eye", [
  c("no_apparent_retinopathy", "No apparent retinopathy"),
  c("mild_npdr", "Mild non-proliferative"),
  c("moderate_npdr", "Moderate non-proliferative"),
  c("severe_npdr", "Severe non-proliferative"),
  c("proliferative", "Proliferative"),
  c("ungradable", "Ungradable"),
]);
export const MACULAR_OEDEMA = list("macular_oedema", "Macular oedema", [
  c("absent", "Absent"),
  c("present", "Present"),
  c("not_assessed", "Not assessed"),
]);
export const AMPUTATION = list("amputation", "Amputation", [
  c("none", "None"),
  c("minor", "Minor"),
  c("major", "Major"),
]);
export const CV_RISK = list("cv_risk", "Cardiovascular risk category, as recorded", [
  c("lt_5", "Below 5%"),
  c("5_to_lt_10", "5% to below 10%"),
  c("10_to_lt_20", "10% to below 20%"),
  c("20_to_lt_30", "20% to below 30%"),
  c("gte_30", "30% or above"),
  c("not_assessed", "Not assessed"),
]);
export const LVH = list("lvh", "Left ventricular hypertrophy", [
  c("yes", "Yes"),
  c("no", "No"),
  c("unknown", "Unknown"),
]);

/** Shared event types; condition modules may add more (§5.6). */
export const EVENT_TYPE = list("event_type", "Event type", [
  c("admission", "Admission"),
  c("stroke", "Stroke"),
  c("acute_coronary_syndrome", "Acute coronary syndrome"),
  c("heart_failure_new", "New heart failure"),
  c("foot_ulcer_new", "New foot ulcer"),
  c("amputation_minor", "Minor amputation"),
  c("amputation_major", "Major amputation"),
  c("dialysis_start", "Dialysis start"),
  c("visual_loss_or_laser", "Visual loss or laser treatment"),
  c("pregnancy", "Pregnancy"),
  c("transfer_out", "Transfer out"),
  c("death", "Death"),
  c("withdrawal", "Withdrawal"),
]);
/** Shared admission reasons; enabled condition modules add theirs. */
export const ADMISSION_REASON = list("admission_reason", "Admission main reason", [
  c("diabetic_ketoacidosis", "Diabetic ketoacidosis"),
  c("hyperosmolar_state", "Hyperosmolar state"),
  c("severe_hypoglycaemia", "Severe hypoglycaemia"),
  c("hypertensive_emergency", "Hypertensive emergency"),
  c("stroke", "Stroke"),
  c("acute_coronary_syndrome", "Acute coronary syndrome"),
  c("heart_failure", "Heart failure"),
  c("foot_sepsis", "Foot sepsis"),
  c("other", "Other"),
]);
export const DEATH_PLACE = list("death_place", "Place of death", [
  c("this_facility", "This facility"),
  c("other_facility", "Another facility"),
  c("home", "Home"),
  c("unknown", "Unknown"),
]);
export const DEATH_SOURCE = list("death_source", "Information source", [
  c("ward", "Ward"),
  c("family_call", "Family, by call"),
  c("records", "Records"),
  c("other", "Other"),
]);

/** E2: the seven call outcomes. */
export const CALL_OUTCOME = list("call_outcome", "Call outcome", [
  c("will_return", "Will return"),
  c("call_later", "Call later"),
  c("no_answer", "No answer"),
  c("moved_or_transferred", "Moved or transferred"),
  c("died", "Died"),
  c("wrong_number", "Wrong number"),
  c("declined", "Declined"),
]);

/** B8: the clinic-day stage. Workflow state only; it feeds no indicator. */
export const STAGE = list("stage", "Stage", [
  c("not_arrived", "Not arrived"),
  c("waiting", "Waiting"),
  c("measurements_taken", "Measurements taken"),
  c("with_clinician", "With clinician"),
  c("closed", "Closed"),
]);

/**
 * §5.3 medicine list, by name, with the ATC class the prompt gives. No doses in this version.
 * `group` drives the order the visit form offers them in (a module's `medicine_groups`).
 */
export type Medicine = { code: string; label: string; atc: string; group: string };
const m = (code: string, label: string, atc: string, group: string): Medicine => ({
  code,
  label,
  atc,
  group,
});
export const MEDICINE_LIST = {
  ...V,
  id: "medicine",
  label: "Medicine list",
  verified: false,
  medicines: [
    m("metformin", "Metformin", "A10BA02", "glucose_lowering"),
    m("glibenclamide", "Glibenclamide", "A10BB", "glucose_lowering"),
    m("gliclazide", "Gliclazide", "A10BB", "glucose_lowering"),
    m("glimepiride", "Glimepiride", "A10BB", "glucose_lowering"),
    m("soluble_insulin", "Soluble insulin", "A10A", "glucose_lowering"),
    m("isophane_insulin", "Isophane insulin", "A10A", "glucose_lowering"),
    m("premixed_insulin", "Premixed insulin", "A10A", "glucose_lowering"),
    m("insulin_analogue", "Insulin analogue", "A10A", "glucose_lowering"),
    m("other_glucose_lowering", "Other glucose-lowering medicine", "A10", "glucose_lowering"),
    m("enalapril", "Enalapril", "C09A", "blood_pressure"),
    m("lisinopril", "Lisinopril", "C09A", "blood_pressure"),
    m("captopril", "Captopril", "C09A", "blood_pressure"),
    m("losartan", "Losartan", "C09C", "blood_pressure"),
    m("telmisartan", "Telmisartan", "C09C", "blood_pressure"),
    m("amlodipine", "Amlodipine", "C08", "blood_pressure"),
    m("nifedipine", "Nifedipine", "C08", "blood_pressure"),
    m("bendroflumethiazide", "Bendroflumethiazide", "C03A", "blood_pressure"),
    m("hydrochlorothiazide", "Hydrochlorothiazide", "C03A", "blood_pressure"),
    m("atenolol", "Atenolol", "C07", "blood_pressure"),
    m("bisoprolol", "Bisoprolol", "C07", "blood_pressure"),
    m("carvedilol", "Carvedilol", "C07", "blood_pressure"),
    m("spironolactone", "Spironolactone", "C03DA01", "blood_pressure"),
    m("furosemide", "Furosemide", "", "blood_pressure"),
    m("hydralazine", "Hydralazine", "", "blood_pressure"),
    m("methyldopa", "Methyldopa", "", "blood_pressure"),
    m("other_blood_pressure", "Other blood pressure medicine", "", "blood_pressure"),
    m("atorvastatin", "Atorvastatin", "C10AA", "cardiovascular_protection"),
    m("simvastatin", "Simvastatin", "C10AA", "cardiovascular_protection"),
    m("rosuvastatin", "Rosuvastatin", "C10AA", "cardiovascular_protection"),
    m("aspirin", "Aspirin", "B01AC06", "cardiovascular_protection"),
    m("clopidogrel", "Clopidogrel", "", "cardiovascular_protection"),
    m("other", "Other", "", "other"),
  ] as readonly Medicine[],
} as const;
export const MEDICINE_GROUP_LABELS: Record<string, string> = {
  glucose_lowering: "Glucose-lowering",
  blood_pressure: "Blood pressure",
  cardiovascular_protection: "Cardiovascular protection",
  other: "Other",
};
export const medicineByCode = new Map(MEDICINE_LIST.medicines.map((x) => [x.code, x]));

/** §5.3 LOINC candidates. Unverified: the exports refuse them outside development. */
export const OBSERVATION_CODES = list(
  "observation_loinc",
  "Observation codes (LOINC candidates)",
  [
    c("8480-6", "Systolic blood pressure"),
    c("8462-4", "Diastolic blood pressure"),
    c("29463-7", "Body weight"),
    c("8302-2", "Body height"),
    c("39156-5", "Body mass index"),
    c("4548-4", "HbA1c"),
    c("14771-0", "Fasting glucose"),
    c("14749-6", "Glucose in serum or plasma"),
    c("14743-9", "Capillary glucose by glucometer"),
    c("14682-9", "Creatinine"),
    c("98979-8", "eGFR, 2021 CKD-EPI"),
    c("14585-4", "Urine albumin-to-creatinine ratio"),
    c("14647-2", "Total cholesterol"),
    c("22748-8", "LDL cholesterol"),
  ],
  { verified: false },
);
export const LOINC = {
  systolic: "8480-6",
  diastolic: "8462-4",
  weight: "29463-7",
  height: "8302-2",
  bmi: "39156-5",
  hba1c: "4548-4",
  glucose_fasting: "14771-0",
  glucose_lab: "14749-6",
  glucose_capillary: "14743-9",
  creatinine: "14682-9",
  egfr: "98979-8",
  acr: "14585-4",
  cholesterol_total: "14647-2",
  ldl: "22748-8",
} as const;

export const ALL_CODE_LISTS: readonly CodeList[] = [
  REPORTING_UNITS,
  SEX,
  WHERE_FIRST_DIAGNOSED,
  REFERRAL_SOURCE,
  TOBACCO,
  ALCOHOL,
  KNOWN_CVD,
  VISIT_TYPE,
  GLUCOSE_TYPE,
  GLUCOSE_METHOD,
  MISSED_DOSES,
  HYPOGLYCAEMIA,
  MEDICINES_OBTAINED,
  NOT_OBTAINED_REASON,
  DISPOSITION,
  URINE_TEST,
  DIPSTICK,
  EYE_METHOD,
  RETINOPATHY_GRADE,
  MACULAR_OEDEMA,
  AMPUTATION,
  CV_RISK,
  LVH,
  EVENT_TYPE,
  ADMISSION_REASON,
  DEATH_PLACE,
  DEATH_SOURCE,
  CALL_OUTCOME,
  STAGE,
  OBSERVATION_CODES,
];

export const codesOf = (l: CodeList) => l.codes.map((x) => x.code) as [string, ...string[]];
export const labelOf = (l: CodeList, code: string) =>
  l.codes.find((x) => x.code === code)?.label ?? code;

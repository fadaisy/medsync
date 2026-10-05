/**
 * NCDReg 0.1 data dictionary (§5.1, §5.2): the five record types and their fields.
 * `identifying` fields are encrypted at application level (§8.2) and never leave in an extract.
 */
import { STANDARD_VERSION } from "./code-lists";

export type FieldDef = {
  name: string;
  type: "text" | "code" | "codes" | "date" | "number" | "integer" | "boolean" | "timestamp";
  codeList?: string;
  unit?: string;
  required?: boolean;
  identifying?: boolean;
  calculated?: boolean;
  note?: string;
};
export type RecordDef = {
  record: string;
  cardinality: string;
  purpose: string;
  fields: readonly FieldDef[];
};

const f = (name: string, type: FieldDef["type"], o: Partial<FieldDef> = {}): FieldDef => ({
  name,
  type,
  ...o,
});

export const DICTIONARY = {
  version: STANDARD_VERSION,
  status: "draft",
  effective_from: "2026-10-05",
  records: [
    {
      record: "Person",
      cardinality: "one per patient",
      purpose: "identifiers, contacts, residence",
      fields: [
        f("registry_number", "text", {
          required: true,
          note: "System-issued, unique per facility; DEMO- series reserved",
        }),
        f("hospital_number", "text", { identifying: true }),
        f("national_id", "text", { identifying: true, note: "Optional, never required" }),
        f("given_name", "text", { identifying: true }),
        f("family_name", "text", { identifying: true }),
        f("sex", "code", { codeList: "sex", required: true }),
        f("date_of_birth", "date", {
          note: "Or estimated age stored as a derived birth year with an estimated flag",
        }),
        f("birth_year", "integer", { required: true }),
        f("date_of_birth_estimated", "boolean"),
        f("phone_1", "text", { identifying: true }),
        f("phone_2", "text", { identifying: true }),
        f("next_of_kin_name", "text", { identifying: true }),
        f("next_of_kin_phone", "text", { identifying: true }),
        f("district", "code", { note: "Uganda administrative dataset" }),
        f("sub_county", "code"),
        f("parish", "text", {
          identifying: true,
          note: "Free text: the dataset stops at sub-county",
        }),
        f("village", "text", { identifying: true }),
        f("sms_allowed", "boolean", { required: true }),
        f("calls_allowed", "boolean", { required: true }),
        f("privacy_notice_version", "text", { required: true }),
        f("privacy_notice_acknowledged_at", "timestamp", { required: true }),
        f("height_cm", "number", { unit: "cm", note: "Expected at enrolment" }),
        f("tobacco", "code", { codeList: "tobacco" }),
        f("alcohol", "code", { codeList: "alcohol" }),
        f("known_cvd", "codes", { codeList: "known_cvd" }),
        f("known_kidney_disease", "boolean"),
        f("family_history_diabetes", "boolean"),
        f("family_history_hypertension", "boolean"),
        f("is_synthetic", "boolean", { required: true }),
      ],
    },
    {
      record: "Registration",
      cardinality: "one per condition per person",
      purpose: "a condition enabled in the catalogue, date and basis of diagnosis",
      fields: [
        f("condition", "code", { required: true, note: "A condition catalogue code" }),
        f("subtype", "code", { required: true, note: "From the module's subtypes" }),
        f("registration_date", "date", { required: true }),
        f("diagnosis_year", "integer", { required: true }),
        f("diagnosis_month", "integer"),
        f("basis_of_diagnosis", "code", { required: true, note: "From the module's list" }),
        f("where_first_diagnosed", "code", { codeList: "where_first_diagnosed" }),
        f("referral_source", "code", { codeList: "referral_source" }),
      ],
    },
    {
      record: "Visit",
      cardinality: "one per clinic attendance",
      purpose: "measurements, medicines, next appointment",
      fields: [
        f("visit_date", "date", { required: true }),
        f("visit_type", "code", { codeList: "visit_type", required: true }),
        f("weight_kg", "number", { unit: "kg" }),
        f("bp_readings", "text", { note: "Up to three systolic/diastolic readings" }),
        f("visit_bp", "text", { calculated: true, note: "Mean of the readings" }),
        f("bmi", "number", { calculated: true, unit: "kg/m²" }),
        f("glucose_mmol", "number", { unit: "mmol/L", note: "Original value and unit kept" }),
        f("glucose_type", "code", { codeList: "glucose_type" }),
        f("glucose_method", "code", { codeList: "glucose_method" }),
        f("hba1c_percent", "number", { unit: "%", note: "mmol/mol stored alongside" }),
        f("hba1c_result_date", "date"),
        f("medicines", "codes", {
          note: "After this visit; carried forward, confirmed or edited. No doses",
        }),
        f("missed_doses", "code", { codeList: "missed_doses" }),
        f("hypoglycaemia", "code", {
          codeList: "hypoglycaemia",
          note: "Offered by modules that list it",
        }),
        f("medicines_obtained", "code", { codeList: "medicines_obtained" }),
        f("medicines_not_obtained_reason", "code", { codeList: "not_obtained_reason" }),
        f("next_appointment_date", "date", { note: "Or a disposition" }),
        f("disposition", "code", { codeList: "disposition" }),
        f("recorded_control", "code", {
          note: "Per core registration: controlled, partly, not, not assessed",
        }),
        f("observations", "codes", { note: "Module observations, one row per code" }),
      ],
    },
    {
      record: "Annual review",
      cardinality: "components, each dated",
      purpose: "kidney, eyes, feet, lipids, other annual items",
      fields: [
        f("kidney.creatinine_umol", "number", { unit: "µmol/L" }),
        f("kidney.egfr", "integer", { calculated: true, note: "2021 CKD-EPI" }),
        f("kidney.urine_test", "code", { codeList: "urine_test" }),
        f("kidney.acr_mg_mmol", "number", { unit: "mg/mmol" }),
        f("kidney.dipstick", "code", { codeList: "dipstick" }),
        f("kidney.kdigo_g", "code", { calculated: true }),
        f("kidney.kdigo_a", "code", { calculated: true, note: "From ACR only" }),
        f("eyes.examined", "boolean"),
        f("eyes.method", "code", { codeList: "eye_method" }),
        f("eyes.retinopathy_grade", "code", { codeList: "retinopathy_grade" }),
        f("eyes.macular_oedema", "code", { codeList: "macular_oedema" }),
        f("eyes.referred", "boolean"),
        f("feet.loss_of_protective_sensation", "boolean"),
        f("feet.absent_pulses", "boolean"),
        f("feet.deformity", "boolean"),
        f("feet.current_ulcer", "boolean"),
        f("feet.previous_ulcer", "boolean"),
        f("feet.amputation", "code", { codeList: "amputation" }),
        f("feet.risk_category", "integer", { calculated: true }),
        f("lipids.total_cholesterol", "number", { unit: "mmol/L" }),
        f("lipids.ldl", "number", { unit: "mmol/L" }),
        f("other.cv_risk_category", "code", {
          codeList: "cv_risk",
          note: "As recorded; never calculated",
        }),
        f("other.ecg_done", "boolean"),
        f("other.lvh", "code", { codeList: "lvh" }),
        f("other.tobacco", "code", { codeList: "tobacco" }),
        f("other.alcohol", "code", { codeList: "alcohol" }),
      ],
    },
    {
      record: "Event",
      cardinality: "one per occurrence",
      purpose: "admission, complication, transfer, death, withdrawal",
      fields: [
        f("event_type", "code", { codeList: "event_type", required: true }),
        f("event_date", "date", { required: true }),
        f("event_date_estimated", "boolean"),
        f("reporting_unit", "code", { codeList: "reporting_unit", required: true }),
        f("admission_reason", "code", { codeList: "admission_reason" }),
        f("death_place", "code", { codeList: "death_place" }),
        f("death_cause", "text", { identifying: true, note: "Optional free text, encrypted" }),
        f("death_source", "code", { codeList: "death_source" }),
        f("transfer_destination", "text", { identifying: true, note: "Free text, encrypted" }),
      ],
    },
  ] as readonly RecordDef[],
} as const;

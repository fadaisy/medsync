import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * NCDSync, the hospital NCD registry (migration 0093, docs/ncd/, ADRs 0208–0213). The SQL is the
 * source of truth (CHECKs, triggers, policies live there); tests/emr-db/drizzle-parity.test.ts holds
 * these columns to it. Every table carries facility_id (= hospitals.id) except the capability map.
 * Identifiers are `*_ciphertext` (lib/encryption) with `*_hmac` blind indexes.
 */
const ts = (n: string) => timestamp(n, { withTimezone: true });
const num = (n: string, precision: number, scale: number) =>
  numeric(n, { precision, scale, mode: "number" });

export const ncdCapabilityGrant = pgTable(
  "ncd_capability_grant",
  { role: text("role").notNull(), capability: text("capability").notNull() },
  (t) => [primaryKey({ columns: [t.role, t.capability] })],
);

export const ncdFacilitySettings = pgTable("ncd_facility_settings", {
  facilityId: uuid("facility_id").primaryKey(),
  timeZone: text("time_zone").notNull().default("Africa/Kampala"),
  glucoseUnit: text("glucose_unit").notNull().default("mmol"),
  creatinineUnit: text("creatinine_unit").notNull().default("umol"),
  reminderBeforeDays: integer("reminder_before_days").notNull().default(2),
  reminderAfterDays: integer("reminder_after_days").notNull().default(3),
  reminderMaxMissed: integer("reminder_max_missed").notNull().default(2),
  sendWindowStart: time("send_window_start").notNull().default("08:00"),
  sendWindowEnd: time("send_window_end").notNull().default("18:00"),
  defaultIntervalWeeks: integer("default_interval_weeks").array().notNull(),
  liveSmsEnabled: boolean("live_sms_enabled").notNull().default(false),
  hospitalDisplayName: text("hospital_display_name"),
  clinicPhone: text("clinic_phone"),
  version: integer("version").notNull().default(1),
  updatedBy: uuid("updated_by"),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const ncdDemoLoad = pgTable("ncd_demo_load", {
  id: uuid("id").primaryKey().defaultRandom(),
  facilityId: uuid("facility_id").notNull(),
  mode: text("mode").notNull(),
  catalogueVersion: text("catalogue_version").notNull(),
  seed: integer("seed").notNull(),
  day0: date("day0").notNull(),
  status: text("status").notNull().default("loading"),
  progress: jsonb("progress").notNull().default({}),
  previousConditionSettings: jsonb("previous_condition_settings").notNull().default({}),
  counts: jsonb("counts").notNull().default({}),
  startedBy: uuid("started_by").notNull(),
  startedAt: ts("started_at").notNull().defaultNow(),
  endedBy: uuid("ended_by"),
  endedAt: ts("ended_at"),
});

export const ncdConditionSetting = pgTable("ncd_condition_setting", {
  id: uuid("id").primaryKey().defaultRandom(),
  facilityId: uuid("facility_id").notNull(),
  conditionCode: text("condition_code").notNull(),
  enabled: boolean("enabled").notNull(),
  moduleLevel: text("module_level").notNull(),
  moduleStatus: text("module_status").notNull(),
  moduleVersion: text("module_version").notNull(),
  version: integer("version").notNull(),
  reason: text("reason"),
  demoLoadId: uuid("demo_load_id"),
  setBy: uuid("set_by"),
  setAt: ts("set_at").notNull().defaultNow(),
});

export const ncdStaffRole = pgTable("ncd_staff_role", {
  id: uuid("id").primaryKey().defaultRandom(),
  facilityId: uuid("facility_id").notNull(),
  userId: uuid("user_id").notNull(),
  ncdRole: text("ncd_role").notNull(),
  grantedBy: uuid("granted_by"),
  grantedAt: ts("granted_at").notNull().defaultNow(),
  revokedBy: uuid("revoked_by"),
  revokedAt: ts("revoked_at"),
});

export const ncdRegistryCounter = pgTable("ncd_registry_counter", {
  facilityId: uuid("facility_id").primaryKey(),
  nextValue: integer("next_value").notNull().default(1),
});

export const ncdPerson = pgTable("ncd_person", {
  id: uuid("id").primaryKey().defaultRandom(),
  facilityId: uuid("facility_id").notNull(),
  registryNumber: text("registry_number").notNull(),
  isSynthetic: boolean("is_synthetic").notNull().default(false),
  demoLoadId: uuid("demo_load_id"),
  hospitalNumberCiphertext: text("hospital_number_ciphertext"),
  hospitalNumberHmac: text("hospital_number_hmac"),
  nationalIdCiphertext: text("national_id_ciphertext"),
  nationalIdHmac: text("national_id_hmac"),
  givenNameCiphertext: text("given_name_ciphertext").notNull(),
  familyNameCiphertext: text("family_name_ciphertext").notNull(),
  sex: text("sex").notNull(),
  dateOfBirth: date("date_of_birth"),
  birthYear: integer("birth_year").notNull(),
  dobEstimated: boolean("dob_estimated").notNull().default(false),
  phone1Ciphertext: text("phone1_ciphertext"),
  phone1Hmac: text("phone1_hmac"),
  phone1Invalid: boolean("phone1_invalid").notNull().default(false),
  phone2Ciphertext: text("phone2_ciphertext"),
  phone2Hmac: text("phone2_hmac"),
  phone2Invalid: boolean("phone2_invalid").notNull().default(false),
  hasValidPhone: boolean("has_valid_phone").generatedAlwaysAs(
    sql`(phone1_hmac IS NOT NULL AND NOT phone1_invalid) OR (phone2_hmac IS NOT NULL AND NOT phone2_invalid)`,
  ),
  nokNameCiphertext: text("nok_name_ciphertext"),
  nokPhoneCiphertext: text("nok_phone_ciphertext"),
  districtCode: text("district_code"),
  districtName: text("district_name"),
  subcountyCode: text("subcounty_code"),
  subcountyName: text("subcounty_name"),
  parishCiphertext: text("parish_ciphertext"),
  villageCiphertext: text("village_ciphertext"),
  smsAllowed: boolean("sms_allowed").notNull().default(false),
  callsAllowed: boolean("calls_allowed").notNull().default(true),
  smsOptedOutAt: ts("sms_opted_out_at"),
  privacyNoticeVersion: text("privacy_notice_version").notNull(),
  privacyNoticeAckAt: ts("privacy_notice_ack_at").notNull(),
  heightCm: num("height_cm", 5, 1),
  tobacco: text("tobacco"),
  alcohol: text("alcohol"),
  knownCvd: text("known_cvd").array().notNull(),
  knownKidneyDisease: boolean("known_kidney_disease"),
  familyHistoryDiabetes: boolean("family_history_diabetes"),
  familyHistoryHypertension: boolean("family_history_hypertension"),
  recallRemovedAt: ts("recall_removed_at"),
  mergedIntoId: uuid("merged_into_id"),
  mergedAt: ts("merged_at"),
  patientUserId: uuid("patient_user_id"),
  provisionalPatientId: uuid("provisional_patient_id"),
  principal: text("principal").notNull().default("user"),
  enteredBy: uuid("entered_by"),
  enteredByLabel: text("entered_by_label"),
  enteredAt: ts("entered_at").notNull().defaultNow(),
  version: integer("version").notNull().default(1),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const ncdNameIndex = pgTable("ncd_name_index", {
  id: uuid("id").primaryKey().defaultRandom(),
  facilityId: uuid("facility_id").notNull(),
  personId: uuid("person_id").notNull(),
  tokenHmac: text("token_hmac").notNull(),
});

export const ncdRegistration = pgTable("ncd_registration", {
  id: uuid("id").primaryKey().defaultRandom(),
  facilityId: uuid("facility_id").notNull(),
  personId: uuid("person_id").notNull(),
  conditionCode: text("condition_code").notNull(),
  subtype: text("subtype").notNull(),
  registrationDate: date("registration_date").notNull(),
  diagnosisYear: integer("diagnosis_year").notNull(),
  diagnosisMonth: integer("diagnosis_month"),
  basisOfDiagnosis: text("basis_of_diagnosis").notNull(),
  whereFirstDiagnosed: text("where_first_diagnosed"),
  referralSource: text("referral_source"),
  isHistorical: boolean("is_historical").notNull().default(false),
  supersededById: uuid("superseded_by_id"),
  principal: text("principal").notNull().default("user"),
  enteredBy: uuid("entered_by"),
  enteredByLabel: text("entered_by_label"),
  enteredAt: ts("entered_at").notNull().defaultNow(),
  version: integer("version").notNull().default(1),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const ncdAppointment = pgTable("ncd_appointment", {
  id: uuid("id").primaryKey().defaultRandom(),
  facilityId: uuid("facility_id").notNull(),
  personId: uuid("person_id").notNull(),
  appointmentDate: date("appointment_date").notNull(),
  sourceVisitId: uuid("source_visit_id"),
  sourceCallId: uuid("source_call_id"),
  status: text("status").notNull().default("pending"),
  statusReason: text("status_reason"),
  enteredAt: ts("entered_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const ncdVisit = pgTable("ncd_visit", {
  id: uuid("id").primaryKey().defaultRandom(),
  facilityId: uuid("facility_id").notNull(),
  personId: uuid("person_id").notNull(),
  appointmentId: uuid("appointment_id"),
  visitDate: date("visit_date").notNull(),
  visitType: text("visit_type").notNull(),
  isHistorical: boolean("is_historical").notNull().default(false),
  status: text("status").notNull().default("open"),
  isInvalid: boolean("is_invalid").notNull().default(false),
  stage: text("stage").notNull().default("waiting"),
  arrivedAt: ts("arrived_at"),
  weightKg: num("weight_kg", 5, 1),
  bpReadings: jsonb("bp_readings").$type<[number, number][]>().notNull().default([]),
  visitSystolic: integer("visit_systolic"),
  visitDiastolic: integer("visit_diastolic"),
  bmi: num("bmi", 4, 1),
  heightCmUsed: num("height_cm_used", 5, 1),
  bmiFormula: text("bmi_formula"),
  bpFormula: text("bp_formula"),
  glucoseMmol: num("glucose_mmol", 4, 1),
  glucoseOriginalValue: num("glucose_original_value", 6, 1),
  glucoseOriginalUnit: text("glucose_original_unit"),
  glucoseType: text("glucose_type"),
  glucoseMethod: text("glucose_method"),
  hba1cPercent: num("hba1c_percent", 4, 1),
  hba1cMmolMol: integer("hba1c_mmol_mol"),
  hba1cResultDate: date("hba1c_result_date"),
  hypoglycaemia: text("hypoglycaemia"),
  medicines: text("medicines").array().notNull(),
  medicinesOtherCiphertext: text("medicines_other_ciphertext"),
  medicinesConfirmedUnchanged: boolean("medicines_confirmed_unchanged"),
  missedDoses: text("missed_doses"),
  medicinesObtained: text("medicines_obtained"),
  notObtainedReason: text("not_obtained_reason"),
  nextAppointmentDate: date("next_appointment_date"),
  disposition: text("disposition"),
  nurseSavedBy: uuid("nurse_saved_by"),
  nurseSavedAt: ts("nurse_saved_at"),
  nurseSavedLabel: text("nurse_saved_label"),
  clinicianStartedBy: uuid("clinician_started_by"),
  clinicianStartedAt: ts("clinician_started_at"),
  clinicianSavedBy: uuid("clinician_saved_by"),
  clinicianSavedAt: ts("clinician_saved_at"),
  clinicianSavedLabel: text("clinician_saved_label"),
  closedBy: uuid("closed_by"),
  closedAt: ts("closed_at"),
  principal: text("principal").notNull().default("user"),
  enteredBy: uuid("entered_by"),
  enteredAt: ts("entered_at").notNull().defaultNow(),
  clientTs: ts("client_ts"),
  version: integer("version").notNull().default(1),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const ncdObservation = pgTable("ncd_observation", {
  id: uuid("id").primaryKey().defaultRandom(),
  facilityId: uuid("facility_id").notNull(),
  personId: uuid("person_id").notNull(),
  visitId: uuid("visit_id").notNull(),
  registrationId: uuid("registration_id").notNull(),
  code: text("code").notNull(),
  valueText: text("value_text"),
  valueNum: numeric("value_num", { mode: "number" }),
  enteredAt: ts("entered_at").notNull().defaultNow(),
});

export const ncdReview = pgTable("ncd_review", {
  id: uuid("id").primaryKey().defaultRandom(),
  facilityId: uuid("facility_id").notNull(),
  personId: uuid("person_id").notNull(),
  component: text("component").notNull(),
  reviewDate: date("review_date").notNull(),
  data: jsonb("data").$type<Record<string, unknown>>().notNull(),
  derived: jsonb("derived").$type<Record<string, unknown>>().notNull().default({}),
  isHistorical: boolean("is_historical").notNull().default(false),
  isInvalid: boolean("is_invalid").notNull().default(false),
  principal: text("principal").notNull().default("user"),
  enteredBy: uuid("entered_by"),
  enteredByLabel: text("entered_by_label"),
  enteredAt: ts("entered_at").notNull().defaultNow(),
  version: integer("version").notNull().default(1),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const ncdEvent = pgTable("ncd_event", {
  id: uuid("id").primaryKey().defaultRandom(),
  facilityId: uuid("facility_id").notNull(),
  personId: uuid("person_id").notNull(),
  eventType: text("event_type").notNull(),
  eventDate: date("event_date").notNull(),
  dateEstimated: boolean("date_estimated").notNull().default(false),
  reportingUnit: text("reporting_unit").notNull(),
  admissionReason: text("admission_reason"),
  deathPlace: text("death_place"),
  deathCauseCiphertext: text("death_cause_ciphertext"),
  deathSource: text("death_source"),
  transferDestinationCiphertext: text("transfer_destination_ciphertext"),
  isInvalid: boolean("is_invalid").notNull().default(false),
  principal: text("principal").notNull().default("user"),
  enteredBy: uuid("entered_by"),
  enteredByLabel: text("entered_by_label"),
  enteredAt: ts("entered_at").notNull().defaultNow(),
  version: integer("version").notNull().default(1),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const ncdCall = pgTable("ncd_call", {
  id: uuid("id").primaryKey().defaultRandom(),
  facilityId: uuid("facility_id").notNull(),
  personId: uuid("person_id").notNull(),
  appointmentId: uuid("appointment_id"),
  callDate: date("call_date").notNull(),
  outcome: text("outcome").notNull(),
  newAppointmentDate: date("new_appointment_date"),
  phoneSlot: integer("phone_slot"),
  principal: text("principal").notNull().default("user"),
  enteredBy: uuid("entered_by"),
  enteredByLabel: text("entered_by_label"),
  enteredAt: ts("entered_at").notNull().defaultNow(),
});

export const ncdSmsTemplate = pgTable("ncd_sms_template", {
  id: uuid("id").primaryKey().defaultRandom(),
  facilityId: uuid("facility_id").notNull(),
  purpose: text("purpose").notNull(),
  language: text("language").notNull(),
  body: text("body").notNull().default(""),
  status: text("status").notNull().default("draft"),
  version: integer("version").notNull().default(1),
  createdBy: uuid("created_by"),
  firstApprover: uuid("first_approver"),
  approvedBy: uuid("approved_by"),
  approvedAt: ts("approved_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const ncdReminder = pgTable("ncd_reminder", {
  id: uuid("id").primaryKey().defaultRandom(),
  facilityId: uuid("facility_id").notNull(),
  personId: uuid("person_id").notNull(),
  appointmentId: uuid("appointment_id").notNull(),
  kind: text("kind").notNull(),
  seq: integer("seq").notNull().default(1),
  dueOn: date("due_on").notNull(),
  status: text("status").notNull().default("pending"),
  statusReason: text("status_reason"),
  decidedAt: ts("decided_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const ncdSmsLog = pgTable("ncd_sms_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  facilityId: uuid("facility_id").notNull(),
  personId: uuid("person_id").notNull(),
  reminderId: uuid("reminder_id"),
  toHmac: text("to_hmac"),
  body: text("body").notNull(),
  transport: text("transport").notNull(),
  result: text("result").notNull(),
  reason: text("reason"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const ncdQuery = pgTable("ncd_query", {
  id: uuid("id").primaryKey().defaultRandom(),
  facilityId: uuid("facility_id").notNull(),
  personId: uuid("person_id").notNull(),
  ruleId: text("rule_id").notNull(),
  status: text("status").notNull().default("open"),
  detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
  resolutionNote: text("resolution_note"),
  createdAt: ts("created_at").notNull().defaultNow(),
  resolvedBy: uuid("resolved_by"),
  resolvedAt: ts("resolved_at"),
});

export const ncdAuditSample = pgTable("ncd_audit_sample", {
  id: uuid("id").primaryKey().defaultRandom(),
  facilityId: uuid("facility_id").notNull(),
  personId: uuid("person_id").notNull(),
  visitId: uuid("visit_id").notNull(),
  month: date("month").notNull(),
  seed: text("seed").notNull(),
  fieldAgreement: jsonb("field_agreement").$type<Record<string, boolean>>(),
  checkedBy: uuid("checked_by"),
  checkedAt: ts("checked_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const ncdMergeRequest = pgTable("ncd_merge_request", {
  id: uuid("id").primaryKey().defaultRandom(),
  facilityId: uuid("facility_id").notNull(),
  personId: uuid("person_id").notNull(),
  loserPersonId: uuid("loser_person_id").notNull(),
  reason: text("reason"),
  status: text("status").notNull().default("requested"),
  requestedBy: uuid("requested_by").notNull(),
  requestedAt: ts("requested_at").notNull().defaultNow(),
  decidedBy: uuid("decided_by"),
  decidedAt: ts("decided_at"),
});

export const ncdRecordVersion = pgTable("ncd_record_version", {
  id: uuid("id").primaryKey().defaultRandom(),
  facilityId: uuid("facility_id").notNull(),
  personId: uuid("person_id").notNull(),
  recordTable: text("record_table").notNull(),
  recordId: uuid("record_id").notNull(),
  version: integer("version").notNull(),
  data: jsonb("data").$type<Record<string, unknown>>().notNull(),
  reason: text("reason").notNull(),
  changedBy: uuid("changed_by"),
  changedAt: ts("changed_at").notNull().defaultNow(),
});

export const ncdCommandLog = pgTable("ncd_command_log", {
  commandId: uuid("command_id").primaryKey(),
  facilityId: uuid("facility_id").notNull(),
  personId: uuid("person_id"),
  type: text("type").notNull(),
  principal: text("principal").notNull(),
  userId: uuid("user_id"),
  clientTs: ts("client_ts"),
  enteredAt: ts("entered_at").notNull(),
  result: jsonb("result").$type<Record<string, unknown>>().notNull().default({}),
  demoLoadId: uuid("demo_load_id"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const ncdIndicatorSnapshot = pgTable("ncd_indicator_snapshot", {
  id: uuid("id").primaryKey().defaultRandom(),
  facilityId: uuid("facility_id").notNull(),
  month: date("month").notNull(),
  definitionVersion: text("definition_version").notNull(),
  results: jsonb("results").$type<Record<string, unknown>>().notNull(),
  isSynthetic: boolean("is_synthetic").notNull().default(false),
  demoLoadId: uuid("demo_load_id"),
  computedAt: ts("computed_at").notNull().defaultNow(),
  signedBy: uuid("signed_by"),
  signedAt: ts("signed_at"),
});

export const ncdGoLiveRequest = pgTable("ncd_go_live_request", {
  id: uuid("id").primaryKey().defaultRandom(),
  facilityId: uuid("facility_id").notNull(),
  status: text("status").notNull().default("requested"),
  note: text("note"),
  requestedBy: uuid("requested_by").notNull(),
  requestedAt: ts("requested_at").notNull().defaultNow(),
  decidedBy: uuid("decided_by"),
  decidedAt: ts("decided_at"),
});

export const ncdExportRequest = pgTable("ncd_export_request", {
  id: uuid("id").primaryKey().defaultRandom(),
  facilityId: uuid("facility_id").notNull(),
  kind: text("kind").notNull(),
  status: text("status").notNull().default("requested"),
  approvalReference: text("approval_reference"),
  requestedBy: uuid("requested_by").notNull(),
  requestedAt: ts("requested_at").notNull().defaultNow(),
  approvedBy: uuid("approved_by"),
  approvedAt: ts("approved_at"),
  releasedAt: ts("released_at"),
  detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
});

export const ncdDefinitionVersion = pgTable("ncd_definition_version", {
  id: uuid("id").primaryKey().defaultRandom(),
  facilityId: uuid("facility_id").notNull(),
  definitionId: text("definition_id").notNull(),
  version: text("version").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  status: text("status").notNull().default("proposed"),
  author: uuid("author").notNull(),
  approver: uuid("approver"),
  decidedAt: ts("decided_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const ncdAccessEvent = pgTable("ncd_access_event", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
  facilityId: uuid("facility_id").notNull(),
  userId: uuid("user_id"),
  principal: text("principal").notNull().default("user"),
  action: text("action").notNull(),
  personId: uuid("person_id"),
  demoLoadId: uuid("demo_load_id"),
  detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
  at: ts("at").notNull().defaultNow(),
});

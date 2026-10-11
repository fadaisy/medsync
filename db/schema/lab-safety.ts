import {
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Lab Phase 1 — the safety floor (migrations 0102–0105, GATED; ADRs 0239–0250). Column for column with
 * the SQL, which is the source of truth (tests/emr-db/drizzle-parity.test.ts). CHECKs, triggers, RLS and
 * the append-only rules live in the migrations; nothing here restates a clinical number.
 */
const tz = { withTimezone: true } as const;

/* ─── 0102 criticals ───────────────────────────────────────────────── */

export const labSettings = pgTable("lab_settings", {
  hospitalId: uuid("hospital_id").primaryKey(),
  labPhone: text("lab_phone"),
  secondCheck: boolean("second_check").notNull().default(false),
  smsLive: boolean("sms_live").notNull().default(false),
  updatedBy: uuid("updated_by"),
  updatedAt: timestamp("updated_at", tz).notNull().defaultNow(),
});

const signedSet = {
  version: integer("version").notNull(),
  status: text("status").notNull().default("draft"),
  authoredBy: uuid("authored_by").notNull(),
  leadSignedBy: uuid("lead_signed_by"),
  leadSignedAt: timestamp("lead_signed_at", tz),
  csoSignedBy: uuid("cso_signed_by"),
  csoSignedAt: timestamp("cso_signed_at", tz),
  exceptionNote: text("exception_note"),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  supersededAt: timestamp("superseded_at", tz),
};

export const criticalResponseVersions = pgTable("critical_response_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  ackWithinMin: integer("ack_within_min").notNull(),
  level1AfterMin: integer("level1_after_min"),
  level2AfterMin: integer("level2_after_min"),
  source: text("source").notNull(),
  ...signedSet,
});

export const criticalContacts = pgTable("critical_contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  departmentId: uuid("department_id"),
  level: smallint("level").notNull(),
  userId: uuid("user_id").notNull(),
  position: integer("position").notNull().default(0),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
});

export const criticalAlerts = pgTable("critical_alerts", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  patientUserId: uuid("patient_user_id").notNull(),
  reportId: uuid("report_id").notNull(),
  orderId: uuid("order_id"),
  correctionOf: uuid("correction_of"),
  restricted: boolean("restricted").notNull().default(false),
  state: text("state").notNull().default("open"),
  subState: text("sub_state"),
  level: smallint("level").notNull().default(0),
  sentAt: timestamp("sent_at", tz).notNull().defaultNow(),
  dueAt: timestamp("due_at", tz),
  acknowledgedAt: timestamp("acknowledged_at", tz),
  acknowledgedBy: uuid("acknowledged_by"),
  acknowledgedVia: text("acknowledged_via"),
  responseCode: text("response_code"),
  noteCiphertext: text("note_ciphertext"),
  loggedBy: uuid("logged_by"),
  createdBy: uuid("created_by").notNull(),
  clientKey: text("client_key"),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
});

export const criticalMarks = pgTable("critical_marks", {
  id: uuid("id").primaryKey().defaultRandom(),
  alertId: uuid("alert_id").notNull(),
  reportId: uuid("report_id").notNull(),
  hospitalId: uuid("hospital_id").notNull(),
  patientUserId: uuid("patient_user_id").notNull(),
  conceptId: text("concept_id").notNull(),
  source: text("source").notNull(),
  limitId: uuid("limit_id"),
  limitVersion: integer("limit_version"),
  direction: text("direction"),
  checkKind: text("check_kind").notNull(),
  repeatValue: numeric("repeat_value"),
  couldNotCheckReason: text("could_not_check_reason"),
  couldNotCheckText: text("could_not_check_text"),
  sampleChecked: boolean("sample_checked").notNull(),
  secondCheckerId: uuid("second_checker_id"),
  soloReason: text("solo_reason"),
  actorId: uuid("actor_id").notNull(),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
});

export const criticalAlertEvents = pgTable("critical_alert_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  alertId: uuid("alert_id").notNull(),
  hospitalId: uuid("hospital_id").notNull(),
  kind: text("kind").notNull(),
  level: smallint("level"),
  actorId: uuid("actor_id"),
  recipientId: uuid("recipient_id"),
  channel: text("channel"),
  outcome: text("outcome"),
  data: jsonb("data").notNull().default({}),
  at: timestamp("at", tz).notNull().defaultNow(),
});

export const escalationHeartbeats = pgTable("escalation_heartbeats", {
  id: uuid("id").primaryKey().defaultRandom(),
  source: text("source").notNull(),
  ranAt: timestamp("ran_at", tz).notNull().defaultNow(),
  escalated: integer("escalated").notNull().default(0),
});

export const labSmsTemplates = pgTable("lab_sms_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind").notNull(),
  version: integer("version").notNull(),
  body: text("body").notNull(),
  status: text("status").notNull().default("draft"),
  authoredBy: uuid("authored_by").notNull(),
  firstApprover: uuid("first_approver"),
  approvedBy: uuid("approved_by"),
  approvedAt: timestamp("approved_at", tz),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
});

/* ─── 0103 measures ────────────────────────────────────────────────── */

export const ucumUnits = pgTable("ucum_units", {
  code: text("code").primaryKey(),
  display: text("display").notNull(),
  words: text("words").notNull(),
});

export const labComponentMeasures = pgTable("lab_component_measures", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  testId: uuid("test_id").notNull(),
  conceptId: text("concept_id").notNull(),
  version: integer("version").notNull(),
  resultType: text("result_type").notNull(),
  unitUcum: text("unit_ucum"),
  unitDisplay: text("unit_display"),
  decimalPlaces: smallint("decimal_places"),
  loincCode: text("loinc_code"),
  entryCheckLow: numeric("entry_check_low"),
  entryCheckHigh: numeric("entry_check_high"),
  supersededBy: uuid("superseded_by"),
  authoredBy: uuid("authored_by").notNull(),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
});

export const labResultSnapshots = pgTable("lab_result_snapshots", {
  observationId: uuid("observation_id").primaryKey(),
  reportId: uuid("report_id").notNull(),
  hospitalId: uuid("hospital_id").notNull(),
  patientUserId: uuid("patient_user_id").notNull(),
  measureId: uuid("measure_id").notNull(),
  measureVersion: integer("measure_version").notNull(),
  valueDecimal: numeric("value_decimal").notNull(),
  valueText: text("value_text").notNull(),
  unitUcum: text("unit_ucum").notNull(),
  unitDisplay: text("unit_display").notNull(),
  rangeState: text("range_state").notNull(),
  rangeLow: numeric("range_low"),
  rangeHigh: numeric("range_high"),
  rangeBandId: uuid("range_band_id"),
  rangeVersionId: uuid("range_version_id"),
  flagComputed: text("flag_computed"),
  flagFinal: text("flag_final"),
  flagChangeReason: text("flag_change_reason"),
  flagChangedBy: uuid("flag_changed_by"),
  entryCheckConfirmedBy: uuid("entry_check_confirmed_by"),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
});

/* ─── 0104 ranges and limits ───────────────────────────────────────── */

export const referenceRangeVersions = pgTable("reference_range_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  testId: uuid("test_id").notNull(),
  conceptId: text("concept_id").notNull(),
  unitUcum: text("unit_ucum").notNull(),
  inForceFrom: timestamp("in_force_from", tz),
  ...signedSet,
});

export const referenceRangeBands = pgTable("reference_range_bands", {
  id: uuid("id").primaryKey().defaultRandom(),
  versionId: uuid("version_id").notNull(),
  sex: text("sex").notNull(),
  ageFromDays: integer("age_from_days"),
  ageToDays: integer("age_to_days"),
  low: numeric("low"),
  high: numeric("high"),
  source: text("source").notNull(),
});

export const criticalLimitVersions = pgTable("critical_limit_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  inForceFrom: timestamp("in_force_from", tz),
  ...signedSet,
});

export const criticalLimits = pgTable("critical_limits", {
  id: uuid("id").primaryKey().defaultRandom(),
  versionId: uuid("version_id").notNull(),
  testId: uuid("test_id").notNull(),
  conceptId: text("concept_id").notNull(),
  unitUcum: text("unit_ucum").notNull(),
  ageFromDays: integer("age_from_days"),
  ageToDays: integer("age_to_days"),
  low: numeric("low"),
  high: numeric("high"),
  referenceId: text("reference_id").notNull(),
  source: text("source").notNull(),
});

/* ─── 0105 downtime and cut-over ───────────────────────────────────── */

export const downtimePeriods = pgTable("downtime_periods", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  startsAt: timestamp("starts_at", tz).notNull(),
  endsAt: timestamp("ends_at", tz).notNull(),
  reason: text("reason").notNull(),
  note: text("note"),
  recordedBy: uuid("recorded_by").notNull(),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
});

export const downtimeFormNumbers = pgTable(
  "downtime_form_numbers",
  {
    hospitalId: uuid("hospital_id").notNull(),
    number: integer("number").notNull(),
    state: text("state").notNull().default("unused"),
    reservedBy: uuid("reserved_by").notNull(),
    reservedAt: timestamp("reserved_at", tz).notNull().defaultNow(),
    reportId: uuid("report_id"),
    voidedReason: text("voided_reason"),
  },
  (t) => [primaryKey({ columns: [t.hospitalId, t.number] })],
);

export const downtimeEntries = pgTable("downtime_entries", {
  reportId: uuid("report_id").primaryKey(),
  hospitalId: uuid("hospital_id").notNull(),
  patientUserId: uuid("patient_user_id").notNull(),
  formNumber: integer("form_number").notNull(),
  collectedAt: timestamp("collected_at", tz).notNull(),
  resultedAt: timestamp("resulted_at", tz).notNull(),
  enteredAt: timestamp("entered_at", tz).notNull().defaultNow(),
  releasedOnPaperBy: text("released_on_paper_by").notNull(),
  outsidePeriodReason: text("outside_period_reason"),
  enteredBy: uuid("entered_by").notNull(),
});

export const downtimeDrills = pgTable("downtime_drills", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  heldOn: date("held_on").notNull(),
  participants: text("participants").notNull(),
  whatWasDone: text("what_was_done").notNull(),
  problems: text("problems"),
  recordedBy: uuid("recorded_by").notNull(),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
});

export const labBriefings = pgTable("lab_briefings", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  heldOn: date("held_on").notNull(),
  audience: text("audience").notNull(),
  notes: text("notes"),
  recordedBy: uuid("recorded_by").notNull(),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
});

export const labCutover = pgTable("lab_cutover", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  conditions: jsonb("conditions").notNull(),
  requestedBy: uuid("requested_by").notNull(),
  requestedAt: timestamp("requested_at", tz).notNull().defaultNow(),
  approvedBy: uuid("approved_by"),
  switchedAt: timestamp("switched_at", tz),
  reversedBy: uuid("reversed_by"),
  reversalApprovedBy: uuid("reversal_approved_by"),
  reversedAt: timestamp("reversed_at", tz),
  reversalReason: text("reversal_reason"),
});

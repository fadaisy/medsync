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
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Lab Phase 5 (migrations 0154–0157; GATED; docs/lab/phase-5/gate-a-proposal.md §10). Column for column with the
 * SQL, which is the source of truth (tests/emr-db/drizzle-parity.test.ts). The never-shown floor, append-only
 * triggers, the patient's definer function and RLS live in the migrations; nothing here carries a clinical number.
 */
const tz = { withTimezone: true } as const;

/* ─── 0154 patients see their results ───────────────────────────────── */
export const patientToldEvents = pgTable("patient_told_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  reportId: uuid("report_id").notNull(),
  patientUserId: uuid("patient_user_id").notNull(),
  how: text("how").notNull(),
  toldBy: uuid("told_by").notNull(),
  toldAt: timestamp("told_at", tz).notNull(),
  clientKey: text("client_key").notNull(),
  recordedAt: timestamp("recorded_at", tz).notNull().defaultNow(),
});

export const patientHoldEvents = pgTable("patient_hold_events", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  hospitalId: uuid("hospital_id").notNull(),
  reportLogicalId: uuid("report_logical_id").notNull(),
  reportId: uuid("report_id").notNull(),
  patientUserId: uuid("patient_user_id").notNull(),
  kind: text("kind").notNull(),
  reason: text("reason"),
  untilOn: date("until_on"),
  byUser: uuid("by_user").notNull(),
  at: timestamp("at", tz).notNull().defaultNow(),
  clientKey: text("client_key").notNull(),
});

export const clinicianNotesToPatient = pgTable("clinician_notes_to_patient", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  reportId: uuid("report_id").notNull(),
  patientUserId: uuid("patient_user_id").notNull(),
  textCiphertext: text("text_ciphertext").notNull(),
  authorUserId: uuid("author_user_id").notNull(),
  at: timestamp("at", tz).notNull().defaultNow(),
  clientKey: text("client_key").notNull(),
});

export const patientResultViews = pgTable("patient_result_views", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  reportId: uuid("report_id").notNull(),
  patientUserId: uuid("patient_user_id").notNull(),
  viewerUserId: uuid("viewer_user_id").notNull(),
  deviceClass: text("device_class").notNull(),
  viewedAt: timestamp("viewed_at", tz).notNull().defaultNow(),
});

export const guardianLinks = pgTable("guardian_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  guardianUserId: uuid("guardian_user_id").notNull(),
  childUserId: uuid("child_user_id").notNull(),
  relationship: text("relationship").notNull(),
  verifiedBy: uuid("verified_by").notNull(),
  verifiedAt: timestamp("verified_at", tz).notNull().defaultNow(),
  evidence: text("evidence").notNull(),
  endedAt: timestamp("ended_at", tz),
  endedBy: uuid("ended_by"),
});

export const recordsRequests = pgTable("records_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  patientUserId: uuid("patient_user_id").notNull(),
  requestedAt: timestamp("requested_at", tz).notNull().defaultNow(),
  dueOn: date("due_on").notNull(),
  fulfilledAt: timestamp("fulfilled_at", tz),
  fulfilledBy: uuid("fulfilled_by"),
  note: text("note"),
  clientKey: text("client_key").notNull(),
});

/* ─── 0155 delta checks ─────────────────────────────────────────────── */
export const deltaFlags = pgTable("delta_flags", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  patientUserId: uuid("patient_user_id").notNull(),
  orderId: uuid("order_id").notNull(),
  reportLogicalId: uuid("report_logical_id").notNull(),
  reportId: uuid("report_id").notNull(),
  kind: text("kind").notNull(),
  conceptId: text("concept_id"),
  ruleConfigId: uuid("rule_config_id").notNull(),
  ruleKey: text("rule_key").notNull(),
  ruleVersion: integer("rule_version").notNull(),
  previousReportId: uuid("previous_report_id"),
  previousValue: numeric("previous_value"),
  currentValue: numeric("current_value"),
  unit: text("unit"),
  changeAbs: numeric("change_abs"),
  changePct: numeric("change_pct"),
  intervalHours: numeric("interval_hours"),
  detail: jsonb("detail").notNull().default({}),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
});

export const deltaOutcomes = pgTable("delta_outcomes", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  flagId: uuid("flag_id").notNull(),
  outcome: text("outcome").notNull(),
  withWhom: text("with_whom"),
  note: text("note").notNull(),
  nonconformityId: uuid("nonconformity_id"),
  decidedBy: uuid("decided_by").notNull(),
  decidedAt: timestamp("decided_at", tz).notNull().defaultNow(),
  clientKey: text("client_key").notNull(),
});

/* ─── 0156 the infection prevention feed ───────────────────────────── */
export const ipcAlerts = pgTable("ipc_alerts", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  patientUserId: uuid("patient_user_id").notNull(),
  entryKey: text("entry_key").notNull(),
  entryConfigId: uuid("entry_config_id").notNull(),
  trigger: text("trigger").notNull(),
  episodeKey: text("episode_key").notNull(),
  reportId: uuid("report_id"),
  referralId: uuid("referral_id"),
  wardId: uuid("ward_id"),
  bedId: uuid("bed_id"),
  admittedAt: timestamp("admitted_at", tz),
  specimenAt: timestamp("specimen_at", tz),
  releasedAt: timestamp("released_at", tz),
  route: text("route").notNull(),
  idsrItem: text("idsr_item"),
  screening: boolean("screening").notNull().default(false),
  restrictedClass: text("restricted_class"),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
});

export const ipcAlertActions = pgTable("ipc_alert_actions", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  hospitalId: uuid("hospital_id").notNull(),
  alertId: uuid("alert_id").notNull(),
  kind: text("kind").notNull(),
  detail: jsonb("detail").notNull().default({}),
  byUser: uuid("by_user"),
  at: timestamp("at", tz).notNull().defaultNow(),
  clientKey: text("client_key"),
});

export const patientIpcFlagEvents = pgTable("patient_ipc_flag_events", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  hospitalId: uuid("hospital_id").notNull(),
  patientUserId: uuid("patient_user_id").notNull(),
  entryKey: text("entry_key").notNull(),
  condition: text("condition").notNull(),
  precaution: text("precaution").notNull(),
  kind: text("kind").notNull(),
  reason: text("reason"),
  alertId: uuid("alert_id"),
  byUser: uuid("by_user").notNull(),
  at: timestamp("at", tz).notNull().defaultNow(),
});

export const ipcListChecks = pgTable("ipc_list_checks", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  configId: uuid("config_id").notNull(),
  checkedBy: uuid("checked_by").notNull(),
  checkedAt: timestamp("checked_at", tz).notNull().defaultNow(),
  note: text("note"),
});

/* ─── 0157 lab demo data ────────────────────────────────────────────── */
export const labDemoHospitals = pgTable("lab_demo_hospitals", {
  hospitalId: uuid("hospital_id").primaryKey(),
  markedBy: uuid("marked_by").notNull(),
  markedAt: timestamp("marked_at", tz).notNull().defaultNow(),
  note: text("note").notNull(),
});

export const labDemoLoads = pgTable("lab_demo_loads", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  startedBy: uuid("started_by").notNull(),
  startedAt: timestamp("started_at", tz).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", tz),
  scenario: text("scenario").notNull(),
  counts: jsonb("counts").notNull().default({}),
  error: text("error"),
});

export const labDemoPatients = pgTable(
  "lab_demo_patients",
  {
    loadId: uuid("load_id").notNull(),
    hospitalId: uuid("hospital_id").notNull(),
    patientUserId: uuid("patient_user_id").notNull(),
    label: text("label").notNull(),
  },
  (t) => [primaryKey({ columns: [t.loadId, t.patientUserId] })],
);

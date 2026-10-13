import {
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
 * Lab Phase 3 (migrations 0112–0117; GATED; docs/lab/phase-3/gate-a-proposal.md §3). Column for column with the
 * SQL, which is the source of truth (tests/emr-db/drizzle-parity.test.ts). State machines, append-only and
 * once-only triggers and RLS live in the migrations; nothing here carries a clinical number.
 */
const tz = { withTimezone: true } as const;

/* ─── 0112 stock ───────────────────────────────────────────────────── */
export const labStockItems = pgTable("lab_stock_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  name: text("name").notNull(),
  kind: text("kind").notNull(),
  unitOfIssue: text("unit_of_issue").notNull(),
  packSize: integer("pack_size"),
  testsPerUnit: numeric("tests_per_unit"),
  testCodes: text("test_codes").array().notNull().default([]),
  conceptIds: text("concept_ids").array().notNull().default([]),
  storageDeviceId: uuid("storage_device_id"),
  hmisTracerCode: text("hmis_tracer_code"),
  /** Months of stock, set by the laboratory lead (operational, ST-5). */
  minMonths: numeric("min_months"),
  maxMonths: numeric("max_months"),
  active: boolean("active").notNull().default(true),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  updatedBy: uuid("updated_by"),
  updatedAt: timestamp("updated_at", tz).notNull().defaultNow(),
});

/** State moves only along §5.1, with a lab_stock_lot_events row in the same transaction (trigger). */
export const labStockLots = pgTable("lab_stock_lots", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  itemId: uuid("item_id").notNull(),
  lot: text("lot").notNull(),
  useBy: date("use_by"),
  receivedAt: timestamp("received_at", tz).notNull().defaultNow(),
  condition: jsonb("condition"),
  openedAt: timestamp("opened_at", tz),
  state: text("state").notNull().default("received"),
  acceptedBasis: text("accepted_basis"),
  statement: text("statement"),
  insertRanges: jsonb("insert_ranges"),
});

export const labStockLotEvents = pgTable("lab_stock_lot_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  lotId: uuid("lot_id").notNull(),
  hospitalId: uuid("hospital_id").notNull(),
  fromState: text("from_state"),
  toState: text("to_state").notNull(),
  reason: text("reason"),
  refKind: text("ref_kind"),
  refId: uuid("ref_id"),
  /** NULL: MedSync. */
  actor: uuid("actor"),
  at: timestamp("at", tz).notNull().defaultNow(),
});

export const labDeliveries = pgTable("lab_deliveries", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  supplier: text("supplier").notNull(),
  supplierName: text("supplier_name"),
  noteNumber: text("note_number"),
  receivedAt: timestamp("received_at", tz).notNull().defaultNow(),
  receivedBy: uuid("received_by").notNull(),
  lines: jsonb("lines").notNull(),
});

export const labStockCounts = pgTable("lab_stock_counts", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  countedAt: timestamp("counted_at", tz).notNull().defaultNow(),
  countedBy: uuid("counted_by").notNull(),
  lines: jsonb("lines").notNull(),
});

/** ST-3: on hand is the sum of this ledger, never a stored number. */
export const labStockTransactions = pgTable("lab_stock_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  itemId: uuid("item_id").notNull(),
  lotId: uuid("lot_id"),
  kind: text("kind").notNull(),
  quantity: integer("quantity").notNull(),
  toKind: text("to_kind"),
  toRef: uuid("to_ref"),
  reason: text("reason"),
  fefoReason: text("fefo_reason"),
  deliveryId: uuid("delivery_id"),
  countId: uuid("count_id"),
  actor: uuid("actor").notNull(),
  at: timestamp("at", tz).notNull().defaultNow(),
  clientKey: text("client_key"),
});

export const labLotAcceptances = pgTable("lab_lot_acceptances", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  lotId: uuid("lot_id").notNull(),
  planConfigId: uuid("plan_config_id"),
  planVersion: integer("plan_version"),
  method: text("method").notNull(),
  pairs: jsonb("pairs").notNull().default([]),
  qcCheckIds: uuid("qc_check_ids").array().notNull().default([]),
  certificatePath: text("certificate_path"),
  outcome: text("outcome").notNull(),
  reason: text("reason"),
  decidedBy: uuid("decided_by").notNull(),
  decidedAt: timestamp("decided_at", tz).notNull().defaultNow(),
});

/** Current = newest row per (device or section, concept, kind). */
export const labLotsInUse = pgTable("lab_lots_in_use", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  deviceId: uuid("device_id"),
  sectionId: uuid("section_id"),
  conceptId: text("concept_id"),
  kind: text("kind").notNull(),
  lotId: uuid("lot_id").notNull(),
  fromAt: timestamp("from_at", tz).notNull().defaultNow(),
  setBy: uuid("set_by").notNull(),
});

/* ─── 0113 equipment ───────────────────────────────────────────────── */
export const labEquipmentLogs = pgTable("lab_equipment_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  deviceId: uuid("device_id").notNull(),
  kind: text("kind").notNull(),
  taskKey: text("task_key"),
  value: numeric("value"),
  unit: text("unit"),
  inRange: boolean("in_range"),
  note: text("note"),
  filePath: text("file_path"),
  doneAt: timestamp("done_at", tz).notNull(),
  actor: uuid("actor").notNull(),
  at: timestamp("at", tz).notNull().defaultNow(),
  clientKey: text("client_key"),
});

/** The closing fields are set once (trigger). */
export const labBreakdowns = pgTable("lab_breakdowns", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  deviceId: uuid("device_id").notNull(),
  since: timestamp("since", tz).notNull(),
  cause: text("cause").notNull(),
  reportedTo: text("reported_to"),
  ticket: text("ticket"),
  hubProblemIds: uuid("hub_problem_ids").array().notNull().default([]),
  specimensToRefer: integer("specimens_to_refer").notNull().default(0),
  repairLogId: uuid("repair_log_id"),
  backAt: timestamp("back_at", tz),
  backBy: uuid("back_by"),
  downtimeMinutes: integer("downtime_minutes"),
});

/* ─── 0114 QC, nonconformities, look-back ──────────────────────────── */
export const labQcRuns = pgTable("lab_qc_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  deviceId: uuid("device_id").notNull(),
  conceptId: text("concept_id").notNull(),
  planConfigId: uuid("plan_config_id").notNull(),
  planVersion: integer("plan_version").notNull(),
  values: jsonb("values").notNull(),
  breaks: jsonb("breaks").notNull().default([]),
  decision: text("decision").notNull(),
  firstStep: text("first_step"),
  note: text("note"),
  runAt: timestamp("run_at", tz).notNull(),
  recordedBy: uuid("recorded_by").notNull(),
  clientKey: text("client_key"),
});

export const labQcStatus = pgTable(
  "lab_qc_status",
  {
    hospitalId: uuid("hospital_id").notNull(),
    deviceId: uuid("device_id").notNull(),
    conceptId: text("concept_id").notNull(),
    status: text("status").notNull(),
    runId: uuid("run_id"),
    planConfigId: uuid("plan_config_id"),
    held: boolean("held").notNull().default(false),
    updatedAt: timestamp("updated_at", tz).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.hospitalId, t.deviceId, t.conceptId] })],
);

export const labControlChecks = pgTable("lab_control_checks", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  subject: text("subject").notNull(),
  itemId: uuid("item_id"),
  lotId: uuid("lot_id"),
  deviceId: uuid("device_id"),
  trigger: text("trigger").notNull(),
  controls: jsonb("controls").notNull(),
  outcome: text("outcome").notNull(),
  hmisIqc: boolean("hmis_iqc").notNull().default(false),
  operator: uuid("operator").notNull(),
  at: timestamp("at", tz).notNull().defaultNow(),
  clientKey: text("client_key"),
});

export const labNonconformities = pgTable("lab_nonconformities", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  number: text("number").notNull(),
  source: text("source").notNull(),
  sourceRef: text("source_ref"),
  subjectDeviceId: uuid("subject_device_id"),
  subjectConceptId: text("subject_concept_id"),
  title: text("title").notNull(),
  whatHappened: text("what_happened").notNull(),
  riskText: text("risk_text"),
  testingHalted: boolean("testing_halted").notNull().default(false),
  owner: uuid("owner"),
  state: text("state").notNull().default("open"),
  causeCategory: text("cause_category"),
  effectivenessPlan: text("effectiveness_plan"),
  effectivenessMet: boolean("effectiveness_met"),
  openedAt: timestamp("opened_at", tz).notNull().defaultNow(),
  /** NULL: MedSync. */
  openedBy: uuid("opened_by"),
  resumedAt: timestamp("resumed_at", tz),
  resumedBy: uuid("resumed_by"),
  closedAt: timestamp("closed_at", tz),
  closedBy: uuid("closed_by"),
});

export const labNcEvents = pgTable("lab_nc_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  ncId: uuid("nc_id").notNull(),
  hospitalId: uuid("hospital_id").notNull(),
  kind: text("kind").notNull(),
  payload: jsonb("payload").notNull().default({}),
  actor: uuid("actor"),
  at: timestamp("at", tz).notNull().defaultNow(),
});

/** PHI: read only with access to the patient, never by the hospital admin. Decided once (trigger). */
export const labLookbackItems = pgTable("lab_lookback_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  ncId: uuid("nc_id").notNull(),
  hospitalId: uuid("hospital_id").notNull(),
  patientUserId: uuid("patient_user_id").notNull(),
  reportId: uuid("report_id").notNull(),
  observationId: uuid("observation_id").notNull(),
  releasedAt: timestamp("released_at", tz).notNull(),
  value: numeric("value").notNull(),
  sort: text("sort").notNull(),
  decision: text("decision"),
  decidedBy: uuid("decided_by"),
  decidedAt: timestamp("decided_at", tz),
  amendmentReportId: uuid("amendment_report_id"),
});

/* ─── 0115 EQA ─────────────────────────────────────────────────────── */
export const labEqaSchemes = pgTable("lab_eqa_schemes", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  name: text("name").notNull(),
  provider: text("provider").notNull(),
  covers: text("covers").array().notNull().default([]),
  roundsPerYear: integer("rounds_per_year"),
  active: boolean("active").notNull().default(true),
});

export const labEqaRounds = pgTable("lab_eqa_rounds", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  schemeId: uuid("scheme_id").notNull(),
  label: text("label").notNull(),
  receivedOn: date("received_on").notNull(),
  dueOn: date("due_on"),
  submittedOn: date("submitted_on"),
  scoredOn: date("scored_on"),
  testedBy: uuid("tested_by").array().notNull().default([]),
  samples: jsonb("samples").notNull().default([]),
  reportPath: text("report_path"),
  outcome: text("outcome"),
  ncId: uuid("nc_id"),
});

export const labAltAssessments = pgTable("lab_alt_assessments", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  testCode: text("test_code").notNull(),
  method: text("method").notNull(),
  partner: text("partner"),
  doneOn: date("done_on").notNull(),
  results: jsonb("results").notNull(),
  conclusion: text("conclusion").notNull(),
  recordedBy: uuid("recorded_by").notNull(),
});

/* ─── 0116 bedside quality ─────────────────────────────────────────── */
/** A reassessment is a new row; only the revocation is ever set, once (trigger). */
export const labCompetencies = pgTable("lab_competencies", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  userId: uuid("user_id").notNull(),
  testCode: text("test_code").notNull(),
  assessedOn: date("assessed_on").notNull(),
  assessor: uuid("assessor"),
  method: text("method").array().notNull().default([]),
  validTo: date("valid_to").notNull(),
  grandfathered: boolean("grandfathered").notNull().default(false),
  revokedAt: timestamp("revoked_at", tz),
  revokedBy: uuid("revoked_by"),
});

/* ─── 0117 registers and HMIS ──────────────────────────────────────── */
export const labRegisterPrints = pgTable("lab_register_prints", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  register: text("register").notNull(),
  sectionId: uuid("section_id"),
  day: date("day").notNull(),
  pages: integer("pages").notNull(),
  configId: uuid("config_id"),
  configVersion: integer("config_version"),
  printedBy: uuid("printed_by").notNull(),
  printedAt: timestamp("printed_at", tz).notNull().defaultNow(),
});

/** Frozen once signed (trigger); `sources` is read by lab readers only (private.lab_hmis_aggregates()). */
export const labHmisReports = pgTable("lab_hmis_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  month: date("month").notNull(),
  revision: integer("revision").notNull().default(1),
  state: text("state").notNull().default("draft"),
  mappingConfigId: uuid("mapping_config_id"),
  mappingVersion: integer("mapping_version"),
  formHash: text("form_hash").notNull(),
  cells: jsonb("cells").notNull().default({}),
  sources: jsonb("sources").notNull().default({}),
  manual: jsonb("manual").notNull().default({}),
  checkedBy: uuid("checked_by"),
  checkedAt: timestamp("checked_at", tz),
  signedBy: uuid("signed_by"),
  signedAt: timestamp("signed_at", tz),
  exportedBy: uuid("exported_by"),
  exportedAt: timestamp("exported_at", tz),
});

/** E-LAB3-11: the Health Unit In-Charge and the HMIS focal person, set by the hospital admin. */
export const hmisDesignations = pgTable("hmis_designations", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  role: text("role").notNull(),
  userId: uuid("user_id").notNull(),
  startsOn: date("starts_on").notNull(),
  endsOn: date("ends_on"),
  setBy: uuid("set_by").notNull(),
  setAt: timestamp("set_at", tz).notNull().defaultNow(),
});

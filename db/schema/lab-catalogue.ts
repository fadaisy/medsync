import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Lab Phase 2 (migrations 0107, 0109, 0110; GATED; ADRs 0251–0259). Column for column with the SQL, which is
 * the source of truth (tests/emr-db/drizzle-parity.test.ts). Guards, append-only triggers and RLS live in
 * the migrations; nothing here carries a clinical number.
 */
const tz = { withTimezone: true } as const;

/** One two-signature store for schemes, flag bases, elevation, the HIV algorithm, NCD mappings, REF entries
 *  and the concept addendum (gate-a-proposal P1). */
export const labSignedConfigs = pgTable("lab_signed_configs", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id"),
  kind: text("kind").notNull(),
  key: text("key").notNull(),
  version: integer("version").notNull(),
  status: text("status").notNull().default("draft"),
  payload: jsonb("payload").notNull(),
  authoredBy: uuid("authored_by").notNull(),
  leadSignedBy: uuid("lead_signed_by"),
  leadSignedAt: timestamp("lead_signed_at", tz),
  csoSignedBy: uuid("cso_signed_by"),
  csoSignedAt: timestamp("cso_signed_at", tz),
  exceptionNote: text("exception_note"),
  inForceFrom: timestamp("in_force_from", tz),
  supersededAt: timestamp("superseded_at", tz),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
});

export const analyserProfiles = pgTable("analyser_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  testId: uuid("test_id").notNull(),
  model: text("model").notNull(),
  bench: text("bench"),
  kind: text("kind").notNull(),
  state: text("state").notNull().default("draft"),
  mappings: jsonb("mappings").notNull().default([]),
  openChecks: jsonb("open_checks").notNull().default([]),
  verifiedConcepts: text("verified_concepts").array().notNull().default([]),
  createdBy: uuid("created_by").notNull(),
  activatedBy: uuid("activated_by"),
  activatedAt: timestamp("activated_at", tz),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
});

export const researchImports = pgTable(
  "research_imports",
  {
    hospitalId: uuid("hospital_id").notNull(),
    hash: text("hash").notNull(),
    importedBy: uuid("imported_by").notNull(),
    importedAt: timestamp("imported_at", tz).notNull().defaultNow(),
    report: jsonb("report").notNull(),
  },
  (t) => [primaryKey({ columns: [t.hospitalId, t.hash] })],
);

/** OM-1: the hub offering each test is linked to at a hospital (HARMONISATION §9). */
export const labTestServices = pgTable(
  "lab_test_services",
  {
    hospitalId: uuid("hospital_id").notNull(),
    testCode: text("test_code").notNull(),
    offeringCode: text("offering_code").notNull(),
    setBy: uuid("set_by").notNull(),
    setAt: timestamp("set_at", tz).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.hospitalId, t.testCode] })],
);

export const labLabels = pgTable("lab_labels", {
  /** 0109: `L` + 8 digits from lab_label_seq. */
  labelNo: text("label_no")
    .primaryKey()
    .default(sql`('L' || lpad(nextval('public.lab_label_seq')::text, 8, '0'))`),
  orderId: uuid("order_id").notNull(),
  hospitalId: uuid("hospital_id").notNull(),
  patientUserId: uuid("patient_user_id").notNull(),
  issuedBy: uuid("issued_by").notNull(),
  issuedAt: timestamp("issued_at", tz).notNull().defaultNow(),
  voidedBy: uuid("voided_by"),
  voidedAt: timestamp("voided_at", tz),
  voidReason: text("void_reason"),
});

export const labPaymentEvents = pgTable("lab_payment_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull(),
  hospitalId: uuid("hospital_id").notNull(),
  state: text("state").notNull(),
  receiptNo: text("receipt_no"),
  insurer: text("insurer"),
  authorisationNo: text("authorisation_no"),
  reason: text("reason"),
  approverId: uuid("approver_id"),
  actorUserId: uuid("actor_user_id").notNull(),
  recordedAt: timestamp("recorded_at", tz).notNull().defaultNow(),
  clientKey: text("client_key"),
});

export const labIdentityChecks = pgTable("lab_identity_checks", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull(),
  hospitalId: uuid("hospital_id").notNull(),
  patientUserId: uuid("patient_user_id").notNull(),
  labelTyped: text("label_typed").notNull(),
  outcome: text("outcome").notNull(),
  method: text("method").notNull(),
  wristbandChecked: boolean("wristband_checked").notNull().default(false),
  actorUserId: uuid("actor_user_id").notNull(),
  recordedAt: timestamp("recorded_at", tz).notNull().defaultNow(),
  clientKey: text("client_key"),
});

export const labHighRiskEvents = pgTable("lab_high_risk_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  encounterId: uuid("encounter_id").notNull(),
  hospitalId: uuid("hospital_id").notNull(),
  patientUserId: uuid("patient_user_id").notNull(),
  kind: text("kind").notNull(),
  source: text("source").notNull(),
  ruleId: text("rule_id"),
  reason: text("reason"),
  actorUserId: uuid("actor_user_id").notNull(),
  recordedAt: timestamp("recorded_at", tz).notNull().defaultNow(),
  clientKey: text("client_key"),
});

export const poctLots = pgTable("poct_lots", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  deviceId: uuid("device_id").notNull(),
  lot: text("lot").notNull(),
  useBy: date("use_by").notNull(),
  addedBy: uuid("added_by").notNull(),
  addedAt: timestamp("added_at", tz).notNull().defaultNow(),
});

export const poctOperators = pgTable(
  "poct_operators",
  {
    hospitalId: uuid("hospital_id").notNull(),
    userId: uuid("user_id").notNull(),
    grantedBy: uuid("granted_by").notNull(),
    grantedAt: timestamp("granted_at", tz).notNull().defaultNow(),
    revokedBy: uuid("revoked_by"),
    revokedAt: timestamp("revoked_at", tz),
  },
  (t) => [primaryKey({ columns: [t.hospitalId, t.userId, t.grantedAt] })],
);

/**
 * Patient payments, membership and Questions for the doctor (migrations 0299 and 0300, GATED; patient app v2
 * §8). The SQL is the source of truth (it holds the CHECKs, RLS and the SECURITY DEFINER engine); these
 * definitions mirror its columns for typed reads. Clients only read these tables (PA5).
 */
import {
  boolean,
  date,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

const tz = { withTimezone: true } as const;

export const hospitalPaymentAccounts = pgTable("hospital_payment_accounts", {
  hospitalId: uuid("hospital_id").primaryKey(),
  provider: text("provider").notNull(),
  live: boolean("live").notNull().default(false),
  merchantRef: text("merchant_ref"),
  networks: text("networks").array().notNull(),
  refundCutoffHours: integer("refund_cutoff_hours").notNull().default(24),
  enabled: boolean("enabled").notNull().default(false),
  updatedBy: uuid("updated_by"),
  updatedAt: timestamp("updated_at", tz).notNull().defaultNow(),
});

export const bills = pgTable("bills", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  appointmentId: uuid("appointment_id"),
  patientUserId: uuid("patient_user_id"),
  provisionalPatientId: uuid("provisional_patient_id"),
  kind: text("kind").notNull(),
  status: text("status").notNull().default("open"),
  currency: text("currency").notNull().default("UGX"),
  totalUgx: integer("total_ugx").notNull(),
  paidUgx: integer("paid_ugx").notNull().default(0),
  refundedUgx: integer("refunded_ugx").notNull().default(0),
  confidential: boolean("confidential").notNull().default(false),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", tz).notNull().defaultNow(),
});

export const billItems = pgTable("bill_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  billId: uuid("bill_id").notNull(),
  kind: text("kind").notNull(),
  label: text("label").notNull(),
  amountUgx: integer("amount_ugx").notNull(),
});

export const paymentIntents = pgTable("payment_intents", {
  id: uuid("id").primaryKey().defaultRandom(),
  billId: uuid("bill_id").notNull(),
  hospitalId: uuid("hospital_id").notNull(),
  amountUgx: integer("amount_ugx").notNull(),
  channel: text("channel").notNull(),
  network: text("network"),
  msisdnMasked: text("msisdn_masked"),
  payerUserId: uuid("payer_user_id"),
  idempotencyKey: text("idempotency_key").notNull(),
  provider: text("provider").notNull(),
  providerRef: text("provider_ref"),
  status: text("status").notNull().default("created"),
  failureReason: text("failure_reason"),
  expiresAt: timestamp("expires_at", tz).notNull(),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", tz).notNull().defaultNow(),
});

export const paymentCallbacks = pgTable("payment_callbacks", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: text("provider").notNull(),
  eventId: text("event_id").notNull(),
  providerRef: text("provider_ref"),
  outcome: text("outcome").notNull(),
  amountUgx: integer("amount_ugx"),
  verified: boolean("verified").notNull(),
  result: text("result").notNull(),
  receivedAt: timestamp("received_at", tz).notNull().defaultNow(),
});

export const receiptCounters = pgTable("receipt_counters", {
  hospitalId: uuid("hospital_id").primaryKey(),
  lastNumber: integer("last_number").notNull().default(0),
});

export const receipts = pgTable("receipts", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  number: integer("number").notNull(),
  billId: uuid("bill_id").notNull(),
  intentId: uuid("intent_id").notNull(),
  totalUgx: integer("total_ugx").notNull(),
  method: text("method").notNull(),
  reference: text("reference"),
  payerUserId: uuid("payer_user_id"),
  itemLabel: text("item_label").notNull(),
  efrisNumber: text("efris_number"),
  efrisQr: text("efris_qr"),
  issuedAt: timestamp("issued_at", tz).notNull().defaultNow(),
});

export const refundRequests = pgTable("refund_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  receiptId: uuid("receipt_id").notNull(),
  hospitalId: uuid("hospital_id").notNull(),
  amountUgx: integer("amount_ugx").notNull(),
  reason: text("reason").notNull(),
  requestedBy: uuid("requested_by"),
  automatic: boolean("automatic").notNull().default(false),
  status: text("status").notNull().default("waiting"),
  decidedBy: uuid("decided_by"),
  decidedAt: timestamp("decided_at", tz),
  providerRef: text("provider_ref"),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", tz).notNull().defaultNow(),
});

export const plusPrices = pgTable(
  "plus_prices",
  {
    tier: text("tier").notNull(),
    period: text("period").notNull(),
    amountUgx: integer("amount_ugx").notNull(),
    effectiveFrom: date("effective_from").notNull().defaultNow(),
    approvedBy: uuid("approved_by"),
    approvedAt: timestamp("approved_at", tz),
  },
  (t) => [primaryKey({ columns: [t.tier, t.period, t.effectiveFrom] })],
);

export const memberships = pgTable("memberships", {
  userId: uuid("user_id").primaryKey(),
  tier: text("tier").notNull().default("basic"),
  period: text("period"),
  status: text("status").notNull().default("active"),
  trialEndsAt: timestamp("trial_ends_at", tz),
  periodEndsAt: timestamp("period_ends_at", tz),
  trialUsed: boolean("trial_used").notNull().default(false),
  updatedAt: timestamp("updated_at", tz).notNull().defaultNow(),
});

export const visitQuestions = pgTable("visit_questions", {
  id: uuid("id").primaryKey().defaultRandom(),
  appointmentId: uuid("appointment_id").notNull(),
  authorUserId: uuid("author_user_id").notNull(),
  body: text("body").notNull(),
  suggested: boolean("suggested").notNull().default(false),
  askedAt: timestamp("asked_at", tz),
  removedAt: timestamp("removed_at", tz),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
});

import {
  bigint,
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Stock › Main store (migration 0275 — GATED, owner-applied). The SQL is the source of truth: the guards refuse a
 * count posted unsigned, a stock-take closed early, a loss without its witness or case. Vouchers, the on-the-way
 * location and the monthly balance view live in SQL only.
 */
const tz = { withTimezone: true } as const;

export type StoreLossReason =
  | "damaged"
  | "broken"
  | "spoilt"
  | "missing"
  | "other"
  | "destroyed"
  | "returned";

export const pharmacyTopupRuns = pgTable("pharmacy_topup_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  locationId: uuid("location_id").notNull(),
  weekdays: smallint("weekdays").array().notNull(),
  at: time("at").notNull(),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  endedAt: timestamp("ended_at", tz),
});

export const pharmacyTopupRunLog = pgTable("pharmacy_topup_run_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  runId: uuid("run_id").notNull(),
  onDate: date("on_date").notNull(),
  issueId: uuid("issue_id").notNull(),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
});

export const pharmacyStoreReturns = pgTable("pharmacy_store_returns", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  locationId: uuid("location_id").notNull(),
  batchId: uuid("batch_id").notNull(),
  qty: integer("qty").notNull(),
  reason: text("reason").notNull(),
  proposedBy: uuid("proposed_by").notNull(),
  proposedAt: timestamp("proposed_at", tz).notNull().defaultNow(),
  acceptedIssueId: uuid("accepted_issue_id"),
  acceptedBy: uuid("accepted_by"),
  acceptedAt: timestamp("accepted_at", tz),
});

export const pharmacyShelves = pgTable("pharmacy_shelves", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  locationId: uuid("location_id").notNull(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  controlled: boolean("controlled").notNull().default(false),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  archivedAt: timestamp("archived_at", tz),
});

export const pharmacyStocktakes = pgTable("pharmacy_stocktakes", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  locationId: uuid("location_id").notNull(),
  startedBy: uuid("started_by").notNull(),
  startedAt: timestamp("started_at", tz).notNull().defaultNow(),
  closedBy: uuid("closed_by"),
  closedAt: timestamp("closed_at", tz),
  report: jsonb("report"),
});

export const pharmacyShelfCounts = pgTable("pharmacy_shelf_counts", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  shelfId: uuid("shelf_id").notNull(),
  stocktakeId: uuid("stocktake_id"),
  voucher: text("voucher").notNull(),
  countedBy: uuid("counted_by").notNull(),
  countedAt: timestamp("counted_at", tz).notNull().defaultNow(),
  diffValue: bigint("diff_value", { mode: "number" }).notNull(),
  signOver: bigint("sign_over", { mode: "number" }).notNull(),
  signedBy: uuid("signed_by"),
  signedAt: timestamp("signed_at", tz),
});

export const pharmacyShelfCountLines = pgTable(
  "pharmacy_shelf_count_lines",
  {
    countId: uuid("count_id").notNull(),
    batchId: uuid("batch_id").notNull(),
    expected: integer("expected").notNull(),
    counted: integer("counted").notNull(),
    unitCost: numeric("unit_cost", { precision: 14, scale: 2 }).notNull().default("0"),
  },
  (t) => [primaryKey({ columns: [t.countId, t.batchId] })],
);

export const pharmacyQuarantineDecisions = pgTable("pharmacy_quarantine_decisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  batchId: uuid("batch_id").notNull(),
  decided: text("decided").$type<"destroy" | "return">().notNull(),
  qty: integer("qty").notNull(),
  valueUgx: bigint("value_ugx", { mode: "number" }).notNull(),
  voucher: text("voucher").notNull(),
  witnessId: uuid("witness_id"),
  decidedBy: uuid("decided_by").notNull(),
  decidedAt: timestamp("decided_at", tz).notNull().defaultNow(),
});

export const pharmacyStoreLosses = pgTable("pharmacy_store_losses", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  locationId: uuid("location_id").notNull(),
  batchId: uuid("batch_id").notNull(),
  qty: integer("qty").notNull(),
  reason: text("reason").$type<StoreLossReason>().notNull(),
  note: text("note"),
  valueUgx: bigint("value_ugx", { mode: "number" }).notNull(),
  voucher: text("voucher").notNull(),
  witnessId: uuid("witness_id"),
  caseId: uuid("case_id"),
  quarantineDecisionId: uuid("quarantine_decision_id"),
  recordedBy: uuid("recorded_by").notNull(),
  recordedAt: timestamp("recorded_at", tz).notNull().defaultNow(),
});

export const pharmacyStoreRoomReadings = pgTable("pharmacy_store_room_readings", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  locationId: uuid("location_id").notNull(),
  readAt: timestamp("read_at", tz).notNull().defaultNow(),
  tempC: numeric("temp_c", { precision: 4, scale: 1 }).notNull(),
  humidity: integer("humidity").notNull(),
  recordedBy: uuid("recorded_by").notNull(),
});

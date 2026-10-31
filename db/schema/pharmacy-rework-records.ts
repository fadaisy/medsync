import { date, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Pharmacy rework, Records (migration 0269 — GATED, owner-applied). The SQL is the source of truth: a report moves
 * checked → submitted once (in-charge only, figures frozen in `snapshot`); risk actions are append-only. The ledger's
 * `correction_of_id` is written by raw SQL in `lib/pharmacy/audit/store.ts`.
 */
const tz = { withTimezone: true } as const;

export type ReportKind = "hmis_meds" | "hmis_epi" | "cd_return" | "losses";
export type RiskAction = "offer" | "swap" | "use_first";

export const pharmacyReports = pgTable("pharmacy_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  kind: text("kind").$type<ReportKind>().notNull(),
  period: date("period").notNull(),
  status: text("status").$type<"checked" | "submitted">().notNull().default("checked"),
  remarks: jsonb("remarks").$type<Record<string, string>>().notNull().default({}),
  checkedBy: uuid("checked_by").notNull(),
  checkedAt: timestamp("checked_at", tz).notNull().defaultNow(),
  submittedBy: uuid("submitted_by"),
  submittedAt: timestamp("submitted_at", tz),
  snapshot: jsonb("snapshot"),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
});

export const pharmacyRiskActions = pgTable("pharmacy_risk_actions", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  productId: uuid("product_id").notNull(),
  batchNumber: text("batch_number").notNull(),
  action: text("action").$type<RiskAction>().notNull(),
  valueUgx: integer("value_ugx").notNull(),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
});

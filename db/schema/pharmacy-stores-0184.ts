import { jsonb, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Pharmacy Phase 2, migration 0184 (GATED): the order's paper comparison, the ordering go-live evidence (5.12). The
 * SQL is the source of truth (append-only, RLS); this mirror carries columns only.
 */
export const pharmacyOrderComparisons = pgTable("pharmacy_order_comparisons", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  orderId: uuid("order_id").notNull(),
  lines: jsonb("lines").notNull(),
  recordedBy: uuid("recorded_by").notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
});

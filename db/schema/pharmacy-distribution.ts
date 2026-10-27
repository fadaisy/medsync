import { integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

const tz = { withTimezone: true } as const;

/* ─── 0259 distribution checks (catalogue slice Step 10; ADRs 0463–0465). Checks only, never stock ─── */
export const pharmacyIssuePicks = pgTable("pharmacy_issue_picks", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  requisitionId: uuid("requisition_id").notNull(),
  lineId: uuid("line_id").notNull(),
  productId: uuid("product_id").notNull(),
  batchId: uuid("batch_id"),
  method: text("method").notNull().$type<"scan" | "hand">(),
  code: text("code"),
  laterBatchReason: text("later_batch_reason"),
  pickedBy: uuid("picked_by").notNull(),
  pickedAt: timestamp("picked_at", tz).notNull().defaultNow(),
});

export const pharmacyUseGapReasons = pgTable(
  "pharmacy_use_gap_reasons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hospitalId: uuid("hospital_id").notNull(),
    locationId: uuid("location_id").notNull(),
    countId: uuid("count_id").notNull(),
    productId: uuid("product_id").notNull(),
    gap: integer("gap").notNull(),
    reasonCode: text("reason_code").notNull(),
    note: text("note"),
    recordedBy: uuid("recorded_by").notNull(),
    recordedAt: timestamp("recorded_at", tz).notNull().defaultNow(),
  },
  (t) => [unique().on(t.countId, t.productId)],
);

export const pharmacySealEvents = pgTable("pharmacy_seal_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  locationId: uuid("location_id").notNull(),
  kind: text("kind").notNull().$type<"applied" | "broken">(),
  sealNumber: text("seal_number"),
  cartCheckId: uuid("cart_check_id"),
  note: text("note"),
  reportedBy: uuid("reported_by").notNull(),
  reportedAt: timestamp("reported_at", tz).notNull().defaultNow(),
});

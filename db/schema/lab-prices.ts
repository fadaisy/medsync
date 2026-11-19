import { boolean, date, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

const tz = { withTimezone: true } as const;

/* ─── 0305 a hospital's own price per laboratory test (ADR 0527). Append-only history from a date; a price is
   above zero or the row is free (UGX 0 is never stored). Written only by lib/lab/prices-store.ts. ─── */
export const labTestPrices = pgTable("lab_test_prices", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  code: text("code").notNull(),
  priceUgx: integer("price_ugx"),
  free: boolean("free").notNull().default(false),
  fromDate: date("from_date").notNull(),
  setBy: uuid("set_by").notNull(),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
});

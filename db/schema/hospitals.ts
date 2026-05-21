import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Hospital / facility. Uganda MoH facility taxonomy for `level`.
 * Seeded with Mulago National Referral Hospital in Phase 0.11.
 */
export const hospitals = pgTable(
  "hospitals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    country: text("country").notNull().default("UG"),
    region: text("region"),
    district: text("district"),
    level: text("level").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "hospitals_level_check",
      sql`${t.level} IN ('national_referral', 'regional', 'district', 'hc4', 'hc3', 'private')`,
    ),
    index("hospitals_country_district_idx").on(t.country, t.district),
  ],
);

export type Hospital = typeof hospitals.$inferSelect;
export type NewHospital = typeof hospitals.$inferInsert;

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
    /**
     * Tenant lifecycle state. Added in migration 0018 to support the
     * superadmin workspace's tenant-management surface. Drizzle sees
     * the value as text; the underlying type is `public.lifecycle_state`.
     */
    state: text("state").notNull().default("active"),
    /**
     * The number rendered as a `tel:` link beside "Go to the hospital's
     * emergency entrance" (ADR 0084 §3, migration 0053). Nullable with no
     * default and no backfill: until someone has dialled and verified a
     * number for this hospital, the emergency block shows the destination
     * alone. Entered by a superadmin during activation.
     */
    emergencyPhone: text("emergency_phone"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "hospitals_level_check",
      sql`${t.level} IN ('national_referral', 'regional', 'district', 'hc4', 'hc3', 'private')`,
    ),
    // Migration 0053. The Ugandan E.164 shape PHONE_E164_UG enforces in the
    // signup actions, written with [+] / [0-9] so the same literal reads in
    // SQL and here without escaping. NULL passes — "no verified number" is
    // the correct default state, not a violation.
    check(
      "hospitals_emergency_phone_format",
      sql`${t.emergencyPhone} IS NULL OR ${t.emergencyPhone} ~ '^[+]2567[0-9]{8}$|^[+]256[23489][0-9]{7,8}$'`,
    ),
    index("hospitals_country_district_idx").on(t.country, t.district),
  ],
);

export type Hospital = typeof hospitals.$inferSelect;
export type NewHospital = typeof hospitals.$inferInsert;

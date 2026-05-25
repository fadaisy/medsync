import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { authUsers } from "./_auth";
import { hospitals } from "./hospitals";

/**
 * Primary + backup hospital-admin tracking with full succession trail.
 *
 * This is the *intent + history* layer; the authoritative grant still
 * lives in public.user_roles. The succession Edge Function writes both
 * tables atomically so they never drift.
 *
 * The partial UNIQUE index on (hospital_id) WHERE
 * `succeeded_at IS NULL AND designation = 'primary'` enforces "exactly
 * one current primary per hospital". Backups are unbounded.
 */
export const hospitalAdminRoster = pgTable(
  "hospital_admin_roster",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hospitalId: uuid("hospital_id")
      .notNull()
      .references(() => hospitals.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    designation: text("designation").notNull(),
    designatedAt: timestamp("designated_at", { withTimezone: true }).notNull().defaultNow(),
    designatedBy: uuid("designated_by")
      .notNull()
      .references(() => authUsers.id, { onDelete: "restrict" }),
    succeededAt: timestamp("succeeded_at", { withTimezone: true }),
    succeededBy: uuid("succeeded_by").references(() => authUsers.id, { onDelete: "set null" }),
    successionReason: text("succession_reason"),
  },
  (t) => [
    check("hospital_admin_roster_designation_check", sql`${t.designation} IN ('primary','backup')`),
    index("hospital_admin_roster_hospital_idx").on(t.hospitalId, t.succeededAt),
    index("hospital_admin_roster_user_idx").on(t.userId),
  ],
);

export type HospitalAdminRosterEntry = typeof hospitalAdminRoster.$inferSelect;
export type NewHospitalAdminRosterEntry = typeof hospitalAdminRoster.$inferInsert;

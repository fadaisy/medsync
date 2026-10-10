import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { authUsers } from "./_auth";
import { hospitals } from "./hospitals";

/**
 * Many-to-many between a user and a role, scoped to a hospital (or global for
 * `superadmin`). The CHECK constraint enforces that superadmin is the only
 * global role; every other role MUST carry a `hospital_id`.
 */
export const userRoles = pgTable(
  "user_roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    hospitalId: uuid("hospital_id").references(() => hospitals.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by").references(() => authUsers.id, { onDelete: "set null" }),
  },
  (t) => [
    check(
      "user_roles_role_check",
      sql`${t.role} IN ('patient', 'clinician', 'nurse', 'pharmacist', 'lab_tech', 'hospital_admin', 'superadmin', 'reception', 'pharmacy_staff')`,
    ),
    check(
      "user_roles_superadmin_global_check",
      sql`(${t.role} = 'superadmin' AND ${t.hospitalId} IS NULL) OR (${t.role} <> 'superadmin' AND ${t.hospitalId} IS NOT NULL)`,
    ),
    uniqueIndex("user_roles_unique").on(t.userId, t.role, t.hospitalId),
    index("user_roles_user_idx").on(t.userId),
    index("user_roles_hospital_role_idx").on(t.hospitalId, t.role),
  ],
);

export type UserRole = typeof userRoles.$inferSelect;
export type NewUserRole = typeof userRoles.$inferInsert;

export const USER_ROLES = [
  "patient",
  "clinician",
  "nurse",
  "pharmacist",
  "lab_tech",
  "hospital_admin",
  "superadmin",
  // Non-clinical (migration 0033).
  "reception",
  // The pharmacy workspace's carrier (migration 0098). Never shown as a title: screens show the
  // approved cadre's name (ADR 0227).
  "pharmacy_staff",
] as const;

export type RoleName = (typeof USER_ROLES)[number];

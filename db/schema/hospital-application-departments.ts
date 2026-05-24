import { sql } from "drizzle-orm";
import { boolean, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { hospitalApplications } from "./hospital-applications";

/**
 * Junction: which department families an applicant ticked.
 *
 * `department_family` matches the same column on public.roles —
 * keyed off the seeded reference data so the catalog stays
 * authoritative. Exactly one row per application is `is_primary=true`
 * (enforced by a partial UNIQUE index on (application_id) WHERE is_primary).
 */
export const hospitalApplicationDepartments = pgTable(
  "hospital_application_departments",
  {
    applicationId: uuid("application_id")
      .notNull()
      .references(() => hospitalApplications.id, { onDelete: "cascade" }),
    departmentFamily: text("department_family").notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
  },
  (t) => [
    uniqueIndex("hospital_application_primary_dept_unique")
      .on(t.applicationId)
      .where(sql`${t.isPrimary}`),
  ],
);

export type HospitalApplicationDepartment = typeof hospitalApplicationDepartments.$inferSelect;
export type NewHospitalApplicationDepartment = typeof hospitalApplicationDepartments.$inferInsert;

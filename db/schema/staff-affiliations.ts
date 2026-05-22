import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { authUsers } from "./_auth";
import { hospitalDepartments } from "./hospital-departments";
import { hospitals } from "./hospitals";
import { LIFECYCLE_STATES } from "./lifecycle";
import {
  refCadreGrades,
  refCadres,
  refCouncils,
  refRoles,
  refSpecialties,
} from "./reference-clinical-catalog";

/**
 * Professional identity anchor for a clinician — council registration +
 * uploaded licence + expiry. One row per clinician; verification is
 * council-anchored, NOT self-selection from a hospital roster.
 *
 * If a hospital pre-loaded a staff slot, the user may "claim" it to
 * pre-fill some fields — the claim grants nothing until council
 * verification passes (recorded here).
 *
 * RLS: owner-only SELECT; superadmin + scoped hospital_admin for the
 * affiliations attached to that user can read for approval purposes.
 * Service-role writes verification updates only via Edge Functions.
 */

export const clinicianProfiles = pgTable(
  "clinician_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    councilId: uuid("council_id")
      .notNull()
      .references(() => refCouncils.id, { onDelete: "restrict" }),
    // Plaintext: this IS the verification anchor and must be queryable
    // by superadmin/hospital_admin during approval. Not PHI.
    registrationNumber: text("registration_number").notNull(),
    // Path/URL into Supabase Storage (private bucket).
    licenceDocumentPath: text("licence_document_path"),
    // Optional — practising certificate expiry.
    registrationExpiry: timestamp("registration_expiry", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("clinician_profiles_council_reg_unique").on(t.councilId, t.registrationNumber),
    index("clinician_profiles_user_idx").on(t.userId),
  ],
);

/**
 * A staff member's affiliation with a hospital × department × cadre × role.
 *
 * Per the spec: "permissions attach to the affiliation; each approved
 * independently". A clinician can hold multiple affiliations (e.g. a
 * consultant who works at Mulago AND Mengo). Each gets its own approval
 * cycle by the relevant hospital_admin.
 */
export const staffAffiliations = pgTable(
  "staff_affiliations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    hospitalId: uuid("hospital_id")
      .notNull()
      .references(() => hospitals.id, { onDelete: "cascade" }),
    departmentId: uuid("department_id")
      .notNull()
      .references(() => hospitalDepartments.id, { onDelete: "restrict" }),
    cadreId: uuid("cadre_id")
      .notNull()
      .references(() => refCadres.id, { onDelete: "restrict" }),
    cadreGradeId: uuid("cadre_grade_id").references(() => refCadreGrades.id, {
      onDelete: "set null",
    }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => refRoles.id, { onDelete: "restrict" }),
    specialtyId: uuid("specialty_id").references(() => refSpecialties.id, {
      onDelete: "set null",
    }),
    employmentType: text("employment_type").notNull(),
    // Lifecycle state of THIS affiliation specifically.
    // Defaults to pending_approval at insert.
    state: text("state").notNull().default("pending_approval"),
    rejectionReason: text("rejection_reason"),
    approvedBy: uuid("approved_by").references(() => authUsers.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "staff_affiliations_employment_check",
      sql`${t.employmentType} IN ('full_time', 'visiting', 'locum')`,
    ),
    check(
      "staff_affiliations_state_check",
      sql.raw(`state IN (${LIFECYCLE_STATES.map((s) => `'${s}'`).join(", ")})`),
    ),
    // One user can hold the same hospital × department × role at most
    // once (no duplicate affiliation rows).
    uniqueIndex("staff_affiliations_unique").on(t.userId, t.hospitalId, t.departmentId, t.roleId),
    index("staff_affiliations_user_idx").on(t.userId),
    index("staff_affiliations_hospital_state_idx").on(t.hospitalId, t.state),
  ],
);

export type ClinicianProfile = typeof clinicianProfiles.$inferSelect;
export type StaffAffiliation = typeof staffAffiliations.$inferSelect;
export type NewStaffAffiliation = typeof staffAffiliations.$inferInsert;

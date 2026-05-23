import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { authUsers } from "./_auth";
import { hospitals } from "./hospitals";
import { refDistricts, refSubcounties } from "./reference-geography";

/**
 * Pending hospital onboarding application. Distinct from
 * `public.hospitals` (which holds approved facilities only) so the
 * rest of the app's queries don't have to filter by state.
 *
 * Lifecycle: starts at `pending_approval`. The superadmin queue
 * approves → creates the public.hospitals row and elevates the
 * applicant's user_roles to `hospital_admin` scoped to it (GATE F).
 *
 * RLS: owner reads/writes (only while pending_approval); superadmin
 * reads everything. Approval transitions are service-role-only
 * through an Edge Function.
 */

export const HOSPITAL_LEVEL_VALUES = [
  "national_referral",
  "regional",
  "district",
  "hc4",
  "hc3",
  "private",
] as const;
export type HospitalLevel = (typeof HOSPITAL_LEVEL_VALUES)[number];

export const HOSPITAL_OWNERSHIP_VALUES = [
  "public_moh",
  "private",
  "ngo_faith_based",
  "private_clinic",
] as const;
export type HospitalOwnership = (typeof HOSPITAL_OWNERSHIP_VALUES)[number];

export const hospitalApplications = pgTable(
  "hospital_applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicantUserId: uuid("applicant_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),

    hospitalName: text("hospital_name").notNull(),
    level: text("level").notNull(),
    // Stored as the enum string from migration 0014.
    ownership: text("ownership").notNull(),
    registrationNumber: text("registration_number").notNull(),
    registrationAuthority: text("registration_authority"),
    districtId: uuid("district_id").references(() => refDistricts.id, {
      onDelete: "restrict",
    }),
    subcountyId: uuid("subcounty_id").references(() => refSubcounties.id, {
      onDelete: "restrict",
    }),
    physicalAddress: text("physical_address").notNull(),
    institutionalEmailDomain: text("institutional_email_domain"),

    applicantRole: text("applicant_role").notNull(),
    authorisationDocumentPath: text("authorisation_document_path"),

    state: text("state").notNull().default("pending_approval"),
    rejectionReason: text("rejection_reason"),
    reviewedBy: uuid("reviewed_by").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    approvedHospitalId: uuid("approved_hospital_id").references(() => hospitals.id, {
      onDelete: "set null",
    }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "hospital_applications_level_check",
      sql.raw(`level IN (${HOSPITAL_LEVEL_VALUES.map((s) => `'${s}'`).join(", ")})`),
    ),
    uniqueIndex("hospital_applications_applicant_unique").on(t.applicantUserId),
    index("hospital_applications_state_idx").on(t.state, t.createdAt),
    index("hospital_applications_district_idx").on(t.districtId),
  ],
);

export type HospitalApplication = typeof hospitalApplications.$inferSelect;
export type NewHospitalApplication = typeof hospitalApplications.$inferInsert;

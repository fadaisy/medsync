import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { authUsers } from "./_auth";

/**
 * Non-clinical staff identity profile (migration 0034).
 *
 * Mirror of clinician_profiles for staff who have no professional
 * council registration (reception, records, and other non-clinical
 * cadres). The hospital admin's approval IS the verification anchor;
 * NIN is the identity anchor; the optional fields below are
 * encouraged-but-not-required supporting evidence.
 */
export const staffIdentityProfiles = pgTable("staff_identity_profiles", {
  id: uuid("id")
    .primaryKey()
    .references(() => authUsers.id, { onDelete: "cascade" }),

  // Identity anchor — captured at signup, encrypted on insert via
  // lib/encryption (mirrors patient_profiles.first_name_encrypted etc).
  ninEncrypted: text("nin_encrypted").notNull(),

  // Optional supporting evidence — none gate the form; admin approval
  // is the floor.
  staffNumber: text("staff_number"),
  appointmentLetterUrl: text("appointment_letter_url"),
  authorisingOfficerName: text("authorising_officer_name"),
  authorisingOfficerRole: text("authorising_officer_role"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type StaffIdentityProfile = typeof staffIdentityProfiles.$inferSelect;
export type NewStaffIdentityProfile = typeof staffIdentityProfiles.$inferInsert;

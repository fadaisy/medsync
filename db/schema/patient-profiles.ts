import { sql } from "drizzle-orm";
import { check, date, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { authUsers } from "./_auth";
import { hospitals } from "./hospitals";
import { refDistricts, refSubcounties } from "./reference-geography";

/**
 * Patient-specific profile data. 1:1 with auth.users / public.users.
 *
 * Created by the GATE C signup server action after the user has
 * created their auth account and confirmed email OTP. The
 * `patient_code` column is auto-assigned by the DB-side
 * `issue_patient_code()` function (migration 0011) and shown to the
 * patient as their MS-YYYY-NNNNN ID.
 *
 * PHI columns (`id_number_encrypted`, `phone_encrypted`) hold the
 * ciphertext produced by lib/encryption.ts — never plaintext, never
 * indexable by content.
 *
 * Plaintext copies that live on `users` (`email`, `phone`) are
 * intentional: they are operational identifiers for routing (SMS,
 * support tickets) — not the PHI source of truth.
 */

export const PATIENT_SEX_VALUES = ["female", "male", "other"] as const;
export type PatientSex = (typeof PATIENT_SEX_VALUES)[number];

export const PATIENT_ID_TYPE_VALUES = ["nin", "passport", "refugee", "none"] as const;
export type PatientIdType = (typeof PATIENT_ID_TYPE_VALUES)[number];

export const patientProfiles = pgTable(
  "patient_profiles",
  {
    id: uuid("id")
      .primaryKey()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    // DB-assigned via DEFAULT issue_patient_code(); read-back after insert.
    patientCode: text("patient_code").notNull().unique(),
    sex: text("sex").notNull(),
    dateOfBirth: date("date_of_birth").notNull(),
    idType: text("id_type").notNull(),
    // Ciphertext (iv:authTag:ciphertext). Nullable iff id_type='none'.
    idNumberEncrypted: text("id_number_encrypted"),
    phoneEncrypted: text("phone_encrypted").notNull(),
    districtId: uuid("district_id").references(() => refDistricts.id, {
      onDelete: "restrict",
    }),
    subcountyId: uuid("subcounty_id").references(() => refSubcounties.id, {
      onDelete: "restrict",
    }),
    preferredLanguage: text("preferred_language"),
    primaryFacilityId: uuid("primary_facility_id").references(() => hospitals.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "patient_profiles_id_number_check",
      sql`(${t.idType} = 'none' AND ${t.idNumberEncrypted} IS NULL)
          OR (${t.idType} <> 'none' AND ${t.idNumberEncrypted} IS NOT NULL)`,
    ),
    index("patient_profiles_district_idx").on(t.districtId),
    index("patient_profiles_facility_idx").on(t.primaryFacilityId),
  ],
);

export type PatientProfile = typeof patientProfiles.$inferSelect;
export type NewPatientProfile = typeof patientProfiles.$inferInsert;

import { pgTable, uuid } from "drizzle-orm/pg-core";

import { hospitalApplications } from "./hospital-applications";
import { specialties } from "./reference-data";

/**
 * Junction: which IM sub-specialties an applicant ticked (e.g.
 * Cardiology, Nephrology). FK to public.specialties keeps the catalog
 * authoritative.
 */
export const hospitalApplicationSpecialties = pgTable("hospital_application_specialties", {
  applicationId: uuid("application_id")
    .notNull()
    .references(() => hospitalApplications.id, { onDelete: "cascade" }),
  specialtyId: uuid("specialty_id")
    .notNull()
    .references(() => specialties.id, { onDelete: "restrict" }),
});

export type HospitalApplicationSpecialty = typeof hospitalApplicationSpecialties.$inferSelect;
export type NewHospitalApplicationSpecialty = typeof hospitalApplicationSpecialties.$inferInsert;

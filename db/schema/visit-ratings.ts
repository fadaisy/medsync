import { pgTable, smallint, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { authUsers } from "./_auth";
import { hospitals } from "./hospitals";
import { appointments } from "./scheduling";

/**
 * One rating per attended appointment (migration 0056, ADR 0085 §2).
 *
 * Written only by `pt-rate-visit`, which refuses unless the caller is the
 * appointment's patient and the visit happened (ended in the past, status
 * arrived / in_progress / completed). A patient signal, not a clinical one:
 * nothing in triage, assignment or scheduling reads it.
 */
export const visitRatings = pgTable("visit_ratings", {
  id: uuid("id").primaryKey().defaultRandom(),
  appointmentId: uuid("appointment_id")
    .notNull()
    .unique()
    .references(() => appointments.id, { onDelete: "cascade" }),
  patientUserId: uuid("patient_user_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  clinicianUserId: uuid("clinician_user_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  hospitalId: uuid("hospital_id")
    .notNull()
    .references(() => hospitals.id, { onDelete: "cascade" }),
  /** 1–5, CHECKed at the database. */
  stars: smallint("stars").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Mirrors the `clinician_rating_summary` view's columns for typed reads. */
export interface ClinicianRatingSummary {
  clinicianUserId: string;
  average: number;
  count: number;
}

export type VisitRating = typeof visitRatings.$inferSelect;

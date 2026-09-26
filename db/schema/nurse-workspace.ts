/* ─── clinical_observations ──────────────────────────────────────── */
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { authUsers } from "./_auth";
import { hospitalDepartments } from "./hospital-departments";
import { hospitalWards } from "./hospital-wards";
import { hospitals } from "./hospitals";
import { encounters } from "./scheduling";

/**
 * Nurse workspace — migration 0031.
 *
 * Five tables:
 *   - nursing_assignments               patient ↔ nurse pairing per shift
 *   - ward_in_charge_assignments        who is currently in-charge of a ward
 *   - clinical_observations             nurse-recorded vitals/obs
 *   - medication_administration_records administer + document; prescription_id TEXT seam
 *   - shift_handovers                   structured between-shift handover
 *
 * Writes are service-role only (Edge Functions own the workflow);
 * reads are RLS-scoped per the proposal §4–§6.
 */

/* ─── nursing_assignments ────────────────────────────────────────── */
export const nursingAssignments = pgTable(
  "nursing_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hospitalId: uuid("hospital_id")
      .notNull()
      .references(() => hospitals.id, { onDelete: "cascade" }),
    wardId: uuid("ward_id").references(() => hospitalWards.id, {
      onDelete: "cascade",
    }),
    departmentId: uuid("department_id")
      .notNull()
      .references(() => hospitalDepartments.id, { onDelete: "cascade" }),
    nurseUserId: uuid("nurse_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    patientUserId: uuid("patient_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    relationshipKind: text("relationship_kind").notNull().default("primary"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull().defaultNow(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    assignedByUserId: uuid("assigned_by_user_id").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("na_kind_check", sql`${t.relationshipKind} IN ('primary','cover')`),
    check("na_time_order", sql`${t.endsAt} IS NULL OR ${t.endsAt} >= ${t.startsAt}`),
    index("nursing_assignments_nurse_active_idx").on(t.nurseUserId, t.startsAt),
    index("nursing_assignments_patient_active_idx").on(t.patientUserId, t.startsAt),
    index("nursing_assignments_ward_active_idx").on(t.wardId, t.startsAt),
  ],
);

export type NursingAssignment = typeof nursingAssignments.$inferSelect;
export type NewNursingAssignment = typeof nursingAssignments.$inferInsert;

/* ─── ward_in_charge_assignments ─────────────────────────────────── */
export const wardInChargeAssignments = pgTable(
  "ward_in_charge_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hospitalId: uuid("hospital_id")
      .notNull()
      .references(() => hospitals.id, { onDelete: "cascade" }),
    wardId: uuid("ward_id")
      .notNull()
      .references(() => hospitalWards.id, { onDelete: "cascade" }),
    nurseUserId: uuid("nurse_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull().defaultNow(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    setByUserId: uuid("set_by_user_id").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    /** 0080: an acting in-charge sits beside the substantive one (STR-3). */
    acting: boolean("acting").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("wic_time_order", sql`${t.endsAt} IS NULL OR ${t.endsAt} >= ${t.startsAt}`),
    uniqueIndex("ward_in_charge_one_open")
      .on(t.wardId, t.acting)
      .where(sql`${t.endsAt} IS NULL`),
    index("ward_in_charge_nurse_idx").on(t.nurseUserId, t.startsAt),
  ],
);

export type WardInChargeAssignment = typeof wardInChargeAssignments.$inferSelect;
export type NewWardInChargeAssignment = typeof wardInChargeAssignments.$inferInsert;

export const clinicalObservations = pgTable(
  "clinical_observations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hospitalId: uuid("hospital_id")
      .notNull()
      .references(() => hospitals.id, { onDelete: "cascade" }),
    patientUserId: uuid("patient_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    encounterId: uuid("encounter_id").references(() => encounters.id, {
      onDelete: "set null",
    }),
    recordedByUserId: uuid("recorded_by_user_id")
      .notNull()
      .references(() => authUsers.id),

    observationKind: text("observation_kind").notNull(),
    numericValue1: numeric("numeric_value_1"),
    numericValue2: numeric("numeric_value_2"),
    unit: text("unit"),
    painScale: text("pain_scale"),
    notes: text("notes"),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),

    state: text("state").notNull().default("active"),
    correctedByObservationId: uuid("corrected_by_observation_id").references(
      (): AnyPgColumn => clinicalObservations.id,
    ),
    // Set when this observation was captured during a triage event
    // (migration 0036) — distinguishes triage vitals from routine obs.
    triageRecordId: uuid("triage_record_id"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "obs_kind_check",
      sql`${t.observationKind} IN ('bp','hr','temperature','rr','spo2','glucose','pain','weight','height','intake','output','gcs','other','acvpu')`,
    ),
    check("obs_state_check", sql`${t.state} IN ('active','corrected')`),
    index("clinical_observations_patient_kind_idx").on(
      t.patientUserId,
      t.observationKind,
      t.recordedAt,
    ),
    index("clinical_observations_recorded_by_idx").on(t.recordedByUserId, t.recordedAt),
  ],
);

export type ClinicalObservation = typeof clinicalObservations.$inferSelect;
export type NewClinicalObservation = typeof clinicalObservations.$inferInsert;

/* ─── medication_administration_records ──────────────────────────── */
export const medicationAdministrationRecords = pgTable(
  "medication_administration_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hospitalId: uuid("hospital_id")
      .notNull()
      .references(() => hospitals.id, { onDelete: "cascade" }),
    patientUserId: uuid("patient_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    encounterId: uuid("encounter_id").references(() => encounters.id, {
      onDelete: "set null",
    }),
    administeredByUserId: uuid("administered_by_user_id")
      .notNull()
      .references(() => authUsers.id),
    cosignedByUserId: uuid("cosigned_by_user_id").references(() => authUsers.id),

    prescriptionId: text("prescription_id"),
    drugName: text("drug_name").notNull(),
    dose: text("dose").notNull(),
    route: text("route").notNull(),
    isHighAlert: boolean("is_high_alert").notNull().default(false),

    state: text("state").notNull(),
    withheldReason: text("withheld_reason"),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    administeredAt: timestamp("administered_at", { withTimezone: true }).notNull().defaultNow(),
    notes: text("notes"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("mar_state_check", sql`${t.state} IN ('administered','withheld','refused','wasted')`),
    check(
      "mar_route_check",
      sql`${t.route} IN ('oral','iv','im','sc','topical','inhaled','pr','other')`,
    ),
    check(
      "mar_withheld_reason",
      sql`${t.state} = 'administered' OR ${t.withheldReason} IS NOT NULL`,
    ),
    index("mar_patient_idx").on(t.patientUserId, t.administeredAt),
    index("mar_administered_by_idx").on(t.administeredByUserId, t.administeredAt),
  ],
);

export type MedicationAdministrationRecord = typeof medicationAdministrationRecords.$inferSelect;
export type NewMedicationAdministrationRecord = typeof medicationAdministrationRecords.$inferInsert;

/* ─── shift_handovers ────────────────────────────────────────────── */
export const shiftHandovers = pgTable(
  "shift_handovers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hospitalId: uuid("hospital_id")
      .notNull()
      .references(() => hospitals.id, { onDelete: "cascade" }),
    wardId: uuid("ward_id")
      .notNull()
      .references(() => hospitalWards.id, { onDelete: "cascade" }),
    submittedByUserId: uuid("submitted_by_user_id")
      .notNull()
      .references(() => authUsers.id),

    shiftLabel: text("shift_label").notNull(),
    summary: text("summary").notNull(),
    patientsOfConcern: jsonb("patients_of_concern"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("sh_shift_label_check", sql`${t.shiftLabel} IN ('day','evening','night','custom')`),
    index("shift_handovers_ward_recent_idx").on(t.wardId, t.submittedAt),
    index("shift_handovers_hospital_recent_idx").on(t.hospitalId, t.submittedAt),
  ],
);

export type ShiftHandover = typeof shiftHandovers.$inferSelect;
export type NewShiftHandover = typeof shiftHandovers.$inferInsert;

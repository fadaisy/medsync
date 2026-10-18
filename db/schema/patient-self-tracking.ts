import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  numeric,
  pgTable,
  smallint,
  text,
  time,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { authUsers } from "./_auth";

/**
 * Patient self-tracking — migration 0029; 0170 adds the kinds pulse, mood
 * (1 not well, 2 okay, 3 good), water (glasses) and activity (minutes).
 *
 * Three tables, all patient-owned:
 *   - personal_health_logs       readings + symptoms + free notes
 *   - self_medications           the patient's own med list
 *   - self_medication_takes      confirmed-taken events; adherence
 *
 * RLS: patient SELECT/INSERT/UPDATE/DELETE on own rows; since 0174 the
 * care team (public.has_clinical_relationship) reads the active log rows.
 *
 * 0175 adds patient_reported_history (ADR 0355): the patient's own
 * conditions, allergies and family history in the clerking catalogue's
 * ids, append-only (insert, or retire state active → removed), read by
 * the care team and shown on the desk as patient-reported, unconfirmed.
 */

/* ─── personal_health_logs ───────────────────────────────────────── */
export const personalHealthLogs = pgTable(
  "personal_health_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientUserId: uuid("patient_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),

    kind: text("kind").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),

    numericValue1: numeric("numeric_value_1"),
    numericValue2: numeric("numeric_value_2"),
    unit: text("unit"),

    severity: smallint("severity"),
    note: text("note"),

    state: text("state").notNull().default("active"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "personal_health_logs_kind_check",
      sql`${t.kind} IN ('glucose','bp','weight','spo2','temperature','symptom','note','other','pulse','mood','water','activity','steps','exercise')`,
    ),
    check("personal_health_logs_state_check", sql`${t.state} IN ('active','deleted')`),
    check(
      "personal_health_logs_severity_range",
      sql`${t.severity} IS NULL OR ${t.severity} BETWEEN 1 AND 5`,
    ),
    index("personal_health_logs_patient_kind_idx").on(t.patientUserId, t.kind, t.recordedAt),
  ],
);

export type PersonalHealthLog = typeof personalHealthLogs.$inferSelect;
export type NewPersonalHealthLog = typeof personalHealthLogs.$inferInsert;

/* ─── self_medications ───────────────────────────────────────────── */
export const selfMedications = pgTable(
  "self_medications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientUserId: uuid("patient_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),

    name: text("name").notNull(),
    dose: text("dose"),
    instructions: text("instructions"),

    schedulePattern: text("schedule_pattern").notNull().default("as_needed"),
    scheduleTimes: time("schedule_times").array(),

    startedOn: date("started_on"),
    endedOn: date("ended_on"),

    state: text("state").notNull().default("active"),
    notes: text("notes"),
    /** 0091 (ADR 0203 §7): added from a shared visit summary; once per prescription. FK in SQL. */
    sourcePrescriptionId: uuid("source_prescription_id"),
    /** 0134 (Pharmacy Phase 1, ML-1): the line's first supply; withdrawn (ML-6) as state `ended`. FK in SQL. */
    sourceSupplyId: uuid("source_supply_id"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("self_medications_state_check", sql`${t.state} IN ('active','paused','ended')`),
    check(
      "self_medications_schedule_pattern_check",
      sql`${t.schedulePattern} IN ('as_needed','once_daily','twice_daily','thrice_daily','custom')`,
    ),
    index("self_medications_patient_idx").on(t.patientUserId, t.state),
  ],
);

export type SelfMedication = typeof selfMedications.$inferSelect;
export type NewSelfMedication = typeof selfMedications.$inferInsert;

/* ─── self_medication_takes ──────────────────────────────────────── */
export const selfMedicationTakes = pgTable(
  "self_medication_takes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    medicationId: uuid("medication_id")
      .notNull()
      .references(() => selfMedications.id, { onDelete: "cascade" }),
    patientUserId: uuid("patient_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),

    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    takenAt: timestamp("taken_at", { withTimezone: true }).notNull().defaultNow(),
    note: text("note"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("self_medication_takes_patient_taken_idx").on(t.patientUserId, t.takenAt),
    index("self_medication_takes_med_idx").on(t.medicationId, t.takenAt),
  ],
);

export type SelfMedicationTake = typeof selfMedicationTakes.$inferSelect;
export type NewSelfMedicationTake = typeof selfMedicationTakes.$inferInsert;

/* ─── patient_reported_history (0175) ────────────────────────────── */
export const patientReportedHistory = pgTable(
  "patient_reported_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientUserId: uuid("patient_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    /** condition | allergy | family | no_known_allergies */
    kind: text("kind").notNull(),
    /** A clerking catalogue id (MS-EMR-CLERK-CAT-001), or 'other' with other_text. */
    itemId: text("item_id"),
    otherText: text("other_text"),
    onsetYear: smallint("onset_year"),
    /** Conditions: the patient no longer has it. */
    resolved: boolean("resolved"),
    /** Family: option_sets.relations id. */
    relation: text("relation"),
    /** Allergies: allergies.reactions ids. */
    reactions: text("reactions")
      .array()
      .notNull()
      .default(sql`'{}'`),
    severity: text("severity"),
    supersedesId: uuid("supersedes_id").references((): AnyPgColumn => patientReportedHistory.id),
    state: text("state").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    removedAt: timestamp("removed_at", { withTimezone: true }),
  },
  (t) => [
    check(
      "patient_reported_history_kind_check",
      sql`${t.kind} IN ('condition','allergy','family','no_known_allergies')`,
    ),
    check("patient_reported_history_state_check", sql`${t.state} IN ('active','removed')`),
    check(
      "patient_reported_history_relation_check",
      sql`${t.relation} IS NULL OR ${t.relation} IN ('mother','father','sibling','child','grandparent','other_relative')`,
    ),
    check(
      "patient_reported_history_severity_check",
      sql`${t.severity} IS NULL OR ${t.severity} IN ('mild','moderate','severe')`,
    ),
    index("patient_reported_history_active_idx")
      .on(t.patientUserId, t.kind)
      .where(sql`${t.state} = 'active'`),
  ],
);

export type PatientReportedHistory = typeof patientReportedHistory.$inferSelect;

import { sql } from "drizzle-orm";
import {
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
 * Patient self-tracking — migration 0029.
 *
 * Three tables, all patient-owned:
 *   - personal_health_logs       readings + symptoms + free notes
 *   - self_medications           the patient's own med list
 *   - self_medication_takes      confirmed-taken events; adherence
 *
 * RLS: patient SELECT/INSERT/UPDATE/DELETE on own rows. No clinician
 * access — that's a separate `clinical_observations` table when the
 * clinical module ships.
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
      sql`${t.kind} IN ('glucose','bp','weight','spo2','temperature','symptom','note','other')`,
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

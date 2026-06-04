import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { authUsers } from "./_auth";
import { hospitalDepartments } from "./hospital-departments";
import { hospitals } from "./hospitals";

/**
 * Scheduling, Appointments & Booking — migration 0028.
 *
 * See docs/scheduling-gate-a-proposal.md for the design rationale.
 *
 * Tables (in dependency order):
 *   - availability_blocks            (clinician declared time)
 *   - clinician_scheduling_settings  (per-clinician + per-hospital config)
 *   - department_scheduling_policy   (per-department defaults / overrides)
 *   - appointments                   (the core booking object)
 *   - encounters                     (minimal seam to clinical module)
 *   - queue_entries                  (same-day arrival queue)
 *   - appointment_reminders          (queued reminders; dispatcher elsewhere)
 *
 * `appointments.triggered_by_alert_id` is intentionally TEXT, not a FK
 * to alerts(id) — the monitoring module hasn't shipped. The day it
 * does, a follow-up migration upgrades the column to a real FK.
 */

/* ─── availability_blocks ─────────────────────────────────────────── */
export const availabilityBlocks = pgTable(
  "availability_blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hospitalId: uuid("hospital_id")
      .notNull()
      .references(() => hospitals.id, { onDelete: "cascade" }),
    clinicianUserId: uuid("clinician_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    departmentId: uuid("department_id").references(() => hospitalDepartments.id, {
      onDelete: "set null",
    }),
    kind: text("kind").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    recurrence: text("recurrence").notNull().default("none"),
    recurrenceWeekday: smallint("recurrence_weekday"),
    recurrenceUntil: timestamp("recurrence_until", { withTimezone: true }),
    location: text("location"),
    notes: text("notes"),
    state: text("state").notNull().default("active"),
    createdByUserId: uuid("created_by_user_id").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "availability_blocks_kind_check",
      sql`${t.kind} IN ('bookable','teaching','ward_round','admin','leave','unavailable')`,
    ),
    check("availability_blocks_recurrence_check", sql`${t.recurrence} IN ('none','weekly')`),
    check("availability_blocks_state_check", sql`${t.state} IN ('active','cancelled')`),
    check("availability_blocks_time_order", sql`${t.endsAt} > ${t.startsAt}`),
    index("availability_blocks_clinician_idx").on(t.clinicianUserId, t.startsAt),
    index("availability_blocks_hospital_idx").on(t.hospitalId, t.startsAt),
  ],
);

/* ─── clinician_scheduling_settings ───────────────────────────────── */
export const clinicianSchedulingSettings = pgTable(
  "clinician_scheduling_settings",
  {
    clinicianUserId: uuid("clinician_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    hospitalId: uuid("hospital_id")
      .notNull()
      .references(() => hospitals.id, { onDelete: "cascade" }),
    autoConfirm: boolean("auto_confirm").notNull().default(false),
    defaultSlotMinutes: integer("default_slot_minutes").notNull().default(15),
    bufferMinutes: integer("buffer_minutes").notNull().default(0),
    allowVirtual: boolean("allow_virtual").notNull().default(false),
    allowOutOfHoursOverride: boolean("allow_out_of_hours_override").notNull().default(true),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.clinicianUserId, t.hospitalId] }),
    check("clinician_scheduling_slot_range", sql`${t.defaultSlotMinutes} BETWEEN 5 AND 240`),
    check("clinician_scheduling_buffer_range", sql`${t.bufferMinutes} BETWEEN 0 AND 60`),
  ],
);

/* ─── department_scheduling_policy ────────────────────────────────── */
export const departmentSchedulingPolicy = pgTable(
  "department_scheduling_policy",
  {
    departmentId: uuid("department_id")
      .primaryKey()
      .references(() => hospitalDepartments.id, { onDelete: "cascade" }),
    defaultSlotMinutes: integer("default_slot_minutes").notNull().default(15),
    defaultBufferMinutes: integer("default_buffer_minutes").notNull().default(0),
    defaultAutoConfirm: boolean("default_auto_confirm").notNull().default(false),
    // smallint[] / integer[] — typed as unknown until we wire generated
    // Database types. Stored as Postgres array literals; the Edge
    // Functions handle parsing.
    bookableWeekdays: smallint("bookable_weekdays").array().notNull().default([1, 2, 3, 4, 5]),
    bookableStartMinutesLocal: integer("bookable_start_minutes_local").notNull().default(480),
    bookableEndMinutesLocal: integer("bookable_end_minutes_local").notNull().default(1020),
    reminderLeadMinutes: integer("reminder_lead_minutes").array().notNull().default([1440, 60]),
    allowVirtual: boolean("allow_virtual").notNull().default(false),
    notes: text("notes"),
    updatedByUserId: uuid("updated_by_user_id").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("dept_policy_slot_range", sql`${t.defaultSlotMinutes} BETWEEN 5 AND 240`),
    check("dept_policy_buffer_range", sql`${t.defaultBufferMinutes} BETWEEN 0 AND 60`),
    check(
      "dept_policy_window_order",
      sql`${t.bookableEndMinutesLocal} > ${t.bookableStartMinutesLocal}`,
    ),
  ],
);

/* ─── appointments ────────────────────────────────────────────────── */
export const appointments = pgTable(
  "appointments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hospitalId: uuid("hospital_id")
      .notNull()
      .references(() => hospitals.id, { onDelete: "cascade" }),
    departmentId: uuid("department_id")
      .notNull()
      .references(() => hospitalDepartments.id, { onDelete: "restrict" }),
    patientUserId: uuid("patient_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    clinicianUserId: uuid("clinician_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "restrict" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    reason: text("reason").notNull(),
    reasonNote: text("reason_note"),
    origin: text("origin").notNull(),
    status: text("status").notNull().default("requested"),
    priority: text("priority").notNull().default("routine"),
    type: text("type").notNull().default("in_person"),
    locationRoom: text("location_room"),
    cancelledReason: text("cancelled_reason"),
    cancelledByUserId: uuid("cancelled_by_user_id").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    declinedReason: text("declined_reason"),
    rescheduledFromAppointmentId: uuid("rescheduled_from_appointment_id").references(
      (): AnyPgColumn => appointments.id,
      { onDelete: "set null" },
    ),
    /** Intent: FK to alerts(id) when monitoring lands. Text for now. */
    triggeredByAlertId: text("triggered_by_alert_id"),
    createdByUserId: uuid("created_by_user_id").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    notifyLeadMinutes: integer("notify_lead_minutes").array(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("appointments_time_order", sql`${t.endsAt} > ${t.startsAt}`),
    check(
      "appointments_reason_check",
      sql`${t.reason} IN ('follow_up','new_concern','refill','routine','urgent_review','other')`,
    ),
    check(
      "appointments_origin_check",
      sql`${t.origin} IN ('patient','clinician','nurse','reception','system_urgent','walk_in')`,
    ),
    check(
      "appointments_status_check",
      sql`${t.status} IN ('requested','pending_approval','confirmed','arrived','in_progress','completed','cancelled','no_show','rescheduled','declined')`,
    ),
    check("appointments_priority_check", sql`${t.priority} IN ('routine','urgent')`),
    check("appointments_type_check", sql`${t.type} IN ('in_person','virtual')`),
    index("appointments_patient_idx").on(t.patientUserId, t.startsAt),
    index("appointments_clinician_idx").on(t.clinicianUserId, t.startsAt),
    index("appointments_hospital_status_idx").on(t.hospitalId, t.status, t.startsAt),
    // Partial unique index — only enforced for live statuses.
    uniqueIndex("appointments_no_double_booking")
      .on(t.clinicianUserId, t.startsAt)
      .where(
        sql`${t.status} IN ('requested','pending_approval','confirmed','arrived','in_progress')`,
      ),
  ],
);

/* ─── encounters ──────────────────────────────────────────────────── */
export const encounters = pgTable(
  "encounters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hospitalId: uuid("hospital_id")
      .notNull()
      .references(() => hospitals.id, { onDelete: "cascade" }),
    appointmentId: uuid("appointment_id").references(() => appointments.id, {
      onDelete: "set null",
    }),
    patientUserId: uuid("patient_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    clinicianUserId: uuid("clinician_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "restrict" }),
    departmentId: uuid("department_id").references(() => hospitalDepartments.id, {
      onDelete: "set null",
    }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    state: text("state").notNull().default("in_progress"),
    // Free-text "why the encounter ended" — discharged / referred-out
    // / left-without-being-seen / admitted / completed-routine. Added
    // in migration 0033 alongside ha-complete-encounter.
    completionReason: text("completion_reason"),
    // ── Encounter / EMR engine (migration 0040, GATED) ──
    // The clinical disposition the clerking produces (the admission slice
    // consumes this). FK enforced in SQL (avoids a triage↔scheduling import cycle).
    disposition: text("disposition"),
    triageRecordId: uuid("triage_record_id"),
    /** What kind of encounter this is (clerkship / scheduled / resus / …). */
    encounterClass: text("encounter_class").notNull().default("scheduled"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("encounters_state_check", sql`${t.state} IN ('in_progress','completed','cancelled')`),
    check(
      "encounters_disposition_check",
      sql`${t.disposition} IS NULL OR ${t.disposition} IN ('admit','discharge','refer','observe','transfer','deceased')`,
    ),
    check("encounters_time_order", sql`${t.endedAt} IS NULL OR ${t.endedAt} >= ${t.startedAt}`),
    index("encounters_patient_idx").on(t.patientUserId, t.startedAt),
    index("encounters_clinician_idx").on(t.clinicianUserId, t.startedAt),
    index("encounters_hospital_idx").on(t.hospitalId, t.startedAt),
  ],
);

/* ─── queue_entries ───────────────────────────────────────────────── */
export const queueEntries = pgTable(
  "queue_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hospitalId: uuid("hospital_id")
      .notNull()
      .references(() => hospitals.id, { onDelete: "cascade" }),
    departmentId: uuid("department_id")
      .notNull()
      .references(() => hospitalDepartments.id, { onDelete: "restrict" }),
    appointmentId: uuid("appointment_id").references(() => appointments.id, {
      onDelete: "set null",
    }),
    patientUserId: uuid("patient_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    state: text("state").notNull().default("waiting"),
    arrivedAt: timestamp("arrived_at", { withTimezone: true }).notNull().defaultNow(),
    calledAt: timestamp("called_at", { withTimezone: true }),
    calledByUserId: uuid("called_by_user_id").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    notes: text("notes"),
    encounterId: uuid("encounter_id").references(() => encounters.id, {
      onDelete: "set null",
    }),
    sequenceNumber: integer("sequence_number").notNull(),
    // Triage re-rank key (migration 0036). Nullable: untriaged entries
    // keep their FIFO sequence_number; once triaged, priority_order = the
    // assigned acuity (lower = seen sooner), sequence_number is the tiebreak.
    priorityOrder: integer("priority_order"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "queue_entries_kind_check",
      sql`${t.kind} IN ('scheduled_arrival','walk_in','urgent_walk_in')`,
    ),
    check("queue_entries_state_check", sql`${t.state} IN ('waiting','being_seen','left','done')`),
    index("queue_entries_dept_state_idx").on(t.hospitalId, t.departmentId, t.state, t.arrivedAt),
    index("queue_entries_patient_idx").on(t.patientUserId, t.arrivedAt),
  ],
);

/* ─── appointment_reminders ───────────────────────────────────────── */
export const appointmentReminders = pgTable(
  "appointment_reminders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appointmentId: uuid("appointment_id")
      .notNull()
      .references(() => appointments.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    state: text("state").notNull().default("queued"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    failureReason: text("failure_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("reminders_channel_check", sql`${t.channel} IN ('push','sms','email','in_app')`),
    check("reminders_state_check", sql`${t.state} IN ('queued','sent','failed','cancelled')`),
    index("appointment_reminders_dispatcher_idx")
      .on(t.state, t.scheduledAt)
      .where(sql`${t.state} = 'queued'`),
  ],
);

/* ─── Inferred types ─────────────────────────────────────────────── */
export type AvailabilityBlock = typeof availabilityBlocks.$inferSelect;
export type NewAvailabilityBlock = typeof availabilityBlocks.$inferInsert;
export type ClinicianSchedulingSettings = typeof clinicianSchedulingSettings.$inferSelect;
export type NewClinicianSchedulingSettings = typeof clinicianSchedulingSettings.$inferInsert;
export type DepartmentSchedulingPolicy = typeof departmentSchedulingPolicy.$inferSelect;
export type NewDepartmentSchedulingPolicy = typeof departmentSchedulingPolicy.$inferInsert;
export type Appointment = typeof appointments.$inferSelect;
export type NewAppointment = typeof appointments.$inferInsert;
export type Encounter = typeof encounters.$inferSelect;
export type NewEncounter = typeof encounters.$inferInsert;
export type QueueEntry = typeof queueEntries.$inferSelect;
export type NewQueueEntry = typeof queueEntries.$inferInsert;
export type AppointmentReminder = typeof appointmentReminders.$inferSelect;
export type NewAppointmentReminder = typeof appointmentReminders.$inferInsert;

/* ─── Enums-as-string-constants (for client + form validation) ───── */

export const APPOINTMENT_REASONS = [
  "follow_up",
  "new_concern",
  "refill",
  "routine",
  "urgent_review",
  "other",
] as const;
export type AppointmentReason = (typeof APPOINTMENT_REASONS)[number];

export const APPOINTMENT_ORIGINS = [
  "patient",
  "clinician",
  "nurse",
  "reception",
  "system_urgent",
  "walk_in",
] as const;
export type AppointmentOrigin = (typeof APPOINTMENT_ORIGINS)[number];

export const APPOINTMENT_STATUSES = [
  "requested",
  "pending_approval",
  "confirmed",
  "arrived",
  "in_progress",
  "completed",
  "cancelled",
  "no_show",
  "rescheduled",
  "declined",
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const APPOINTMENT_PRIORITIES = ["routine", "urgent"] as const;
export type AppointmentPriority = (typeof APPOINTMENT_PRIORITIES)[number];

export const APPOINTMENT_TYPES = ["in_person", "virtual"] as const;
export type AppointmentType = (typeof APPOINTMENT_TYPES)[number];

export const AVAILABILITY_KINDS = [
  "bookable",
  "teaching",
  "ward_round",
  "admin",
  "leave",
  "unavailable",
] as const;
export type AvailabilityKind = (typeof AVAILABILITY_KINDS)[number];

export const QUEUE_KINDS = ["scheduled_arrival", "walk_in", "urgent_walk_in"] as const;
export type QueueKind = (typeof QUEUE_KINDS)[number];

export const QUEUE_STATES = ["waiting", "being_seen", "left", "done"] as const;
export type QueueState = (typeof QUEUE_STATES)[number];

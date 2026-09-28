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
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { authUsers } from "./_auth";
import { hospitalDepartments } from "./hospital-departments";
import { hospitals } from "./hospitals";
import { serviceLines } from "./service-lines";

/**
 * Session mode — migration 0058 (GATED), ADR 0087, proposal §5.3 / §5.4.
 *
 *   session_templates  the weekly rule: "every Tuesday, 08:00, 4 h, cap 60"
 *   clinic_sessions    one dated instance, materialised 14 days ahead by
 *                      `expandSessionTemplate` (`_shared/slots.ts`) — on
 *                      template write and nightly — idempotent on
 *                      (template_id, starts_at).
 *
 * The capacity columns are copied template → instance so editing a rule
 * never rewrites a published session. `booked_count` / `next_position` are
 * moved by the one-statement allocator in `_shared/sessions-sql.ts` (Gate C);
 * `next_position` is monotonic so a position number is never re-issued.
 */

/* ─── session_templates ───────────────────────────────────────────── */
export const sessionTemplates = pgTable(
  "session_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    serviceLineId: uuid("service_line_id")
      .notNull()
      .references(() => serviceLines.id, { onDelete: "cascade" }),
    hospitalId: uuid("hospital_id")
      .notNull()
      .references(() => hospitals.id, { onDelete: "cascade" }),
    departmentId: uuid("department_id")
      .notNull()
      .references(() => hospitalDepartments.id, { onDelete: "cascade" }),
    clinicianUserId: uuid("clinician_user_id").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    venue: text("venue"),
    /** ISO 1 = Monday … 7 = Sunday (0052's convention). */
    weekday: smallint("weekday").notNull(),
    /** Minutes past local midnight in the hospital's zone. */
    startMinutesLocal: smallint("start_minutes_local").notNull(),
    durationMinutes: smallint("duration_minutes").notNull(),
    capacityTotal: smallint("capacity_total").notNull(),
    /** No DEFAULT: the writer supplies ceil(0.6 × capacity_total) when blank (Part 8 #4). */
    capacityBooked: smallint("capacity_booked").notNull(),
    interleaveBooked: smallint("interleave_booked").notNull().default(2),
    interleaveWalkIn: smallint("interleave_walk_in").notNull().default(1),
    overbookingFactor: numeric("overbooking_factor", { precision: 3, scale: 2 })
      .notNull()
      .default("1.00"),
    validFrom: date("valid_from").notNull(),
    validUntil: date("valid_until"),
    active: boolean("active").notNull().default(true),
    /** 0080 (CLN-3): every N weeks from the first occurrence; or the nth weekday (−1 = last). */
    repeatEveryWeeks: smallint("repeat_every_weeks").notNull().default(1),
    nthWeekday: smallint("nth_weekday"),
    /** 0080 (CLN-4): skip public holidays unless true. Closures always win. */
    runsOnHolidays: boolean("runs_on_holidays").notNull().default(false),
    placeId: uuid("place_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("session_templates_weekday_range", sql`${t.weekday} BETWEEN 1 AND 7`),
    check("session_templates_start_range", sql`${t.startMinutesLocal} BETWEEN 0 AND 1440`),
    check("session_templates_duration_range", sql`${t.durationMinutes} BETWEEN 15 AND 720`),
    check("session_templates_capacity_total_positive", sql`${t.capacityTotal} > 0`),
    check(
      "session_templates_capacity_booked_range",
      sql`${t.capacityBooked} > 0 AND ${t.capacityBooked} <= ${t.capacityTotal}`,
    ),
    check(
      "session_templates_interleave_positive",
      sql`${t.interleaveBooked} > 0 AND ${t.interleaveWalkIn} > 0`,
    ),
    check("session_templates_overbooking_range", sql`${t.overbookingFactor} BETWEEN 1.00 AND 2.00`),
    check(
      "session_templates_validity_order",
      sql`${t.validUntil} IS NULL OR ${t.validUntil} >= ${t.validFrom}`,
    ),
    unique("session_templates_unique_rule").on(
      t.serviceLineId,
      t.weekday,
      t.startMinutesLocal,
      t.validFrom,
    ),
    index("session_templates_hospital_idx").on(t.hospitalId, t.active),
  ],
);

/* ─── clinic_sessions ─────────────────────────────────────────────── */
export const clinicSessions = pgTable(
  "clinic_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hospitalId: uuid("hospital_id")
      .notNull()
      .references(() => hospitals.id, { onDelete: "cascade" }),
    departmentId: uuid("department_id")
      .notNull()
      .references(() => hospitalDepartments.id, { onDelete: "cascade" }),
    serviceLineId: uuid("service_line_id")
      .notNull()
      .references(() => serviceLines.id, { onDelete: "cascade" }),
    templateId: uuid("template_id").references(() => sessionTemplates.id, {
      onDelete: "set null",
    }),
    /** NULL is the §3.6 "unset" state, not an error. */
    clinicianUserId: uuid("clinician_user_id").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    venue: text("venue"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    capacityTotal: smallint("capacity_total").notNull(),
    /** Walk-in share = total − booked; not stored. */
    capacityBooked: smallint("capacity_booked").notNull(),
    interleaveBooked: smallint("interleave_booked").notNull().default(2),
    interleaveWalkIn: smallint("interleave_walk_in").notNull().default(1),
    overbookingFactor: numeric("overbooking_factor", { precision: 3, scale: 2 })
      .notNull()
      .default("1.00"),
    /** Live bookings; decremented on cancellation. */
    bookedCount: smallint("booked_count").notNull().default(0),
    /** Monotonic; never decremented (PRD §4.4). */
    nextPosition: smallint("next_position").notNull().default(0),
    /** 'draft' | 'published' | 'cancelled' | 'closed' */
    status: text("status").notNull().default("published"),
    cancelledReason: text("cancelled_reason"),
    cancelledByUserId: uuid("cancelled_by_user_id").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    /** Migration 0061 / ADR 0090: "running late by N minutes"; stored windows of un-arrived positions shift with it. */
    delayMinutes: smallint("delay_minutes").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("clinic_sessions_delay_range", sql`${t.delayMinutes} BETWEEN 0 AND 480`),
    check("clinic_sessions_time_order", sql`${t.endsAt} > ${t.startsAt}`),
    check("clinic_sessions_capacity_total_positive", sql`${t.capacityTotal} > 0`),
    check(
      "clinic_sessions_capacity_booked_range",
      sql`${t.capacityBooked} > 0 AND ${t.capacityBooked} <= ${t.capacityTotal}`,
    ),
    check(
      "clinic_sessions_interleave_positive",
      sql`${t.interleaveBooked} > 0 AND ${t.interleaveWalkIn} > 0`,
    ),
    check("clinic_sessions_overbooking_range", sql`${t.overbookingFactor} BETWEEN 1.00 AND 2.00`),
    check(
      "clinic_sessions_booked_count_range",
      sql`${t.bookedCount} >= 0 AND ${t.bookedCount} <= ceil(${t.capacityBooked} * ${t.overbookingFactor})`,
    ),
    check("clinic_sessions_next_position_nonneg", sql`${t.nextPosition} >= 0`),
    check(
      "clinic_sessions_status_check",
      sql`${t.status} IN ('draft','published','cancelled','closed')`,
    ),
    index("clinic_sessions_line_published_idx")
      .on(t.serviceLineId, t.startsAt)
      .where(sql`${t.status} = 'published'`),
    index("clinic_sessions_hospital_idx").on(t.hospitalId, t.startsAt),
    uniqueIndex("clinic_sessions_template_start_unique")
      .on(t.templateId, t.startsAt)
      .where(sql`${t.templateId} IS NOT NULL`),
  ],
);

export type SessionTemplate = typeof sessionTemplates.$inferSelect;
export type NewSessionTemplate = typeof sessionTemplates.$inferInsert;
export type ClinicSession = typeof clinicSessions.$inferSelect;
export type NewClinicSession = typeof clinicSessions.$inferInsert;

export const CLINIC_SESSION_STATUSES = ["draft", "published", "cancelled", "closed"] as const;
export type ClinicSessionStatus = (typeof CLINIC_SESSION_STATUSES)[number];

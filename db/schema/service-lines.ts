import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { hospitalDepartments } from "./hospital-departments";
import { hospitals } from "./hospitals";

/**
 * Service lines — migration 0058 (GATED), ADR 0087, proposal §5.2.
 *
 * The table everything in the capacity model hangs on: which of the three
 * capacity modes a service runs in, its time-to-care target, continuity
 * default, confidentiality flag and payment posture. One line belongs to one
 * department; `department_scheduling_policy` remains the slot-mode policy
 * source.
 *
 * Every existing department was backfilled with one `slot` line so nothing
 * shipped changes (ruling C2). New lines default to `session` (Part 8 #3).
 * Written only by `ha-upsert-service-line`.
 */
export const serviceLines = pgTable(
  "service_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hospitalId: uuid("hospital_id")
      .notNull()
      .references(() => hospitals.id, { onDelete: "cascade" }),
    departmentId: uuid("department_id")
      .notNull()
      .references(() => hospitalDepartments.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    /** 'slot' | 'session' | 'open_queue' (ruling C2). */
    capacityMode: text("capacity_mode").notNull().default("session"),
    /**
     * Facility-set maximum acceptable lead time (PRD §2.4). The DEFAULT and
     * the Appendix A per-family values are CSO-PROVISIONAL (Part 8 #5).
     */
    timeToCareDays: smallint("time_to_care_days").notNull().default(7),
    continuityDefault: boolean("continuity_default").notNull().default(false),
    confidential: boolean("confidential").notNull().default(false),
    /** 'none' | 'deposit' | 'full' — posture only; payments are Gate G. */
    paymentPosture: text("payment_posture").notNull().default("none"),
    feeUgx: integer("fee_ugx"),
    depositUgx: integer("deposit_ugx"),
    /** The Appendix A reasons this line accepts (⊆ PATIENT_REASON_CODES + 'other'). */
    reasonCodes: text("reason_codes").array().notNull().default([]),
    isDefault: boolean("is_default").notNull().default(false),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "service_lines_capacity_mode_check",
      sql`${t.capacityMode} IN ('slot','session','open_queue')`,
    ),
    check("service_lines_time_to_care_range", sql`${t.timeToCareDays} BETWEEN 1 AND 365`),
    check(
      "service_lines_payment_posture_check",
      sql`${t.paymentPosture} IN ('none','deposit','full')`,
    ),
    check("service_lines_fee_nonneg", sql`${t.feeUgx} IS NULL OR ${t.feeUgx} >= 0`),
    check("service_lines_deposit_nonneg", sql`${t.depositUgx} IS NULL OR ${t.depositUgx} >= 0`),
    check(
      "service_lines_fee_required",
      sql`${t.paymentPosture} = 'none' OR ${t.feeUgx} IS NOT NULL`,
    ),
    check(
      "service_lines_reason_codes_check",
      sql`${t.reasonCodes} <@ ARRAY['follow_up','post_discharge','new_concern','refill','test_results','antenatal','immunisation','child_wellness','specialist_review','routine','procedure','counselling','second_opinion','other']::text[]`,
    ),
    unique("service_lines_hospital_slug_unique").on(t.hospitalId, t.slug),
    uniqueIndex("service_lines_one_default_per_hospital")
      .on(t.hospitalId)
      .where(sql`${t.isDefault}`),
    index("service_lines_hospital_active_idx").on(t.hospitalId, t.active),
  ],
);

export type ServiceLine = typeof serviceLines.$inferSelect;
export type NewServiceLine = typeof serviceLines.$inferInsert;

export const CAPACITY_MODES = ["slot", "session", "open_queue"] as const;
export type CapacityMode = (typeof CAPACITY_MODES)[number];

export const PAYMENT_POSTURES = ["none", "deposit", "full"] as const;
export type PaymentPosture = (typeof PAYMENT_POSTURES)[number];

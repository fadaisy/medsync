import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { authUsers } from "./_auth";
import { hospitalDepartments } from "./hospital-departments";
import { hospitals } from "./hospitals";

/**
 * Dispensing points (migration 0121 — GATED, ADR 0236): a unit of the Pharmacy department and what
 * it serves, which picks the lane its staff's queue opens on. Holds no stock, records no dispensing.
 */
export const DISPENSING_SERVES = ["window", "wards", "emergency", "all"] as const;
export type DispensingServes = (typeof DISPENSING_SERVES)[number];

export const pharmacyDispensingPoints = pgTable(
  "pharmacy_dispensing_points",
  {
    departmentId: uuid("department_id")
      .primaryKey()
      .references(() => hospitalDepartments.id, { onDelete: "cascade" }),
    hospitalId: uuid("hospital_id")
      .notNull()
      .references(() => hospitals.id, { onDelete: "cascade" }),
    serves: text("serves").$type<DispensingServes>().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    updatedByUserId: uuid("updated_by_user_id").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    /** 0129 (Pharmacy Phase 1): stamped by an approved go-live request, never by hand (RD-2). */
    liveAt: timestamp("live_at", { withTimezone: true }),
    switchedOffAt: timestamp("switched_off_at", { withTimezone: true }),
    labelMode: text("label_mode").$type<"printed" | "by_hand">().notNull().default("printed"),
    countFreshnessDays: integer("count_freshness_days"),
    /** The point's own number (gate-a-proposal §1 W1); the hub holds none. */
    phone: text("phone"),
  },
  (t) => [index("pharmacy_dispensing_points_hospital_idx").on(t.hospitalId)],
);

import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { hospitals } from "./hospitals";

/**
 * Department or sub-specialty within a hospital. Self-referential via
 * `parent_id` so Internal Medicine can hold Cardiology, Nephrology, …
 * as children (seeded in Phase 0.11).
 */
export const hospitalDepartments = pgTable(
  "hospital_departments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hospitalId: uuid("hospital_id")
      .notNull()
      .references(() => hospitals.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id").references((): AnyPgColumn => hospitalDepartments.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    /** 0080: 'clinical' | 'diagnostic' | 'support' | 'administrative' (STR-1). */
    kind: text("kind").notNull().default("clinical"),
    /** 0080: the hub catalogue code (INTERNAL_MEDICINE, LABORATORY, a lab section code …). */
    catalogueCode: text("catalogue_code"),
    /** 0080: live on MedSync — only live departments reach sign-up, queues and booking (D-SVC-02). */
    medsyncLiveAt: timestamp("medsync_live_at", { withTimezone: true }),
    /** 0080: archived, never deleted (STR-4). */
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    /** 0080: where this hospital starts with MedSync — one per hospital (STR-2). */
    isStart: boolean("is_start").notNull().default(false),
    placeId: uuid("place_id"),
    serviceHours: text("service_hours"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("hospital_departments_unique_slug").on(t.hospitalId, t.parentId, t.slug),
    index("hospital_departments_hospital_idx").on(t.hospitalId),
    index("hospital_departments_parent_idx").on(t.parentId),
  ],
);

export type HospitalDepartment = typeof hospitalDepartments.$inferSelect;
export type NewHospitalDepartment = typeof hospitalDepartments.$inferInsert;

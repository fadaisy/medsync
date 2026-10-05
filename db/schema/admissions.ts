/* ─── Closing the encounter (migration 0091 — GATED) ─────────────────────
 * ADRs 0197–0203, docs/emr/closure/.
 *
 * admissions: one row per inpatient stay, from the visit that decided it to a ward; one open per patient;
 * awaiting_bed → bed_allocated → arrived, or cancelled (a guard trigger). Written only by the four SQL
 * functions of 0091, called by the Edge Functions on the service role.
 *
 * patient_visit_summaries: the clinician's share or hold of a visit's patient-facing copy; append-only and
 * versioned (only the supersession is stamped). Written in the clinician's transaction; the patient reads
 * their own current shared row.
 */
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { authUsers } from "./_auth";
import { conditions } from "./emr";
import { hospitalWards } from "./hospital-wards";
import { hospitals } from "./hospitals";
import { encounters } from "./scheduling";

export const ADMISSION_STATUSES = [
  "awaiting_bed",
  "bed_allocated",
  "arrived",
  "cancelled",
] as const;
export type AdmissionStatus = (typeof ADMISSION_STATUSES)[number];
/** The open statuses: one admission per patient among these. */
export const OPEN_ADMISSION_STATUSES = ["awaiting_bed", "bed_allocated", "arrived"] as const;
/** Why an admitted patient waits for a bed (ADR 0198 §5; the wording is a draft for the CSO). */
export const BED_WAIT_REASONS = ["no_free_bed", "extra_bed", "floor", "other"] as const;
export type BedWaitReason = (typeof BED_WAIT_REASONS)[number];

export const admissions = pgTable(
  "admissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hospitalId: uuid("hospital_id")
      .notNull()
      .references(() => hospitals.id, { onDelete: "cascade" }),
    patientUserId: uuid("patient_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    sourceEncounterId: uuid("source_encounter_id")
      .notNull()
      .references(() => encounters.id),
    /** Opened on arrival (ADR 0200 §5). */
    inpatientEncounterId: uuid("inpatient_encounter_id").references(() => encounters.id),
    wardId: uuid("ward_id")
      .notNull()
      .references(() => hospitalWards.id),
    leadingConditionId: uuid("leading_condition_id").references(() => conditions.id),
    status: text("status").notNull().default("awaiting_bed"),
    decidedBy: uuid("decided_by").notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
    bedWaitReason: text("bed_wait_reason"),
    bedWaitNoteCiphertext: text("bed_wait_note_ciphertext"),
    arrivedAt: timestamp("arrived_at", { withTimezone: true }),
    arrivedBy: uuid("arrived_by"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledBy: uuid("cancelled_by"),
    cancelReason: text("cancel_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "admissions_status_check",
      sql`${t.status} IN ('awaiting_bed', 'bed_allocated', 'arrived', 'cancelled')`,
    ),
    check(
      "admissions_wait_reason_check",
      sql`${t.bedWaitReason} IS NULL OR ${t.bedWaitReason} IN ('no_free_bed', 'extra_bed', 'floor', 'other')`,
    ),
    uniqueIndex("admissions_one_open_per_patient")
      .on(t.patientUserId)
      .where(sql`${t.status} IN ('awaiting_bed', 'bed_allocated', 'arrived')`),
    uniqueIndex("admissions_source_encounter").on(t.sourceEncounterId),
    index("admissions_ward_status_idx").on(t.wardId, t.status, t.decidedAt),
    index("admissions_hospital_idx").on(t.hospitalId),
  ],
);

export const HOLD_REASONS = [
  "tell_in_person",
  "awaiting_result",
  "patient_declined",
  "other",
] as const;
export type HoldReason = (typeof HOLD_REASONS)[number];

export const patientVisitSummaries = pgTable(
  "patient_visit_summaries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hospitalId: uuid("hospital_id")
      .notNull()
      .references(() => hospitals.id, { onDelete: "cascade" }),
    patientUserId: uuid("patient_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    encounterId: uuid("encounter_id")
      .notNull()
      .references(() => encounters.id),
    version: integer("version").notNull(),
    state: text("state").notNull(),
    /** The composed copy (lib/patient/visit-summary.ts), encrypted; shared rows only. */
    copyCiphertext: text("copy_ciphertext"),
    /** The items the clinician removed, by id. */
    removedItemIds: jsonb("removed_item_ids").$type<string[]>().notNull().default([]),
    holdReason: text("hold_reason"),
    holdNoteCiphertext: text("hold_note_ciphertext"),
    decidedBy: uuid("decided_by").notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    supersededBy: uuid("superseded_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("patient_visit_summaries_state_check", sql`${t.state} IN ('shared', 'held')`),
    uniqueIndex("patient_visit_summaries_encounter_version").on(t.encounterId, t.version),
    uniqueIndex("patient_visit_summaries_one_current")
      .on(t.encounterId)
      .where(sql`${t.supersededAt} IS NULL`),
    index("patient_visit_summaries_patient_idx")
      .on(t.patientUserId, t.decidedAt.desc())
      .where(sql`${t.supersededAt} IS NULL`),
  ],
);

export type Admission = typeof admissions.$inferSelect;
export type PatientVisitSummaryRow = typeof patientVisitSummaries.$inferSelect;

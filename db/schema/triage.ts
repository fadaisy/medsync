import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { authUsers } from "./_auth";
import { hospitalDepartments } from "./hospital-departments";
import { hospitals } from "./hospitals";
import { patientIntakes } from "./patient-intakes";

/**
 * Smart Triage Engine — migration 0036.
 *
 *   - triage_discriminators   reference data (the §A.2 red-flag list)
 *   - triage_records          the medico-legal triage record (PHI)
 *   - triage_config           per-hospital target-time / threshold overrides
 *
 * The scoring is a pure deterministic function in lib/triage; these
 * tables are its storage + authority substrate. Writes are Edge
 * Function / service-role only; reads are RLS-scoped (clinical staff +
 * patient-own + superadmin — reception excluded via is_clinical).
 */

/* ─── triage_discriminators (reference) ─────────────────────────── */
export const triageDiscriminators = pgTable(
  "triage_discriminators",
  {
    code: text("code").primaryKey(),
    label: text("label").notNull(),
    minAcuityLevel: smallint("min_acuity_level").notNull(),
    appliesTo: text("applies_to").notNull().default("all"),
    source: text("source").notNull().default("manual"),
    isLifeThreat: boolean("is_life_threat").notNull().default(false),
    isConditional: boolean("is_conditional").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("td_min_acuity_check", sql`${t.minAcuityLevel} BETWEEN 1 AND 5`),
    check("td_applies_to_check", sql`${t.appliesTo} IN ('all','adult','paediatric','obstetric')`),
    check("td_source_check", sql`${t.source} IN ('manual','derived')`),
  ],
);

export type TriageDiscriminatorRow = typeof triageDiscriminators.$inferSelect;

/* ─── triage_records (medico-legal; PHI) ────────────────────────── */
export const triageRecords = pgTable(
  "triage_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    intakeId: uuid("intake_id").references(() => patientIntakes.id, { onDelete: "set null" }),
    patientUserId: uuid("patient_user_id").references(() => authUsers.id, { onDelete: "set null" }),
    hospitalId: uuid("hospital_id")
      .notNull()
      .references(() => hospitals.id, { onDelete: "cascade" }),
    departmentId: uuid("department_id").references(() => hospitalDepartments.id, {
      onDelete: "set null",
    }),

    ruleset: text("ruleset").notNull(),

    vitalsSnapshot: jsonb("vitals_snapshot").notNull(),
    computedLevel: smallint("computed_level").notNull(),
    computedScore: integer("computed_score"),
    computedBreakdown: jsonb("computed_breakdown").notNull(),

    assignedLevel: smallint("assigned_level").notNull(),
    overrideDirection: text("override_direction").notNull().default("none"),
    overrideReason: text("override_reason"),

    baselineAdjusted: boolean("baseline_adjusted").notNull().default(false),
    baselineReason: text("baseline_reason"),
    lifeThreatFastTracked: boolean("life_threat_fast_tracked").notNull().default(false),
    provisional: boolean("provisional").notNull().default(false),

    triagedByUserId: uuid("triaged_by_user_id").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    triagedAt: timestamp("triaged_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "tr_ruleset_check",
      sql`${t.ruleset} IN ('adult_news2','paediatric_pews','obstetric_meows')`,
    ),
    check("tr_computed_level_check", sql`${t.computedLevel} BETWEEN 1 AND 5`),
    check("tr_assigned_level_check", sql`${t.assignedLevel} BETWEEN 1 AND 5`),
    check("tr_override_direction_check", sql`${t.overrideDirection} IN ('up','down','none')`),
    check(
      "tr_override_reason_required",
      sql`${t.overrideDirection} <> 'down' OR ${t.overrideReason} IS NOT NULL`,
    ),
    check(
      "tr_baseline_reason_required",
      sql`${t.baselineAdjusted} = false OR ${t.baselineReason} IS NOT NULL`,
    ),
    index("triage_records_intake_idx").on(t.intakeId),
    index("triage_records_patient_idx").on(t.patientUserId, t.triagedAt),
    index("triage_records_hospital_idx").on(t.hospitalId, t.triagedAt),
  ],
);

export type TriageRecord = typeof triageRecords.$inferSelect;
export type NewTriageRecord = typeof triageRecords.$inferInsert;

/* ─── triage_config (per-hospital overrides) ────────────────────── */
export const triageConfig = pgTable("triage_config", {
  hospitalId: uuid("hospital_id")
    .primaryKey()
    .references(() => hospitals.id, { onDelete: "cascade" }),
  targetMinutesByLevel: jsonb("target_minutes_by_level"),
  thresholdOverrides: jsonb("threshold_overrides"),
  updatedByUserId: uuid("updated_by_user_id").references(() => authUsers.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TriageConfig = typeof triageConfig.$inferSelect;

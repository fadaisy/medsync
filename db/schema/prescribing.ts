/* ─── smart prescribing (emergency/crash-cart scope) ──────────────────
 * Persistence layer for the smart prescribing tool — see migration
 * 0039_smart_prescribing.sql. GATED: the deployed v1 records emergency
 * administrations + allergy capture to the immutable resus timeline; these
 * tables are turned on via the controlled DB step when the persistent cross-
 * encounter store lands. RLS + audit live in the migration. */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { authUsers } from "./_auth";
import { conditions, medicationStatements } from "./emr";
import { hospitalDepartments } from "./hospital-departments";
import { hospitals } from "./hospitals";
import { resusEpisodes } from "./resus";
import { encounters } from "./scheduling";

export const patientAllergies = pgTable(
  "patient_allergies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hospitalId: uuid("hospital_id")
      .notNull()
      .references(() => hospitals.id, { onDelete: "cascade" }),
    patientUserId: uuid("patient_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    substance: text("substance").notNull(),
    reaction: text("reaction"),
    severity: text("severity"),
    recordedByUserId: uuid("recorded_by_user_id")
      .notNull()
      .references(() => authUsers.id),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "patient_allergies_severity_check",
      sql`${t.severity} IS NULL OR ${t.severity} IN ('mild','moderate','severe','anaphylaxis','unknown')`,
    ),
    index("patient_allergies_patient_idx").on(t.patientUserId, t.recordedAt),
  ],
);

export const prescriptions = pgTable(
  "prescriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hospitalId: uuid("hospital_id")
      .notNull()
      .references(() => hospitals.id, { onDelete: "cascade" }),
    encounterId: uuid("encounter_id").references(() => encounters.id, { onDelete: "set null" }),
    patientUserId: uuid("patient_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    prescriberUserId: uuid("prescriber_user_id")
      .notNull()
      .references(() => authUsers.id),
    drugId: text("drug_id").notNull(),
    drugName: text("drug_name").notNull(),
    dose: text("dose").notNull(),
    concentration: text("concentration"),
    route: text("route").notNull(),
    indication: text("indication"),
    source: text("source"),
    isEmergency: boolean("is_emergency").notNull().default(true),
    controlled: boolean("controlled").notNull().default(false),
    state: text("state").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    // OPD prescription from the encounter (migration 0074, GATED; EMR Phase 7).
    frequency: text("frequency"),
    duration: text("duration"),
    quantity: text("quantity"),
    instructionsCiphertext: text("instructions_ciphertext"),
    prescriberCadre: text("prescriber_cadre"),
    /** Codes of the safety checks that fired and the prescriber confirmed. */
    confirmedFlags: jsonb("confirmed_flags")
      .notNull()
      .default(sql`'[]'::jsonb`),
    confirmReasonCiphertext: text("confirm_reason_ciphertext"),
    clientKey: text("client_key"),
    sensitivity: text("sensitivity").notNull().default("standard"),
    medicationStatementId: uuid("medication_statement_id").references(
      () => medicationStatements.id,
      { onDelete: "restrict" },
    ),
    // Prescribing from the Plan (migration 0088, GATED; ADR 0186). Course is `duration` above.
    method: text("method"),
    infusionOver: text("infusion_over"),
    diluent: text("diluent"),
    prn: boolean("prn").notNull().default(false),
    /** The signed formulary regimen the dose came from; `edits` are the changes made to it. */
    regimenId: text("regimen_id"),
    edits: jsonb("edits")
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** The problem: a conditions version id, as encounter_orders.reason_condition_ids. */
    conditionId: uuid("condition_id").references(() => conditions.id, { onDelete: "restrict" }),
    start: text("start"),
    kind: text("kind").notNull().default("drug"),
    fluidPurpose: text("fluid_purpose"),
    volumeMl: numeric("volume_ml"),
    overMinutes: integer("over_minutes"),
    givingSetDropsPerMl: integer("giving_set_drops_per_ml"),
    warmed: boolean("warmed"),
    /** The checks that needed an answer, with the answer chosen: [{code, answer}]. */
    checkAnswers: jsonb("check_answers")
      .notNull()
      .default(sql`'[]'::jsonb`),
  },
  (t) => [
    check(
      "prescriptions_state_check",
      sql`${t.state} IN ('active','administered','completed','cancelled')`,
    ),
    check("prescriptions_sensitivity_check", sql`${t.sensitivity} IN ('standard','restricted')`),
    check(
      "prescriptions_confirm_reason",
      sql`${t.confirmedFlags} = '[]'::jsonb OR ${t.confirmReasonCiphertext} IS NOT NULL`,
    ),
    check(
      "prescriptions_start_check",
      sql`${t.start} IS NULL OR ${t.start} IN ('now','next_round')`,
    ),
    check("prescriptions_kind_check", sql`${t.kind} IN ('drug','fluid')`),
    check(
      "prescriptions_fluid_purpose_check",
      sql`${t.fluidPurpose} IS NULL OR ${t.fluidPurpose} IN ('bolus','maintenance','replacement')`,
    ),
    check(
      "prescriptions_giving_set_check",
      sql`${t.givingSetDropsPerMl} IS NULL OR ${t.givingSetDropsPerMl} IN (20, 60)`,
    ),
    check(
      "prescriptions_fluid_amounts",
      sql`(${t.volumeMl} IS NULL OR ${t.volumeMl} > 0) AND (${t.overMinutes} IS NULL OR ${t.overMinutes} > 0)`,
    ),
    check(
      "prescriptions_fluid_shape",
      sql`(${t.kind} = 'fluid' AND ${t.fluidPurpose} IS NOT NULL AND ${t.volumeMl} IS NOT NULL AND ${t.overMinutes} IS NOT NULL)
      OR (${t.kind} = 'drug' AND ${t.fluidPurpose} IS NULL AND ${t.volumeMl} IS NULL AND ${t.overMinutes} IS NULL
          AND ${t.givingSetDropsPerMl} IS NULL AND ${t.warmed} IS NULL)`,
    ),
    check(
      "prescriptions_answer_reason",
      sql`${t.checkAnswers} = '[]'::jsonb OR ${t.confirmReasonCiphertext} IS NOT NULL`,
    ),
    uniqueIndex("prescriptions_client_key")
      .on(t.clientKey)
      .where(sql`${t.clientKey} IS NOT NULL`),
    index("prescriptions_patient_idx").on(t.patientUserId, t.createdAt),
    index("prescriptions_encounter_idx").on(t.encounterId),
    index("prescriptions_condition_idx")
      .on(t.conditionId)
      .where(sql`${t.conditionId} IS NOT NULL`),
  ],
);

export const crashCarts = pgTable("crash_carts", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id")
    .notNull()
    .references(() => hospitals.id, { onDelete: "cascade" }),
  departmentId: uuid("department_id").references(() => hospitalDepartments.id, {
    onDelete: "set null",
  }),
  label: text("label").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const crashCartStock = pgTable(
  "crash_cart_stock",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cartId: uuid("cart_id")
      .notNull()
      .references(() => crashCarts.id, { onDelete: "cascade" }),
    drugId: text("drug_id").notNull(),
    drugName: text("drug_name").notNull(),
    onHand: integer("on_hand").notNull().default(0),
    parLevel: integer("par_level").notNull().default(0),
    expiresAt: date("expires_at"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("crash_cart_stock_cart_idx").on(t.cartId)],
);

export const emergencyAdministrations = pgTable(
  "emergency_administrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hospitalId: uuid("hospital_id")
      .notNull()
      .references(() => hospitals.id, { onDelete: "cascade" }),
    encounterId: uuid("encounter_id").references(() => encounters.id, { onDelete: "set null" }),
    resusEpisodeId: uuid("resus_episode_id").references(() => resusEpisodes.id, {
      onDelete: "set null",
    }),
    patientUserId: uuid("patient_user_id").references(() => authUsers.id, { onDelete: "set null" }),
    prescriptionId: uuid("prescription_id").references(() => prescriptions.id, {
      onDelete: "set null",
    }),
    drugId: text("drug_id").notNull(),
    drugName: text("drug_name").notNull(),
    dose: text("dose").notNull(),
    concentration: text("concentration"),
    route: text("route").notNull(),
    amountMg: numeric("amount_mg"),
    cartId: uuid("cart_id").references(() => crashCarts.id, { onDelete: "set null" }),
    administeredByUserId: uuid("administered_by_user_id")
      .notNull()
      .references(() => authUsers.id),
    witnessedByUserId: uuid("witnessed_by_user_id").references(() => authUsers.id),
    controlled: boolean("controlled").notNull().default(false),
    overrideReason: text("override_reason"),
    overriddenFlags: jsonb("overridden_flags")
      .notNull()
      .default(sql`'[]'::jsonb`),
    administeredAt: timestamp("administered_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "emergency_admin_controlled_witness",
      sql`${t.controlled} = false OR ${t.witnessedByUserId} IS NOT NULL`,
    ),
    index("emergency_admin_patient_idx").on(t.patientUserId, t.administeredAt),
    index("emergency_admin_cart_idx").on(t.cartId, t.administeredAt),
    index("emergency_admin_episode_idx").on(t.resusEpisodeId),
  ],
);

export type PatientAllergy = typeof patientAllergies.$inferSelect;
export type Prescription = typeof prescriptions.$inferSelect;
export type CrashCart = typeof crashCarts.$inferSelect;
export type CrashCartStock = typeof crashCartStock.$inferSelect;
export type EmergencyAdministration = typeof emergencyAdministrations.$inferSelect;

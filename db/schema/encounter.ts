import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { authUsers } from "./_auth";
import { hospitals } from "./hospitals";
import { encounters } from "./scheduling";

/**
 * Encounter / EMR engine — the clinical-data spine (migration 0040, GATED).
 *
 * The encounter's clinical documentation is a structured Hutchison CLERKSHIP
 * (history → examination → differential → initial management) — not a free-text
 * note. This schema EXTENDS the existing `encounters` table (migration 0028;
 * db/schema/scheduling.ts adds the new columns) and adds the clinical objects
 * the clerking populates. See docs/encounter-emr-engine-gate-a-proposal.md +
 * docs/clinical/clerkship-clinical-reference.md.
 *
 * CLINICAL-SAFETY + PDPO-CRITICAL. Documentation + the encounter timeline are
 * VERSIONED / APPEND-ONLY (a correction is a new version that supersedes an
 * earlier one — nothing is silently edited/deleted). PHI free-text is encrypted
 * at rest; coded/structured fields are queryable. Clinical writes go through
 * service-role server actions (which stamp author/cadre + write the audit, incl.
 * AUDIT-ON-READ); RLS keeps reception out at the DB. Decision-support, not
 * autonomous — the clinician examines, reasons, and decides; no auto-diagnosis.
 */

/**
 * The versioned, append-only clerkship documentation. One row per VERSION of the
 * clerking for an encounter. `sectionData` holds the structured Hutchison
 * sections (history/exam/synthesis); PHI free-text within is encrypted.
 */
export const clinicalDocumentation = pgTable(
  "clinical_documentation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    encounterId: uuid("encounter_id")
      .notNull()
      .references(() => encounters.id, { onDelete: "cascade" }),
    patientUserId: uuid("patient_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    /** 1-based version; a correction appends a new version. */
    version: integer("version").notNull().default(1),
    /** The version this one supersedes (a correction), or null for the first. */
    supersedesId: uuid("supersedes_id"),
    /** The structured Hutchison clerking (history/exam/synthesis). PHI in here. */
    sectionData: jsonb("section_data").notNull(),
    status: text("status").notNull().default("draft"),
    authoredByUserId: uuid("authored_by_user_id").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    authorCadreCode: text("author_cadre_code"),
    /** Junior-clerking co-sign hook (a senior attests) — soft, surfaced. */
    cosignedByUserId: uuid("cosigned_by_user_id").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("clin_doc_status_check", sql`${t.status} IN ('draft','final')`),
    // One row per (encounter, version) — a racing corrector errors rather than
    // silently duplicating a version number (see record.ts version increment).
    unique("clin_doc_encounter_version_unique").on(t.encounterId, t.version),
    index("clin_doc_patient_idx").on(t.patientUserId, t.createdAt),
  ],
);

/** The differential → diagnoses (working/final/excluded), ICD-10 where codable. */
export const encounterDiagnoses = pgTable(
  "encounter_diagnoses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    encounterId: uuid("encounter_id")
      .notNull()
      .references(() => encounters.id, { onDelete: "cascade" }),
    patientUserId: uuid("patient_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    icd10Code: text("icd10_code"),
    text: text("text").notNull(),
    /** Rank within the differential (1 = most likely). */
    rank: integer("rank"),
    /** A "must-not-miss" dangerous diagnosis to exclude (safety-net). */
    mustNotMiss: boolean("must_not_miss").notNull().default(false),
    status: text("status").notNull().default("working"),
    authoredByUserId: uuid("authored_by_user_id").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("enc_dx_status_check", sql`${t.status} IN ('working','final','excluded')`),
    index("enc_dx_encounter_idx").on(t.encounterId),
    index("enc_dx_patient_idx").on(t.patientUserId, t.createdAt),
  ],
);

/** The patient-level problem list (acute + chronic), ICD-10 where codable. */
export const problemList = pgTable(
  "problem_list",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientUserId: uuid("patient_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    hospitalId: uuid("hospital_id")
      .notNull()
      .references(() => hospitals.id, { onDelete: "cascade" }),
    item: text("item").notNull(),
    icd10Code: text("icd10_code"),
    active: boolean("active").notNull().default(true),
    onset: text("onset"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    sourceEncounterId: uuid("source_encounter_id").references(() => encounters.id, {
      onDelete: "set null",
    }),
    authoredByUserId: uuid("authored_by_user_id").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("problem_list_patient_idx").on(t.patientUserId, t.active)],
);

// NOTE: `patient_allergies` is the canonical allergy object and already lives in
// db/schema/prescribing.ts (declared for the gated 0039 — the table is actually
// created by THIS migration, 0040). The clerkship writes to it (the prescribing
// allergy check reads it). We reuse it rather than redeclare it here.

/** Medications elicited/recorded in the clerking. */
export const encounterMedications = pgTable(
  "encounter_medications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    encounterId: uuid("encounter_id")
      .notNull()
      .references(() => encounters.id, { onDelete: "cascade" }),
    patientUserId: uuid("patient_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    dose: text("dose"),
    route: text("route"),
    frequency: text("frequency"),
    status: text("status").notNull().default("active"),
    source: text("source").notNull().default("clerking"),
    authoredByUserId: uuid("authored_by_user_id").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("enc_med_status_check", sql`${t.status} IN ('active','stopped','suspended')`),
    index("enc_med_encounter_idx").on(t.encounterId),
  ],
);

/** Investigations ordered in the plan (LOINC where codable). Execution is a
 *  later seam — the record exists now; results display when back. */
export const encounterOrders = pgTable(
  "encounter_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    encounterId: uuid("encounter_id")
      .notNull()
      .references(() => encounters.id, { onDelete: "cascade" }),
    patientUserId: uuid("patient_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    loincCode: text("loinc_code"),
    text: text("text").notNull(),
    /** Why ordered — justified by the differential (not a blind panel). */
    justification: text("justification"),
    status: text("status").notNull().default("ordered"),
    authoredByUserId: uuid("authored_by_user_id").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "enc_order_kind_check",
      sql`${t.kind} IN ('bloods','imaging','bedside','special','other')`,
    ),
    check(
      "enc_order_status_check",
      sql`${t.status} IN ('ordered','collected','resulted','cancelled')`,
    ),
    index("enc_order_encounter_idx").on(t.encounterId, t.status),
  ],
);

export const encounterResults = pgTable(
  "encounter_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => encounterOrders.id, { onDelete: "cascade" }),
    value: text("value").notNull(),
    unit: text("unit"),
    abnormalFlag: text("abnormal_flag"),
    loincCode: text("loinc_code"),
    resultedAt: timestamp("resulted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("enc_result_order_idx").on(t.orderId)],
);

/** The append-only encounter timeline (mirrors the resus-timeline model). */
export const encounterEvents = pgTable(
  "encounter_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    encounterId: uuid("encounter_id")
      .notNull()
      .references(() => encounters.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    /** The id of the row this event refers to (documentation/diagnosis/etc.). */
    refId: uuid("ref_id"),
    label: text("label").notNull(),
    actorUserId: uuid("actor_user_id").references(() => authUsers.id, { onDelete: "set null" }),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "enc_event_kind_check",
      sql`${t.kind} IN ('documentation','diagnosis','problem','order','result','medication','allergy','disposition','note','access')`,
    ),
    index("enc_event_encounter_idx").on(t.encounterId, t.recordedAt),
  ],
);

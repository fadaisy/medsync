import { sql } from "drizzle-orm";
import {
  boolean,
  check,
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
import { hospitals } from "./hospitals";
import { encounters } from "./scheduling";

/**
 * Clerkship symptom-capture engine (migration 0042, GATED) — the tap-first
 * history catalogs. Versioned, CSO-signed REFERENCE DATA: a catalog of symptoms,
 * a catalog of properties (qualifiers — SOCRATES + general), each property's
 * tappable value-set, and the symptom→property RELEVANCE mapping (which encodes
 * "what to ask" — clinical-safety content). Plus the governed contribution path
 * (catalog_proposals) and the queryable projection of captured selections.
 *
 * Per-encounter ad-hoc symptoms/properties live in the clerkship's section_data
 * (the documentation), never mutating the shared catalog. Decision-support +
 * structured documentation, not autonomous — surfacing relevant properties is
 * structuring, not diagnosis.
 */

/* ── Catalog: symptoms ─────────────────────────────────────────────── */
export const symptomCatalog = pgTable(
  "symptom_catalog",
  {
    code: text("code").primaryKey(), // e.g. 'chest_pain'
    display: text("display").notNull(),
    /** Lay terms / synonyms for tap-search. */
    synonyms: text("synonyms")
      .array()
      .notNull()
      .default(sql`'{}'`),
    /** Body system — drives the systematic-enquiry grouping later. */
    system: text("system").notNull(),
    /** Conceptual interoperability hints (not forced). */
    snomedConcept: text("snomed_concept"),
    icd10Hint: text("icd10_hint"),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    version: text("version").notNull(),
    source: text("source").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("symptom_catalog_system_idx").on(t.system, t.sortOrder)],
);

/* ── Catalog: properties (qualifiers) ──────────────────────────────── */
export const symptomProperty = pgTable(
  "symptom_property",
  {
    code: text("code").primaryKey(), // e.g. 'character', 'onset', 'severity'
    display: text("display").notNull(),
    /** How the value is captured (drives the tap UI). */
    valueType: text("value_type").notNull(),
    /** Optional unit (e.g. '/10' for a scale). */
    unit: text("unit"),
    /** Common properties apply to EVERY symptom (duration/onset/progression). */
    common: boolean("common").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    version: text("version").notNull(),
    source: text("source").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "symptom_property_value_type_check",
      sql`${t.valueType} IN ('single_select','multi_select','scale','duration','boolean','text')`,
    ),
  ],
);

/* ── Catalog: a property's tappable value-set ──────────────────────── */
export const symptomPropertyOption = pgTable(
  "symptom_property_option",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    propertyCode: text("property_code")
      .notNull()
      .references(() => symptomProperty.code, { onDelete: "cascade" }),
    value: text("value").notNull(), // e.g. 'crushing'
    display: text("display").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [uniqueIndex("symptom_property_option_unique").on(t.propertyCode, t.value)],
);

/* ── Mapping: which properties are relevant to which symptom ────────── */
export const symptomPropertyMap = pgTable(
  "symptom_property_map",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    symptomCode: text("symptom_code")
      .notNull()
      .references(() => symptomCatalog.code, { onDelete: "cascade" }),
    propertyCode: text("property_code")
      .notNull()
      .references(() => symptomProperty.code, { onDelete: "cascade" }),
    /** A property the clinician is prompted to complete (soft, not enforced). */
    required: boolean("required").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [uniqueIndex("symptom_property_map_unique").on(t.symptomCode, t.propertyCode)],
);

/* ── Governed contribution: propose a catalog item to the shared base ─ */
export const catalogProposals = pgTable(
  "catalog_proposals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    proposerUserId: uuid("proposer_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "set null" }),
    hospitalId: uuid("hospital_id").references(() => hospitals.id, { onDelete: "set null" }),
    /** What is being proposed. */
    kind: text("kind").notNull(),
    /** The proposed item (symptom / property / option / mapping), self-contained. */
    payload: jsonb("payload").notNull(),
    note: text("note"),
    status: text("status").notNull().default("pending"),
    reviewerUserId: uuid("reviewer_user_id").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "catalog_proposal_kind_check",
      sql`${t.kind} IN ('symptom','property','option','mapping')`,
    ),
    check(
      "catalog_proposal_status_check",
      sql`${t.status} IN ('pending','approved','rejected','withdrawn')`,
    ),
    index("catalog_proposal_status_idx").on(t.status, t.createdAt),
    index("catalog_proposal_proposer_idx").on(t.proposerUserId, t.createdAt),
  ],
);

/* ── Queryable projection of captured selections (analytics/research) ─ */
export const encounterSymptomObservations = pgTable(
  "encounter_symptom_observations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    encounterId: uuid("encounter_id")
      .notNull()
      .references(() => encounters.id, { onDelete: "cascade" }),
    patientUserId: uuid("patient_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    /** Catalog code, or an ad-hoc slug for a per-encounter symptom. */
    symptomCode: text("symptom_code").notNull(),
    symptomDisplay: text("symptom_display").notNull(),
    adHoc: boolean("ad_hoc").notNull().default(false),
    /** Null for the symptom-presence row; set for each property value. */
    propertyCode: text("property_code"),
    propertyDisplay: text("property_display"),
    valueType: text("value_type"),
    valueText: text("value_text"),
    valueNum: numeric("value_num"),
    recordedByUserId: uuid("recorded_by_user_id").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("enc_symptom_obs_encounter_idx").on(t.encounterId),
    index("enc_symptom_obs_symptom_idx").on(t.symptomCode),
    index("enc_symptom_obs_patient_idx").on(t.patientUserId, t.createdAt),
  ],
);

export type SymptomCatalogRow = typeof symptomCatalog.$inferSelect;
export type SymptomPropertyRow = typeof symptomProperty.$inferSelect;
export type SymptomPropertyOptionRow = typeof symptomPropertyOption.$inferSelect;
export type SymptomPropertyMapRow = typeof symptomPropertyMap.$inferSelect;
export type CatalogProposalRow = typeof catalogProposals.$inferSelect;
export type EncounterSymptomObservationRow = typeof encounterSymptomObservations.$inferSelect;

import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/**
 * Clinical reference catalog — the verification anchor for staff onboarding.
 *
 * Per the GATE A confirmation: seed the *full national* council + cadre
 * catalog (it's finite and needed for licence verification) but seed
 * role + specialty instances scoped to Internal Medicine for now. Add new
 * specialty/role rows when MedSync onboards new departments.
 *
 * Source: regulatory council websites + MoH Human Resources for Health
 * Strategic Plan 2020–2030 + Ministry of Public Service scheme of
 * service. Every seed batch records a row in `ref_data_versions`.
 *
 * RLS: public SELECT (forms read this without auth); service-role mutates.
 */

/* ─── Versioning ───────────────────────────────────────────────────────
   Single source of truth for "where did this reference data come from".
   Every seed migration writes one row here so the data set is traceable
   + replaceable on a new source release. */

export const refDataVersions = pgTable(
  "ref_data_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dataset: text("dataset").notNull(), // e.g. "ug_districts", "ug_councils"
    source: text("source").notNull(), // e.g. "UBOS NPHC 2024 framework"
    sourceUrl: text("source_url"),
    versionDate: text("version_date").notNull(), // ISO date of the source release
    rowCount: integer("row_count"), // # rows seeded for traceability
    notes: text("notes"),
    appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ref_data_versions_dataset_idx").on(t.dataset),
    uniqueIndex("ref_data_versions_unique").on(t.dataset, t.versionDate),
  ],
);

/* ─── Councils (4 regulators) ─────────────────────────────────────────── */

export const refCouncils = pgTable(
  "ref_councils",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(), // "UMDPC" | "UNMC" | "AHPC" | "PSU"
    name: text("name").notNull(), // full official name
    shortName: text("short_name").notNull(), // user-facing short label
    description: text("description"), // who they regulate
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ref_councils_code_unique").on(t.code)],
);

/* ─── Cadres (professional ladder, council-linked) ────────────────────── */

export const refCadres = pgTable(
  "ref_cadres",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    councilId: uuid("council_id")
      .notNull()
      .references(() => refCouncils.id, { onDelete: "restrict" }),
    code: text("code").notNull(),
    name: text("name").notNull(), // e.g. "Medical Officer", "Registered Nurse"
    description: text("description"),
    // Display ordering inside a council (entry-level → senior).
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ref_cadres_code_unique").on(t.code),
    index("ref_cadres_council_idx").on(t.councilId),
  ],
);

/* ─── Cadre grades (career levels inside a cadre, optional) ──────────── */

export const refCadreGrades = pgTable(
  "ref_cadre_grades",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cadreId: uuid("cadre_id")
      .notNull()
      .references(() => refCadres.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ref_cadre_grades_cadre_code_unique").on(t.cadreId, t.code),
    index("ref_cadre_grades_cadre_idx").on(t.cadreId),
  ],
);

/* ─── Specialties (Internal Medicine + 13 sub-specialties seeded now) ─ */

export const refSpecialties = pgTable(
  "ref_specialties",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    // For sub-specialties, points at parent (e.g. "im-cardiology" → "internal-medicine").
    parentId: uuid("parent_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ref_specialties_code_unique").on(t.code),
    index("ref_specialties_parent_idx").on(t.parentId),
  ],
);

/* ─── Roles (cadre × department × optional specialty) ────────────────── */

export const refRoles = pgTable(
  "ref_roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cadreId: uuid("cadre_id")
      .notNull()
      .references(() => refCadres.id, { onDelete: "restrict" }),
    // Optional specialty narrows role to e.g. "Consultant Physician — Cardiology".
    specialtyId: uuid("specialty_id").references(() => refSpecialties.id, {
      onDelete: "set null",
    }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    // Tagged with the department family this role lives under (e.g.
    // "internal-medicine"). Maps loosely to hospital_departments.slug.
    departmentFamily: text("department_family").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ref_roles_code_unique").on(t.code),
    index("ref_roles_cadre_idx").on(t.cadreId),
    index("ref_roles_specialty_idx").on(t.specialtyId),
    index("ref_roles_dept_family_idx").on(t.departmentFamily),
  ],
);

export type RefCouncil = typeof refCouncils.$inferSelect;
export type RefCadre = typeof refCadres.$inferSelect;
export type RefCadreGrade = typeof refCadreGrades.$inferSelect;
export type RefSpecialty = typeof refSpecialties.$inferSelect;
export type RefRole = typeof refRoles.$inferSelect;
export type RefDataVersion = typeof refDataVersions.$inferSelect;

import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Clinical code reference — ICD-10 (diagnoses/problems) + LOINC (labs) as
 * VERSIONED reference data (kickoff §1/§5; migration 0041, GATED). NON-PHI
 * public catalogs; readable by any authenticated user, maintained service-role.
 * The curated seed mirrors lib/encounter/reference-codes.ts.
 */
export const icd10Codes = pgTable(
  "icd10_codes",
  {
    code: text("code").primaryKey(),
    display: text("display").notNull(),
    category: text("category"),
    version: text("version").notNull(),
    source: text("source").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("icd10_codes_category_idx").on(t.category)],
);

export const loincCodes = pgTable(
  "loinc_codes",
  {
    code: text("code").primaryKey(),
    display: text("display").notNull(),
    category: text("category"),
    version: text("version").notNull(),
    source: text("source").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("loinc_codes_category_idx").on(t.category)],
);

export type Icd10Code = typeof icd10Codes.$inferSelect;
export type LoincCode = typeof loincCodes.$inferSelect;

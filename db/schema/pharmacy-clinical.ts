import { integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Pharmacy Phase 3, first merge (migration 0210, GATED; GATE A signed 25 Oct 2026). The SQL is the source of truth:
 * the signing guard (CC-2), append-only signatures and coding live there. Mirrors carry columns only.
 */
const tz = { withTimezone: true } as const;

export const pharmacyContentEntries = pgTable("pharmacy_content_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  pack: text("pack").notNull(),
  key: text("key").notNull(),
  version: integer("version").notNull(),
  payload: jsonb("payload").notNull(),
  source: text("source"),
  status: text("status")
    .$type<"draft" | "reviewer_signed" | "in_force" | "withdrawn">()
    .notNull()
    .default("draft"),
  blocked: text("blocked").$type<"not_matched" | "waits_for_class_map">(),
  candidateId: text("candidate_id"),
  authorUserId: uuid("author_user_id").notNull(),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  inForceAt: timestamp("in_force_at", tz),
  withdrawnAt: timestamp("withdrawn_at", tz),
  withdrawnBy: uuid("withdrawn_by"),
  withdrawnReason: text("withdrawn_reason"),
});

export const pharmacyContentSignatures = pgTable("pharmacy_content_signatures", {
  id: uuid("id").primaryKey().defaultRandom(),
  entryId: uuid("entry_id").notNull(),
  hospitalId: uuid("hospital_id").notNull(),
  signerUserId: uuid("signer_user_id").notNull(),
  role: text("role")
    .$type<"pharmacist_reviewer" | "cso" | "ams_chair" | "pharmacy_in_charge">()
    .notNull(),
  attestationId: uuid("attestation_id").notNull(),
  exceptionText: text("exception_text"),
  signedAt: timestamp("signed_at", tz).notNull().defaultNow(),
});

export const pharmacyContentImports = pgTable("pharmacy_content_imports", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  file: text("file").notNull(),
  sha256: text("sha256").notNull(),
  counts: jsonb("counts").notNull(),
  importedBy: uuid("imported_by").notNull(),
  importedAt: timestamp("imported_at", tz).notNull().defaultNow(),
});

export const pharmacyQueryPcne = pgTable("pharmacy_query_pcne", {
  id: uuid("id").primaryKey().defaultRandom(),
  queryId: uuid("query_id").notNull(),
  hospitalId: uuid("hospital_id").notNull(),
  codes: jsonb("codes").notNull(),
  mapEntryId: uuid("map_entry_id").notNull(),
  coderUserId: uuid("coder_user_id").notNull(),
  codedAt: timestamp("coded_at", tz).notNull().defaultNow(),
});

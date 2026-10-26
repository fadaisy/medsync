import { boolean, date, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

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

/* ─── 0211: stewardship reviews and suspected reactions ─────────────── */

export const pharmacyAmsReviews = pgTable("pharmacy_ams_reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  patientUserId: uuid("patient_user_id").notNull(),
  prescriptionId: uuid("prescription_id").notNull(),
  answer: text("answer").$type<"continue" | "change" | "switch_oral" | "stop">().notNull(),
  stopDate: date("stop_date"),
  reason: text("reason"),
  queryId: uuid("query_id"),
  actorUserId: uuid("actor_user_id").notNull(),
  actorCadre: text("actor_cadre"),
  reviewedAt: timestamp("reviewed_at", tz).notNull().defaultNow(),
});

export const pharmacyReactionReports = pgTable("pharmacy_reaction_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  patientUserId: uuid("patient_user_id").notNull(),
  reference: text("reference").notNull(),
  kind: text("kind").notNull(),
  reactionText: text("reaction_text").notNull(),
  manifestation: text("manifestation"),
  startedOn: date("started_on"),
  seriousness: text("seriousness").array().notNull(),
  outcome: text("outcome").notNull(),
  actionTaken: text("action_taken").notNull(),
  rechallenge: text("rechallenge").notNull(),
  reporter: text("reporter").notNull(),
  recordedBy: uuid("recorded_by").notNull(),
  recorderCadre: text("recorder_cadre"),
  recordedAt: timestamp("recorded_at", tz).notNull().defaultNow(),
  clientKey: text("client_key"),
});

export const pharmacyReactionMedicines = pgTable("pharmacy_reaction_medicines", {
  id: uuid("id").primaryKey().defaultRandom(),
  reportId: uuid("report_id").notNull(),
  hospitalId: uuid("hospital_id").notNull(),
  medicineId: text("medicine_id"),
  productId: uuid("product_id"),
  batchId: uuid("batch_id"),
  uncodedText: text("uncoded_text"),
  main: boolean("main").notNull().default(false),
  allergyId: uuid("allergy_id"),
});

export const pharmacyReactionEvents = pgTable("pharmacy_reaction_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  reportId: uuid("report_id").notNull(),
  hospitalId: uuid("hospital_id").notNull(),
  kind: text("kind")
    .$type<
      "causality" | "submitted" | "closed_not_submitted" | "correction" | "printed" | "copied"
    >()
    .notNull(),
  causality: text("causality"),
  route: text("route"),
  submittedOn: date("submitted_on"),
  reference: text("reference"),
  field: text("field"),
  note: text("note"),
  actorUserId: uuid("actor_user_id").notNull(),
  at: timestamp("at", tz).notNull().defaultNow(),
});

/* ─── 0212: reconciliation at discharge (MR-1 to MR-7) ─── */

export const pharmacyReconciliations = pgTable("pharmacy_reconciliations", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  patientUserId: uuid("patient_user_id").notNull(),
  admissionId: uuid("admission_id").notNull().unique(),
  openedBy: uuid("opened_by").notNull(),
  openedAt: timestamp("opened_at", tz).notNull().defaultNow(),
  clientKey: text("client_key").unique(),
});

export const pharmacyReconciliationDecisions = pgTable("pharmacy_reconciliation_decisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  reconciliationId: uuid("reconciliation_id").notNull(),
  hospitalId: uuid("hospital_id").notNull(),
  rowKey: text("row_key").notNull(),
  decision: text("decision")
    .$type<
      | "continue"
      | "restart"
      | "changed"
      | "stay_stopped"
      | "paused"
      | "ends_on_ward"
      | "new_for_home"
    >()
    .notNull(),
  reason: text("reason"),
  decidedBy: uuid("decided_by").notNull(),
  deciderCadre: text("decider_cadre"),
  decidedAt: timestamp("decided_at", tz).notNull().defaultNow(),
  clientKey: text("client_key").unique(),
});

export const pharmacyReconciliationEvents = pgTable("pharmacy_reconciliation_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  reconciliationId: uuid("reconciliation_id").notNull(),
  hospitalId: uuid("hospital_id").notNull(),
  kind: text("kind")
    .$type<"explained" | "added" | "confirmed" | "closed" | "reopened" | "printed">()
    .notNull(),
  discrepancy: text("discrepancy"),
  reason: text("reason"),
  note: text("note"),
  snapshot: jsonb("snapshot"),
  actorUserId: uuid("actor_user_id").notNull(),
  at: timestamp("at", tz).notNull().defaultNow(),
  clientKey: text("client_key").unique(),
});

import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

const tz = { withTimezone: true } as const;

/* ─── 0251 the shared medicines catalogue (ADR 0456): no hospital_id, no prices; facts only from applied proposals ─── */
export const catalogueCurators = pgTable("catalogue_curators", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  grantedBy: uuid("granted_by").notNull(),
  startsAt: timestamp("starts_at", tz).notNull().defaultNow(),
  endsAt: timestamp("ends_at", tz),
  note: text("note"),
});

export const catProposals = pgTable("cat_proposals", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind").notNull(),
  payload: jsonb("payload").notNull(),
  source: text("source").notNull(),
  hospitalId: uuid("hospital_id"),
  proposedBy: uuid("proposed_by"),
  proposerSource: text("proposer_source"),
  seedKey: text("seed_key"),
  requiredReviews: smallint("required_reviews").notNull(),
  state: text("state").notNull().default("open"),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  decidedAt: timestamp("decided_at", tz),
});

export const catProposalReviews = pgTable(
  "cat_proposal_reviews",
  {
    proposalId: uuid("proposal_id").notNull(),
    reviewer: uuid("reviewer").notNull(),
    decision: text("decision").notNull(),
    note: text("note"),
    reviewedAt: timestamp("reviewed_at", tz).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.proposalId, t.reviewer] })],
);

export const catDoseForms = pgTable("cat_dose_forms", {
  code: text("code").primaryKey(),
  label: text("label").notNull(),
  edqmCode: text("edqm_code"),
  edqmRetrievedOn: date("edqm_retrieved_on"),
  status: text("status").notNull(),
});

export const catRoutes = pgTable("cat_routes", {
  code: text("code").primaryKey(),
  label: text("label").notNull(),
  edqmCode: text("edqm_code"),
  edqmRetrievedOn: date("edqm_retrieved_on"),
  status: text("status").notNull(),
});

export const catSubstances = pgTable("cat_substances", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  preferredName: text("preferred_name").notNull(),
  // 0253: the folded name search compares (generated; never written).
  nameFold: text("name_fold").generatedAlwaysAs(sql`private.cat_fold(preferred_name)`),
  kind: text("kind").notNull(),
  emhsluClass: text("emhslu_class"),
  status: text("status").notNull().default("active"),
  version: integer("version").notNull().default(1),
  proposalId: uuid("proposal_id").notNull(),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
});

export const catSubstanceNames = pgTable("cat_substance_names", {
  id: uuid("id").primaryKey().defaultRandom(),
  substanceId: uuid("substance_id").notNull(),
  name: text("name").notNull(),
  // 0253: the folded name search compares (generated; never written).
  nameFold: text("name_fold").generatedAlwaysAs(sql`private.cat_fold(name)`),
  type: text("type").notNull(),
  language: text("language").notNull().default("en"),
  source: text("source").notNull(),
  proposalId: uuid("proposal_id").notNull(),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
});

export const catMedicines = pgTable("cat_medicines", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  displayName: text("display_name").notNull(),
  // 0253: the folded name search compares (generated; never written).
  nameFold: text("name_fold").generatedAlwaysAs(sql`private.cat_fold(display_name)`),
  kind: text("kind").notNull(),
  doseFormCode: text("dose_form_code"),
  issueUnitKind: text("issue_unit_kind"),
  strengthText: text("strength_text"),
  spec: text("spec"),
  emhsluLevel: text("emhslu_level"),
  emhsluVen: text("emhslu_ven"),
  flagged: boolean("flagged").notNull().default(false),
  checkNote: text("check_note"),
  status: text("status").notNull().default("active"),
  version: integer("version").notNull().default(1),
  proposalId: uuid("proposal_id").notNull(),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
});

export const catMedicineIngredients = pgTable(
  "cat_medicine_ingredients",
  {
    medicineId: uuid("medicine_id").notNull(),
    position: smallint("position").notNull(),
    substanceId: uuid("substance_id").notNull(),
    strengthText: text("strength_text"),
    amount: numeric("amount"),
    unit: text("unit"),
    perAmount: numeric("per_amount"),
    perUnit: text("per_unit"),
    basis: text("basis"),
  },
  (t) => [primaryKey({ columns: [t.medicineId, t.position] })],
);

export const catMedicineRoutes = pgTable(
  "cat_medicine_routes",
  {
    medicineId: uuid("medicine_id").notNull(),
    routeCode: text("route_code").notNull(),
  },
  (t) => [primaryKey({ columns: [t.medicineId, t.routeCode] })],
);

export const catMedicineLinks = pgTable("cat_medicine_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  medicineId: uuid("medicine_id").notNull(),
  linkKind: text("link_kind").notNull(),
  rowId: uuid("row_id"),
  formularyId: text("formulary_id"),
  proposalId: uuid("proposal_id").notNull(),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
});

export const catManufacturers = pgTable("cat_manufacturers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  // 0253: the folded name search compares (generated; never written).
  nameFold: text("name_fold").generatedAlwaysAs(sql`private.cat_fold(name)`),
  country: text("country"),
  otherNames: text("other_names").array().notNull().default([]),
  proposalId: uuid("proposal_id").notNull(),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
});

export const catRegisterEditions = pgTable("cat_register_editions", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  editionDate: date("edition_date").notNull(),
  fileName: text("file_name").notNull(),
  fileSha256: text("file_sha256").notNull().unique(),
  rowCount: integer("row_count").notNull(),
  appliedBy: uuid("applied_by").notNull(),
  appliedAt: timestamp("applied_at", tz).notNull().defaultNow(),
});

export const catProducts = pgTable("cat_products", {
  id: uuid("id").primaryKey().defaultRandom(),
  medicineId: uuid("medicine_id").notNull(),
  brandName: text("brand_name"),
  // 0253: the folded name search compares (generated; never written).
  nameFold: text("name_fold").generatedAlwaysAs(sql`private.cat_fold(brand_name)`),
  manufacturerId: uuid("manufacturer_id"),
  ndaNumber: text("nda_number"),
  ndaState: text("nda_state").notNull().default("unknown"),
  registrationKind: text("registration_kind"),
  validTo: date("valid_to"),
  sourceEditionId: uuid("source_edition_id"),
  sourceRow: integer("source_row"),
  status: text("status").notNull().default("active"),
  version: integer("version").notNull().default(1),
  proposalId: uuid("proposal_id").notNull(),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
});

export const catPacks = pgTable("cat_packs", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id").notNull(),
  description: text("description").notNull(),
  contents: integer("contents"),
  container: text("container"),
  status: text("status").notNull().default("active"),
  proposalId: uuid("proposal_id").notNull(),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
});

export const catPackCodes = pgTable("cat_pack_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  packId: uuid("pack_id").notNull(),
  codeType: text("code_type").notNull(),
  code: text("code").notNull(),
  hospitalId: uuid("hospital_id"),
  state: text("state").notNull(),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  evidence: jsonb("evidence").notNull().default({}),
  proposalId: uuid("proposal_id"),
});

export const catPackPhotos = pgTable("cat_pack_photos", {
  id: uuid("id").primaryKey().defaultRandom(),
  proposalId: uuid("proposal_id").notNull(),
  hospitalId: uuid("hospital_id"),
  assetPath: text("asset_path").notNull(),
  uploadedBy: uuid("uploaded_by").notNull(),
  uploadedAt: timestamp("uploaded_at", tz).notNull().defaultNow(),
});

export const catChanges = pgTable("cat_changes", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  tableName: text("table_name").notNull(),
  rowId: text("row_id").notNull(),
  before: jsonb("before"),
  after: jsonb("after"),
  source: text("source").notNull(),
  proposalId: uuid("proposal_id"),
  changedBy: uuid("changed_by").notNull(),
  changedAt: timestamp("changed_at", tz).notNull().defaultNow(),
});

/* ─── 0253 a medicine's own names: a combination's or a class's abbreviation ─── */
export const catMedicineNames = pgTable("cat_medicine_names", {
  id: uuid("id").primaryKey().defaultRandom(),
  medicineId: uuid("medicine_id").notNull(),
  name: text("name").notNull(),
  // 0253: the folded name search compares (generated; never written).
  nameFold: text("name_fold").generatedAlwaysAs(sql`private.cat_fold(name)`),
  type: text("type").notNull(),
  source: text("source").notNull(),
  proposalId: uuid("proposal_id").notNull(),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
});

import { date, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

const tz = { withTimezone: true } as const;

/* ─── 0258 imports as drafts (catalogue slice Step 9; ADR 0462). Commit writes only the accepted rows ─── */
export const pharmacyImportDrafts = pgTable("pharmacy_import_drafts", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  kind: text("kind").notNull().$type<"products" | "opening_stock" | "price_list">(),
  fileName: text("file_name").notNull(),
  rowCount: integer("row_count").notNull(),
  locationId: uuid("location_id"),
  supplierId: uuid("supplier_id"),
  editionDate: date("edition_date"),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  committedBy: uuid("committed_by"),
  committedAt: timestamp("committed_at", tz),
  priceListId: uuid("price_list_id"),
});

export const pharmacyImportRows = pgTable("pharmacy_import_rows", {
  id: uuid("id").primaryKey().defaultRandom(),
  draftId: uuid("draft_id").notNull(),
  hospitalId: uuid("hospital_id").notNull(),
  lineNo: integer("line_no").notNull(),
  raw: jsonb("raw").notNull().$type<Record<string, string>>(),
  match: text("match").notNull().$type<"matched" | "check" | "not_in_catalogue" | "invalid">(),
  why: text("why").notNull(),
  proposal: jsonb("proposal"),
  decision: text("decision").$type<"accept" | "skip" | "add_supply">(),
  chosen: jsonb("chosen"),
  decidedBy: uuid("decided_by"),
  decidedAt: timestamp("decided_at", tz),
  committedId: uuid("committed_id"),
});

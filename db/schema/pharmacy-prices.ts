import {
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

const tz = { withTimezone: true } as const;

/* ─── 0257 a hospital's own prices (catalogue slice Step 8; ADRs 0460, 0461). Append-only history, from a date ─── */
export const pharmacyPayers = pgTable("pharmacy_payers", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  kind: text("kind").notNull().$type<"cash" | "scheme" | "staff" | "other">(),
  active: boolean("active").notNull().default(true),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
});

export const pharmacyPointChargeModes = pgTable("pharmacy_point_charge_modes", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  dispensingPointId: uuid("dispensing_point_id").notNull(),
  mode: text("mode").notNull().$type<"charged" | "free">(),
  fromDate: date("from_date").notNull(),
  setBy: uuid("set_by").notNull(),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
});

export const pharmacyPointPayFirst = pgTable("pharmacy_point_pay_first", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  dispensingPointId: uuid("dispensing_point_id").notNull(),
  required: boolean("required").notNull(),
  fromDate: date("from_date").notNull(),
  setBy: uuid("set_by").notNull(),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
});

export const pharmacyPriceRules = pgTable("pharmacy_price_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  multiplier: numeric("multiplier", { precision: 6, scale: 3 }).notNull(),
  roundingStep: integer("rounding_step").notNull(),
  payerAdjustments: jsonb("payer_adjustments")
    .notNull()
    .default({})
    .$type<Record<string, number>>(),
  fromDate: date("from_date").notNull(),
  setBy: uuid("set_by").notNull(),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
});

export const pharmacyProductPrices = pgTable("pharmacy_product_prices", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  productId: uuid("product_id").notNull(),
  payerId: uuid("payer_id").notNull(),
  priceUgx: integer("price_ugx"),
  free: boolean("free").notNull().default(false),
  fromDate: date("from_date").notNull(),
  source: text("source").notNull().$type<"rule_accepted" | "typed" | "import">(),
  basis: jsonb("basis"),
  setBy: uuid("set_by"),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
});

export const pharmacyPriceLists = pgTable("pharmacy_price_lists", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  supplierId: uuid("supplier_id").notNull(),
  editionDate: date("edition_date").notNull(),
  fileName: text("file_name"),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
});

export const pharmacyPriceListLines = pgTable("pharmacy_price_list_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  priceListId: uuid("price_list_id").notNull(),
  hospitalId: uuid("hospital_id").notNull(),
  rawText: text("raw_text").notNull(),
  packId: uuid("pack_id"),
  productId: uuid("product_id"),
  packPriceUgx: integer("pack_price_ugx"),
  supplierCode: text("supplier_code"),
  gtin: text("gtin"),
  matchedBy: uuid("matched_by"),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
});

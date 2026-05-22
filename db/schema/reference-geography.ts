import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/**
 * Uganda administrative-unit reference data — regions → districts → subcounties.
 *
 * Seeded from a versioned authoritative UBOS source (recorded in
 * `ref_data_versions`). Counts are source-and-date dependent (UBOS 2024
 * NPHC framework uses 135 districts + 11 cities; older lists cite ~146 +
 * ~2,184 subcounties). DO NOT hand-type. DO NOT approximate.
 *
 * Updateable at runtime without a code change — new census release → new
 * version row + UPSERT into these tables.
 *
 * Form behaviour: District = searchable combobox (the list is large enough
 * that a plain select is unusable on mobile). Subcounty = cascading
 * combobox filtered by selected district (disabled until district chosen).
 *
 * RLS: anon + authenticated SELECT (public reference data); only the
 * service role mutates (via migrations or admin tooling).
 */

export const refRegions = pgTable(
  "ref_regions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(), // "CENTRAL" | "EASTERN" | "NORTHERN" | "WESTERN"
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ref_regions_code_unique").on(t.code)],
);

export const refDistricts = pgTable(
  "ref_districts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    regionId: uuid("region_id")
      .notNull()
      .references(() => refRegions.id, { onDelete: "restrict" }),
    code: text("code").notNull(), // UBOS code if available, else slug
    name: text("name").notNull(),
    // True for the 11 cities elevated to district-equivalent status
    // (separate query path lets the form group/highlight cities).
    isCity: boolean("is_city").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ref_districts_code_unique").on(t.code),
    index("ref_districts_region_idx").on(t.regionId),
    index("ref_districts_name_idx").on(t.name),
  ],
);

export const refSubcounties = pgTable(
  "ref_subcounties",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    districtId: uuid("district_id")
      .notNull()
      .references(() => refDistricts.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ref_subcounties_district_code_unique").on(t.districtId, t.code),
    index("ref_subcounties_district_idx").on(t.districtId),
  ],
);

export type RefRegion = typeof refRegions.$inferSelect;
export type RefDistrict = typeof refDistricts.$inferSelect;
export type RefSubcounty = typeof refSubcounties.$inferSelect;

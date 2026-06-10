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
  uuid,
} from "drizzle-orm/pg-core";

import { authUsers } from "./_auth";

/**
 * Clerkship history-section pick-lists (migration 0046) — ONE generic, governed
 * reference table keyed by `list_type` (condition / operation / allergen / drug /
 * occupation / exposure / immunisation). Conditions are shared by PMH + Family Hx.
 * CSO-signed; mirrors the symptom_catalog governance (scope/origin + immutable
 * attribution). Tap-first content the structured history sections consume.
 */
export const clerkshipPicklist = pgTable(
  "clerkship_picklist",
  {
    code: text("code").primaryKey(),
    listType: text("list_type").notNull(),
    display: text("display").notNull(),
    synonyms: text("synonyms")
      .array()
      .notNull()
      .default(sql`'{}'`),
    /** list-specific extras (e.g. condition complications) — tap content. */
    meta: jsonb("meta")
      .notNull()
      .default(sql`'{}'::jsonb`),
    icd10Hint: text("icd10_hint"),
    ugandaFlag: text("uganda_flag"),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    version: text("version").notNull(),
    source: text("source").notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    createdByName: text("created_by_name"),
    scope: text("scope").notNull().default("shared"),
    origin: text("origin").notNull().default("seed"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("clerkship_picklist_type_idx").on(t.listType, t.active, t.sortOrder),
    index("clerkship_picklist_scope_creator_idx").on(t.scope, t.createdByUserId),
    check(
      "clerkship_picklist_list_type_check",
      sql`${t.listType} IN ('condition','operation','allergen','drug','occupation','exposure','immunisation')`,
    ),
    check("clerkship_picklist_scope_check", sql`${t.scope} IN ('shared','personal')`),
    check("clerkship_picklist_origin_check", sql`${t.origin} IN ('seed','doctor','approved')`),
  ],
);

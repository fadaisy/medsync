import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { authUsers } from "./_auth";

/**
 * 1:1 profile row with `auth.users`. Created either by a trigger on
 * `auth.users` insert (Phase 0.9) or directly by the seed script.
 *
 * PHI columns (NIN, encrypted clinical fields) land in Phase 1+ tables, not
 * here. `full_name` is plaintext for operational queries; encryption of the
 * stored-name copy is a Phase 1 decision once we know which surfaces need it.
 */
export const users = pgTable("users", {
  id: uuid("id")
    .primaryKey()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  fullName: text("full_name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

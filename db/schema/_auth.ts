import { pgSchema, uuid } from "drizzle-orm/pg-core";

/**
 * Phantom Drizzle definition of the bits of Supabase's `auth.users` we need to
 * reference via foreign keys. We DO NOT manage this schema — Supabase owns it.
 *
 * `drizzle.config.ts` sets `schemaFilter: ["public"]` so introspect / generate
 * / push / migrate never touch `auth.*`. This file exists purely so we can
 * write typed FKs like `references(() => authUsers.id)`.
 */
export const authSchema = pgSchema("auth");

export const authUsers = authSchema.table("users", {
  id: uuid("id").primaryKey(),
});

import { defineConfig } from "drizzle-kit";

import { env } from "@/lib/env";

/**
 * Drizzle Kit configuration.
 *
 * - `schema`: where TypeScript schema files live. Barrel-exports from db/schema.
 * - `out`: SQL migrations land in supabase/migrations/ (kickoff folder layout).
 * - Uses DATABASE_DIRECT_URL (port 5432) because pgbouncer/pooler doesn't
 *   support the prepared statements drizzle-kit emits during introspect/push.
 * - schemaFilter: ["public"] — never touch Supabase's auth/storage/realtime
 *   schemas; those are managed by Supabase itself.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./db/schema/*",
  out: "./supabase/migrations",
  schemaFilter: ["public"],
  dbCredentials: {
    url: env.DATABASE_DIRECT_URL,
  },
  verbose: true,
  strict: true,
});

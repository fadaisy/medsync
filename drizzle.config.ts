import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

// drizzle-kit runs as a standalone CLI; it doesn't go through Next.js, so we
// have to load `.env.local` (and any `.env*` files) ourselves before reading
// process.env. @next/env is the same loader Next.js uses internally, so the
// precedence rules (`.env.local` wins) match runtime exactly.
loadEnvConfig(process.cwd());

const url = process.env.DATABASE_DIRECT_URL;
if (!url) {
  throw new Error(
    "DATABASE_DIRECT_URL is required for drizzle-kit. " +
      "Populate .env.local (see .env.example) before running db:* scripts.",
  );
}

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
  dbCredentials: { url },
  verbose: true,
  strict: true,
});

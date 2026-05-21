import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "@/lib/env";
import * as schema from "./schema";

/**
 * Singleton postgres client + Drizzle instance.
 *
 * `globalThis` cache survives Hot Module Reloads in dev, so we don't leak
 * connections every save. In production / serverless, Fluid Compute reuses
 * function instances so this also serves cross-request reuse.
 *
 * `prepare: false` is required for Supabase's pgbouncer pooler (the default
 * Transaction mode doesn't support prepared statements). For migrations we use
 * DATABASE_DIRECT_URL via drizzle.config.ts, which does support them.
 */
const globalForDb = globalThis as unknown as {
  pgClient: ReturnType<typeof postgres> | undefined;
};

const pgClient =
  globalForDb.pgClient ??
  postgres(env.DATABASE_URL, {
    prepare: false,
    max: env.NODE_ENV === "production" ? 10 : 1,
  });

if (env.NODE_ENV !== "production") {
  globalForDb.pgClient = pgClient;
}

export const db = drizzle(pgClient, { schema });

export { schema };

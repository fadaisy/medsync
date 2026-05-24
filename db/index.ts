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
    // Dev: max 3 so one hung connection doesn't block every render
    // (we used to run max:1 and a single stall would jam the whole
    // session). Prod: max 10 matches Fluid Compute per-instance budget.
    max: env.NODE_ENV === "production" ? 10 : 3,
    // Reap connections idle longer than 30s so stuck handles get
    // recycled. Longer than 20s tolerates mobile networks where the
    // cold TCP+TLS handshake to the EU pooler can eat ~2–3s.
    idle_timeout: 30,
    // DO NOT set connect_timeout — high-latency networks (Uganda → EU
    // pooler) can need 5–10s for a fresh handshake. Failing fast there
    // produced 57014 "canceling statement" errors on the first query
    // because postgres-js cancelled the half-open connection mid-flight.
    // Server-side statement timeout (below) is what actually protects
    // us from runaway queries.
    connection: {
      // Generous 30s cap on any single statement at the server side.
      // Reference-data queries should finish in <50ms; this just stops
      // a pathological query from holding a connection forever.
      // postgres-js sends this as a SET command after connect.
      statement_timeout: 30_000,
    },
  });

if (env.NODE_ENV !== "production") {
  globalForDb.pgClient = pgClient;
}

export const db = drizzle(pgClient, { schema });

export { schema };

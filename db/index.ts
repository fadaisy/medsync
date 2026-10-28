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
    // One query in flight per connection. Pipelined queries through Supavisor's transaction
    // pooler (6543) stall now and then, a statement left in ClientRead until it times out:
    // the pharmacy Today hang (28 Oct 2026). 0 is the value that turns pipelining off; 1 still
    // stalled. It also stops sql.begin working, so transactions use `begin` below.
    // @ts-expect-error read at runtime (postgres/src/index.js) but missing from postgres 3.4's types
    max_pipeline: 0,
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

/**
 * sql.begin for a pool without pipelining. postgres-js reserves the transaction's connection in a
 * hook it only calls while under max_pipeline, so with 0 every BEGIN failed with UNSAFE_TRANSACTION
 * (production, 28 Oct 2026). This takes a reserved connection instead; `savepoint` serves Drizzle's
 * nested `tx.transaction`. Queries sent together inside the transaction queue on that connection.
 */
async function begin(...args: unknown[]): Promise<unknown> {
  const fn = args[args.length - 1] as (sql: postgres.ReservedSql) => unknown;
  const mode = args.length > 1 ? String(args[0]).replace(/[^a-z ]/gi, "") : "";
  const c = await pgClient.reserve();
  let savepoints = 0;
  const tx = Object.assign(c, {
    async savepoint(inner: (sql: postgres.ReservedSql) => unknown) {
      const name = `s${++savepoints}`;
      await c.unsafe(`savepoint ${name}`);
      try {
        const out = await inner(tx);
        await c.unsafe(`release savepoint ${name}`);
        return out;
      } catch (error) {
        await c.unsafe(`rollback to savepoint ${name}`);
        throw error;
      }
    },
  });
  try {
    await c.unsafe(`begin ${mode}`);
    try {
      const out = await fn(tx);
      await c.unsafe("commit");
      return out;
    } catch (error) {
      await c.unsafe("rollback").catch(() => {});
      throw error;
    }
  } finally {
    c.release();
  }
}
(pgClient as unknown as { begin: typeof begin }).begin = begin;

export const db = drizzle(pgClient, { schema });

export { schema };

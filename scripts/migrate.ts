/* eslint-disable no-console */
/**
 * Pooler-friendly migrator.
 *
 * drizzle-kit migrate needs a connection that supports prepared statements
 * (i.e. Supabase's direct connection on port 5432). On free-tier projects that
 * hostname is IPv6-only and unreachable from most networks. The transaction
 * pooler (port 6543) accepts plain DDL but breaks prepared statements — which
 * is exactly the lane drizzle-kit migrate doesn't use, but postgres-js's
 * `.unsafe()` does fine.
 *
 * This script applies every .sql file under supabase/migrations/ exactly once,
 * tracked in `public._medsync_migrations`, wrapped in a transaction per file.
 *
 * Run via `npm run db:migrate`.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

// Node 20.12+ native env loader. Load .env first, then .env.local overrides.
for (const f of [".env", ".env.local"]) {
  if (existsSync(f)) process.loadEnvFile(f);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL required (pooler URL on port 6543).");
  process.exit(1);
}

const MIGRATIONS_DIR = "./supabase/migrations";
const TRACK_TABLE = "_medsync_migrations";

const client = postgres(url, { prepare: false, max: 1 });

async function main() {
  await client.unsafe(`
    CREATE TABLE IF NOT EXISTS public.${TRACK_TABLE} (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  const applied = await client.unsafe(`SELECT name FROM public.${TRACK_TABLE};`);
  const appliedNames = new Set((applied as unknown as { name: string }[]).map((r) => r.name));

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let appliedCount = 0;
  for (const file of files) {
    if (appliedNames.has(file)) {
      process.stdout.write(`· ${file} (already applied)\n`);
      continue;
    }

    process.stdout.write(`→ ${file} ...`);
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");

    try {
      await client.begin(async (tx) => {
        await tx.unsafe(sql);
        await tx.unsafe(`INSERT INTO public.${TRACK_TABLE} (name) VALUES ($1);`, [file]);
      });
      process.stdout.write(" ✓\n");
      appliedCount++;
    } catch (err) {
      process.stdout.write(" ✗\n");
      console.error(err instanceof Error ? err.message : err);
      throw err;
    }
  }

  if (appliedCount === 0) {
    console.log("\nNo new migrations.");
  } else {
    console.log(`\n✓ Applied ${appliedCount} migration${appliedCount === 1 ? "" : "s"}.`);
  }

  await client.end();
}

main().catch(async (err) => {
  console.error("\n❌ Migration failed:", err instanceof Error ? err.message : err);
  await client.end({ timeout: 5 });
  process.exit(1);
});

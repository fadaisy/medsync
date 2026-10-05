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
 * Run via `npm run db:migrate` IN THE FOLDER OF THE BRANCH WHOSE MIGRATIONS YOU MEAN TO APPLY. It reads
 * `./supabase/migrations` from where it runs, so the main folder on an older branch has nothing new to
 * apply even when a worktree holds a new migration ("No new migrations" was that, every time). A worktree
 * has no `.env.local` of its own: the main folder's is used, and the run says which file it read (never
 * the value). When nothing is new, it says which branch and which newest migration it looked at, and
 * whether the database already holds migrations this folder does not.
 *
 *   npm run db:migrate -- --dry-run      list what would run, apply nothing
 *   npm run db:migrate -- 0092 0083      apply only the pending files whose names start with these
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import postgres from "postgres";

const MIGRATIONS_DIR = "./supabase/migrations";
const TRACK_TABLE = "_medsync_migrations";

/** Run git here; null outside a repository. */
function git(...args: string[]): string | null {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * The env files to load, in order (later overrides earlier): this folder's `.env` and `.env.local`; when this
 * folder has neither (a git worktree), the main checkout's, which `git rev-parse --git-common-dir` names.
 */
export function envFiles(
  cwd: string,
  mainRoot: string | null,
  exists: (path: string) => boolean = existsSync,
): string[] {
  const here = [".env", ".env.local"].map((f) => join(cwd, f)).filter(exists);
  if (here.length || !mainRoot || resolve(mainRoot) === resolve(cwd)) return here;
  return [".env", ".env.local"].map((f) => join(mainRoot, f)).filter(exists);
}

export interface MigrationPlan {
  pending: string[];
  /** Applied in the database but not in this folder: the folder is behind the database. */
  appliedElsewhere: string[];
  newestHere: string | null;
  newestApplied: string | null;
}

/** What a run will do, and what it can say when there is nothing to do. Pure. */
export function planMigrations(
  files: readonly string[],
  applied: ReadonlySet<string>,
): MigrationPlan {
  const sorted = [...files].filter((f) => f.endsWith(".sql")).sort();
  const here = new Set(sorted);
  const appliedSorted = [...applied].sort();
  return {
    pending: sorted.filter((f) => !applied.has(f)),
    appliedElsewhere: appliedSorted.filter((f) => !here.has(f)),
    newestHere: sorted.at(-1) ?? null,
    newestApplied: appliedSorted.at(-1) ?? null,
  };
}

/** `--dry-run` and file-name prefixes from the command line. */
export function parseArgs(argv: readonly string[]): { dryRun: boolean; only: string[] } {
  return { dryRun: argv.includes("--dry-run"), only: argv.filter((a) => !a.startsWith("--")) };
}

/**
 * The pending files this run applies: all of them, or only those named by prefix (a gated migration is applied
 * deliberately). A prefix that names no file in this folder is an error, never a silent "nothing new".
 */
export function selectPending(
  plan: MigrationPlan,
  files: readonly string[],
  only: readonly string[],
): string[] {
  const unknown = only.filter((p) => !files.some((f) => f.startsWith(p)));
  if (unknown.length)
    throw new Error(`No migration in this folder starts with: ${unknown.join(", ")}`);
  return only.length ? plan.pending.filter((f) => only.some((p) => f.startsWith(p))) : plan.pending;
}

/** The lines printed when nothing is new: where we looked and what the database has. */
export function nothingNewWords(
  plan: MigrationPlan,
  folder: string,
  branch: string | null,
): string[] {
  const lines = [
    "No new migrations in this folder.",
    `  folder: ${folder}${branch ? ` (branch ${branch})` : ""}`,
    `  newest migration here:          ${plan.newestHere ?? "none"}`,
    `  newest applied in the database: ${plan.newestApplied ?? "none"}`,
  ];
  if (plan.appliedElsewhere.length)
    lines.push(
      `  The database has ${plan.appliedElsewhere.length} migration(s) this folder does not: this folder is ` +
        "behind, or they were applied from another branch. To apply a new migration, run " +
        "`npm run db:migrate` in the worktree or branch that holds it.",
      ...plan.appliedElsewhere.map((f) => `    ${f}`),
    );
  return lines;
}

async function main() {
  const common = git("rev-parse", "--path-format=absolute", "--git-common-dir");
  const loaded = envFiles(process.cwd(), common ? dirname(common) : null);
  // Node 20.12+ native env loader. Load .env first, then .env.local overrides.
  for (const f of loaded) process.loadEnvFile(f);
  if (loaded.some((f) => !f.startsWith(process.cwd())))
    console.log(`Using the main checkout's env: ${loaded.join(", ")}`);

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL required (pooler URL on port 6543).");
    process.exit(1);
  }
  const client = postgres(url, { prepare: false, max: 1 });

  try {
    await client.unsafe(`
      CREATE TABLE IF NOT EXISTS public.${TRACK_TABLE} (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    const applied = await client.unsafe(`SELECT name FROM public.${TRACK_TABLE};`);
    const appliedNames = new Set((applied as unknown as { name: string }[]).map((r) => r.name));
    const files = readdirSync(MIGRATIONS_DIR);
    const plan = planMigrations(files, appliedNames);
    const args = parseArgs(process.argv.slice(2));
    const todo = selectPending(plan, files, args.only);
    if (args.dryRun) {
      console.log(
        todo.length ? `Would apply:\n${todo.map((f) => `  ${f}`).join("\n")}` : "Nothing pending.",
      );
      await client.end();
      return;
    }

    let appliedCount = 0;
    for (const file of todo) {
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

    if (appliedCount === 0 && args.only.length) {
      const done = files.filter(
        (f) => args.only.some((p) => f.startsWith(p)) && appliedNames.has(f),
      );
      console.log(
        done.length ? `\nAlready applied: ${done.join(", ")}. Nothing to do.` : "\nNothing to do.",
      );
    } else if (appliedCount === 0) {
      const words = nothingNewWords(plan, process.cwd(), git("branch", "--show-current"));
      console.log(`\n${words.join("\n")}`);
    } else {
      console.log(`\n✓ Applied ${appliedCount} migration${appliedCount === 1 ? "" : "s"}.`);
    }
    await client.end();
  } catch (err) {
    console.error("\n❌ Migration failed:", err instanceof Error ? err.message : err);
    await client.end({ timeout: 5 });
    process.exit(1);
  }
}

// Run only as the script (`npm run db:migrate`), never when a test imports the helpers.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main();
}

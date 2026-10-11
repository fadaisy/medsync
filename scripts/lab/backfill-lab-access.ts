/* eslint-disable no-console */
/**
 * Backfill the lab workspace role for lab staff approved before migration 0097 (Lab Phase 0,
 * D-LAB0-12). From 0097 on, a trigger grants and revokes `lab_tech` with every affiliation change;
 * staff approved earlier have no role row. This lists them and, with --apply, grants each through
 * the same `private.sync_lab_access`, so every grant writes the same audit row as the trigger.
 *
 *   npm run lab:backfill-access              # dry run: list only (the default)
 *   npm run lab:backfill-access -- --apply   # grant, after reviewing the list
 *
 * Prints affiliation and hospital ids, cadre and approval date: no names, no contact details.
 * Idempotent: a second run finds nobody.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import postgres from "postgres";

// This folder's env files; in a git worktree (which has none), the main checkout's, as
// scripts/migrate.ts does. The file names are printed, never their values.
let envDir = process.cwd();
if (![".env", ".env.local"].some((f) => existsSync(join(envDir, f)))) {
  try {
    const common = execFileSync(
      "git",
      ["rev-parse", "--path-format=absolute", "--git-common-dir"],
      {
        encoding: "utf8",
      },
    ).trim();
    envDir = dirname(common);
    console.log(`Using the main checkout's env: ${envDir}`);
  } catch {
    // not a git checkout: no env files to load
  }
}
for (const f of [".env", ".env.local"]) {
  const path = join(envDir, f);
  if (existsSync(path)) process.loadEnvFile(path);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}
const apply = process.argv.includes("--apply");
const sql = postgres(url, { prepare: false, max: 1 });

interface Candidate {
  user_id: string;
  hospital_id: string;
  affiliation_id: string;
  cadre: string;
  approved_at: Date | null;
}

async function main() {
  const rows = (await sql`
    select distinct on (sa.user_id, sa.hospital_id)
           sa.user_id, sa.hospital_id, sa.id as affiliation_id, c.code as cadre, sa.approved_at
      from public.staff_affiliations sa
      join public.cadres c on c.id = sa.cadre_id
     where sa.state in ('approved', 'active')
       and c.code in ('LAB_TECH', 'LAB_TECHNOLOGIST')
       and not exists (
         select 1 from public.user_roles ur
          where ur.user_id = sa.user_id and ur.hospital_id = sa.hospital_id and ur.role = 'lab_tech')
     order by sa.user_id, sa.hospital_id, sa.approved_at desc nulls last
  `) as unknown as Candidate[];

  console.log(`${rows.length} approved lab staff without lab access.`);
  for (const r of rows) {
    const approved = r.approved_at ? r.approved_at.toISOString().slice(0, 10) : "no date";
    console.log(
      `  affiliation ${r.affiliation_id} · hospital ${r.hospital_id} · ${r.cadre} · approved ${approved}`,
    );
  }
  if (!apply) {
    console.log("Dry run. Nothing changed. Re-run with --apply to grant.");
    return;
  }
  let granted = 0;
  for (const r of rows) {
    const [res] = await sql`
      select private.sync_lab_access(
        ${r.user_id}::uuid, ${r.hospital_id}::uuid, null,
        ${sql.json({ op: "backfill", affiliation_id: r.affiliation_id })}
      ) as outcome`;
    if (res?.outcome === "granted") granted += 1;
  }
  console.log(`Granted ${granted} of ${rows.length}. Each has a lab_access row in audit_log.`);
}

main()
  .catch((e: unknown) => {
    console.error("backfill failed:", e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  })
  .finally(() => sql.end());

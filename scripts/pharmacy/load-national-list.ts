/* eslint-disable no-console */
/**
 * Load an edition of the national list (Pharmacy Phase 1, CT-3; ADR 0282). Owner-run, after 0136.
 * Writes one edition and its rows, as printed, in one transaction. Links nothing: the CSO confirms
 * each link from /admin/pharmacy-catalogue.
 *
 *   npx tsx scripts/pharmacy/load-national-list.ts data/pharmacy/national-list/emhslu-2023.csv \
 *     --name "EMHSLU 2023" --source "Ministry of Health, EMHSLU 2023 (PDF, 118 pp.)" --by you@example.org
 *   ... --apply   # write, after reviewing the dry run
 *
 * --by names the superadmin the edition is recorded against. A file with any unreadable line is
 * refused whole, and an edition name already loaded is refused.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import postgres from "postgres";

import { readNationalList } from "@/lib/pharmacy/national-list";

// As scripts/pharmacy/backfill-pharmacy-access.ts: this folder's env, or the main checkout's.
let envDir = process.cwd();
if (![".env", ".env.local"].some((f) => existsSync(join(envDir, f)))) {
  try {
    const common = execFileSync(
      "git",
      ["rev-parse", "--path-format=absolute", "--git-common-dir"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
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

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] ?? null) : null;
};
const file = args[0];
const name = flag("name");
const source = flag("source");
const by = flag("by");
const published = flag("published");
const apply = args.includes("--apply");
if (!file || file.startsWith("--") || !name || !source || !by) {
  console.error(
    'Usage: load-national-list.ts <file.csv> --name "<edition>" --source "<reference>" --by <superadmin email> [--published YYYY-MM-DD] [--apply]',
  );
  process.exit(2);
}

const { rows, rejected } = readNationalList(readFileSync(file, "utf8"));
const count = (f: (r: (typeof rows)[number]) => boolean) => rows.filter(f).length;
console.log(`Rows read: ${rows.length}`);
console.log(`  medicines: ${count((r) => r.kind === "medicine")}`);
console.log(`  supplies: ${count((r) => r.kind === "supply")}`);
console.log(`  specialist: ${count((r) => r.specialist)}`);
console.log(`  flagged to check against the source: ${count((r) => r.checkNote !== null)}`);
console.log(`Lines not read: ${rejected.length}`);
for (const x of rejected) console.log(`  line ${x.line}: ${x.reason}`);
if (rejected.length) {
  console.error("Refused: fix the file so every line reads, then run again.");
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}
const sql = postgres(url, { prepare: false, max: 1 });

async function main() {
  const [user] = await sql<{ id: string }[]>`
    select u.id from auth.users u
    where lower(u.email) = lower(${by!})
      and exists (select 1 from public.user_roles r where r.user_id = u.id and r.role = 'superadmin')`;
  if (!user) throw new Error(`No superadmin with the email given to --by.`);
  const [existing] =
    await sql`select id from public.pharmacy_national_list_editions where name = ${name!}`;
  if (existing) throw new Error(`An edition named "${name}" is already loaded.`);
  if (!apply) {
    console.log("Dry run: nothing written. Add --apply to load.");
    return;
  }
  const editionId = await sql.begin(async (tx) => {
    const [edition] = await tx<{ id: string }[]>`
      insert into public.pharmacy_national_list_editions (name, published_on, source_ref, imported_by)
      values (${name!}, ${published}, ${source!}, ${user.id}) returning id`;
    const values = rows.map((r) => ({
      edition_id: edition!.id,
      generic_name: r.genericName,
      form: r.form,
      strength: r.strength,
      level_of_care: r.levelOfCare,
      ven_class: r.venClass,
      therapeutic_class: r.therapeuticClass,
      source_line: r.line,
      kind: r.kind,
      list_section: r.listSection,
      unit: r.unit,
      specialist: r.specialist,
      source_page: r.sourcePage,
      check_note: r.checkNote,
    }));
    for (let i = 0; i < values.length; i += 500)
      await tx`insert into public.pharmacy_national_list_rows ${tx(values.slice(i, i + 500))}`;
    return edition!.id;
  });
  console.log(
    `Loaded edition ${editionId}: ${rows.length} rows. Confirm links at /admin/pharmacy-catalogue.`,
  );
}

main()
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => sql.end());

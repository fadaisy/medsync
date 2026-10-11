/* eslint-disable no-console */
/**
 * Import laboratory LOINC codes from an official LOINC release (Lab Phase 1, UN-7, E-LAB1-07).
 *
 *   npm run lab:import-loinc -- <path/to/LoincTable/Loinc.csv> <release, e.g. 2.80>           # dry run
 *   npm run lab:import-loinc -- <path/to/LoincTable/Loinc.csv> <release> --apply
 *
 * Reads the release's Loinc.csv (download from loinc.org after accepting its licence; the file is not
 * kept in this repository), keeps active laboratory terms (CLASSTYPE 1, STATUS ACTIVE), and upserts
 * code, long common name, class and release into `loinc_codes`. Codes are optional on a test component
 * and validated against this table; nothing is ever inferred from a name. Re-runnable.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import postgres from "postgres";

const [file, release] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const apply = process.argv.includes("--apply");
if (!file || !release || !existsSync(file)) {
  console.error("Usage: npm run lab:import-loinc -- <Loinc.csv> <release> [--apply]");
  process.exit(1);
}

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
  } catch {
    // not a git checkout
  }
}
for (const f of [".env", ".env.local"]) {
  const path = join(envDir, f);
  if (existsSync(path)) process.loadEnvFile(path);
}

/** RFC 4180 CSV: quoted fields, doubled quotes, commas inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const [header, ...body] = parseCsv(readFileSync(file, "utf8"));
const col = (name: string) => header!.indexOf(name);
const [iCode, iName, iClass, iType, iStatus] = [
  col("LOINC_NUM"),
  col("LONG_COMMON_NAME"),
  col("CLASS"),
  col("CLASSTYPE"),
  col("STATUS"),
];
if ([iCode, iName, iClass, iType, iStatus].some((i) => i < 0)) {
  console.error(
    "Not a LOINC table: LOINC_NUM, LONG_COMMON_NAME, CLASS, CLASSTYPE and STATUS are required.",
  );
  process.exit(1);
}
const lab = body.filter((r) => r[iType] === "1" && r[iStatus] === "ACTIVE" && r[iCode]);
console.log(`${lab.length} active laboratory terms in LOINC ${release} (of ${body.length} rows).`);
if (!apply) {
  console.log("Dry run. Nothing written. Re-run with --apply to import.");
  process.exit(0);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}
const sql = postgres(url, { prepare: false, max: 1 });
try {
  for (let i = 0; i < lab.length; i += 1000) {
    const chunk = lab.slice(i, i + 1000).map((r) => ({
      code: r[iCode]!,
      display: r[iName]!,
      category: r[iClass] ?? null,
      version: release,
      source: `LOINC ${release} release (Loinc.csv)`,
    }));
    await sql`insert into public.loinc_codes ${sql(chunk)}
      on conflict (code) do update set display = excluded.display, category = excluded.category,
        version = excluded.version, source = excluded.source`;
  }
  console.log(`Imported ${lab.length} codes.`);
} finally {
  await sql.end();
}

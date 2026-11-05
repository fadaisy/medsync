/* eslint-disable no-console -- a one-shot generator */
/**
 * data/emhslu-2023-supplies.csv -> supabase/migrations/0278_pharmacy_supplies_list.sql. Run once; the migration is then
 * immutable. Rows repeated in the PDF load once.
 *
 *   npx tsx scripts/pharmacy/gen-supplies-migration.ts
 */
import type { SupplyRow } from "../../lib/pharmacy/supplies/defaults";
import { readFileSync, writeFileSync } from "node:fs";
import { supplyDefaults } from "../../lib/pharmacy/supplies/defaults";
import { parseCsv } from "../../lib/pharmacy/supplies/csv";

const q = (s: string) => `'${s.replaceAll("'", "''")}'`;
const rows = parseCsv(readFileSync("data/emhslu-2023-supplies.csv", "utf8"));
const seen = new Set<string>();
const values: string[] = [];
for (const r of rows as SupplyRow[]) {
  const d = supplyDefaults(r);
  const key = [r.section, d.category, r.name, r.specification, r.unit, r.level].join("|");
  if (seen.has(key)) continue;
  seen.add(key);
  values.push(
    `(${q(r.section)},${q(d.category)},${q(r.name)},${q(r.specification)},${q(r.unit)},${q(d.issueUnit)},${q(r.level)},` +
      `${d.level ? q(d.level) : "NULL"},${r.ven ? q(r.ven) : "NULL"},${d.sterile},${d.testKit},${d.noExpiry},${d.freeIssue})`,
  );
}
writeFileSync(
  "supabase/migrations/0278_pharmacy_supplies_list.sql",
  `-- 0278 — The EMHSLU 2023 Sections B, C and D list (${values.length} items), generated from data/emhslu-2023-supplies.csv by
-- scripts/pharmacy/gen-supplies-migration.ts. Spelling and specifications are the PDF's own.
--
-- GATED: owner-applied (\`npm run db:migrate\`), after 0277.
INSERT INTO public.cat_supply_items (section, category, name, specification, unit_printed, issue_unit, level_printed,
  level_of_care, ven, sterile, test_kit, no_expiry, free_issue) VALUES
${values.join(",\n")}
ON CONFLICT (section, category, name, specification, unit_printed, level_printed) DO NOTHING;
`,
);
console.log(`${values.length} items from ${rows.length} rows`);

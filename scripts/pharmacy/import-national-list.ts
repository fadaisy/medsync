/* eslint-disable no-console */
/**
 * The national list import, dry run only (Pharmacy Phase 1, CT-3; STOP 2). Reads an edition's CSV and
 * prints how many rows it read, how many have exactly one proposed prescribing-list medicine, how many
 * are ambiguous or unmatched, and every line it could not read. Writes nothing: the edition is loaded
 * with scripts/pharmacy/load-national-list.ts and each link confirmed by the CSO at
 * /admin/pharmacy-catalogue (ADR 0282).
 *
 *   npx tsx scripts/pharmacy/import-national-list.ts path/to/edition.csv
 *
 * Columns: generic_name, form, strength, level_of_care, ven_class, therapeutic_class.
 */
import { readFileSync } from "node:fs";

import { matchNationalList } from "@/lib/pharmacy/national-list";
import { FORMULARY_DRUGS } from "@/lib/prescribing/reference/general-formulary";

const file = process.argv[2];
if (!file) {
  console.error(
    "Give the edition's CSV file: npx tsx scripts/pharmacy/import-national-list.ts edition.csv",
  );
  process.exit(2);
}
const r = matchNationalList(readFileSync(file, "utf8"), FORMULARY_DRUGS);
console.log(`Rows read: ${r.rows}`);
console.log(
  `Proposed (one medicine, by generic name; strength not compared): ${r.proposed.length}`,
);
console.log(`Ambiguous (several medicines): ${r.ambiguous.length}`);
console.log(`Unmatched: ${r.unmatched.length}`);
console.log(`Lines not read: ${r.rejected.length}`);
for (const x of r.rejected) console.log(`  line ${x.line}: ${x.reason}`);
for (const x of r.ambiguous)
  console.log(`  ambiguous line ${x.row.line}: ${x.row.genericName} → ${x.medicineIds.join(", ")}`);
for (const x of r.unmatched)
  console.log(`  unmatched line ${x.line}: ${x.genericName}${x.form ? `, ${x.form}` : ""}`);

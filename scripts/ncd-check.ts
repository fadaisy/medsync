/* eslint-disable no-console -- a CLI checker reports to stdout */
/**
 * Prints catalog validation issues to stdout. Writes nothing.
 *
 * Exists so that several authors can validate at once without racing on the
 * generated manifest, and so an author can filter to their own feature codes
 * rather than reading everyone else's errors:
 *
 *   npx tsx scripts/ncd-check.ts errors | grep -E 'kussmaul|gcs'
 *
 * Exits non-zero when there is at least one error, so it can gate a build.
 */
import { DIABETES_CATALOG } from "@/lib/ncd/catalog/diabetes";
import { validateCatalog } from "@/lib/ncd/catalog/validate";

const only = process.argv[2]; // "errors" | "warnings" | undefined = both
const issues = validateCatalog(DIABETES_CATALOG).filter(
  (i) => !only || (only === "errors" ? i.severity === "error" : i.severity === "warning"),
);

for (const i of issues) console.log(`${i.severity}\t${i.path}\t${i.message}`);

const errors = validateCatalog(DIABETES_CATALOG).filter((i) => i.severity === "error");
console.log(`\n${errors.length} errors, ${issues.length - errors.length} other issues shown.`);
process.exit(errors.length ? 1 : 0);

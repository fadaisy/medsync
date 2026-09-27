/**
 * npm run clerking:catalogue-check — validates the clerking catalogue against the schema and the
 * sign-off, and prints its counts. Exits non-zero on any problem (CI runs it).
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { parseCatalogue } from "../../lib/clerking/catalogue";

const path = "data/clerking/clerking-history-catalogue.v1.json";
const bytes = readFileSync(path);
const cat = parseCatalogue(JSON.parse(bytes.toString("utf8")));
const signoff = JSON.parse(readFileSync("data/clerking/catalogue-signoff.v1.json", "utf8")) as { catalogueSha256: string };
const problems: string[] = [];

const hash = createHash("sha256").update(bytes).digest("hex");
if (hash !== signoff.catalogueSha256) problems.push(`catalogue changed since sign-off (sha256 ${hash})`);
for (const s of cat.symptoms) if (cat.properties(s.id).length === 0) problems.push(`${s.id}: no properties`);
const ids = new Set(cat.symptoms.map((s) => s.id));
for (const sys of cat.data.review_of_systems.systems)
  for (const i of sys.items) if (!ids.has(i)) problems.push(`review of systems ${sys.id}: unknown ${i}`);
const refs = new Set(Object.keys(cat.data.reference_entries));
for (const r of cat.data.flag_rules)
  for (const ref of JSON.stringify(r.when).match(/REF-FLAG-[A-Z0-9-]+/g) ?? [])
    if (!refs.has(ref)) problems.push(`${r.id}: unknown reference ${ref}`);

const rules = cat.data.flag_rules;
console.log(
  [
    `catalogue ${cat.data.id} ${cat.version} (sha256 ${hash.slice(0, 12)}…)`,
    `symptoms ${cat.symptoms.length}, families ${Object.keys(cat.data.property_families).length}`,
    `review-of-systems groups ${cat.data.review_of_systems.systems.length}`,
    `red flags ${cat.symptoms.reduce((n, s) => n + s.red_flags.length, 0)}`,
    `flag rules ${rules.length} (${rules.filter((r) => r.level === "urgent").length} urgent)`,
    `reference entries ${refs.size}, sources ${Object.keys(cat.data.sources).length}`,
  ].join("\n"),
);
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log("ok");

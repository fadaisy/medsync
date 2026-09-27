/**
 * npm run clerking:catalogue-check — validates the clerking catalogues (history and examination)
 * against their schemas and sign-offs, checks the ids that cross between them, and prints their
 * counts. Exits non-zero on any problem (CI runs it).
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { parseCatalogue } from "../../lib/clerking/catalogue";
import { parseExamCatalogue } from "../../lib/clerking/exam/catalogue";

const path = "data/clerking/clerking-history-catalogue.v1.json";
const bytes = readFileSync(path);
const cat = parseCatalogue(JSON.parse(bytes.toString("utf8")));
const signoff = JSON.parse(readFileSync("data/clerking/catalogue-signoff.v1.json", "utf8")) as {
  catalogueSha256: string;
};
const problems: string[] = [];

const hash = createHash("sha256").update(bytes).digest("hex");
if (hash !== signoff.catalogueSha256)
  problems.push(`catalogue changed since sign-off (sha256 ${hash})`);
for (const s of cat.symptoms)
  if (cat.properties(s.id).length === 0) problems.push(`${s.id}: no properties`);
const ids = new Set(cat.symptoms.map((s) => s.id));
for (const sys of cat.data.review_of_systems.systems)
  for (const i of sys.items)
    if (!ids.has(i)) problems.push(`review of systems ${sys.id}: unknown ${i}`);
const refs = new Set(Object.keys(cat.data.reference_entries));
for (const r of cat.data.flag_rules)
  for (const ref of JSON.stringify(r.when).match(/REF-FLAG-[A-Z0-9-]+/g) ?? [])
    if (!refs.has(ref)) problems.push(`${r.id}: unknown reference ${ref}`);

const rules = cat.data.flag_rules;
process.stdout.write(
  [
    `catalogue ${cat.data.id} ${cat.version} (sha256 ${hash.slice(0, 12)}…)`,
    `symptoms ${cat.symptoms.length}, families ${Object.keys(cat.data.property_families).length}`,
    `review-of-systems groups ${cat.data.review_of_systems.systems.length}`,
    `red flags ${cat.symptoms.reduce((n, s) => n + s.red_flags.length, 0)}`,
    `flag rules ${rules.length} (${rules.filter((r) => r.level === "urgent").length} urgent)`,
    `reference entries ${refs.size}, sources ${Object.keys(cat.data.sources).length}`,
  ].join("\n") + "\n",
);
/* ─── The examination catalogue (MS-EMR-EXAM-CAT-001) ─────────────── */

const examPath = "data/clerking/clerking-exam-catalogue.v1.json";
const examBytes = readFileSync(examPath);
const exam = parseExamCatalogue(JSON.parse(examBytes.toString("utf8")));
const examSignoff = JSON.parse(readFileSync("data/clerking/exam-signoff.v1.json", "utf8")) as {
  catalogueSha256: string;
};
const examHash = createHash("sha256").update(examBytes).digest("hex");
if (examHash !== examSignoff.catalogueSha256)
  problems.push(`exam catalogue changed since sign-off (sha256 ${examHash})`);
const ed = exam.data;
const examRefs = new Set(Object.keys(ed.reference_entries));
const pastIds = new Set(cat.data.past_history.conditions.map((c) => c.id));
const cross = (where: string, json: unknown) => {
  const t = JSON.stringify(json);
  for (const ref of t.match(/REF-EX-[A-Z0-9-]+/g) ?? [])
    if (!examRefs.has(ref)) problems.push(`${where}: unknown reference ${ref}`);
  for (const ref of t.match(/REF-FLAG-[A-Z0-9-]+/g) ?? [])
    if (!refs.has(ref)) problems.push(`${where}: unknown history reference ${ref}`);
  for (const sym of t.match(/sym\.[a-z_0-9]+/g) ?? [])
    if (!ids.has(sym)) problems.push(`${where}: unknown symptom ${sym}`);
  for (const m of t.matchAll(/"past_condition":"([a-z_0-9]+)"/g))
    if (!pastIds.has(m[1]!)) problems.push(`${where}: unknown past condition ${m[1]}`);
  for (const m of t.matchAll(
    /"red_flag":"([a-z_0-9]+)","symptom":"(sym\.[a-z_0-9]+)"|"symptom":"(sym\.[a-z_0-9]+)","red_flag":"([a-z_0-9]+)"/g,
  )) {
    const [flag, sym] = m[1] ? [m[1], m[2]!] : [m[4]!, m[3]!];
    if (!cat.symptom(sym)?.red_flags.some((f) => f.id === flag))
      problems.push(`${where}: unknown red flag ${sym}/${flag}`);
  }
  for (const m of t.matchAll(/"(?:finding|item)":"(ex\.[a-z_0-9.]+)"/g))
    if (!exam.item(m[1]!)) problems.push(`${where}: unknown item ${m[1]}`);
  for (const m of t.matchAll(/"(?:source|also_source)":"([A-Z0-9-]+)"/g))
    if (!ed.sources[m[1]!]) problems.push(`${where}: unknown source ${m[1]}`);
};
for (const r of ed.flag_rules) cross(r.id, r);
for (const r of ed.suggestion_rules.rules) {
  cross(r.id, r);
  for (const s of r.suggest) {
    const base = s.target.split("#")[0]!.split("/")[0]!;
    const ok =
      s.target === "vs" ||
      s.target.startsWith("vs.") ||
      !!exam.item(base) ||
      !!exam.system(base.replace(/^ex\./, "")) ||
      Object.values(ed.blocks).some((b) => b.id === base);
    if (!ok) problems.push(`${r.id}: unknown target ${s.target}`);
  }
}
for (const [id, c] of Object.entries(ed.classifiers)) cross(`classifier ${id}`, c);

const answerable = exam.items.filter((i) => i.response.type !== "link");
const attrs = exam.items.flatMap((i) => exam.allAttributes(i));
const options =
  attrs.reduce((n, a) => n + (a.options?.length ?? 0), 0) +
  exam.items.reduce(
    (n, i) => n + (i.response.type === "choice" ? i.response.options.length : 0),
    0,
  );
const byType = answerable.reduce<Record<string, number>>(
  (m, i) => ((m[i.response.type] = (m[i.response.type] ?? 0) + 1), m),
  {},
);
const verifiedSources = new Set(
  Object.entries(ed.sources)
    .filter(([, v]) => v.verified)
    .map(([k]) => k),
);
const refsFromOpened = Object.values(ed.reference_entries).filter((r) =>
  verifiedSources.has(r.source),
).length;
process.stdout.write(
  [
    `catalogue ${ed.id} ${exam.version} (sha256 ${examHash.slice(0, 12)}…)`,
    `systems ${exam.systems.length}, parts ${exam.systems.reduce((n, s) => n + s.parts.length, 0)}`,
    `answerable items ${answerable.length}, links ${exam.items.length - answerable.length}`,
    `attributes ${attrs.length}, options ${options}`,
    `by response type ${Object.entries(byType)
      .map(([k, v]) => `${k} ${v}`)
      .join(", ")}`,
    `scales ${Object.keys(ed.scales).length}, classifiers ${Object.keys(ed.classifiers).length}`,
    `reference entries ${examRefs.size} (${refsFromOpened} from opened sources)`,
    `sources ${Object.keys(ed.sources).length} (${verifiedSources.size} verified)`,
    `flag rules ${ed.flag_rules.length} (${ed.flag_rules.filter((r) => r.level === "urgent").length} urgent, ${ed.flag_rules.filter((r) => r.restricted).length} restricted)`,
    `suggestion rules ${ed.suggestion_rules.rules.length}, shared facts ${ed.shared_facts.length}, mirrors ${exam.mirrors.length}`,
    `not-examined reasons ${ed.not_examined.reasons.length}, gates ${Object.keys(ed.gates).length}`,
  ].join("\n") + "\n",
);

if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
process.stdout.write("ok\n");

/* eslint-disable no-console */
/**
 * Generate the EMR reference seed from the signed data files:
 *   supabase/migrations/0072_emr_reference_seed.sql  (rows for the 0071 registries, gate-a-proposal §A.2)
 *   supabase/migrations/0082, 0083                   (the CFC v1.2 and v1.3 addenda)
 *   supabase/migrations/0085_ref_dx_terms_v1_1.sql   (the REF-DX-TERMS v1.1 addendum, uncoded: D-SI-26)
 *   supabase/migrations/0086_ref_dx_terms_v1_1_icd11.sql (their ICD-11 codes, read on the WHO API and signed)
 *   lib/facts/catalogue.generated.ts                 (the same registry as a typed const for the engines)
 *
 * Deterministic: rows sorted by id, uuids derived from the data id (v5), output through the repo's
 * Prettier config for the TS so a regen and the pre-commit hook agree byte-for-byte. tests/emr/seed.test.ts
 * re-runs `generateSeed` in memory and fails while either committed file drifts from the data.
 *
 * Usage: npx tsx scripts/emr/gen-seed.ts
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import prettier from "prettier";

export const SEED_SOURCES = {
  v1: "docs/emr/clinical-fact-concepts.v1.json",
  v11: "data/emr/clinical-fact-concepts.v1.1.json",
  v12: "data/emr/clinical-fact-concepts.v1.2.json",
  v13: "data/emr/clinical-fact-concepts.v1.3.json",
  v15: "data/emr/clinical-fact-concepts.v1.5.json",
  tests: "data/emr/test-catalogue.v1.json",
  terms: "data/emr/diagnosis-terms.v1.json",
  terms11: "docs/emr/clerking-v2/summary-impression/diagnosis-terms.v1.1-addendum.json",
  codes11: "data/emr/diagnosis-terms.v1.1-icd11.json",
  terms12: "data/emr/diagnosis-terms.v1.2.json",
} as const;
export const SEED_OUTPUTS = {
  sql: "supabase/migrations/0072_emr_reference_seed.sql",
  sql12: "supabase/migrations/0082_cfc_v1_2_clerking_findings.sql",
  sql13: "supabase/migrations/0083_cfc_v1_3_examination.sql",
  sql85: "supabase/migrations/0085_ref_dx_terms_v1_1.sql",
  sql86: "supabase/migrations/0086_ref_dx_terms_v1_1_icd11.sql",
  sql15: "supabase/migrations/0092_cfc_v1_5_ncd_diabetes.sql",
  sql95: "supabase/migrations/0095_ref_dx_terms_v1_2.sql",
  ts: "lib/facts/catalogue.generated.ts",
} as const;

// The data files carry "1.0.0-draft" for v1; the catalogues were signed at GATE A, so the rows carry the
// released versions (brief C).
const V1_VERSION = "1.0.0";
const V11_VERSION = "1.1.0";
// The addenda carry their own versions (docs/emr/cfc/cfc-migrations-proposal.md, signed 2026-09-28).
const ADDENDA = [
  {
    key: "v12",
    version: "1.2.0",
    sql: "sql12",
    title: "0082 — CFC v1.2: clerking history findings",
  },
  { key: "v13", version: "1.3.0", sql: "sql13", title: "0083 — CFC v1.3: the examination" },
  {
    key: "v15",
    version: "1.5.0",
    sql: "sql15",
    title: "0092 — CFC v1.5: NCD diabetes (MS-NCD-DM-PACK-001)",
  },
] as const;

// Fixed namespace for the uuid-keyed registries (test_catalogue, diagnosis_terms have no text key column).
// Changing it re-keys every seeded row, so it never changes.
const UUID_NAMESPACE = "b08c11db-6eac-493f-8712-c8642d0d45ae";

// The menu JSON has no ionising flag; plain radiography is ionising by definition (not a clinical number),
// and D-EMR-12's pregnancy prompt keys on it. Ultrasound and ECG are not.
const IONISING_TESTS = new Set(["test.chest_xray"]);

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export function uuidV5(name: string): string {
  const h = createHash("sha1")
    .update(Buffer.from(UUID_NAMESPACE.replace(/-/g, ""), "hex"))
    .update(name)
    .digest();
  h[6] = (h[6]! & 0x0f) | 0x50;
  h[8] = (h[8]! & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

export function readSeedSources(root: string) {
  const read = (rel: string): Json => JSON.parse(readFileSync(join(root, rel), "utf8"));
  return {
    v1: read(SEED_SOURCES.v1),
    v11: read(SEED_SOURCES.v11),
    v12: read(SEED_SOURCES.v12),
    v13: read(SEED_SOURCES.v13),
    v15: read(SEED_SOURCES.v15),
    tests: read(SEED_SOURCES.tests),
    terms: read(SEED_SOURCES.terms),
    terms11: read(SEED_SOURCES.terms11),
    codes11: read(SEED_SOURCES.codes11),
    terms12: read(SEED_SOURCES.terms12),
  };
}
export type SeedSources = ReturnType<typeof readSeedSources>;

const byId =
  <T>(key: (t: T) => string) =>
  (a: T, b: T) =>
    key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0;

// ─── SQL literals ────────────────────────────────────────────────────
const lit = (v: string | null | undefined) => (v == null ? "NULL" : `'${v.replace(/'/g, "''")}'`);
const bool = (v: boolean) => (v ? "true" : "false");
const arr = (v: readonly string[] | null | undefined) =>
  v == null ? "NULL" : v.length === 0 ? "'{}'" : `ARRAY[${v.map(lit).join(", ")}]`;
const jsonb = (v: unknown) => `${lit(JSON.stringify(v))}::jsonb`;

function insert(table: string, cols: string[], rows: string[][]): string {
  return (
    `INSERT INTO public.${table} (${cols.join(", ")}) VALUES\n` +
    rows.map((r) => `  (${r.join(", ")})`).join(",\n") +
    "\nON CONFLICT DO NOTHING;\n"
  );
}

/** The merged concept list, each tagged with the catalogue version and its resolved symptom code. */
export function allConcepts(src: SeedSources) {
  const v1Codes: Record<string, string | null> = src.v11.v1FindingSymptomCodes;
  return [
    ...src.v1.concepts.map((c: Json) => ({
      ...c,
      version: V1_VERSION,
      symptomCode: v1Codes[c.id] ?? null,
    })),
    ...src.v11.concepts.map((c: Json) => ({
      ...c,
      version: V11_VERSION,
      symptomCode: c.symptomCode ?? null,
    })),
  ].sort(byId((c: Json) => c.id)) as Json[];
}

/** The registry the engines read: 0072's concepts, then each addendum's (with its answer extensions
 *  applied to the concepts it extends). */
export function registryConcepts(src: SeedSources) {
  const base = allConcepts(src).map((c) => ({ ...c }));
  for (const a of ADDENDA) {
    const add = src[a.key];
    for (const [id, answers] of Object.entries(
      (add.answerExtensions ?? {}) as Record<string, string[]>,
    )) {
      const c = base.find((x) => x.id === id);
      if (!c) throw new Error(`${a.key} extends unknown concept ${id}`);
      c.answers = [...(c.answers ?? []), ...answers.filter((x) => !(c.answers ?? []).includes(x))];
    }
    base.push(
      ...add.concepts.map((c: Json) => ({
        ...c,
        version: a.version,
        symptomCode: c.symptomCode ?? null,
      })),
    );
  }
  return base.sort(byId((c: Json) => c.id)) as Json[];
}

/** SR-PREG-MINOR and friends: `appliesTo` names a concept id or `kind:<kind>`. */
function sensitivityRuleFor(src: SeedSources, c: Json): Json | null {
  return (
    src.v11.sensitivityRules.find(
      (r: Json) => r.appliesTo.includes(c.id) || r.appliesTo.includes(`kind:${c.kind}`),
    ) ?? null
  );
}

/** v1 enums with the v1.1 additions appended (STOP 1 extends specimen and container in place). */
// The two lists the generated types read are always in v1.enums.
type Enums = Record<string, string[]> & Record<"valueType" | "sensitivity", string[]>;
export function mergedEnums(src: SeedSources): Enums {
  const out: Enums = structuredClone(src.v1.enums);
  for (const [k, added] of Object.entries(src.v11.enumsAdded as Record<string, string[]>)) {
    out[k] = [...(out[k] ?? []), ...added.filter((a) => !out[k]?.includes(a))];
  }
  // enumsAdded.valueType only lists the new one; the full list is what the concepts use plus it.
  out.valueType = [
    ...new Set([...allConcepts(src).map((c) => c.valueType), ...out.valueType]),
  ].sort();
  return out;
}

const CONCEPT_COLS = [
  "id",
  "display",
  "kind",
  "concept_group",
  "value_type",
  "canonical_unit",
  "accepted_units",
  "answers",
  "context_required",
  "context_conditional",
  "context_optional",
  "codes",
  "lanes",
  "sensitivity",
  "sensitivity_rule",
  "symptom_code",
  "phase",
  "catalogue_version",
];

function conceptRow(src: SeedSources, c: Json): string[] {
  const rule = sensitivityRuleFor(src, c);
  return [
    lit(c.id),
    lit(c.display),
    lit(c.kind),
    lit(c.group),
    lit(c.valueType),
    lit(c.canonicalUnit),
    jsonb(c.acceptedUnits ?? []),
    arr(c.answers ?? null),
    arr(c.contextRequired),
    jsonb(c.contextConditional ?? {}),
    arr(c.contextOptional ?? []),
    jsonb(c.codes),
    arr(c.lanes),
    lit(c.sensitivity),
    rule ? jsonb(rule) : "NULL",
    lit(c.symptomCode),
    lit(c.phase),
    lit(c.version),
  ];
}

const TERM_COLS = [
  "id",
  "display",
  "synonyms",
  "icd11_code",
  "chronic",
  "symptom_level",
  "hmis_category_id",
  "idsr_class",
  "sensitivity",
  "status",
  "source",
  "verified_on",
];
const symptomLevel = (display: string) => /, (cause|substance) not yet known$/.test(display);

// ─── 0072 ────────────────────────────────────────────────────────────
function buildSql(src: SeedSources): string {
  const concepts = allConcepts(src);
  const caps = [...src.v1.capabilities].sort(byId((c: Json) => c.id));
  const tags = [...src.v1.drugClassTags].sort(byId((t: Json) => t.tag));
  const tests = [...src.tests.tests].sort(byId((t: Json) => t.id));
  const terms = [...src.terms.terms].sort(byId((t: Json) => t.id));

  const header = `-- 0072 — EMR reference seed: the concept registry, drug class tags, capabilities, the default test
-- menu and the diagnosis terms (docs/emr/gate-a-proposal.md §A.2; HARMONISATION.md §3).
--
-- GENERATED by scripts/emr/gen-seed.ts from ${SEED_SOURCES.v1},
-- ${SEED_SOURCES.v11}, ${SEED_SOURCES.tests} and
-- ${SEED_SOURCES.terms}. Do not edit: regenerate with \`npx tsx scripts/emr/gen-seed.ts\`;
-- tests/emr/seed.test.ts fails while this file drifts from the data.
--
-- ADDITIVE. Inserts only, ON CONFLICT DO NOTHING: a re-run adds nothing and never overwrites a registry
-- row a hospital has since edited (registries are config, audited by 0071's triggers).
--   clinical_concepts   ${concepts.length} (v1 ${src.v1.concepts.length} at ${V1_VERSION}, v1.1 ${src.v11.concepts.length} at ${V11_VERSION}; signed at GATE A)
--   drug_class_tags     ${tags.length}
--   capabilities        ${caps.length}
--   test_catalogue      ${tests.length} (hospital_id NULL: the default menu; no reference ranges, no turnaround numbers)
--   diagnosis_terms     ${terms.length} (status 'draft' until the CSO signs REF-DX-TERMS; ICD-10 stays NULL, R9/E6)
-- External codes keep their verification status in jsonb; a 'candidate' code is never exported.
-- facility_capabilities and devices are per-hospital config and are not seeded.
--
-- GATED: owner-applied (\`npm run db:migrate\`), after 0071. Until it runs, EMR_V1 stays off and every
-- page behaves as before.
`;

  const capSql = insert(
    "capabilities",
    ["id", "display", "catalogue_version"],
    caps.map((c: Json) => [lit(c.id), lit(c.display), lit(V1_VERSION)]),
  );

  // routeFilter has no column in §A.2; the engines read it from catalogue.generated.ts.
  const tagSql = insert(
    "drug_class_tags",
    ["id", "display", "atc", "lanes", "sensitivity", "note", "catalogue_version"],
    tags.map((t: Json) => [
      lit(t.tag),
      lit(t.display),
      jsonb(t.atc),
      arr(t.lanes),
      lit(t.sensitivity),
      lit(t.notes),
      lit(V1_VERSION),
    ]),
  );

  const conceptSql = insert(
    "clinical_concepts",
    CONCEPT_COLS,
    concepts.map((c) => conceptRow(src, c)),
  );

  const testSql = insert("test_catalogue", TEST_CATALOGUE_COLS, tests.map(testRow));

  // source keeps the ICD-11 verification status and page, since the table has one code column, not jsonb.
  // symptom_level follows the terms file's own rule: "…, cause not yet known" terms.
  const termSql = insert(
    "diagnosis_terms",
    TERM_COLS,
    terms.map((t: Json) => [
      lit(uuidV5(`diagnosis_terms:${t.id}`)),
      lit(t.display),
      arr(t.synonyms),
      lit(t.icd11?.code),
      bool(t.chronic),
      bool(symptomLevel(t.display)),
      lit(t.hmis_category_id),
      lit(t.idsr_class),
      lit(t.sensitivity),
      lit(t.status),
      lit(
        t.icd11
          ? `${t.icd11.status}: ${t.icd11.source}`
          : `${src.terms.reference} ${src.terms.version}`,
      ),
      lit(t.icd11?.verifiedOn),
    ]),
  );

  return [
    header,
    "-- ─── capabilities ───────────────────────────────────────────────────",
    capSql,
    "-- ─── drug_class_tags ────────────────────────────────────────────────",
    tagSql,
    "-- ─── clinical_concepts (symptom_code → symptom_catalog, 0042/0045) ─",
    conceptSql,
    "-- ─── test_catalogue (the default menu) ──────────────────────────────",
    testSql,
    "-- ─── diagnosis_terms (draft) ────────────────────────────────────────",
    termSql,
  ].join("\n");
}

// ─── test_catalogue rows (0072, and the menu additions of later addenda) ──
const TEST_CATALOGUE_COLS = [
  "id",
  "hospital_id",
  "code",
  "display",
  "kind",
  "components",
  "specimen_type",
  "container",
  "fasting_required",
  "ionising",
  "default_units",
  "in_house",
  "capability_id",
  "turnaround_target_minutes",
  "active",
];
const testRow = (t: Json) => [
  lit(uuidV5(`test_catalogue:${t.id}`)),
  "NULL",
  lit(t.id),
  lit(t.display),
  lit(t.kind),
  arr(t.panelComponents),
  lit(t.specimenType),
  lit(t.container),
  bool(t.fasting_required),
  bool(IONISING_TESTS.has(t.id)),
  jsonb(t.defaultUnits),
  bool(t.in_house),
  lit(t.capability_id),
  t.turnaround_target_minutes == null ? "NULL" : String(t.turnaround_target_minutes),
  bool(t.active),
];

// ─── 0082, 0083: the CFC addenda ─────────────────────────────────────
function buildAddendumSql(src: SeedSources, a: (typeof ADDENDA)[number]): string {
  const add = src[a.key];
  const concepts = [...add.concepts]
    .map((c: Json) => ({ ...c, version: a.version, symptomCode: c.symptomCode ?? null }))
    .sort(byId((c: Json) => c.id));
  const ext = Object.entries((add.answerExtensions ?? {}) as Record<string, string[]>);
  const withCode = concepts.filter((c: Json) => c.symptomCode).length;
  const header = `-- ${a.title}
--
-- GENERATED by scripts/emr/gen-seed.ts from ${SEED_SOURCES[a.key]} (${add.status}, ${add.signedBy},
-- ${add.signedAt}; ${add.signature}). Do not edit: regenerate with \`npx tsx scripts/emr/gen-seed.ts\`;
-- tests/emr/seed.test.ts fails while this file drifts from the data.
--
-- ADDITIVE. Inserts only, ON CONFLICT DO NOTHING; an answer is appended only when absent. A re-run adds
-- nothing and never overwrites a registry row a hospital has since edited.
--   clinical_concepts   ${concepts.length} at ${a.version} (${withCode} carry a symptom_catalog code${ext.length ? `; answers added to ${ext.map(([id]) => id).join(", ")}` : ""})
--
-- GATED: owner-applied (\`npm run db:migrate\`), after 0076 (symptom_code references symptom_catalog codes
-- 0076 adds) and after ${a.key === "v12" ? "0072" : a.key === "v13" ? "0082 (v1.3 reuses v1.2 concepts)" : "0083 and 0085 (v1.5 links terms 0085 seeds)"}. Until it runs, signing keeps these findings in the note only
-- (it charts only concepts present in clinical_concepts).
`;
  const extSql = ext.map(
    ([id, answers]) =>
      answers
        .map(
          (x) =>
            `UPDATE public.clinical_concepts SET answers = array_append(answers, ${lit(x)})\n  WHERE id = ${lit(id)} AND NOT (${lit(x)} = ANY (answers));`,
        )
        .join("\n") + "\n",
  );
  return [
    header,
    "-- ─── clinical_concepts ──────────────────────────────────────────────",
    insert(
      "clinical_concepts",
      CONCEPT_COLS,
      concepts.map((c) => conceptRow(src, c)),
    ),
    ...(extSql.length
      ? ["-- ─── answers added to existing concepts ─────────────────────────────", ...extSql]
      : []),
  ].join("\n");
}

// ─── 0085: the REF-DX-TERMS v1.1 addendum, uncoded (D-SI-26) ─────────
/**
 * Every term with icd11_code NULL and no verified_on, whatever the addendum proposes: no code is
 * read on the WHO browser yet, and an unverified code is never written ("As typed, not coded"). The
 * addendum's ICD-11 status word is kept in `source`, never its proposed code. restricted_class stays
 * in the data file (the table has sensitivity only).
 */
function buildTermsAddendumSql(src: SeedSources): string {
  const add = src.terms11;
  const terms = [...add.terms].sort(byId((t: Json) => t.id));
  const restricted = terms.filter((t: Json) => t.sensitivity === "restricted").length;
  const header = `-- 0085 — REF-DX-TERMS v1.1: the diagnosis terms the Summary and Impression catalogue names, uncoded.
--
-- GENERATED by scripts/emr/gen-seed.ts from ${SEED_SOURCES.terms11}
-- (${add.version}), merged uncoded per docs/emr/clerking-v2/summary-impression/gate-a-proposal.md D-SI-26
-- (GATE A signed 2026-09-28). Do not edit: regenerate with \`npx tsx scripts/emr/gen-seed.ts\`;
-- tests/emr/seed.test.ts fails while this file drifts from the data.
--
-- ADDITIVE. Inserts only, ON CONFLICT DO NOTHING: a re-run adds nothing and never overwrites a term a
-- hospital has since edited (registries are config, audited by 0071's triggers).
--   diagnosis_terms     ${terms.length} (${restricted} restricted; status 'draft' as the addendum carries it)
-- icd11_code is NULL and verified_on NULL on every row: "As typed, not coded" until each code is read on
-- the WHO ICD-11 browser and added by a later migration. No proposed code is written. ICD-10 stays NULL (R9/E6).
-- Keyed uuidV5("diagnosis_terms:" + id) in 0072's namespace, so the diagnosis catalogue's profiles find
-- their terms (D-SI-22). The addendum's restricted_class stays in the data file (the table has sensitivity).
--
-- GATED: owner-applied (\`npm run db:migrate\`), after 0072. Until it runs, these diagnoses can only be
-- typed (uncoded), and the catalogue's profiles for them have no term to key on.
`;
  return [
    header,
    "-- ─── diagnosis_terms (draft, uncoded) ───────────────────────────────",
    insert(
      "diagnosis_terms",
      TERM_COLS,
      terms.map((t: Json) => [
        lit(uuidV5(`diagnosis_terms:${t.id}`)),
        lit(t.display),
        arr(t.synonyms),
        "NULL",
        bool(t.chronic),
        bool(symptomLevel(t.display)),
        lit(t.hmis_category_id),
        lit(t.idsr_class),
        lit(t.sensitivity),
        lit(t.status),
        lit(
          `REF-DX-TERMS ${add.version}: as typed, not coded (ICD-11 ${t.icd11?.status ?? "to-code"})`,
        ),
        "NULL",
      ]),
    ),
  ].join("\n");
}

// ─── 0092: v1.5's diagnosis terms (uncoded) and term → concept links ──
/**
 * v1.5 adds the diagnosis terms the diabetes pack names (uncoded, as 0085: "as typed, not coded") and
 * links each pack term to its condition concept, so a diagnosis picked from REF-DX-TERMS becomes a
 * condition fact an engine can read (Phase 0 Q10). A link is written only where none exists: a re-run,
 * or a hospital's own link, is never overwritten.
 */
function buildV15Extra(src: SeedSources): string {
  const add = src.v15;
  const terms = [...add.termsAdd].sort(byId((t: Json) => t.id));
  const tests = [...(add.testsAdd ?? [])].sort(byId((t: Json) => t.id));
  const links = Object.entries(add.termConcepts as Record<string, string>).sort(([a], [b]) =>
    a < b ? -1 : 1,
  );
  return [
    "-- ─── diagnosis_terms (draft, uncoded) ───────────────────────────────",
    insert(
      "diagnosis_terms",
      TERM_COLS,
      terms.map((t: Json) => [
        lit(uuidV5(`diagnosis_terms:${t.id}`)),
        lit(t.display),
        arr(t.synonyms),
        "NULL",
        bool(t.chronic),
        bool(symptomLevel(t.display)),
        lit(t.hmis_category_id),
        lit(t.idsr_class),
        lit(t.sensitivity),
        lit(t.status),
        lit(`CFC ${add.version}: as typed, not coded (ICD-11 ${t.icd11?.status ?? "to-code"})`),
        "NULL",
      ]),
    ),
    "-- ─── test_catalogue (the default menu; no reference ranges, no turnaround numbers) ─",
    insert("test_catalogue", TEST_CATALOGUE_COLS, tests.map(testRow)),
    "-- ─── term → condition concept links ─────────────────────────────────",
    links
      .map(
        ([term, concept]) =>
          `UPDATE public.diagnosis_terms SET concept_id = ${lit(concept)}\n  WHERE id = ${lit(uuidV5(`diagnosis_terms:${term}`))} AND concept_id IS NULL; -- ${term}`,
      )
      .join("\n") + "\n",
  ].join("\n");
}

// ─── 0086: ICD-11 codes for the v1.1 addendum, read on the WHO API and signed ─
/**
 * Sets icd11_code, verified_on and source on each signed term, and nothing else. A term is touched
 * only while it is still exactly as 0085 left it (no code, never verified), so a re-run changes
 * nothing and a code set since by other means is never overwritten. The held terms get no row.
 */
function buildTermsCodesSql(src: SeedSources): string {
  const data = src.codes11;
  const { release } = data.classification;
  const codes = [...data.codes].sort(byId((c: Json) => c.id));
  const source = (c: Json) => `verified (WHO ICD-11 API, MMS ${release}): ${c.uri}`;
  const header = `-- 0086 — REF-DX-TERMS v1.1: ICD-11 codes for the addendum terms 0085 seeded uncoded.
--
-- GENERATED by scripts/emr/gen-seed.ts from ${SEED_SOURCES.codes11}, signed by the CSO
-- ${data.signed.on} (${data.signed.record}). Do not edit: regenerate with
-- \`npx tsx scripts/emr/gen-seed.ts\`; tests/emr/seed.test.ts fails while this file drifts from the data.
--
-- Each code was resolved on the WHO ICD-11 API (id.who.int) in MMS ${release} on ${data.verified_on}: the
-- code, WHO's title and the entity uri are WHO's own, never typed from memory or a mirror (D-SI-26).
--   coded   ${codes.length} (groups A, B and C of the sign-off record)
--   held    ${data.held.length}, no single honest code; they stay "As typed, not coded" (group D)
-- Sets icd11_code, verified_on and source only. A row is updated only while icd11_code and verified_on
-- are both still NULL, as 0085 left it: a re-run changes nothing. ICD-10 stays NULL (R9/E6).
--
-- GATED: owner-applied (\`npm run db:migrate\`), after 0085. Until it runs, these terms read
-- "As typed, not coded" and are never HMIS-counted.
`;
  const rows = codes.map(
    (c: Json) =>
      `  (${lit(uuidV5(`diagnosis_terms:${c.id}`))}, ${lit(c.code)}, ${lit(source(c))}), -- ${c.id}`,
  );
  rows[rows.length - 1] = rows[rows.length - 1]!.replace(/\), -- /, ")  -- ");
  return [
    header,
    "-- ─── diagnosis_terms: signed ICD-11 codes ───────────────────────────",
    "UPDATE public.diagnosis_terms AS t",
    `SET icd11_code = v.icd11_code, verified_on = DATE ${lit(data.verified_on)}, source = v.source`,
    "FROM (VALUES",
    ...rows,
    ") AS v (id, icd11_code, source)",
    "WHERE t.id = v.id::uuid",
    "  AND t.icd11_code IS NULL",
    "  AND t.verified_on IS NULL;",
    "",
  ].join("\n");
}

// ─── 0095: REF-DX-TERMS v1.2, the terms diagnosis relations need, coded ─
/**
 * The new terms of BRIEF-DX-RELATIONS (ADR 0220): each code read on the WHO ICD-11 API and signed by the
 * CSO before it is written, so the terms are inserted coded (unlike 0085). A held term gets no row.
 */
function buildTermsV12Sql(src: SeedSources): string {
  const data = src.terms12;
  const { release } = data.classification;
  const terms = [...data.terms].sort(byId((t: Json) => t.id));
  const header = `-- 0095 — REF-DX-TERMS v1.2: the diagnosis terms the relations build needs (ADR 0220), coded.
--
-- GENERATED by scripts/emr/gen-seed.ts from ${SEED_SOURCES.terms12}, signed by the CSO
-- ${data.signed.on} (${data.signed.record}). Do not edit: regenerate with
-- \`npx tsx scripts/emr/gen-seed.ts\`; tests/emr/seed.test.ts fails while this file drifts from the data.
--
-- Each code was read on the WHO ICD-11 API (id.who.int) in MMS ${release} on ${data.verified_on}; five
-- replace the proposal's candidate with WHO's own code (see the data file's corrections).
--   diagnosis_terms   ${terms.length} (coded)   held ${data.held.length} (no row: ${data.held.map((h: Json) => h.id).join(", ")})
-- ADDITIVE. Inserts only, ON CONFLICT DO NOTHING: a re-run adds nothing. ICD-10 stays NULL (R9/E6).
-- Keyed uuidV5("diagnosis_terms:" + id) in 0072's namespace.
--
-- GATED: owner-applied (\`npm run db:migrate\`), after 0092.
`;
  return [
    header,
    "-- ─── diagnosis_terms (signed, coded) ────────────────────────────────",
    insert(
      "diagnosis_terms",
      TERM_COLS,
      terms.map((t: Json) => [
        lit(uuidV5(`diagnosis_terms:${t.id}`)),
        lit(t.display),
        arr(t.synonyms),
        lit(t.icd11.code),
        bool(t.chronic),
        bool(symptomLevel(t.display)),
        "NULL",
        "NULL",
        lit(t.sensitivity),
        lit("cso_signed"),
        lit(`verified (WHO ICD-11 API, MMS ${release}, ${t.icd11.match}): ${t.icd11.title}`),
        `DATE ${lit(data.verified_on)}`,
      ]),
    ),
  ].join("\n");
}

// ─── catalogue.generated.ts ──────────────────────────────────────────
function buildTs(src: SeedSources): string {
  const concepts = registryConcepts(src);
  const enums = mergedEnums(src);
  const union = (xs: string[]) =>
    [...new Set(xs)]
      .sort()
      .map((x) => JSON.stringify(x))
      .join(" | ");

  const registry = Object.fromEntries(
    concepts.map((c) => [
      c.id,
      {
        display: c.display,
        kind: c.kind,
        group: c.group,
        valueType: c.valueType,
        canonicalUnit: c.canonicalUnit ?? null,
        acceptedUnits: (c.acceptedUnits ?? []).map((u: Json) => u.unit),
        answers: c.answers ?? null,
        contextRequired: c.contextRequired,
        contextConditional: Object.keys(c.contextConditional ?? {}),
        sensitivity: c.sensitivity,
        sensitivityRule: sensitivityRuleFor(src, c)?.id ?? null,
        lanes: c.lanes,
        phase: c.phase,
        symptomCode: c.symptomCode,
      },
    ]),
  );
  const tags = Object.fromEntries(
    [...src.v1.drugClassTags].sort(byId((t: Json) => t.tag)).map((t: Json) => [
      t.tag,
      {
        display: t.display,
        lanes: t.lanes,
        sensitivity: t.sensitivity,
        routeFilter: t.routeFilter ?? null,
      },
    ]),
  );
  const caps = src.v1.capabilities.map((c: Json) => c.id).sort();
  const sensitivityRuleIds = src.v11.sensitivityRules.map((r: Json) => r.id);
  const minorTerms = [
    ...src.terms.conditionalSensitivity.termIds,
    ...(src.v15.restrictedForMinors ?? []),
  ].sort();

  return `// GENERATED — do not edit. Sources: ${SEED_SOURCES.v1}, ${SEED_SOURCES.v11}, ${SEED_SOURCES.v12}, ${SEED_SOURCES.v13},
// ${SEED_SOURCES.tests}, ${SEED_SOURCES.terms}.
// Regenerate with \`npx tsx scripts/emr/gen-seed.ts\`; tests/emr/seed.test.ts fails while it drifts.
/**
 * The clinical concept registry (CFC v1 ${V1_VERSION} + v1.1 ${V11_VERSION} + v1.2 + v1.3) as a typed const, the
 * same rows 0072, 0082 and 0083 seed into clinical_concepts, drug_class_tags and capabilities. Codes, notes and the conditional-context
 * wording stay in the database and the data files; this carries only what code branches on.
 */

export type ConceptKind = ${union(concepts.map((c) => c.kind))};
export type ValueType = ${union(enums.valueType)};
export type Lane = ${union(Object.keys(src.v1.laneKey))};
export type Sensitivity = ${union(enums.sensitivity)};
/** A rule that restricts a fact at insert time from the patient's age (cfc-v1.1-addendum A3). */
export type SensitivityRuleId = ${union(sensitivityRuleIds)};

export interface ConceptDef {
  readonly display: string;
  readonly kind: ConceptKind;
  readonly group: string;
  readonly valueType: ValueType;
  readonly canonicalUnit: string | null;
  /** Units other than the canonical one that lib/units can convert. */
  readonly acceptedUnits: readonly string[];
  readonly answers: readonly string[] | null;
  readonly contextRequired: readonly string[];
  /** Context keys required only in some situations; the condition text lives in clinical_concepts. */
  readonly contextConditional: readonly string[];
  readonly sensitivity: Sensitivity;
  readonly sensitivityRule: SensitivityRuleId | null;
  readonly lanes: readonly Lane[];
  readonly phase: string;
  /** The clinician symptom_catalog code this finding shares its token with (D-CFC-11 [H]). */
  readonly symptomCode: string | null;
}

export const CONCEPTS = ${JSON.stringify(registry)} as const satisfies Record<string, ConceptDef>;
export type ConceptId = keyof typeof CONCEPTS;

/** CFC v1 enums with the v1.1 additions (incl. the STOP 1 specimen and container extension). */
export const ENUMS = ${JSON.stringify(enums)} as const;

export interface DrugClassTagDef {
  readonly display: string;
  readonly lanes: readonly Lane[];
  readonly sensitivity: Sensitivity;
  /** When set, only these routes count (e.g. systemic glucocorticoids: not topical or inhaled). */
  readonly routeFilter: readonly string[] | null;
}
export const DRUG_CLASS_TAGS = ${JSON.stringify(tags)} as const satisfies Record<string, DrugClassTagDef>;
export type DrugClassTagId = keyof typeof DRUG_CLASS_TAGS;

export const CAPABILITY_IDS = ${JSON.stringify(caps)} as const;
export type CapabilityId = (typeof CAPABILITY_IDS)[number];

/** Terms restricted when the patient is under 18 (D-CFC-09), id → diagnosis_terms.id; the table has no rule column. */
export const DIAGNOSIS_TERMS_RESTRICTED_FOR_MINORS = ${JSON.stringify(
    Object.fromEntries(minorTerms.map((id) => [id, uuidV5(`diagnosis_terms:${id}`)])),
  )} as const;
`;
}

/** The pure core: data in, file contents out. Nothing is written. */
export async function generateSeed(root: string = process.cwd()): Promise<{
  sql: string;
  ts: string;
  sql12: string;
  sql13: string;
  sql85: string;
  sql86: string;
  sql15: string;
  sql95: string;
}> {
  const src = readSeedSources(root);
  const tsPath = join(root, SEED_OUTPUTS.ts);
  const config = (await prettier.resolveConfig(tsPath)) ?? {};
  return {
    sql: buildSql(src),
    sql12: buildAddendumSql(src, ADDENDA[0]),
    sql13: buildAddendumSql(src, ADDENDA[1]),
    sql85: buildTermsAddendumSql(src),
    sql86: buildTermsCodesSql(src),
    sql15: buildAddendumSql(src, ADDENDA[2]) + "\n" + buildV15Extra(src),
    sql95: buildTermsV12Sql(src),
    ts: await prettier.format(buildTs(src), { ...config, filepath: tsPath }),
  };
}

if (process.argv[1]?.endsWith("gen-seed.ts")) {
  const root = process.cwd();
  generateSeed(root).then(({ sql, ts, sql12, sql13, sql85, sql86, sql15, sql95 }) => {
    writeFileSync(join(root, SEED_OUTPUTS.sql), sql);
    writeFileSync(join(root, SEED_OUTPUTS.sql12), sql12);
    writeFileSync(join(root, SEED_OUTPUTS.sql13), sql13);
    writeFileSync(join(root, SEED_OUTPUTS.sql85), sql85);
    writeFileSync(join(root, SEED_OUTPUTS.sql86), sql86);
    writeFileSync(join(root, SEED_OUTPUTS.sql15), sql15);
    writeFileSync(join(root, SEED_OUTPUTS.sql95), sql95);
    writeFileSync(join(root, SEED_OUTPUTS.ts), ts);
    console.log(`wrote ${Object.values(SEED_OUTPUTS).join(", ")}`);
  });
}

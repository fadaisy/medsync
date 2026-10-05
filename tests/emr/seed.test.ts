import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { CAPABILITY_IDS, CONCEPTS, DRUG_CLASS_TAGS, ENUMS } from "@/lib/facts/catalogue.generated";
import {
  allConcepts,
  generateSeed,
  readSeedSources,
  SEED_OUTPUTS,
  uuidV5,
} from "@/scripts/emr/gen-seed";

const root = process.cwd();
const src = readSeedSources(root);
const committed = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("EMR reference seed (0072, 0082, 0083, 0085 + catalogue.generated.ts)", () => {
  it("regenerating from the data reproduces the committed files byte-for-byte", async () => {
    const { sql, ts, sql12, sql13, sql85, sql15 } = await generateSeed(root);
    expect(sql).toBe(committed(SEED_OUTPUTS.sql));
    expect(sql12).toBe(committed(SEED_OUTPUTS.sql12));
    expect(sql13).toBe(committed(SEED_OUTPUTS.sql13));
    expect(sql85).toBe(committed(SEED_OUTPUTS.sql85));
    expect(sql15).toBe(committed(SEED_OUTPUTS.sql15));
    expect(ts).toBe(committed(SEED_OUTPUTS.ts));
  });

  it("carries the signed counts: v1 145/21/29 plus v1.1 59", () => {
    expect(src.v1.concepts).toHaveLength(145);
    expect(src.v1.drugClassTags).toHaveLength(21);
    expect(src.v1.capabilities).toHaveLength(29);
    expect(src.v11.concepts).toHaveLength(59);
    expect(Object.keys(CONCEPTS)).toHaveLength(145 + 59 + 86 + 165 + 10); // + v1.2, v1.3, v1.5 (0082, 0083, 0092)
    expect(Object.keys(DRUG_CLASS_TAGS)).toHaveLength(21);
    expect(CAPABILITY_IDS).toHaveLength(29);
    const sql = committed(SEED_OUTPUTS.sql);
    const rows = (table: string) =>
      sql
        .split(`INSERT INTO public.${table} `)[1]!
        .split("ON CONFLICT")[0]!
        .match(/^ {2}\(/gm)!.length;
    expect([
      rows("clinical_concepts"),
      rows("drug_class_tags"),
      rows("capabilities"),
      rows("test_catalogue"),
      rows("diagnosis_terms"),
    ]).toEqual([204, 21, 29, 35, 85]);
  });

  it("ids are unique within and across registries, and v1.1 never redefines a v1 concept", () => {
    const conceptIds = allConcepts(src).map((c) => c.id);
    const tagIds = src.v1.drugClassTags.map((t: { tag: string }) => t.tag);
    const testIds = src.tests.tests.map((t: { id: string }) => t.id);
    const termIds = src.terms.terms.map((t: { id: string }) => t.id);
    const all = [...conceptIds, ...tagIds, ...CAPABILITY_IDS, ...testIds, ...termIds];
    expect(new Set(all).size).toBe(all.length);
    const uuids = [
      ...testIds.map((id: string) => uuidV5(`test_catalogue:${id}`)),
      ...termIds.map((id: string) => uuidV5(`diagnosis_terms:${id}`)),
    ];
    expect(new Set(uuids).size).toBe(uuids.length);
    const symptomCodes = Object.values(CONCEPTS).flatMap((c) =>
      c.symptomCode ? [c.symptomCode] : [],
    );
    expect(new Set(symptomCodes).size).toBe(symptomCodes.length);
    // addendum B3: 6 v1 + jaundice, oedema; v1.2 adds 49 (M1: a code only when it means exactly the finding)
    expect(symptomCodes).toHaveLength(8 + 49);
  });

  it("the addenda: signed, additive, never redefining an earlier concept, one code one meaning", () => {
    const earlier = new Set(allConcepts(src).map((c) => c.id));
    const v12 = src.v12.concepts.map((c: { id: string }) => c.id);
    const v13 = src.v13.concepts.map((c: { id: string }) => c.id);
    for (const id of [...v12, ...v13]) expect(earlier.has(id), id).toBe(false);
    expect(new Set([...v12, ...v13]).size).toBe(v12.length + v13.length);
    expect([src.v12.status, src.v13.status]).toEqual(["signed", "signed"]);
    expect(src.v12.concepts).toHaveLength(86);
    expect(src.v13.concepts).toHaveLength(165);
    // M1: no concept carries a code the rule lists as a broader screen, a shared code or a narrower one.
    for (const [id] of Object.entries(src.v12.broaderRosScreens as Record<string, string>))
      expect(CONCEPTS[id as keyof typeof CONCEPTS].symptomCode, id).toBeNull();
    expect(CONCEPTS["obs.avpu"].answers).toContain("new_confusion");
    for (const f of [SEED_OUTPUTS.sql12, SEED_OUTPUTS.sql13]) {
      const sql = committed(f);
      expect(sql, f).toMatch(/^-- GATED: owner-applied/m);
      expect(sql, f).not.toMatch(/\b(DELETE|DROP|TRUNCATE|ALTER)\b/);
      expect(sql, f).toMatch(/ON CONFLICT DO NOTHING;/);
    }
  });

  it("every test menu component, capability, specimen and container resolves", () => {
    const caps = new Set<string>(CAPABILITY_IDS);
    for (const t of src.tests.tests) {
      expect(t.panelComponents.length, t.id).toBeGreaterThan(0);
      for (const c of t.panelComponents) expect(CONCEPTS, `${t.id} → ${c}`).toHaveProperty([c]);
      for (const c of Object.keys(t.defaultUnits)) expect(t.panelComponents, t.id).toContain(c);
      if (t.capability_id) expect(caps.has(t.capability_id), t.id).toBe(true);
      if (t.specimenType)
        expect(ENUMS.specimen as readonly string[], t.id).toContain(t.specimenType);
      if (t.container) expect(ENUMS.container as readonly string[], t.id).toContain(t.container);
    }
    expect(ENUMS.specimen).toContain("sputum");
    expect(ENUMS.container).toEqual(
      expect.arrayContaining(["sodium_citrate", "blood_culture_bottle", "sterile_container"]),
    );
  });

  it("no code is exportable unless verified, and no ICD-10 code is set", () => {
    const codes = [
      ...allConcepts(src).flatMap((c) => c.codes),
      ...src.v1.drugClassTags.flatMap((t: { atc: unknown[] }) => t.atc),
    ] as { status: string }[];
    const legend = Object.keys(src.v1.verificationLegend);
    for (const c of codes) expect(legend).toContain(c.status);
    const unverified = codes.filter((c) => !c.status.startsWith("verified"));
    expect(unverified.every((c) => c.status === "candidate")).toBe(true);
    // v1.1 codes are all candidates (addendum A2: 57, 0 verified).
    expect(
      src.v11.concepts
        .flatMap((c: { codes: { status: string }[] }) => c.codes)
        .filter((c: { status: string }) => c.status === "candidate"),
    ).toHaveLength(57);
    // The seed keeps each code's status next to it, so an exporter can filter on it.
    const sql = committed(SEED_OUTPUTS.sql);
    expect(sql.match(/"status":"candidate"/g)!.length).toBe(unverified.length);
    expect(src.terms.terms.every((t: { icd10_who: unknown }) => t.icd10_who === null)).toBe(true);
    expect(sql).not.toContain("icd10_who_code");
  });

  it("diagnosis terms stay draft, and SR-PREG-MINOR reaches every pregnancy concept", () => {
    expect(src.terms.terms.every((t: { status: string }) => t.status === "draft")).toBe(true);
    const ruled = Object.entries(CONCEPTS).filter(([, c]) => c.sensitivityRule === "SR-PREG-MINOR");
    expect(ruled.map(([id]) => id).sort()).toEqual(
      Object.entries(CONCEPTS)
        .filter(([id, c]) => c.kind === "pregnancy" || id === "obs.pregnancy_test")
        .map(([id]) => id)
        .sort(),
    );
    expect(DRUG_CLASS_TAGS.systemic_glucocorticoid.routeFilter).toEqual(["oral", "iv", "im"]);
  });
});

describe("0085: the REF-DX-TERMS v1.1 addendum, uncoded (D-SI-26)", () => {
  type Term = {
    id: string;
    display: string;
    sensitivity: string;
    icd11: { code: string | null; status: string } | null;
  };
  const add: Term[] = src.terms11.terms;
  const sql = committed(SEED_OUTPUTS.sql85);
  const rows = sql.split("\n").filter((l) => l.startsWith("  ("));

  it("seeds all 187 terms, keyed in 0072's namespace, none colliding with REF-DX-TERMS v1", () => {
    expect(add).toHaveLength(187);
    expect(rows).toHaveLength(187);
    const v1 = new Set(src.terms.terms.map((t: { id: string }) => t.id));
    for (const t of add) {
      expect(v1.has(t.id), t.id).toBe(false);
      expect(sql, t.id).toContain(`('${uuidV5(`diagnosis_terms:${t.id}`)}', `);
    }
    const uuids = [...v1, ...add.map((t) => t.id)].map((id) => uuidV5(`diagnosis_terms:${id}`));
    expect(new Set(uuids).size).toBe(uuids.length);
  });

  it("writes no ICD-11 code: every row NULL, and no proposed code appears anywhere", () => {
    for (const r of rows)
      expect(r).toMatch(/^ {2}\('[0-9a-f-]{36}', '(?:[^']|'')*', (?:ARRAY\[.*\]|'\{\}'), NULL, /);
    for (const r of rows) expect(r.endsWith(", NULL),") || r.endsWith(", NULL)")).toBe(true);
    const proposed = add.flatMap((t) => (t.icd11?.code ? [t.icd11.code] : []));
    expect(proposed.length).toBeGreaterThan(0); // the addendum proposes 37, all unverified
    for (const code of proposed) expect(sql, code).not.toContain(`'${code}'`);
    expect(sql).not.toContain("icd10_who_code");
  });

  it("keeps restricted terms restricted, and is additive and GATED", () => {
    const restricted = add.filter((t) => t.sensitivity === "restricted");
    expect(restricted).toHaveLength(15);
    for (const t of restricted) {
      const row = rows.find((r) => r.includes(`'${uuidV5(`diagnosis_terms:${t.id}`)}'`))!;
      expect(row, t.id).toContain(", 'restricted', 'draft', ");
    }
    expect(sql).toMatch(/^-- GATED: owner-applied/m);
    expect(sql).not.toMatch(/\b(DELETE|DROP|TRUNCATE|ALTER|UPDATE)\b/);
    expect(sql).toMatch(/ON CONFLICT DO NOTHING;/);
  });
});

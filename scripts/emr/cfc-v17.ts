/**
 * CFC v1.7 (Lab test menu v2, TM-1; gate-a-proposal §1): the lab catalogue v2 file read as a CFC addendum. Pure:
 * data in, addendum out. The catalogue never renames a v1 id, and nothing here removes a component:
 *   - concepts whose id already exists are kept as they are (ON CONFLICT DO NOTHING; listed in the import report);
 *   - unverified LOINC codes import as `code: null` with a verification note (TM-1);
 *   - an existing test only gains the components the catalogue adds that are defined somewhere (F-4's two held
 *     blood-culture concepts stay held);
 *   - TM-D12: obs.tb_xpert_rif's TRIAL code becomes the ACTIVE one.
 */
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const V17_VERSION = "1.7.0";
export const V17_KEY = "cfc-1.7.0";
export const V17_SOURCE = "docs/lab/test-menu-v2/lab-catalogue-v2.json";

const CLASS: Record<string, string> = {
  hiv: "hiv",
  tb: "tb",
  srh: "sexual_reproductive_health",
  mental_health: "mental_health",
};

/** TM-D12, signed 19 Oct 2026. */
export const V17_CODE_CHANGES: Record<string, { from: string; to: string }> = {
  "obs.tb_xpert_rif": { from: "89372-7", to: "89489-9" },
};

export const UNVERIFIED_NOTE =
  "Unverified on loinc.org at import (catalogue v2, 19 Oct 2026): exported with no code until verified.";

/**
 * `known`: concept ids already in the registry (v1 to v1.6). `existing`: each existing test's current component
 * list (v1.6's list where it changed one, else v1's), and `v1`: its first list. `frozen`: tests another signed
 * pack owns (v1.5's NCD tests): they get the catalogue facts, but their result lists are not touched.
 */
export function fromLabCatalogueV2(
  raw: Json,
  known: ReadonlySet<string>,
  existing: Readonly<Record<string, readonly string[]>>,
  v1: Readonly<Record<string, readonly string[]>>,
  frozen: ReadonlySet<string> = new Set(),
) {
  const tests: Json[] = raw.tests;
  const firstTest = new Map<string, Json>();
  // A result is restricted only when every test that reports it is (Gram stain, AST and the like are shared
  // with unrestricted tests; the order's own class still restricts a restricted test's results, CC-8).
  const open = new Set<string>();
  const inRestricted = new Set<string>();
  for (const t of tests)
    for (const c of t.components as string[]) {
      if (!firstTest.has(c)) firstTest.set(c, t);
      (t.restricted ? inRestricted : open).add(c);
    }
  const restricted = new Set([...inRestricted].filter((c) => !open.has(c)));
  const fresh = (raw.concepts as Json[]).filter((c) => !known.has(c.id));
  const concepts = fresh.map((c) => ({
    id: c.id,
    display: c.display,
    kind: "observation",
    group: firstTest.get(c.id)?.section ?? "laboratory",
    valueType: c.valueType === "text" ? "as_typed" : c.valueType,
    canonicalUnit: c.canonicalUnit ?? null,
    acceptedUnits: [],
    contextRequired: [],
    codes:
      c.loinc.status === "verified"
        ? [{ system: "LOINC", code: c.loinc.code, status: "verified" }]
        : c.loinc.status === "unverified"
          ? [{ system: "LOINC", code: null, status: "unverified", note: UNVERIFIED_NOTE }]
          : [],
    lanes: [],
    sensitivity: restricted.has(c.id) ? "restricted" : "standard",
    phase: "v1.7",
    symptomCode: null,
    ...(c.answers ? { answers: (c.answers as Json[]).map((a) => a.code) } : {}),
  }));
  const defined = new Set([...known, ...fresh.map((c) => c.id)]);
  const testRow = (t: Json) => ({
    id: t.id,
    display: t.display,
    components: t.components as string[],
    section: t.section,
    aliases: t.aliases as string[],
    specimen: t.specimen ?? null,
    tube: t.container ?? null,
    orderLoinc: t.orderLoinc?.verified ? t.orderLoinc.code : null,
    minLevel: t.minLevel,
    levelBasis: t.levelBasis,
    usualRoute: t.usualRoute,
    referTo: t.referTo,
    restrictedClass: t.restricted ? CLASS[t.restricted]! : null,
    kitDependentRanges: !!t.kitDependentRanges,
    advisory: t.advisory ?? null,
    offerByDefault: t.offerByDefault !== false,
  });
  const added = tests.filter((t) => !existing[t.id]).map(testRow);
  const updated = tests.filter((t) => existing[t.id]).map(testRow);
  // An existing test gains only what is new to both its current and its v1 list, and defined.
  const additions: Record<string, string[]> = {};
  const held: { test: string; concept: string; why: string }[] = [];
  for (const t of tests) {
    const now = existing[t.id];
    if (!now) continue;
    for (const c of t.components as string[]) {
      if (now.includes(c) || v1[t.id]?.includes(c)) continue;
      if (!defined.has(c)) held.push({ test: t.id, concept: c, why: "not defined (F-4)" });
      else if (frozen.has(t.id)) held.push({ test: t.id, concept: c, why: "NCD pack test (v1.5)" });
      else (additions[t.id] ??= []).push(c);
    }
  }
  const missing = added.flatMap((t) =>
    t.components.filter((c) => !defined.has(c)).map((c) => ({ test: t.id, concept: c })),
  );
  if (missing.length)
    throw new Error(`v1.7 adds tests with undefined components: ${JSON.stringify(missing)}`);
  const abnormal: Record<string, string[]> = {};
  const otherUnits: Record<string, { unit: string; multiplyBy: number }[]> = {};
  for (const c of fresh) {
    const ab = ((c.answers ?? []) as Json[]).filter((a) => a.abnormal).map((a) => a.code);
    if (ab.length) abnormal[c.id] = ab;
    if (c.otherUnits?.length) otherUnits[c.id] = c.otherUnits;
  }
  return {
    status: "draft",
    signedBy: null,
    signedAt: null,
    signature: `In the product: the laboratory lead and the CSO sign the addendum (CC-1; lab_signed_configs kind 'addendum', key '${V17_KEY}', payload the SHA-256 of ${V17_SOURCE}).`,
    concepts,
    answerExtensions: {},
    canonicalUnitChanges: {},
    kept: (raw.concepts as Json[]).filter((c) => known.has(c.id)).map((c) => c.id as string),
    unverified: (raw.concepts as Json[])
      .filter((c) => c.loinc.status === "unverified")
      .map((c) => c.id as string),
    added,
    updated,
    additions,
    held,
    abnormal,
    otherUnits,
  };
}
export type V17 = ReturnType<typeof fromLabCatalogueV2>;

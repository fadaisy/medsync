import { createHash } from "node:crypto";
import type { DxSignoff } from "./catalogue";

import raw from "@/data/clerking/clerking-diagnosis-catalogue.v1.json";
import signoff from "@/data/clerking/dx-signoff.v1.json";
import PACK_TERMS from "@/data/emr/clinical-fact-concepts.v1.5.json";
import BASE_TERMS from "@/data/emr/diagnosis-terms.v1.json";
import TEST_MENU from "@/data/emr/test-catalogue.v1.json";
import ADD_TERMS from "@/docs/emr/clerking-v2/summary-impression/diagnosis-terms.v1.1-addendum.json";
import { parseDxCatalogue } from "./catalogue";

/** The diagnosis catalogue, parsed and indexed once per process, and its signature. */
export const DX_CATALOGUE = parseDxCatalogue(raw);

const list = (v: unknown): "all" | string[] => (v === "all" ? "all" : (v as string[]));
export const DX_SIGNOFF: DxSignoff & { catalogueSha256: string } = {
  profiles: list(signoff.profiles),
  rules: list(signoff.rules),
  referenceEntries: list(signoff.referenceEntries),
  namedScales: list(signoff.namedScales),
  withheld: signoff.withheld,
  catalogueSha256: signoff.catalogueSha256,
};

// The seed's namespace (scripts/emr/gen-seed.ts): diagnosis_terms rows are keyed by uuidV5 of
// "diagnosis_terms:" + the REF-DX-TERMS id, and have no text key (D-SI-22).
const UUID_NAMESPACE = "b08c11db-6eac-493f-8712-c8642d0d45ae";

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

export const dxTermUuid = (dxId: string) => uuidV5(`diagnosis_terms:${dxId}`);

/** Term uuid → profile id, for every profile (the desk maps a condition's term to its profile). */
export const DX_TERM_IDS: Readonly<Record<string, string>> = Object.fromEntries(
  DX_CATALOGUE.profiles.map((p) => [dxTermUuid(p.id), p.id]),
);

/** Display names by `dx.*` id, from REF-DX-TERMS and its v1.1 addendum (terminology stays owned
 *  there; the catalogue holds none). A term of the addendum is "as typed, not coded" until its
 *  seed migration is applied (D-SI-26). */
export const DX_NAMES: Readonly<
  Record<string, { display: string; restricted: boolean; coded: boolean }>
> = Object.fromEntries([
  ...BASE_TERMS.terms.map((t) => [
    t.id,
    { display: t.display, restricted: t.sensitivity === "restricted", coded: true },
  ]),
  ...ADD_TERMS.terms.map((t) => [
    t.id,
    { display: t.display, restricted: t.sensitivity === "restricted", coded: false },
  ]),
  // The diabetes pack's terms (CFC v1.5 termsAdd, migration 0092): uncoded, as the addendum's.
  ...PACK_TERMS.termsAdd.map((t) => [
    t.id,
    { display: t.display, restricted: t.sensitivity === "restricted", coded: false },
  ]),
]);

/** The catalogue with its term and name maps, as the board reads them (signing, D-SI-06). */
export const DX_INDEX = { cat: DX_CATALOGUE, termIds: DX_TERM_IDS, names: DX_NAMES };

/** The default test menu's names (the hospital's menu decides what can be ordered). */
export const TEST_NAMES: Readonly<Record<string, string>> = Object.fromEntries(
  TEST_MENU.tests.map((t) => [t.id, t.display]),
);

/** Test id → the test_catalogue row's uuid (the seed's key), for "Add to plan". */
export const TEST_UUIDS: Readonly<Record<string, string>> = Object.fromEntries(
  TEST_MENU.tests.map((t) => [t.id, uuidV5(`test_catalogue:${t.id}`)]),
);

/** Test id → specimen type (the default menu), for the Plan's test rows. */
export const TEST_SPECIMENS: Readonly<Record<string, string>> = Object.fromEntries(
  TEST_MENU.tests.flatMap((t) => (t.specimenType ? [[t.id, t.specimenType]] : [])),
);

/** What `/api/clerking/dx-catalogue` serves: the catalogue as signed, the term map and names. */
export const DX_SERVED = {
  catalogue: raw,
  termIds: DX_TERM_IDS,
  names: DX_NAMES,
  tests: TEST_NAMES,
  testIds: TEST_UUIDS,
  specimens: TEST_SPECIMENS,
};

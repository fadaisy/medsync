import { DIAGNOSIS_CATALOG } from "@/lib/clerkship/diagnosis/catalog";
import { ncdCatalog } from "@/lib/clerkship/diagnosis/ncd-catalog";

/**
 * Diagnosis-catalog search — powers the doctor's "select a diagnosis from the
 * catalog" picker. Searches BOTH the maps-derived acute catalog (live) and the
 * NCD catalog (gated — empty until the CSO signs), by name / code / ICD-10.
 * NCDs are surfaced FIRST (the kickoff's prioritisation). Pure; a selection
 * commits through the SAME differential path as a ranked suggestion — never a
 * second record.
 */

export interface CatalogSearchResult {
  code: string;
  display: string;
  icd10: string | null;
  category: "ncd" | "acute";
  mustNotMiss: boolean;
}

const norm = (s: string) => s.trim().toLowerCase();

/** Search the catalogs. Returns [] for a query under 2 chars; NCDs first, capped. */
export function searchCatalog(query: string, limit = 24): CatalogSearchResult[] {
  const q = norm(query);
  if (q.length < 2) return [];

  const matches = (display: string, code: string, icd10: string | null) =>
    norm(display).includes(q) ||
    code.includes(q.replace(/\s+/g, "_")) ||
    (icd10 != null && norm(icd10).includes(q));

  const ncd: CatalogSearchResult[] = ncdCatalog()
    .filter((e) => matches(e.display, e.code, e.icd10))
    .map((e) => ({
      code: e.code,
      display: e.display,
      icd10: e.icd10,
      category: "ncd",
      mustNotMiss: e.mustNotMiss,
    }));

  const acute: CatalogSearchResult[] = DIAGNOSIS_CATALOG.filter((e) =>
    matches(e.display, e.code, e.icd10),
  ).map((e) => ({
    code: e.code,
    display: e.display,
    icd10: e.icd10,
    category: "acute",
    mustNotMiss: e.mustNotMiss,
  }));

  // NCDs first (prioritised), then acute; each already in a stable catalog order.
  return [...ncd, ...acute].slice(0, limit);
}

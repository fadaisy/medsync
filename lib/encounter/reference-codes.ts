/**
 * Curated clinical reference codes — ICD-10 (diagnoses/problems) + LOINC
 * (labs/observations). Kickoff §1/§5: standards alignment as **versioned
 * reference data, sourced — not invented**.
 *
 * This is a CURATED STARTER SUBSET of common codes for a Ugandan general
 * hospital, each verified against its official source (WHO ICD-10; loinc.org).
 * The full code sets are loaded later via an official import (the DB tables in
 * migration 0041 carry the same rows + version/source; this module is the
 * app/UI-side source of truth + the seed origin).
 *
 * Pure + dependency-free (importable by the documentation UI AND the test
 * runner). Codes are coded WHERE codable; free-text remains allowed elsewhere.
 */

export type CodeSystem = "icd10" | "loinc";

export interface ClinicalCode {
  system: CodeSystem;
  code: string;
  display: string;
  /** Optional grouping for the picker (body system / panel). */
  category?: string;
}

export const CODE_SYSTEM_VERSIONS = {
  icd10: { version: "2019", source: "WHO ICD-10 (2019)" },
  loinc: { version: "2.77", source: "LOINC (Regenstrief) — loinc.org" },
} as const;

/** Curated ICD-10 (WHO) — common diagnoses/problems. Verified codes. */
export const ICD10_CODES: ClinicalCode[] = [
  {
    system: "icd10",
    code: "A09",
    display: "Gastroenteritis / diarrhoea, presumed infectious",
    category: "Infectious",
  },
  { system: "icd10", code: "A41.9", display: "Sepsis, unspecified", category: "Infectious" },
  { system: "icd10", code: "B54", display: "Malaria, unspecified", category: "Infectious" },
  {
    system: "icd10",
    code: "B50",
    display: "Plasmodium falciparum malaria",
    category: "Infectious",
  },
  {
    system: "icd10",
    code: "A15",
    display: "Respiratory tuberculosis, confirmed",
    category: "Infectious",
  },
  { system: "icd10", code: "B24", display: "HIV disease, unspecified", category: "Infectious" },
  {
    system: "icd10",
    code: "J18.9",
    display: "Pneumonia, unspecified organism",
    category: "Respiratory",
  },
  {
    system: "icd10",
    code: "J06.9",
    display: "Acute upper respiratory infection, unspecified",
    category: "Respiratory",
  },
  { system: "icd10", code: "J45", display: "Asthma", category: "Respiratory" },
  {
    system: "icd10",
    code: "I10",
    display: "Essential (primary) hypertension",
    category: "Cardiovascular",
  },
  { system: "icd10", code: "I50", display: "Heart failure", category: "Cardiovascular" },
  {
    system: "icd10",
    code: "I63",
    display: "Cerebral infarction (stroke)",
    category: "Neurological",
  },
  { system: "icd10", code: "E11", display: "Type 2 diabetes mellitus", category: "Endocrine" },
  { system: "icd10", code: "D64.9", display: "Anaemia, unspecified", category: "Haematology" },
  {
    system: "icd10",
    code: "N39.0",
    display: "Urinary tract infection, site not specified",
    category: "Renal/GU",
  },
  { system: "icd10", code: "K35", display: "Acute appendicitis", category: "Surgical" },
  { system: "icd10", code: "O15", display: "Eclampsia", category: "Obstetric" },
  { system: "icd10", code: "O80", display: "Single spontaneous delivery", category: "Obstetric" },
  { system: "icd10", code: "S06", display: "Intracranial injury", category: "Injury" },
];

/** Curated LOINC — common labs/observations. Verified against loinc.org. */
export const LOINC_CODES: ClinicalCode[] = [
  {
    system: "loinc",
    code: "718-7",
    display: "Hemoglobin [Mass/volume] in Blood",
    category: "Haematology",
  },
  {
    system: "loinc",
    code: "20570-8",
    display: "Hematocrit [Volume Fraction] of Blood",
    category: "Haematology",
  },
  {
    system: "loinc",
    code: "6690-2",
    display: "Leukocytes (WBC) [#/volume] in Blood",
    category: "Haematology",
  },
  {
    system: "loinc",
    code: "777-3",
    display: "Platelets [#/volume] in Blood",
    category: "Haematology",
  },
  {
    system: "loinc",
    code: "2345-7",
    display: "Glucose [Mass/volume] in Serum or Plasma",
    category: "Chemistry",
  },
  {
    system: "loinc",
    code: "4548-4",
    display: "Hemoglobin A1c / Hemoglobin.total in Blood",
    category: "Chemistry",
  },
  {
    system: "loinc",
    code: "2160-0",
    display: "Creatinine [Mass/volume] in Serum or Plasma",
    category: "Chemistry",
  },
  {
    system: "loinc",
    code: "2951-2",
    display: "Sodium [Moles/volume] in Serum or Plasma",
    category: "Chemistry",
  },
  {
    system: "loinc",
    code: "2823-3",
    display: "Potassium [Moles/volume] in Serum or Plasma",
    category: "Chemistry",
  },
];

const ICD10_BY_CODE = new Map(ICD10_CODES.map((c) => [c.code, c]));
const LOINC_BY_CODE = new Map(LOINC_CODES.map((c) => [c.code, c]));

function normalise(code: string | null | undefined): string {
  return (code ?? "").trim().toUpperCase();
}

export function findIcd10(code: string | null | undefined): ClinicalCode | undefined {
  const key = normalise(code);
  return key ? ICD10_BY_CODE.get(key) : undefined;
}

export function findLoinc(code: string | null | undefined): ClinicalCode | undefined {
  // LOINC codes are case-insensitive digits + a check digit (e.g. 718-7).
  const key = normalise(code);
  return key ? LOINC_BY_CODE.get(key) : undefined;
}

/**
 * Search the curated codes by display text or code prefix. Optionally restrict
 * to one system. An empty query returns nothing (the picker shows its own
 * defaults). Decision-support — the clinician chooses the code.
 */
export function searchClinicalCodes(query: string, system?: CodeSystem): ClinicalCode[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const pool =
    system === "icd10"
      ? ICD10_CODES
      : system === "loinc"
        ? LOINC_CODES
        : [...ICD10_CODES, ...LOINC_CODES];
  return pool.filter(
    (c) => c.display.toLowerCase().includes(q) || c.code.toLowerCase().includes(q),
  );
}

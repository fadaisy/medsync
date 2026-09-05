/**
 * Citation constants for the diabetes catalog.
 *
 * Every one of these was FETCHED during the Phase 0 research
 * (docs/clinical/ncd/diabetes-criteria-research.json) — 205/205 findings carried
 * `fetched: true`, and each was independently re-audited by an agent instructed
 * to refute it. Nothing here is from memory.
 *
 * ── csoSigned is FALSE throughout, deliberately ──────────────────────────────
 * The three policy decisions in the Phase 0 memo are ratified, but no individual
 * threshold has had a formal CSO sign-off pass. The catalog therefore ships
 * gated dark; `validateCatalog` emits a warning (not an error) for each unsigned
 * citation, which is exactly the designed behaviour. Flipping these to true is a
 * deliberate, reviewable act.
 *
 * ── Four corrections the adversarial audit forced ────────────────────────────
 * 1. WHO 2011's confirmatory rule is in Chapter 2's closing paragraphs; the
 *    section name originally cited does not exist in the document.
 * 2. WHO 2011 states the HbA1c cut-point as a percentage ONLY. The 48 mmol/mol
 *    equivalent is NOT in that document and is cited to WHO 2019 / ADA 2026.
 * 3. ADA SOC 2026 Table 16.1 gives pH/bicarbonate with NO venous-vs-arterial
 *    designation; the venous-sampling recommendation belongs to the 2024
 *    consensus report and is cited there.
 * 4. ADA Table 12.1 is an ADAPTED REPRINT of the IWGDF foot stratification,
 *    published with permission. It is NOT independent corroboration and is not
 *    cited as such anywhere below — IWGDF is the sole source for those criteria.
 */
import type { Citation } from "@/lib/ncd/catalog/schema";

const RETRIEVED = "2026-09-05";

const c = (x: Omit<Citation, "csoSigned" | "retrieved">): Citation => ({
  ...x,
  retrieved: RETRIEVED,
  csoSigned: false,
});

/* ── Diagnosis + classification ──────────────────────────────────────────── */

export const ADA_2026_DX = c({
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 2 (Table 2.1 / 2.2)",
  title: "2. Diagnosis and Classification of Diabetes: Standards of Care in Diabetes—2026",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690183/",
  quote:
    "FPG >=126 mg/dL (>=7.0 mmol/L). Fasting is defined as no caloric intake for at least 8 h.",
});

export const WHO_2019_CLASS = c({
  standard: "WHO",
  version: "Classification of diabetes mellitus, 2019",
  title: "Classification of diabetes mellitus. Geneva: World Health Organization; 2019",
  url: "https://iris.who.int/server/api/core/bitstreams/2cb3ab68-a52a-402e-ad47-8bc5a4edc834/content",
});

export const WHO_2006_DX = c({
  standard: "WHO",
  version: "WHO/IDF consultation, 2006",
  title:
    "Definition and diagnosis of diabetes mellitus and intermediate hyperglycaemia (WHO/IDF 2006)",
  url: "https://iris.who.int/server/api/core/bitstreams/ef6a81ae-5db3-4c5c-9136-c047bd8f8344/content",
  quote:
    "Fasting plasma glucose 6.1 to 6.9mmol/l ... and (if measured) 2-h plasma glucose <7.8mmol/l",
});

/** NOTE: percentage cut-point only — this document contains no mmol/mol figure. */
export const WHO_2011_HBA1C = c({
  standard: "WHO",
  version: "WHO 2011 HbA1c consultation, Chapter 2 (closing paragraphs)",
  title: "Use of Glycated Haemoglobin (HbA1c) in the Diagnosis of Diabetes Mellitus (WHO 2011)",
  url: "https://www.ncbi.nlm.nih.gov/books/NBK304271/",
  quote:
    "The diagnosis of diabetes in an asymptomatic person should not be made on the basis of a single abnormal plasma glucose or HbA1c value.",
});

export const IDF_2025_ATLAS = c({
  standard: "IDF",
  version: "IDF Diabetes Atlas, 11th Edition, 2025, Figure 1.1",
  title: "IDF Diabetes Atlas 11th Edition 2025",
  url: "https://media.idf.org/media/uploads/sites/3/2025/10/IDF_Diabetes_Atlas_11th_Edition_2025_WEB.pdf",
});

/* ── HbA1c reliability (Phase 0 decision (a)) ────────────────────────────── */

/**
 * The source that changed the design: interference from haemoglobin variants is
 * ASSAY-SPECIFIC, so "HbA1c is unreliable in sickle-cell trait" is a property of
 * the analyser rather than a clinical fact. Hence `lab.hba1c_ngsp_certified` as
 * a separate declared capability.
 */
export const NGSP_FACTORS = c({
  standard: "local",
  version: "NGSP, 'Factors that interfere with HbA1c test results', page updated 06/2026",
  title: "NGSP: Factors that Interfere with HbA1c Test Results",
  url: "https://ngsp.org/factors.asp",
  quote:
    "Any condition that shortens erythrocyte survival or decreases mean erythrocyte age will falsely lower HbA1c test results.",
});

/* ── Acute emergencies ───────────────────────────────────────────────────── */

export const ADAEASD_2024_CRISES = c({
  standard: "EASD",
  version: "ADA/EASD/JBDS/AACE/DTS consensus report, 2024 (Diabetologia)",
  title: "Hyperglycaemic crises in adults with diabetes: a consensus report",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11343900/",
});

export const ADA_2026_ACUTE = c({
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 16, Table 16.1",
  title: "16. Diabetes Care in the Hospital: Standards of Care in Diabetes—2026",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690180/",
  quote: "pH <7.3 and/or bicarbonate concentration <18 mmol/L",
});

/* ── Diabetic kidney disease ─────────────────────────────────────────────── */

export const KDIGO_2024_CKD = c({
  standard: "KDIGO",
  version: "KDIGO 2024 Clinical Practice Guideline for the Evaluation and Management of CKD",
  title: "KDIGO 2024 CKD Guideline",
  url: "https://kdigo.org/wp-content/uploads/2024/03/KDIGO-2024-CKD-Guideline.pdf",
});

/** Retained specifically for the reagent-strip → albuminuria-category fallback,
 *  which KDIGO 2024 does not restate but which the resource-limited tier needs. */
export const KDIGO_2012_CKD = c({
  standard: "KDIGO",
  version: "KDIGO 2012 CKD Guideline (reagent-strip fallback mapping)",
  title: "KDIGO 2012 Clinical Practice Guideline for the Evaluation and Management of CKD",
  url: "https://kdigo.org/wp-content/uploads/2017/02/KDIGO_2012_CKD_GL.pdf",
});

/* ── Diabetic foot ───────────────────────────────────────────────────────── */

export const IWGDF_2023_PRACTICAL = c({
  standard: "IWGDF",
  version: "IWGDF 2023 Practical Guidelines, Table 1",
  title:
    "IWGDF Practical Guidelines on the prevention and management of diabetes-related foot disease (2023 update)",
  url: "https://iwgdfguidelines.org/wp-content/uploads/2023/07/IWGDF-2023-01-Practical-Guidelines.pdf",
  quote: "Category 0 = no LOPS and no PAD; screening frequency once a year",
});

export const IWGDF_2023_PAD = c({
  standard: "IWGDF",
  version: "IWGDF/ESVS/SVS 2023 PAD Guideline",
  title:
    "The intersocietal IWGDF, ESVS, SVS guidelines on peripheral artery disease in people with diabetes",
  url: "https://iwgdfguidelines.org/wp-content/uploads/2023/07/IWGDF-2023-05-PAD-Guideline.pdf",
});

/* ── Resource-limited tier ───────────────────────────────────────────────── */

export const WHO_HEARTS_D = c({
  standard: "WHO",
  version: "HEARTS-D, WHO 2020 (derived from WHO PEN 2013)",
  title: "HEARTS D: diagnosis and management of type 2 diabetes",
  url: "https://iris.who.int/server/api/core/bitstreams/2a0b4f68-7155-4ad1-b543-945791e31830/content",
});

export const WHO_PEN = c({
  standard: "WHO",
  version: "WHO Package of Essential NCD interventions (PEN), 2020",
  title: "WHO package of essential noncommunicable (PEN) disease interventions",
  url: "https://iris.who.int/server/api/core/bitstreams/b9f09202-a320-4c07-ba2c-afe0d1186339/content",
});

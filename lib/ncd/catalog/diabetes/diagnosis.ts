/**
 * Diabetes — diagnostic criteria and aetiological classification.
 *
 * Two criteria sets, WHO and ADA, because they genuinely differ and the site
 * profile chooses. The thresholds themselves are identical across WHO 2019,
 * ADA 2026 and IDF 2025 — 7.0 / 11.1 / 6.5% — and the disagreement is entirely
 * about CONFIRMATION:
 *
 *   WHO 2019  repeat on a SUBSEQUENT DAY, preferably the same test.
 *   ADA 2026  two abnormal results, which MAY come from one draw (e.g. A1C+FPG).
 *
 * Per the ratified Phase 0 decision (b) the WHO set is the resource-limited
 * default and its stricter rule is encoded as an actual PREDICATE, not merely a
 * flag: a WHO criterion cannot reach `met` until the repeat is recorded. The ADA
 * set carries `requiresConfirmation` so the surface can say so, but does not
 * enforce a second sample, because ADA's same-draw allowance needs
 * cross-criterion logic the schema does not yet express. That limitation is
 * deliberate and recorded rather than silently approximated.
 *
 * Both sets exempt the symptomatic route: a random glucose >= 11.1 mmol/L WITH
 * classic symptoms is diagnostic on a single sample under WHO, ADA and IDF alike.
 */
import type { Classification, CriteriaSet } from "@/lib/ncd/catalog/schema";

import {
  ADA_2026_DX,
  IDF_2025_ATLAS,
  WHO_2011_HBA1C,
  WHO_2019_CLASS,
} from "@/lib/ncd/catalog/diabetes/sources";

/** Classic osmotic symptoms — the ONLY route to a single-sample diagnosis. */
const CLASSIC_SYMPTOMS = [
  { feature: "polyuria", op: "present" as const },
  { feature: "polydipsia", op: "present" as const },
  { feature: "unexplained_weight_loss", op: "present" as const },
];

export const DIAGNOSIS: CriteriaSet[] = [
  {
    id: "who_2019",
    standard: "WHO",
    version: "2019",
    citation: WHO_2019_CLASS,
    anyOf: [
      {
        id: "who_random_symptomatic",
        label:
          "Random plasma glucose ≥ 11.1 mmol/L with classic symptoms of hyperglycaemia — diagnostic on a single sample",
        all: [{ feature: "random_pg", op: ">=", value: 11.1, unit: "mmol/L" }],
        any: CLASSIC_SYMPTOMS,
        citation: WHO_2019_CLASS,
      },
      {
        id: "who_fpg",
        label:
          "Fasting plasma glucose ≥ 7.0 mmol/L, confirmed on a second sample on a subsequent day",
        all: [
          { feature: "fpg", op: ">=", value: 7.0, unit: "mmol/L" },
          { feature: "second_sample_confirms", op: "present" },
        ],
        citation: WHO_2019_CLASS,
      },
      {
        id: "who_ogtt",
        label:
          "2-hour plasma glucose ≥ 11.1 mmol/L on a 75 g OGTT, confirmed on a second sample on a subsequent day",
        all: [
          { feature: "ogtt_2h", op: ">=", value: 11.1, unit: "mmol/L" },
          { feature: "second_sample_confirms", op: "present" },
        ],
        citation: WHO_2019_CLASS,
      },
      {
        // WHO 2011 states the cut-point as a PERCENTAGE only; the 48 mmol/mol
        // equivalence is not in that document (audit finding) and is not used here.
        id: "who_hba1c",
        label:
          "HbA1c ≥ 6.5% on an NGSP-certified assay, confirmed on a second sample. An HbA1c below 6.5% does NOT exclude diabetes diagnosed on glucose.",
        all: [
          { feature: "hba1c", op: ">=", value: 6.5, unit: "%" },
          { feature: "second_sample_confirms", op: "present" },
        ],
        citation: WHO_2011_HBA1C,
      },
    ],
  },
  {
    id: "ada_2026",
    standard: "ADA",
    version: "Standards of Care 2026",
    citation: ADA_2026_DX,
    anyOf: [
      {
        id: "ada_random_symptomatic",
        label:
          "Random plasma glucose ≥ 11.1 mmol/L (≥ 200 mg/dL) with classic symptoms or hyperglycaemic crisis — diagnostic on a single sample",
        all: [{ feature: "random_pg", op: ">=", value: 11.1, unit: "mmol/L" }],
        any: CLASSIC_SYMPTOMS,
        citation: ADA_2026_DX,
      },
      {
        id: "ada_fpg",
        label:
          "Fasting plasma glucose ≥ 7.0 mmol/L (≥ 126 mg/dL), no caloric intake for ≥ 8 h. Needs a second abnormal result, which may be a different test from the same draw.",
        all: [{ feature: "fpg", op: ">=", value: 7.0, unit: "mmol/L" }],
        requiresConfirmation: true,
        citation: ADA_2026_DX,
      },
      {
        id: "ada_ogtt",
        label:
          "2-hour plasma glucose ≥ 11.1 mmol/L (≥ 200 mg/dL) on a 75 g OGTT. Needs a second abnormal result.",
        all: [{ feature: "ogtt_2h", op: ">=", value: 11.1, unit: "mmol/L" }],
        requiresConfirmation: true,
        citation: ADA_2026_DX,
      },
      {
        id: "ada_hba1c",
        label:
          "HbA1c ≥ 6.5% (≥ 48 mmol/mol) on an NGSP-certified, DCCT-standardised assay. Needs a second abnormal result.",
        all: [{ feature: "hba1c", op: ">=", value: 6.5, unit: "%" }],
        requiresConfirmation: true,
        citation: ADA_2026_DX,
      },
    ],
  },
  {
    id: "idf_2025",
    standard: "IDF",
    version: "Diabetes Atlas 11th Edition, 2025",
    citation: IDF_2025_ATLAS,
    anyOf: [
      {
        id: "idf_random_symptomatic",
        label:
          "Random plasma glucose ≥ 11.1 mmol/L with polyuria, polydipsia and unexplained weight loss",
        all: [{ feature: "random_pg", op: ">=", value: 11.1, unit: "mmol/L" }],
        any: CLASSIC_SYMPTOMS,
        citation: IDF_2025_ATLAS,
      },
      {
        id: "idf_fpg",
        label: "Fasting plasma glucose ≥ 7.0 mmol/L; two abnormal tests required if asymptomatic",
        all: [
          { feature: "fpg", op: ">=", value: 7.0, unit: "mmol/L" },
          { feature: "second_sample_confirms", op: "present" },
        ],
        citation: IDF_2025_ATLAS,
      },
    ],
  },
];

/**
 * Aetiological classification, WHO 2019 as the primary axis.
 *
 * Every entry is gated on a DISCRIMINATING TEST — C-peptide or islet
 * autoantibodies — and never on phenotype alone. Where those are unavailable,
 * which is the common case globally, the engine returns `unclassified` by
 * design. That is the ratified position: an inferred type drives real insulin
 * decisions, so a guess is worse than an honest blank.
 *
 * NOT MODELLED, deliberately (Phase 0 memo §4):
 *  • type 5 / malnutrition-related diabetes — IDF endorsed it in 2025, WHO
 *    dropped MRDM in 1999 for lack of evidence, ADA has no such category, and
 *    IDF concedes no diagnostic criteria exist yet.
 *  • LADA / slowly evolving immune-mediated diabetes of adults — a distinct WHO
 *    hybrid category but subsumed under type 1 by ADA. Needs the ADA-mapping
 *    field the memo describes before it can be stored without ambiguity.
 */
export const CLASSIFICATIONS: Classification[] = [
  {
    code: "type_1",
    display: "Type 1 diabetes",
    citation: WHO_2019_CLASS,
    discriminators: ["islet_autoantibodies", "c_peptide"],
    supportedBy: [
      {
        id: "t1_autoantibodies",
        label: "Islet autoantibodies positive",
        all: [{ feature: "islet_autoantibodies", op: "==", value: "positive" }],
        citation: WHO_2019_CLASS,
      },
      {
        id: "t1_c_peptide",
        label: "Low C-peptide, indicating insulin deficiency",
        all: [{ feature: "c_peptide", op: "==", value: "low" }],
        citation: WHO_2019_CLASS,
      },
    ],
  },
  {
    code: "type_2",
    display: "Type 2 diabetes",
    citation: WHO_2019_CLASS,
    discriminators: ["islet_autoantibodies", "c_peptide"],
    supportedBy: [
      {
        id: "t2_preserved_c_peptide",
        label: "Preserved C-peptide with negative islet autoantibodies",
        all: [{ feature: "islet_autoantibodies", op: "==", value: "negative" }],
        any: [
          { feature: "c_peptide", op: "==", value: "normal" },
          { feature: "c_peptide", op: "==", value: "high" },
        ],
        citation: WHO_2019_CLASS,
      },
    ],
    refutedBy: [
      {
        id: "t2_refuted_by_antibodies",
        label: "Islet autoantibodies positive",
        all: [{ feature: "islet_autoantibodies", op: "==", value: "positive" }],
        citation: WHO_2019_CLASS,
      },
    ],
  },
  {
    // A WHO 2019 hybrid form kept because the management implication is specific
    // and safety-relevant: insulin at presentation, then planned reassessment for
    // withdrawal. Recognising it prevents lifelong insulin by default.
    code: "ketosis_prone_type_2",
    display: "Ketosis-prone type 2 diabetes",
    citation: WHO_2019_CLASS,
    discriminators: ["islet_autoantibodies", "c_peptide"],
    supportedBy: [
      {
        id: "kpt2_course",
        label: "Presented with ketosis and insulin deficiency, but later did not require insulin",
        all: [
          { feature: "ketosis_at_presentation", op: "present" },
          { feature: "insulin_withdrawn_later", op: "present" },
        ],
        citation: WHO_2019_CLASS,
      },
    ],
  },
];

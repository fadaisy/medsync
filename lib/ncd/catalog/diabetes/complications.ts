/**
 * Diabetes complications — acute emergencies and chronic organ damage.
 *
 * `acute` entries are evaluated by an always-on interlock regardless of whether
 * the form is being used for a new presentation or an annual review, and they
 * carry an `emergency` action that routes OUT to the resuscitation pathway. They
 * are not checklist rows. A chronic profile that quietly accepts a glucose of 32
 * with ketones is worse than no profile at all.
 *
 * Thresholds follow the ADA/EASD/JBDS/AACE/DTS 2024 consensus, which changed
 * several numbers from older teaching — most consequentially the DKA glucose
 * threshold, LOWERED from > 13.9 mmol/L (250 mg/dL) to ≥ 11.1 (200 mg/dL), and
 * with prior diabetes qualifying at ANY glucose. Anyone carrying the old numbers
 * in their head will under-call DKA.
 */
import type { Complication } from "@/lib/ncd/catalog/schema";

import {
  ADA_2026_ACUTE,
  ADAEASD_2024_CRISES,
  IWGDF_2023_PAD,
  IWGDF_2023_PRACTICAL,
  KDIGO_2012_CKD,
  KDIGO_2024_CKD,
  WHO_PEN,
} from "@/lib/ncd/catalog/diabetes/sources";

/* ── acute ───────────────────────────────────────────────────────────────── */

const DKA: Complication = {
  code: "dka",
  display: "Diabetic ketoacidosis",
  timing: "acute",
  citation: ADAEASD_2024_CRISES,
  screenedBy: ["bohb", "urine_ketones", "venous_ph", "bicarbonate", "capillary_glucose"],
  emergency: {
    severity: "red",
    action:
      "Hyperglycaemic emergency — begin emergency management and escalate now. Do not continue the routine review.",
    citation: ADAEASD_2024_CRISES,
  },
  establishedBy: [
    {
      id: "dka_bohb",
      label:
        "Ketosis (β-hydroxybutyrate ≥ 3.0 mmol/L) with acidosis (pH < 7.3 or bicarbonate < 18 mmol/L), in known diabetes or glucose ≥ 11.1 mmol/L",
      all: [{ feature: "bohb", op: ">=", value: 3.0, unit: "mmol/L" }],
      any: [
        { feature: "venous_ph", op: "<", value: 7.3, unit: "pH" },
        { feature: "bicarbonate", op: "<", value: 18, unit: "mmol/L" },
      ],
      citation: ADAEASD_2024_CRISES,
    },
    {
      // Urine ketones are an explicit FALLBACK, not the preferred test: they
      // underestimate early DKA and overestimate late DKA, and give false
      // positives with sulfhydryl drugs such as captopril.
      id: "dka_urine_ketones",
      label:
        "Urine ketones ≥ 2+ with acidosis (pH < 7.3 or bicarbonate < 18 mmol/L) — fallback where blood ketones are unavailable",
      all: [{ feature: "urine_ketones", op: "in", value: ["2plus", "3plus"] }],
      any: [
        { feature: "venous_ph", op: "<", value: 7.3, unit: "pH" },
        { feature: "bicarbonate", op: "<", value: 18, unit: "mmol/L" },
      ],
      citation: ADAEASD_2024_CRISES,
    },
  ],
  staging: [
    {
      id: "dka_severity",
      display: "DKA severity",
      standard: "EASD",
      version: "ADA/EASD 2024 consensus, Table 2",
      citation: ADAEASD_2024_CRISES,
      stages: [
        {
          code: "severe",
          display: "Severe",
          severity: "critical",
          when: {
            id: "dka_sev",
            label:
              "β-hydroxybutyrate > 6.0 mmol/L, pH < 7.0, bicarbonate < 10 mmol/L, or stupor/coma",
            any: [
              { feature: "bohb", op: ">", value: 6.0, unit: "mmol/L" },
              { feature: "venous_ph", op: "<", value: 7.0, unit: "pH" },
              { feature: "bicarbonate", op: "<", value: 10, unit: "mmol/L" },
              { feature: "mental_status", op: "in", value: ["stupor", "coma"] },
            ],
            citation: ADAEASD_2024_CRISES,
          },
        },
        {
          code: "moderate",
          display: "Moderate",
          severity: "severe",
          when: {
            id: "dka_mod",
            label: "pH 7.0–7.25 or bicarbonate 10 to < 15 mmol/L",
            any: [
              { feature: "venous_ph", op: "<=", value: 7.25, unit: "pH" },
              { feature: "bicarbonate", op: "<", value: 15, unit: "mmol/L" },
            ],
            citation: ADAEASD_2024_CRISES,
          },
        },
        {
          code: "mild",
          display: "Mild",
          severity: "moderate",
          when: {
            id: "dka_mild",
            label: "pH > 7.25 to < 7.30 or bicarbonate 15–18 mmol/L, alert",
            any: [
              { feature: "venous_ph", op: "<", value: 7.3, unit: "pH" },
              { feature: "bicarbonate", op: "<", value: 18, unit: "mmol/L" },
            ],
            citation: ADAEASD_2024_CRISES,
          },
        },
      ],
    },
  ],
};

const HHS: Complication = {
  code: "hhs",
  display: "Hyperosmolar hyperglycaemic state",
  timing: "acute",
  citation: ADAEASD_2024_CRISES,
  screenedBy: [
    "capillary_glucose",
    "effective_osmolality",
    "total_osmolality",
    "bohb",
    "venous_ph",
  ],
  emergency: {
    severity: "red",
    action:
      "Hyperglycaemic emergency — begin emergency management and escalate now. Do not continue the routine review.",
    citation: ADAEASD_2024_CRISES,
  },
  establishedBy: [
    {
      // Altered mental status was REMOVED as a diagnostic criterion in 2024,
      // though a change in cognition remains a common presenting feature.
      id: "hhs_effective",
      label:
        "Glucose ≥ 33.3 mmol/L with effective osmolality > 300 mOsm/kg, without significant ketosis or acidosis",
      all: [
        { feature: "random_pg", op: ">=", value: 33.3, unit: "mmol/L" },
        { feature: "effective_osmolality", op: ">", value: 300, unit: "mOsm/kg" },
        { feature: "bohb", op: "<", value: 3.0, unit: "mmol/L" },
        { feature: "bicarbonate", op: ">=", value: 15, unit: "mmol/L" },
      ],
      citation: ADA_2026_ACUTE,
    },
    {
      id: "hhs_total",
      label:
        "Glucose ≥ 33.3 mmol/L with total osmolality > 320 mOsm/kg, without significant ketosis or acidosis",
      all: [
        { feature: "random_pg", op: ">=", value: 33.3, unit: "mmol/L" },
        { feature: "total_osmolality", op: ">", value: 320, unit: "mOsm/kg" },
        { feature: "bohb", op: "<", value: 3.0, unit: "mmol/L" },
        { feature: "bicarbonate", op: ">=", value: 15, unit: "mmol/L" },
      ],
      citation: ADA_2026_ACUTE,
    },
  ],
};

const HYPOGLYCAEMIA: Complication = {
  code: "hypoglycaemia",
  display: "Hypoglycaemia",
  timing: "acute",
  citation: ADA_2026_ACUTE,
  screenedBy: ["capillary_glucose", "needed_third_party_help"],
  emergency: {
    severity: "red",
    action: "Treat hypoglycaemia now and recheck. Do not continue the routine review.",
    citation: ADA_2026_ACUTE,
  },
  establishedBy: [
    {
      id: "hypo_level2",
      label: "Level 2 — glucose < 3.0 mmol/L (clinically significant)",
      any: [
        { feature: "capillary_glucose", op: "<", value: 3.0, unit: "mmol/L" },
        { feature: "random_pg", op: "<", value: 3.0, unit: "mmol/L" },
      ],
      citation: ADA_2026_ACUTE,
    },
    {
      id: "hypo_level1",
      label: "Level 1 — glucose < 3.9 mmol/L (alert value)",
      any: [
        { feature: "capillary_glucose", op: "<", value: 3.9, unit: "mmol/L" },
        { feature: "random_pg", op: "<", value: 3.9, unit: "mmol/L" },
      ],
      citation: ADA_2026_ACUTE,
    },
    {
      // Level 3 is defined by SEVERITY, not by a number — a severe event
      // requiring third-party assistance, irrespective of the glucose value.
      id: "hypo_level3",
      label: "Level 3 — severe event requiring third-party assistance, at any glucose value",
      all: [{ feature: "needed_third_party_help", op: "present" }],
      citation: ADA_2026_ACUTE,
    },
  ],
};

/* ── chronic ─────────────────────────────────────────────────────────────── */

const DKD: Complication = {
  code: "diabetic_kidney_disease",
  display: "Diabetic kidney disease",
  timing: "chronic",
  citation: KDIGO_2024_CKD,
  screenedBy: ["egfr", "urine_acr", "urine_protein_strip"],
  screeningIntervals: [{ months: 12, citation: KDIGO_2024_CKD }],
  establishedBy: [
    {
      id: "dkd_albuminuria",
      label: "ACR ≥ 3 mg/mmol (≥ 30 mg/g) persisting for at least 3 months",
      all: [
        { feature: "urine_acr", op: ">=", value: 3, unit: "mg/mmol" },
        { feature: "kidney_abnormality_3_months", op: "present" },
      ],
      requiresConfirmation: true,
      citation: KDIGO_2024_CKD,
    },
    {
      id: "dkd_egfr",
      label: "eGFR < 60 mL/min/1.73m² persisting for at least 3 months",
      all: [
        { feature: "egfr", op: "<", value: 60, unit: "mL/min/1.73m2" },
        { feature: "kidney_abnormality_3_months", op: "present" },
      ],
      requiresConfirmation: true,
      citation: KDIGO_2024_CKD,
    },
  ],
  staging: [
    {
      id: "kdigo_gfr",
      display: "KDIGO GFR category",
      standard: "KDIGO",
      version: "KDIGO 2024",
      citation: KDIGO_2024_CKD,
      stages: [
        {
          code: "G5",
          display: "G5 — kidney failure (< 15)",
          severity: "critical",
          when: {
            id: "g5",
            label: "eGFR < 15",
            all: [{ feature: "egfr", op: "<", value: 15, unit: "mL/min/1.73m2" }],
            citation: KDIGO_2024_CKD,
          },
        },
        {
          code: "G4",
          display: "G4 — severely decreased (15–29)",
          severity: "severe",
          when: {
            id: "g4",
            label: "eGFR < 30",
            all: [{ feature: "egfr", op: "<", value: 30, unit: "mL/min/1.73m2" }],
            citation: KDIGO_2024_CKD,
          },
        },
        {
          code: "G3b",
          display: "G3b — moderately to severely decreased (30–44)",
          severity: "moderate",
          when: {
            id: "g3b",
            label: "eGFR < 45",
            all: [{ feature: "egfr", op: "<", value: 45, unit: "mL/min/1.73m2" }],
            citation: KDIGO_2024_CKD,
          },
        },
        {
          code: "G3a",
          display: "G3a — mildly to moderately decreased (45–59)",
          severity: "moderate",
          when: {
            id: "g3a",
            label: "eGFR < 60",
            all: [{ feature: "egfr", op: "<", value: 60, unit: "mL/min/1.73m2" }],
            citation: KDIGO_2024_CKD,
          },
        },
        {
          code: "G2",
          display: "G2 — mildly decreased (60–89)",
          severity: "mild",
          when: {
            id: "g2",
            label: "eGFR < 90",
            all: [{ feature: "egfr", op: "<", value: 90, unit: "mL/min/1.73m2" }],
            citation: KDIGO_2024_CKD,
          },
        },
        {
          code: "G1",
          display: "G1 — normal or high (≥ 90)",
          severity: "none",
          when: {
            id: "g1",
            label: "eGFR ≥ 90",
            all: [{ feature: "egfr", op: ">=", value: 90, unit: "mL/min/1.73m2" }],
            citation: KDIGO_2024_CKD,
          },
        },
      ],
    },
    {
      id: "kdigo_albuminuria",
      display: "KDIGO albuminuria category",
      standard: "KDIGO",
      version: "KDIGO 2024",
      citation: KDIGO_2024_CKD,
      stages: [
        {
          code: "A3",
          display: "A3 — severely increased (ACR ≥ 30 mg/mmol)",
          severity: "severe",
          when: {
            id: "a3",
            label: "ACR ≥ 30 mg/mmol (≥ 300 mg/g)",
            all: [{ feature: "urine_acr", op: ">=", value: 30, unit: "mg/mmol" }],
            citation: KDIGO_2024_CKD,
          },
        },
        {
          code: "A2",
          display: "A2 — moderately increased (ACR 3–30 mg/mmol)",
          severity: "moderate",
          when: {
            id: "a2",
            label: "ACR ≥ 3 mg/mmol (≥ 30 mg/g)",
            all: [{ feature: "urine_acr", op: ">=", value: 3, unit: "mg/mmol" }],
            citation: KDIGO_2024_CKD,
          },
        },
        {
          code: "A1",
          display: "A1 — normal to mildly increased (ACR < 3 mg/mmol)",
          severity: "none",
          when: {
            id: "a1",
            label: "ACR < 3 mg/mmol (< 30 mg/g)",
            all: [{ feature: "urine_acr", op: "<", value: 3, unit: "mg/mmol" }],
            citation: KDIGO_2024_CKD,
          },
        },
      ],
    },
    {
      /**
       * The resource-limited pathway. KDIGO 2024 does not restate this mapping;
       * it is carried forward from KDIGO 2012 because WHO PEN specifies annual
       * proteinuria testing where quantitative ACR is unavailable, and without
       * it a site with only dipsticks can never stage albuminuria at all.
       * Reagent strips are semiquantitative and unstandardised between
       * manufacturers, so a positive must still be confirmed quantitatively.
       */
      id: "kdigo_dipstick_fallback",
      display: "Albuminuria category from protein reagent strip (fallback)",
      standard: "KDIGO",
      version: "KDIGO 2012 mapping; WHO PEN pathway",
      citation: KDIGO_2012_CKD,
      stages: [
        {
          code: "A3_strip",
          display: "A3 equivalent — 1+ or greater",
          severity: "severe",
          when: {
            id: "a3s",
            label: "Protein strip 1+ or greater",
            all: [{ feature: "urine_protein_strip", op: "in", value: ["1plus", "2plus", "3plus"] }],
            citation: KDIGO_2012_CKD,
          },
        },
        {
          code: "A2_strip",
          display: "A2 equivalent — trace",
          severity: "moderate",
          when: {
            id: "a2s",
            label: "Protein strip trace",
            all: [{ feature: "urine_protein_strip", op: "==", value: "trace" }],
            citation: KDIGO_2012_CKD,
          },
        },
        {
          code: "A1_strip",
          display: "A1 equivalent — negative",
          severity: "none",
          when: {
            id: "a1s",
            label: "Protein strip negative",
            all: [{ feature: "urine_protein_strip", op: "==", value: "neg" }],
            citation: WHO_PEN,
          },
        },
      ],
    },
  ],
};

const FOOT: Complication = {
  code: "diabetic_foot",
  display: "Diabetes-related foot disease",
  timing: "chronic",
  citation: IWGDF_2023_PRACTICAL,
  screenedBy: [
    "lops",
    "lops_ipswich",
    "pedal_pulses",
    "abi",
    "pad",
    "foot_deformity",
    "active_foot_ulcer",
  ],
  screeningIntervals: [
    { months: 12, forStage: "iwgdf_0", citation: IWGDF_2023_PRACTICAL },
    { months: 6, forStage: "iwgdf_1", citation: IWGDF_2023_PRACTICAL },
    { months: 3, forStage: "iwgdf_2", citation: IWGDF_2023_PRACTICAL },
    { months: 1, forStage: "iwgdf_3", citation: IWGDF_2023_PRACTICAL },
  ],
  establishedBy: [
    {
      id: "foot_active_ulcer",
      label: "Active foot ulcer",
      all: [{ feature: "active_foot_ulcer", op: "present" }],
      citation: IWGDF_2023_PRACTICAL,
    },
    {
      id: "foot_lops_or_pad",
      label: "Loss of protective sensation or peripheral artery disease",
      any: [
        { feature: "lops", op: "==", value: "present" },
        { feature: "lops_ipswich", op: "==", value: "present" },
        { feature: "pad", op: "==", value: "present" },
      ],
      citation: IWGDF_2023_PRACTICAL,
    },
  ],
  staging: [
    {
      /**
       * IWGDF is the SOLE source for these criteria. ADA Table 12.1 reproduces
       * them but is an adapted reprint published with permission — it is NOT
       * independent corroboration, and the Phase 0 audit caught that claim.
       *
       * The screening intervals above carry an explicit expert-opinion caveat in
       * the source; they are not evidence-derived.
       */
      id: "iwgdf_risk",
      display: "IWGDF foot ulcer risk category",
      standard: "IWGDF",
      version: "IWGDF 2023 Practical Guidelines, Table 1",
      citation: IWGDF_2023_PRACTICAL,
      stages: [
        {
          code: "iwgdf_3",
          display: "Category 3 — high risk",
          severity: "severe",
          when: {
            id: "iw3",
            label:
              "Loss of protective sensation or PAD, PLUS a previous foot ulcer, a previous lower-extremity amputation, or end-stage renal disease",
            any: [
              { feature: "lops", op: "==", value: "present" },
              { feature: "lops_ipswich", op: "==", value: "present" },
              { feature: "pad", op: "==", value: "present" },
            ],
            atLeast: {
              n: 1,
              of: [
                { feature: "prior_foot_ulcer", op: "present" },
                { feature: "prior_amputation", op: "present" },
                { feature: "esrd", op: "present" },
              ],
            },
            citation: IWGDF_2023_PRACTICAL,
          },
        },
        {
          code: "iwgdf_2",
          display: "Category 2 — moderate risk",
          severity: "moderate",
          when: {
            id: "iw2",
            label:
              "Any two of: loss of protective sensation, peripheral artery disease, foot deformity",
            atLeast: {
              n: 2,
              of: [
                { feature: "lops", op: "==", value: "present" },
                { feature: "pad", op: "==", value: "present" },
                { feature: "foot_deformity", op: "present" },
              ],
            },
            citation: IWGDF_2023_PRACTICAL,
          },
        },
        {
          code: "iwgdf_1",
          display: "Category 1 — low risk",
          severity: "mild",
          when: {
            id: "iw1",
            label: "Loss of protective sensation or peripheral artery disease",
            any: [
              { feature: "lops", op: "==", value: "present" },
              { feature: "lops_ipswich", op: "==", value: "present" },
              { feature: "pad", op: "==", value: "present" },
            ],
            citation: IWGDF_2023_PRACTICAL,
          },
        },
        {
          code: "iwgdf_0",
          display: "Category 0 — very low risk",
          severity: "none",
          when: {
            id: "iw0",
            label: "No loss of protective sensation and no peripheral artery disease",
            all: [
              { feature: "lops", op: "==", value: "absent" },
              { feature: "pad", op: "==", value: "absent" },
            ],
            citation: IWGDF_2023_PAD,
          },
        },
      ],
    },
  ],
};

export const COMPLICATIONS: Complication[] = [DKA, HHS, HYPOGLYCAEMIA, DKD, FOOT];

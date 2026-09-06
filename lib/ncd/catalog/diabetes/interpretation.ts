/**
 * How to read a glycaemic number — the bands behind the interpretation table.
 *
 * ── The disagreement this file exists to show ────────────────────────────────
 * The DIABETES thresholds are the same everywhere: fasting 7.0 mmol/L, 2-hour
 * 11.1, HbA1c 6.5%. The INTERMEDIATE band is where the standards part company,
 * and not by accident:
 *
 *   ADA  impaired fasting glucose starts at 5.6 mmol/L (100 mg/dL)
 *   WHO  impaired fasting glucose starts at 6.1 mmol/L (110 mg/dL)
 *
 * WHO did not overlook the lower cut-point; it considered it and declined, in
 * Recommendation 4, "based on concerns about the significant increase in IFG
 * prevalence which would occur with lowering the cut-point and the impact on
 * individuals and health systems". A form that showed one number would be
 * telling a district clinic that a quarter more of its patients have a condition
 * — a claim WHO explicitly refused to make.
 *
 * So the table follows the site's declared standard, and says which it applied.
 *
 * ── HbA1c under WHO ──────────────────────────────────────────────────────────
 * WHO accepts HbA1c >= 6.5% to DIAGNOSE but publishes no intermediate HbA1c
 * band. That is recorded as a `note` and rendered as a stated gap, rather than
 * being quietly filled in with ADA's 5.7-6.4 — which is the same borrowing this
 * whole file exists to refuse.
 *
 * ── A band is not a verdict ──────────────────────────────────────────────────
 * `tone: "diagnostic"` means the number meets the standard's threshold. It does
 * NOT mean the patient has diabetes: confirmation on a second sample, the HbA1c
 * validity caveats, and the standard in force all bear on that, and `diagnose()`
 * remains the only thing that adjudicates.
 */
import type { InterpretationTable, ResultBand } from "@/lib/ncd/catalog/schema";

import { ADA_2026_DX, WHO_2006_DX } from "@/lib/ncd/catalog/diabetes/sources";

const RETRIEVED = "2026-09-06";

/** ADA Standards of Care 2026, Table 2.2 — the prediabetes definitions. */
const ADA_PREDIABETES = {
  ...ADA_2026_DX,
  version: "Standards of Care in Diabetes—2026, Section 2 (Table 2.2)",
  retrieved: RETRIEVED,
  quote:
    "A1C 5.7–6.4% (39–47 mmol/mol) OR FPG 100 mg/dL (5.6 mmol/L) to 125 mg/dL (6.9 mmol/L) (IFG) OR 2-h PG during 75-g OGTT 140 mg/dL (7.8 mmol/L) to 199 mg/dL (11.0 mmol/L) (IGT)",
};

/** WHO/IDF 2006 — intermediate hyperglycaemia, and the cut-point WHO kept. */
const WHO_IFG = {
  ...WHO_2006_DX,
  retrieved: RETRIEVED,
  quote:
    "The fasting plasma glucose cut-point for Impaired Fasting Glucose (IFG) should remain at 6.1mmol/l. This decision was based on concerns about the significant increase in IFG prevalence which would occur with lowering the cut-point and the impact on individuals and health systems.",
};

const WHO_IGT = {
  ...WHO_2006_DX,
  retrieved: RETRIEVED,
  quote:
    "Impaired Glucose tolerance (IGT) Fasting plasma glucose 2–h plasma glucose* <7.0mmol/l (126mg/dl) and ≥7.8 and <11.1mmol/l (140mg/dl and 200mg/dl)",
};

const normal = (to: number, display = "Not diabetes"): ResultBand => ({
  code: "normal",
  display,
  to,
  tone: "normal",
});

const diagnostic = (from: number): ResultBand => ({
  code: "diagnostic",
  display: "Diabetes range",
  from,
  tone: "diagnostic",
});

export const INTERPRETATION: InterpretationTable[] = [
  /* ── fasting plasma glucose — the one that differs ────────────────────── */
  {
    id: "fpg_ada",
    feature: "fpg",
    standard: "ADA",
    version: "Standards of Care in Diabetes—2026",
    citation: ADA_PREDIABETES,
    bands: [
      normal(5.6),
      {
        code: "intermediate",
        display: "Prediabetes (IFG)",
        from: 5.6,
        to: 7.0,
        tone: "intermediate",
      },
      diagnostic(7.0),
    ],
  },
  {
    id: "fpg_who",
    feature: "fpg",
    standard: "WHO",
    version: "WHO/IDF 2006",
    citation: WHO_IFG,
    note: "WHO keeps the impaired-fasting-glucose cut-point at 6.1 mmol/L, having considered 5.6 and declined it.",
    bands: [
      normal(6.1),
      {
        code: "intermediate",
        display: "Impaired fasting glucose",
        from: 6.1,
        to: 7.0,
        tone: "intermediate",
      },
      diagnostic(7.0),
    ],
  },

  /* ── 2-hour OGTT — the standards agree here ───────────────────────────── */
  {
    id: "ogtt_ada",
    feature: "ogtt_2h",
    standard: "ADA",
    version: "Standards of Care in Diabetes—2026",
    citation: ADA_PREDIABETES,
    bands: [
      normal(7.8),
      {
        code: "intermediate",
        display: "Prediabetes (IGT)",
        from: 7.8,
        to: 11.1,
        tone: "intermediate",
      },
      diagnostic(11.1),
    ],
  },
  {
    id: "ogtt_who",
    feature: "ogtt_2h",
    standard: "WHO",
    version: "WHO/IDF 2006",
    citation: WHO_IGT,
    bands: [
      normal(7.8),
      {
        code: "intermediate",
        display: "Impaired glucose tolerance",
        from: 7.8,
        to: 11.1,
        tone: "intermediate",
      },
      diagnostic(11.1),
    ],
  },

  /* ── HbA1c — ADA bands it, WHO does not ───────────────────────────────── */
  {
    id: "hba1c_ada",
    feature: "hba1c",
    standard: "ADA",
    version: "Standards of Care in Diabetes—2026",
    citation: ADA_PREDIABETES,
    bands: [
      normal(5.7),
      { code: "intermediate", display: "Prediabetes", from: 5.7, to: 6.5, tone: "intermediate" },
      diagnostic(6.5),
    ],
  },
  {
    id: "hba1c_who",
    feature: "hba1c",
    standard: "WHO",
    version: "WHO 2011",
    citation: {
      ...WHO_2006_DX,
      version: "WHO 2011 (HbA1c) — no intermediate band published",
      retrieved: RETRIEVED,
      needsCsoInput:
        "WHO accepts HbA1c >= 6.5% to diagnose but publishes no prediabetes HbA1c range. The absence is recorded rather than filled from ADA. CSO to confirm the current WHO position.",
    },
    note: "WHO publishes no intermediate HbA1c band. A value below 6.5% is not classified here.",
    bands: [normal(6.5, "Below the diagnostic threshold"), diagnostic(6.5)],
  },

  /* ── random plasma glucose ────────────────────────────────────────────── */
  {
    id: "random_ada",
    feature: "random_pg",
    standard: "ADA",
    version: "Standards of Care in Diabetes—2026",
    citation: ADA_2026_DX,
    note: "A random glucose has no intermediate band — below the threshold it excludes nothing, and a fasting glucose or HbA1c is still needed.",
    bands: [normal(11.1, "Not diagnostic — does not exclude diabetes"), diagnostic(11.1)],
  },
];

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

import {
  ADA_S10_BP,
  REFERENCE_RANGE,
  WHO_BMI,
  WHO_WAIST,
} from "@/lib/ncd/catalog/diabetes/examination";
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

/**
 * Hypoglycaemia. ADA Table 6.4 puts the in-range floor at 3.9 mmol/L, level 1
 * hypoglycaemia at 3.0–3.8 and level 2 — "clinically significant" — below 3.0.
 *
 * ONE band rather than two, on purpose: two hypo columns would sit empty on
 * every row that has no low band (HbA1c, the OGTT) and buy a distinction the
 * alert already makes in words. The level-2 threshold is carried in the alert
 * and the note, where it changes what someone does.
 */
const ADA_HYPO = {
  standard: "ADA" as const,
  version: "Standards of Care in Diabetes, Section 6 (Table 6.4)",
  title: "6. Glycemic Goals and Hypoglycemia",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC10725808/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "TBR: % of readings and time 54–69 mg/dL (3.0–3.8 mmol/L) Level 1 hypoglycemia … TBR: % of readings and time <54 mg/dL (<3.0 mmol/L) Level 2 hypoglycemia",
};

const low = (): ResultBand => ({
  code: "low",
  display: "Hypoglycaemia",
  to: 3.9,
  tone: "low",
});

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
      low(),
      { ...normal(5.6), from: 3.9 },
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
      low(),
      { ...normal(6.1), from: 3.9 },
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
    bands: [
      low(),
      { ...normal(11.1, "Not diagnostic — does not exclude diabetes"), from: 3.9 },
      diagnostic(11.1),
    ],
  },

  /* ── capillary glucose — the bedside test, and what it can honestly say ── */
  {
    /**
     * A capillary sample CANNOT diagnose diabetes: the standards define the
     * thresholds on venous plasma, and this catalog's criteria say so. What a
     * bedside glucose is genuinely for is finding a hypo, which is why it gets a
     * table at all and why that table has no diagnostic band.
     *
     * The upper band is therefore open and says what it means — not low, and not
     * a diagnosis either.
     */
    id: "capillary_hypo",
    feature: "capillary_glucose",
    standard: "ADA",
    version: "Standards of Care in Diabetes, Section 6",
    citation: ADA_HYPO,
    note: "A capillary glucose can find a hypoglycaemia but cannot diagnose diabetes — the thresholds are defined on venous plasma.",
    bands: [
      low(),
      {
        code: "normal",
        display: "Not low — not diagnostic either",
        from: 3.9,
        tone: "normal",
      },
    ],
  },

  /* ── body mass index — WHO's classes ──────────────────────────────────── */
  {
    /**
     * The tone vocabulary is borrowed, not the meaning: `low` is underweight,
     * `diagnostic` is obesity. The column headings below say so, because a BMI
     * under a heading reading "Diabetes range" would be nonsense.
     *
     * WHO's classes are the ones every other body's cut-points are read
     * against — and the note carries the caveat that matters most for a product
     * that is not built for one continent.
     */
    id: "bmi_who",
    feature: "bmi",
    standard: "WHO",
    version: "WHO fact sheet",
    citation: WHO_BMI,
    note: "WHO's own expert consultation records LOWER action points for Asian populations (23 and 27.5). These classes are the international default, not a universal one.",
    toneLabels: {
      low: "Underweight",
      normal: "Healthy weight",
      intermediate: "Overweight",
      diagnostic: "Obesity",
    },
    bands: [
      { code: "underweight", display: "Underweight", to: 18.5, tone: "low" },
      { code: "normal", display: "Healthy weight", from: 18.5, to: 25, tone: "normal" },
      { code: "overweight", display: "Overweight", from: 25, to: 30, tone: "intermediate" },
      { code: "obese", display: "Obesity", from: 30, tone: "diagnostic" },
    ],
  },

  /* ── blood pressure — ADA's target and its two triggers ───────────────── */
  {
    /**
     * Two tables, one per limb, because ADA's trigger is EITHER of them: a
     * patient at 128/94 qualifies for treatment on the diastolic alone, and a
     * single combined band could not say that.
     */
    id: "bp_systolic_ada",
    feature: "bp_systolic",
    standard: "ADA",
    version: "Standards of Care, Section 10",
    citation: ADA_S10_BP,
    toneLabels: {
      normal: "At target",
      intermediate: "Above target",
      diagnostic: "Treat promptly",
    },
    bands: [
      { code: "at_target", display: "At target", to: 130, tone: "normal" },
      {
        code: "above_target",
        display: "Qualifies for treatment",
        from: 130,
        to: 150,
        tone: "intermediate",
      },
      { code: "prompt", display: "Prompt initiation", from: 150, tone: "diagnostic" },
    ],
  },
  {
    id: "bp_diastolic_ada",
    feature: "bp_diastolic",
    standard: "ADA",
    version: "Standards of Care, Section 10",
    citation: ADA_S10_BP,
    toneLabels: {
      normal: "At target",
      intermediate: "Above target",
      diagnostic: "Treat promptly",
    },
    bands: [
      { code: "at_target", display: "At target", to: 80, tone: "normal" },
      {
        code: "above_target",
        display: "Qualifies for treatment",
        from: 80,
        to: 90,
        tone: "intermediate",
      },
      { code: "prompt", display: "Prompt initiation", from: 90, tone: "diagnostic" },
    ],
  },

  /* ── waist circumference — two scales, not one ────────────────────────── */
  {
    /**
     * Gated on the recorded sex, because these are DIFFERENT NUMBERS rather than
     * one scale with an adjustment. Without the gate the surface would have to
     * print one sex's cut-points as if they were everyone's — and the sex is
     * prefilled from the patient record, so the gate costs the clinician nothing.
     *
     * The note carries what is still unrecorded: IDF's thresholds are LOWER for
     * several populations, and this catalog has no ethnicity to select on.
     */
    id: "waist_male_who",
    feature: "waist_cm",
    when: { feature: "sex", op: "==", value: "male" },
    standard: "WHO",
    version: "WHO expert consultation",
    citation: WHO_WAIST,
    note: "Europid cut-points. IDF publishes lower thresholds for South Asian, Chinese and Japanese populations, and no ethnicity is recorded here.",
    toneLabels: {
      normal: "No added risk",
      intermediate: "Increased risk",
      diagnostic: "Substantially increased",
    },
    bands: [
      { code: "normal", display: "No added risk", to: 94, tone: "normal" },
      { code: "increased", display: "Increased risk", from: 94, to: 102, tone: "intermediate" },
      { code: "substantial", display: "Substantially increased", from: 102, tone: "diagnostic" },
    ],
  },
  {
    id: "waist_female_who",
    feature: "waist_cm",
    when: { feature: "sex", op: "==", value: "female" },
    standard: "WHO",
    version: "WHO expert consultation",
    citation: WHO_WAIST,
    note: "Europid cut-points. IDF publishes lower thresholds for South Asian, Chinese and Japanese populations, and no ethnicity is recorded here.",
    toneLabels: {
      normal: "No added risk",
      intermediate: "Increased risk",
      diagnostic: "Substantially increased",
    },
    bands: [
      { code: "normal", display: "No added risk", to: 80, tone: "normal" },
      { code: "increased", display: "Increased risk", from: 80, to: 88, tone: "intermediate" },
      { code: "substantial", display: "Substantially increased", from: 88, tone: "diagnostic" },
    ],
  },

  /* ── the other vitals — standard adult reference ranges ───────────────── */
  {
    /**
     * The ordinary adult reference range, NOT an early-warning score.
     *
     * NEWS2 was the first thing reached for and it is the wrong instrument
     * here: it scores DETERIORATION for escalation, so its bands answer "how
     * close is this patient to needing a review" rather than "is this pulse
     * normal". A clerkship is asking the second question, and a table headed
     * with NEWS2 points would read as an acuity call the clerkship is not
     * making. The triage surface still uses NEWS2, where it belongs.
     */
    id: "pulse_reference",
    feature: "pulse",
    standard: "local",
    version: "Adult reference range",
    citation: REFERENCE_RANGE,
    toneLabels: {
      low: "Low",
      normal: "Normal",
      intermediate: "Raised",
      diagnostic: "Markedly raised",
    },
    // Orange, not the glucose green: prediabetes is a risk state the patient
    // lives in, a raised pulse is a number that is off right now.
    toneColors: { intermediate: "orange" },
    bands: [
      { code: "low", display: "Bradycardia", to: 60, tone: "low" },
      { code: "normal", display: "Normal", from: 60, to: 100, tone: "normal" },
      { code: "raised", display: "Tachycardia", from: 100, to: 130, tone: "intermediate" },
      { code: "marked", display: "Marked tachycardia", from: 130, tone: "diagnostic" },
    ],
  },
  {
    id: "rr_reference",
    feature: "respiratory_rate",
    standard: "local",
    version: "Adult reference range",
    citation: REFERENCE_RANGE,
    toneLabels: {
      low: "Low",
      normal: "Normal",
      intermediate: "Raised",
      diagnostic: "Markedly raised",
    },
    // Orange, not the glucose green: prediabetes is a risk state the patient
    // lives in, a raised pulse is a number that is off right now.
    toneColors: { intermediate: "orange" },
    bands: [
      { code: "low", display: "Bradypnoea", to: 12, tone: "low" },
      { code: "normal", display: "Normal", from: 12, to: 20, tone: "normal" },
      { code: "raised", display: "Tachypnoea", from: 20, to: 30, tone: "intermediate" },
      { code: "marked", display: "Marked tachypnoea", from: 30, tone: "diagnostic" },
    ],
  },
  {
    /**
     * REVISED. The first version put hypothermia below 36 °C, which is wrong:
     * hypothermia is defined below 35.0, and 35.0–36.0 is a low temperature in a
     * patient who is not hypothermic. The top boundary was 39.5, which is not a
     * defined threshold at all — hyperpyrexia is 41.0.
     */
    id: "temperature_reference",
    feature: "temperature",
    standard: "local",
    version: "Adult reference range",
    citation: REFERENCE_RANGE,
    // The generic headings, so temperature shares a table with the pulse and the
    // respiratory rate — the CELLS still read Hypothermia, Fever and High fever,
    // so nothing is lost and there is one table fewer to scan.
    toneLabels: {
      low: "Low",
      normal: "Normal",
      intermediate: "Raised",
      diagnostic: "Markedly raised",
    },
    // Orange, not the glucose green: prediabetes is a risk state the patient
    // lives in, a raised pulse is a number that is off right now.
    toneColors: { intermediate: "orange" },
    note: "Hypothermia is defined below 35.0 °C — 35.0–36.0 is low, not hypothermic. Fever is conventionally ≥38.0 °C; 37.5–38.0 is low-grade and sits in the fever band here rather than earning a fifth column.",
    bands: [
      { code: "low", display: "Hypothermia", to: 35, tone: "low" },
      { code: "normal", display: "Normal", from: 35, to: 37.5, tone: "normal" },
      { code: "fever", display: "Fever", from: 37.5, to: 41, tone: "intermediate" },
      { code: "hyperpyrexia", display: "Hyperpyrexia", from: 41, tone: "diagnostic" },
    ],
  },
  {
    /**
     * Inverted, and the band model does not mind: a saturation is worse the
     * LOWER it goes, so the severe band is the open low end rather than the open
     * high one. The bands still tile the line, which is all the engine asks.
     */
    id: "spo2_reference",
    feature: "spo2",
    standard: "local",
    version: "Adult reference range, breathing air",
    citation: REFERENCE_RANGE,
    note: "Breathing air. A patient on oxygen, or on a hypercapnic target of 88–92%, is read against a different range that this table does not apply.",
    toneLabels: { diagnostic: "Severe", intermediate: "Low", normal: "Normal" },
    toneColors: { intermediate: "orange" },
    bands: [
      { code: "severe", display: "Severe hypoxaemia", to: 90, tone: "diagnostic" },
      { code: "low", display: "Hypoxaemia", from: 90, to: 94, tone: "intermediate" },
      { code: "normal", display: "Normal", from: 94, tone: "normal" },
    ],
  },
];

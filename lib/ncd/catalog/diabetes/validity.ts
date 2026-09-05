/**
 * When an HbA1c result cannot be trusted — Phase 0 decision (a), as data.
 *
 * The ratified policy has three parts, and all three are expressed here rather
 * than in engine code:
 *
 * 1. HbA1c may DIAGNOSE only on an NGSP-certified, DCCT-standardised assay. That
 *    is enforced by the `lab.hba1c_ngsp_certified` capability being separate
 *    from `lab.hba1c`, so a site with a machine but no certification simply
 *    cannot reach the HbA1c criterion.
 *
 * 2. Where an interfering condition is recorded, plasma glucose must be used
 *    instead — `blocksDiagnosis: true` with an explicit `alternative`.
 *
 * 3. The flag states a DIRECTION, because a bare "unreliable" leaves the
 *    clinician unable to tell which error they are looking at:
 *      masks         falsely LOW — may hide diabetes that is present
 *      manufactures  falsely HIGH — may create diabetes that is not there
 *
 * The subtlety that drove the design: NGSP states variant interference is
 * ASSAY-SPECIFIC, not universal. "HbA1c is unreliable in sickle-cell trait" is a
 * property of the analyser, not a clinical fact. So a KNOWN variant blocks
 * diagnosis conservatively, and an UNKNOWN variant status in a high-prevalence
 * population is itself a caveat rather than a silent assumption of absence.
 */
import type { ValidityCaveat } from "@/lib/ncd/catalog/schema";

import {
  ADA_2026_DX,
  KDIGO_2024_CKD,
  NGSP_FACTORS,
  WHO_2011_HBA1C,
} from "@/lib/ncd/catalog/diabetes/sources";

const USE_GLUCOSE = "Use fasting or 2-hour plasma glucose criteria instead of HbA1c.";

export const VALIDITY_CAVEATS: ValidityCaveat[] = [
  {
    id: "hba1c_shortened_rbc_survival",
    feature: "hba1c",
    label:
      "Shortened red-cell survival — haemolysis, current or recent malaria, or transfusion within 3 months — falsely LOWERS HbA1c and may mask diabetes",
    direction: "masks",
    blocksDiagnosis: true,
    alternative: USE_GLUCOSE,
    citation: NGSP_FACTORS,
    when: {
      id: "shortened_rbc",
      label: "Haemolysis, malaria, or transfusion in the last 3 months",
      any: [
        { feature: "haemolysis", op: "present" },
        { feature: "malaria_current", op: "present" },
        { feature: "recent_transfusion", op: "present" },
      ],
      citation: NGSP_FACTORS,
    },
  },
  {
    id: "hba1c_iron_deficiency",
    feature: "hba1c",
    label:
      "Iron deficiency falsely RAISES HbA1c and may manufacture a diagnosis that is not there — treat the deficiency first",
    direction: "manufactures",
    blocksDiagnosis: true,
    alternative: USE_GLUCOSE,
    citation: NGSP_FACTORS,
    when: {
      id: "iron_def",
      label: "Iron deficiency",
      all: [{ feature: "iron_deficiency", op: "present" }],
      citation: NGSP_FACTORS,
    },
  },
  {
    /**
     * Direction is `unpredictable` on purpose: NGSP is explicit that variant
     * interference depends on the assay method, so neither a falsely high nor a
     * falsely low result can be promised. For HbSS, HbCC and HbSC it recommends
     * glycated serum protein or glycated albumin instead.
     */
    id: "hba1c_haemoglobin_variant",
    feature: "hba1c",
    label:
      "A haemoglobin variant is present. Interference is ASSAY-SPECIFIC — the direction of error depends on which analyser the laboratory runs",
    direction: "unpredictable",
    blocksDiagnosis: true,
    alternative:
      "Use plasma glucose criteria. Where available, glycated albumin or glycated serum protein is recommended for monitoring in HbSS, HbCC and HbSC.",
    citation: NGSP_FACTORS,
    when: {
      id: "hb_variant",
      label: "Known haemoglobin variant",
      all: [
        {
          feature: "haemoglobin_variant",
          op: "in",
          value: ["hbs_trait", "hbss", "hbc", "hbe", "thalassaemia"],
        },
      ],
      citation: NGSP_FACTORS,
    },
  },
  {
    /**
     * Fail safe. Not knowing the variant status is NOT the same as knowing there
     * is none, and in high-prevalence populations the difference matters. This
     * caveat does not block diagnosis — it surfaces the assumption so the
     * clinician can decide, rather than the tool deciding silently.
     */
    id: "hba1c_variant_status_unknown",
    feature: "hba1c",
    label:
      "Haemoglobin variant status is not known. In a high-prevalence population an HbA1c-based diagnosis rests on an untested assumption",
    direction: "unpredictable",
    blocksDiagnosis: false,
    citation: WHO_2011_HBA1C,
    when: {
      id: "hb_variant_unknown",
      label: "Haemoglobin variant status not known",
      all: [{ feature: "haemoglobin_variant", op: "==", value: "unknown" }],
      citation: WHO_2011_HBA1C,
    },
  },
  {
    id: "hba1c_anaemia",
    feature: "hba1c",
    label: "Anaemia alters the HbA1c–glycaemia relationship",
    direction: "unpredictable",
    blocksDiagnosis: true,
    alternative: USE_GLUCOSE,
    citation: ADA_2026_DX,
    when: {
      id: "anaemia_present",
      label: "Anaemia",
      all: [{ feature: "anaemia", op: "present" }],
      citation: ADA_2026_DX,
    },
  },
  {
    id: "hba1c_erythropoietin",
    feature: "hba1c",
    label: "Erythropoietin therapy alters red-cell turnover and the HbA1c–glycaemia relationship",
    direction: "masks",
    blocksDiagnosis: true,
    alternative: USE_GLUCOSE,
    citation: ADA_2026_DX,
    when: {
      id: "epo",
      label: "Erythropoietin therapy",
      all: [{ feature: "erythropoietin", op: "present" }],
      citation: ADA_2026_DX,
    },
  },
  {
    id: "hba1c_hiv_art",
    feature: "hba1c",
    label:
      "HIV on antiretroviral therapy — ADA directs screening with fasting plasma glucose rather than HbA1c around therapy changes",
    direction: "unpredictable",
    blocksDiagnosis: true,
    alternative: "Screen with fasting plasma glucose.",
    citation: ADA_2026_DX,
    when: {
      id: "hiv_art",
      label: "HIV on antiretroviral therapy",
      all: [{ feature: "hiv_on_art", op: "present" }],
      citation: ADA_2026_DX,
    },
  },
  {
    id: "hba1c_pregnancy",
    feature: "hba1c",
    label: "HbA1c is not reliable for diagnosis from 15 weeks of gestation onward",
    direction: "unpredictable",
    blocksDiagnosis: true,
    alternative: USE_GLUCOSE,
    citation: ADA_2026_DX,
    when: {
      id: "pregnancy",
      label: "Pregnant",
      all: [{ feature: "pregnant", op: "present" }],
      citation: ADA_2026_DX,
    },
  },
  {
    /**
     * KDIGO is explicit that HbA1c more commonly UNDERestimates than
     * overestimates glycaemia in advanced CKD, and has low reliability on
     * dialysis. It finds no advantage in glycated albumin or fructosamine and
     * points to CGM instead — which is generally unavailable in the settings
     * this catalog targets, so the alternative here stays plasma glucose.
     */
    id: "hba1c_dialysis",
    feature: "hba1c",
    label: "On dialysis — HbA1c has low reliability and more often underestimates glycaemia",
    direction: "masks",
    blocksDiagnosis: true,
    alternative: USE_GLUCOSE,
    citation: KDIGO_2024_CKD,
    when: {
      id: "dialysis",
      label: "On dialysis",
      all: [{ feature: "on_dialysis", op: "present" }],
      citation: KDIGO_2024_CKD,
    },
  },
];

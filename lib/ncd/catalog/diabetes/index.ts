/**
 * The diabetes catalog — v0, first vertical slice.
 *
 * IN SCOPE: diagnosis (WHO / ADA / IDF), aetiological classification, the three
 * acute emergencies, diabetic kidney disease and diabetes-related foot disease.
 *
 * NOT YET: retinopathy, neuropathy beyond the foot, cardiovascular risk,
 * glycaemic targets and the management ladder. The Phase 0 research covers all
 * of them — they are data-file work against this same schema, deliberately left
 * until the engine and surfaces are proven end to end on two complications
 * chosen to be maximally unalike (one lab-driven, one purely clinical).
 *
 * Every citation in this catalog is `csoSigned: false`. `validateCatalog` warns
 * on each, which is the designed behaviour: the catalog ships GATED DARK until a
 * formal sign-off pass. Nothing here has been ratified threshold-by-threshold.
 */
import type { NcdCatalog, SiteProfile } from "@/lib/ncd/catalog/schema";

import { COMPLICATION_SYMPTOM_FEATURES } from "@/lib/ncd/catalog/diabetes/complication-symptoms";
import { COMPLICATIONS } from "@/lib/ncd/catalog/diabetes/complications";
import { DIABETES_CONDITIONS } from "@/lib/ncd/catalog/diabetes/conditions";
import { CLASSIFICATIONS, DIAGNOSIS } from "@/lib/ncd/catalog/diabetes/diagnosis";
import { ABDOMEN_FEATURES } from "@/lib/ncd/catalog/diabetes/exam-abdomen";
import { AGE_SPECIFIC_FEATURES } from "@/lib/ncd/catalog/diabetes/exam-age-specific";
import { AUTOIMMUNE_FEATURES } from "@/lib/ncd/catalog/diabetes/exam-autoimmune";
import { CNS_FEATURES } from "@/lib/ncd/catalog/diabetes/exam-cns";
import { EYE_FEATURES } from "@/lib/ncd/catalog/diabetes/exam-eyes";
import { FOOT_EXAM_FEATURES } from "@/lib/ncd/catalog/diabetes/exam-foot";
import { MSK_FEATURES } from "@/lib/ncd/catalog/diabetes/exam-msk";
import { NEUROPATHY_FEATURES } from "@/lib/ncd/catalog/diabetes/exam-neuropathy";
import { SKIN_FEATURES } from "@/lib/ncd/catalog/diabetes/exam-skin";
import { VITALS_EXTRA_FEATURES } from "@/lib/ncd/catalog/diabetes/exam-vitals";
import { EXAMINATION_FEATURES } from "@/lib/ncd/catalog/diabetes/examination";
import { CAPABILITIES, FEATURES, SECTIONS } from "@/lib/ncd/catalog/diabetes/features";
import { GENERAL_EXAM_FEATURES } from "@/lib/ncd/catalog/diabetes/general-exam";
import { HBA1C_EVIDENCE_FEATURES, ORDERABLES } from "@/lib/ncd/catalog/diabetes/hba1c-evidence";
import { INTERPRETATION } from "@/lib/ncd/catalog/diabetes/interpretation";
import { ACUTE_RULES } from "@/lib/ncd/catalog/diabetes/rules-acute";
import { AETIOLOGY_RULES } from "@/lib/ncd/catalog/diabetes/rules-aetiology";
import { FOOT_RULES } from "@/lib/ncd/catalog/diabetes/rules-foot";
import { SYMPTOM_FEATURES } from "@/lib/ncd/catalog/diabetes/symptoms";
import { THERAPY_FLAGS } from "@/lib/ncd/catalog/diabetes/therapy-flags";
import { VALIDITY_CAVEATS } from "@/lib/ncd/catalog/diabetes/validity";

export const DIABETES_CATALOG: NcdCatalog = {
  id: "diabetes",
  display: "Diabetes mellitus",
  version: "0.1.0",
  capabilities: CAPABILITIES,
  sections: SECTIONS,
  features: [
    ...FEATURES,
    ...SYMPTOM_FEATURES,
    ...COMPLICATION_SYMPTOM_FEATURES,
    ...HBA1C_EVIDENCE_FEATURES,
    ...EXAMINATION_FEATURES,
    ...GENERAL_EXAM_FEATURES,
    /* The examination build-out (ADR 0083), one file per domain. */
    ...VITALS_EXTRA_FEATURES,
    ...CNS_FEATURES,
    ...NEUROPATHY_FEATURES,
    ...FOOT_EXAM_FEATURES,
    ...SKIN_FEATURES,
    ...MSK_FEATURES,
    ...EYE_FEATURES,
    ...ABDOMEN_FEATURES,
    ...AUTOIMMUNE_FEATURES,
    ...AGE_SPECIFIC_FEATURES,
  ],
  diagnosis: DIAGNOSIS,
  classifications: CLASSIFICATIONS,
  complications: COMPLICATIONS,
  validityCaveats: VALIDITY_CAVEATS,
  therapyFlags: THERAPY_FLAGS,
  interpretation: INTERPRETATION,
  orderables: ORDERABLES,
  /* The examination discrimination layer (ADR 0083). */
  conditions: DIABETES_CONDITIONS,
  rules: [...ACUTE_RULES, ...FOOT_RULES, ...AETIOLOGY_RULES],
};

/* ── Reference site profiles ─────────────────────────────────────────────── */

/**
 * A well-resourced referral centre. ADA takes precedence, and the fuller
 * pathway (quantitative ACR, blood ketones, fundoscopy) is available.
 */
export const REFERRAL_SITE: SiteProfile = {
  id: "referral",
  display: "Referral hospital",
  standardPreference: ["ADA", "WHO", "IDF"],
  available: [
    "device.glucometer",
    "device.monofilament",
    "device.doppler_abi",
    // A well-resourced centre is where a biothesiometer would be, if anywhere.
    // The district profile deliberately lacks it, so the reading reads as
    // unobtainable there rather than as a gap someone failed to close.
    "device.biothesiometer",
    "lab.glucose",
    "lab.hba1c",
    "lab.hba1c_ngsp_certified",
    "lab.ketones_blood",
    "lab.ketones_urine",
    "lab.blood_gas",
    "lab.electrolytes",
    "lab.creatinine",
    "lab.urine_acr",
    "lab.urine_dipstick",
    "imaging.fundus",
  ],
};

/**
 * A district-level clinic on the WHO PEN pathway: glucose and creatinine, urine
 * and ketone strips, a monofilament — and no HbA1c, no quantitative ACR, no
 * blood gas, no fundus camera.
 *
 * This profile is what the honesty rules are FOR. Under it the engine must
 * reach a diagnosis on plasma glucose rather than nagging for an HbA1c that
 * cannot be run, must stage albuminuria from the dipstick fallback, and must
 * return `unclassified` rather than guessing a diabetes type.
 */
export const DISTRICT_SITE: SiteProfile = {
  id: "district",
  display: "District clinic (WHO PEN tier)",
  standardPreference: ["WHO", "IDF", "ADA"],
  available: [
    "device.glucometer",
    "device.monofilament",
    "lab.glucose",
    "lab.ketones_urine",
    "lab.creatinine",
    "lab.urine_dipstick",
  ],
};

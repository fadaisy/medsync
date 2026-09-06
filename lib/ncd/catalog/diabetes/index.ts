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
import { CLASSIFICATIONS, DIAGNOSIS } from "@/lib/ncd/catalog/diabetes/diagnosis";
import { CAPABILITIES, FEATURES, SECTIONS } from "@/lib/ncd/catalog/diabetes/features";
import { INTERPRETATION } from "@/lib/ncd/catalog/diabetes/interpretation";
import { SYMPTOM_FEATURES } from "@/lib/ncd/catalog/diabetes/symptoms";
import { THERAPY_FLAGS } from "@/lib/ncd/catalog/diabetes/therapy-flags";
import { VALIDITY_CAVEATS } from "@/lib/ncd/catalog/diabetes/validity";

export const DIABETES_CATALOG: NcdCatalog = {
  id: "diabetes",
  display: "Diabetes mellitus",
  version: "0.1.0",
  capabilities: CAPABILITIES,
  sections: SECTIONS,
  features: [...FEATURES, ...SYMPTOM_FEATURES, ...COMPLICATION_SYMPTOM_FEATURES],
  diagnosis: DIAGNOSIS,
  classifications: CLASSIFICATIONS,
  complications: COMPLICATIONS,
  validityCaveats: VALIDITY_CAVEATS,
  therapyFlags: THERAPY_FLAGS,
  interpretation: INTERPRETATION,
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

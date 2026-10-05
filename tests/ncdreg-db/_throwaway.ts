/** A condition module in no file of the standard (§5.6 extensibility test). */
import { CONDITION_CATALOGUE } from "@/lib/ncdreg/standard/conditions";
import type { ConditionModule } from "@/lib/ncdreg/standard/types";

export const THROWAWAY: ConditionModule = {
  version: "test-1",
  status: "draft",
  effective_from: "2026-10-05",
  code: "zz_throwaway_condition",
  label: "Throwaway condition",
  level: "core",
  subtypes: [{ code: "unknown", label: "Unknown" }],
  basis_of_diagnosis: [{ code: "unknown", label: "Unknown" }],
  diagnosis_codes: [],
  medicine_groups: [],
  visit_fields: [
    {
      code: "flares_since_last_visit",
      label: "Flares",
      type: "integer",
      requirement: "offered",
      storage: "observation",
    },
  ],
  outcome_classification: { kind: "clinician_recorded" },
  review_components: [],
  outcome_label: "Recorded as controlled",
  admission_reasons: [{ code: "zz_flare", label: "Flare" }],
  event_types: [],
  sms_banned_terms: ["throwaway"],
  enabled_by_default: false,
};
export const CATALOGUE = [...CONDITION_CATALOGUE, THROWAWAY];

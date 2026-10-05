/**
 * §10.1 the demo catalogue's schema, validated in a test and again at load time. Every date is a
 * whole-day offset from day 0. Unknown fields are allowed (and listed in the ledger) but never used.
 */
import { z } from "zod";

const day = z.number().int();
const bp = z.array(z.tuple([z.number(), z.number()]));
const glucose = z.object({
  value: z.number(),
  type: z.enum(["fasting", "random", "post_meal"]),
  method: z.enum(["capillary", "laboratory"]),
});

export const scenarioVisit = z.object({
  day,
  type: z.enum(["scheduled", "unscheduled", "refill_only", "remote"]),
  weight_kg: z.number().optional(),
  bp: bp.optional(),
  glucose: glucose.optional(),
  hba1c: z.object({ value_percent: z.number(), result_day: day }).optional(),
  medicines: z.array(z.string()),
  missed_doses: z.enum(["none", "1_to_2_days", "3_or_more_days", "not_asked"]).optional(),
  hypoglycaemia: z
    .enum(["none", "mild_self_treated", "severe_needed_help", "not_asked"])
    .optional(),
  medicines_obtained: z.enum(["full", "partial", "none", "not_applicable"]).optional(),
  medicines_not_obtained_reason: z.enum(["stock_out", "cost", "other"]).optional(),
  next_appointment_day: day.optional(),
  recorded_control: z
    .record(
      z.string(),
      z.enum(["controlled", "partly_controlled", "not_controlled", "not_assessed"]),
    )
    .optional(),
  observations: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});

const review = z
  .object({ component: z.enum(["kidney", "eyes", "feet", "lipids"]), day })
  .passthrough();

export const scenarioPatient = z.object({
  key: z.string(),
  registry_number: z.string().regex(/^DEMO-/),
  is_synthetic: z.literal(true),
  given_name: z.string(),
  family_name: z.string(),
  sex: z.enum(["female", "male"]),
  age_years_at_day_0: z.number().int().min(18),
  date_of_birth_estimated: z.boolean().optional(),
  phone_1: z.string().nullable(),
  sms_allowed: z.boolean(),
  calls_allowed: z.boolean(),
  residence: z.object({
    district: z.string(),
    sub_county: z.string().optional(),
    parish: z.string().optional(),
  }),
  privacy_notice: z.object({ version: z.string() }),
  hospital_number: z.string().optional(),
  registrations: z
    .array(
      z.object({
        condition: z.string(),
        subtype: z.string(),
        diagnosed_years_before_day_0: z.number().int(),
        basis_of_diagnosis: z.string(),
        registered_day: day,
        where_first_diagnosed: z.enum(["this_facility", "other_facility", "unknown"]),
        referral_source: z.enum([
          "self",
          "outpatients",
          "ward",
          "other_facility",
          "community_screening",
          "other",
        ]),
      }),
    )
    .min(1),
  baseline: z.object({
    height_cm: z.number().optional(),
    tobacco: z.enum(["never", "former", "current"]).optional(),
    alcohol: z.enum(["none", "occasional", "regular"]).optional(),
    known_cardiovascular_disease: z.array(z.string()).optional(),
    known_kidney_disease: z.boolean().optional(),
    family_history_diabetes: z.boolean().optional(),
    family_history_hypertension: z.boolean().optional(),
  }),
  visits: z.array(scenarioVisit),
  reviews: z.array(review).default([]),
  events: z
    .array(
      z
        .object({
          type: z.string(),
          day,
          reporting_unit: z.enum(["ncd_clinic", "medical_ward", "dialysis_unit", "other"]),
          main_reason: z.string().optional(),
          place: z.enum(["this_facility", "other_facility", "home", "unknown"]).optional(),
          information_source: z.enum(["ward", "family_call", "records", "other"]).optional(),
          destination: z.string().optional(),
        })
        .passthrough(),
    )
    .default([]),
  today: z
    .object({
      appointment_day: day,
      arrived_at: z.string().nullable(),
      stage: z.enum(["not_arrived", "waiting", "measurements_taken", "with_clinician", "closed"]),
      nurse_part: z
        .object({
          saved_at: z.string(),
          weight_kg: z.number().optional(),
          bp: bp.optional(),
          glucose: glucose.optional(),
        })
        .optional(),
      clinician_part: z
        .object({
          saved_at: z.string(),
          medicines: z.array(z.string()),
          medicines_confirmed_unchanged: z.boolean().optional(),
          missed_doses: z.string().optional(),
          hypoglycaemia: z.string().optional(),
          medicines_obtained: z.string().optional(),
          next_appointment_day: day.optional(),
        })
        .optional(),
    })
    .optional(),
  recall: z
    .object({
      missed_appointment_day: day,
      days_overdue_at_day_0: z.number().int(),
      calls: z.array(z.object({ day, outcome: z.string(), new_appointment_day: day.optional() })),
    })
    .optional(),
  phone_1_flagged_invalid: z.boolean().optional(),
  expect: z.record(z.string(), z.unknown()).optional(),
  preview_role: z.string().optional(),
});
export type ScenarioPatient = z.infer<typeof scenarioPatient>;
export type ScenarioVisit = z.infer<typeof scenarioVisit>;

export const demoCatalogue = z.object({
  catalogue: z.literal("ncd-demo-catalog"),
  version: z.string(),
  standard: z.string(),
  schema_notes: z.record(z.string(), z.string()),
  modes: z.array(
    z
      .object({
        id: z.enum(["scenario", "full_clinic"]),
        label: z.string(),
        description: z.string(),
        persons: z.number(),
      })
      .passthrough(),
  ),
  ui_copy: z.object({
    switch_on: z.string(),
    switch_off: z.string(),
    empty_state: z.string(),
    banner: z.string(),
    confirm_off: z.string(),
    blocked_after_go_live: z.string(),
  }),
  safety_rules: z.array(z.string()),
  facility: z.object({
    name: z.string(),
    time_zone: z.string(),
    reporting_units: z.array(z.string()),
  }),
  demo_actors: z.array(z.object({ role: z.string(), label: z.string() })),
  condition_modules_enabled_while_on: z.array(z.string()),
  scenario_patients: z.array(scenarioPatient),
  duplicate_check_demo: z.object({
    typed: z.object({
      given_name: z.string(),
      family_name: z.string(),
      sex: z.enum(["female", "male"]),
      age_years_at_day_0: z.number(),
      phone_1: z.string(),
    }),
    expected_candidates: z.array(
      z.object({
        key: z.string(),
        tier: z.enum(["definite", "probable", "possible"]),
        matched: z.array(z.string()),
      }),
    ),
    expected_definite: z.array(z.string()),
  }),
  data_quality_demo: z.array(
    z.object({ rule: z.string(), how: z.string(), optional: z.boolean() }),
  ),
  sms_templates_demo: z.array(
    z.object({
      purpose: z.enum(["appointment_reminder", "missed_visit"]),
      language: z.string(),
      status: z.enum(["draft", "pending_review", "approved"]),
      text: z.string(),
    }),
  ),
  generator: z
    .object({
      seed: z.number().int(),
      history_months: z.number().int(),
      target_registered_excluding_died: z.number().int(),
      registered_by_condition: z.record(z.string(), z.number()),
      other_modules: z.record(z.string(), z.number()),
      name_pools: z
        .object({
          given_female: z.array(z.string()),
          given_male: z.array(z.string()),
          family: z.array(z.string()),
        })
        .passthrough(),
      sex_female_percent: z.number(),
      age_bands_percent: z.record(z.string(), z.number()),
      visit_interval_days: z.object({ typical: z.number(), min: z.number(), max: z.number() }),
      share_with_no_phone_percent: z.number(),
      glucose_type_mix_percent: z.record(z.string(), z.number()),
      monthly_in_range_percent: z.record(z.string(), z.unknown()),
      calibration_targets: z.record(z.string(), z.unknown()),
    })
    .passthrough(),
  counts: z.object({
    scenario_patients: z.number(),
    visits: z.number(),
    today_appointments: z.number(),
    overdue: z.number(),
  }),
});
export type DemoCatalogue = z.infer<typeof demoCatalogue>;

/** HARD STOP 7 / §10.1: parse, and refuse any person without is_synthetic: true. */
export function parseCatalogue(json: unknown): DemoCatalogue {
  return demoCatalogue.parse(json);
}

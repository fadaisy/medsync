/**
 * Resus Desk v2 — survey presentation metadata (GATE A §3, signed).
 *
 * PRESENTATION ONLY: which of each step's signed catalog codes show as the
 * overall picture, the ≤ 8 key signs, the context-promoted signs, the "More
 * signs" groups, the search synonyms and the vitals-derived (Q13) codes. It
 * adds no finding, no threshold and no rule — every code here must exist in the
 * step's signed catalog (asserted by tests/resus/v2/presentation.test.ts). The
 * catalogs and engines stay byte-identical.
 */
import type { PatientContextFlags, StepLocalToggles } from "@/lib/resus/model";
import type { AbcdeLetter } from "@/lib/resus/types";

import { AIRWAY_STATES } from "@/lib/resus/airway";
import {
  AIRWAY_ACTIONS,
  AIRWAY_DIFFICULTY,
  AIRWAY_FEEL,
  AIRWAY_LISTEN,
  AIRWAY_LOOK,
  AIRWAY_PATENCY,
} from "@/lib/resus/reference/airway-catalog";
import {
  BREATHING_FEEL,
  BREATHING_LISTEN,
  BREATHING_LOOK,
  BREATHING_MEASURE,
  BREATHING_STATES,
} from "@/lib/resus/reference/breathing-catalog";
import {
  CIRCULATION_FEEL,
  CIRCULATION_LOOK,
  CIRCULATION_MEASURE,
  CIRCULATORY_STATES,
} from "@/lib/resus/reference/circulation-catalog";
import {
  DISABILITY_FOCAL_SEIZURE,
  DISABILITY_METABOLIC,
  DISABILITY_PUPILS,
  DISABILITY_STATES,
} from "@/lib/resus/reference/disability-catalog";
import {
  EXPOSURE_INJURY,
  EXPOSURE_PATCHES,
  EXPOSURE_SKIN,
  EXPOSURE_STATES,
} from "@/lib/resus/reference/exposure-catalog";

export const FINDING_GROUPS = ["look", "listen", "feel", "measure", "results"] as const;
export type FindingGroup = (typeof FINDING_GROUPS)[number];
export type FindingTier = "overall" | "key" | "more";

export interface CatalogFinding {
  code: string;
  label: string;
  group: FindingGroup;
}

/** A context promotion: when `when(flags)` holds, `codes` join the step's key row. */
export interface Promotion {
  /** The context-bar label that promotes ("promoted by Trauma"). */
  by: string;
  when: (flags: PatientContextFlags) => boolean;
  codes: readonly string[];
}

export interface StepPresentation {
  step: AbcdeLetter;
  /** The step's headline read — existing state (or patency) codes. */
  overall: readonly string[];
  /** ≤ 8 key signs, always on screen. */
  key: readonly string[];
  /** Context-promoted signs, in priority order; at most `promotionCap` show. */
  promotions: readonly Promotion[];
  promotionCap: number;
  /** The Q13 codes that fresh adult vitals derive (lib/resus/survey/vitals-bands.ts). */
  derived: readonly string[];
  /** Every signed finding code of the step, with its catalog label and group. */
  findings: readonly CatalogFinding[];
  /** The signed state ladder, best → worst (the step engine's own array). */
  ladder: readonly string[];
}

/** Manual results (labs, ECG, ultrasound, β-hCG) — collapsed "Results" group. */
const RESULTS_CODES: ReadonlySet<string> = new Set([
  "pao2_lt8",
  "resp_acidosis",
  "paco2_rising_normalising",
  "raised_lactate",
  "lactate_raised",
  "lactate_severe",
  "ecg_ischaemia",
  "ecg_arrhythmia",
  "ecg_pe",
  "ecg_tamponade",
  "bhcg_positive",
  "us_free_fluid",
  "us_tamponade",
  "us_rv_strain",
  "us_poor_filling",
  "hyperglycaemia_ketotic",
]);

/** Vitals-derived codes per step (GATE A §3 "Vitals-derived", §5 SV-VIT-01..13). */
export const DERIVED_CODES: Record<AbcdeLetter, readonly string[]> = {
  A: ["gcs_le8"],
  B: ["rr_raised", "rr_very_high", "rr_low_falling", "spo2_lt92", "spo2_lt94"],
  C: [
    "tachycardia",
    "bradycardia",
    "hypotension",
    "shock_index_high",
    "shock_index_severe",
    "narrow_pulse_pressure",
  ],
  D: ["hypoglycaemia"],
  E: [],
};

function grouped(
  step: AbcdeLetter,
  parts: readonly [FindingGroup, readonly { code: string; label: string }[]][],
): CatalogFinding[] {
  const derived = new Set(DERIVED_CODES[step]);
  return parts.flatMap(([group, list]) =>
    list.map((f) => ({
      code: f.code,
      label: f.label,
      group: RESULTS_CODES.has(f.code) ? "results" : derived.has(f.code) ? "measure" : group,
    })),
  );
}

const pregnant = (f: PatientContextFlags) => f.pregnancy !== "none";

/* ─── per-step presentation (GATE A §3 table) ─────────────────────────── */
export const STEP_PRESENTATION: Record<AbcdeLetter, StepPresentation> = {
  A: {
    step: "A",
    overall: AIRWAY_PATENCY,
    key: [
      "stridor_inspiratory",
      "gurgling",
      "snoring",
      "see_saw",
      "foreign_body",
      "swelling_face",
      "gcs_le8",
      "drooling_tripod",
    ],
    promotions: [
      { by: "Trauma", when: (f) => f.trauma, codes: ["facial_neck_trauma", "swelling_neck"] },
      { by: "Allergen trigger", when: (f) => f.allergenTrigger, codes: ["hoarse_muffled_voice"] },
    ],
    promotionCap: 4,
    derived: DERIVED_CODES.A,
    findings: grouped("A", [
      ["look", AIRWAY_LOOK],
      ["listen", AIRWAY_LISTEN],
      ["feel", AIRWAY_FEEL],
    ]),
    ladder: AIRWAY_STATES,
  },
  B: {
    step: "B",
    overall: BREATHING_STATES,
    key: [
      "cant_complete_sentences",
      "accessory_muscles",
      "silent_chest",
      "wheeze",
      "crackles",
      "reduced_breath_sounds",
      "trachea_deviated_away",
      "exhaustion_drowsy",
    ],
    promotions: [
      {
        by: "Chest trauma",
        when: (f) => f.chestTrauma,
        codes: ["flail_segment", "open_chest_wound", "surgical_emphysema", "hyper_resonant"],
      },
      {
        by: "Known asthma",
        when: (f) => f.knownAsthma,
        codes: ["pef_33_50", "pef_lt33", "paco2_rising_normalising"],
      },
      { by: "COPD / CO₂ retainer", when: (f) => f.copdRisk, codes: ["resp_acidosis"] },
      { by: "Allergen trigger", when: (f) => f.allergenTrigger, codes: ["stridor"] },
    ],
    promotionCap: 4,
    derived: DERIVED_CODES.B,
    findings: grouped("B", [
      ["look", BREATHING_LOOK],
      ["listen", BREATHING_LISTEN],
      ["feel", BREATHING_FEEL],
      ["measure", BREATHING_MEASURE],
    ]),
    ladder: BREATHING_STATES,
  },
  C: {
    step: "C",
    overall: ["well_perfused", "compensated_shock", "decompensated_shock", "peri_arrest"],
    key: [
      "cold_peripheries",
      "cap_refill_delayed",
      "thready_pulse",
      "altered_consciousness",
      "external_haemorrhage",
      "raised_jvp",
      "flat_jvp",
      "oliguria",
    ],
    promotions: [
      {
        by: "Trauma / Active bleeding",
        when: (f) => f.trauma || f.activeBleeding,
        codes: ["pelvic_instability", "long_bone_deformity", "abdominal_distension", "peritonism"],
      },
      { by: "Allergen trigger", when: (f) => f.allergenTrigger, codes: ["urticaria_angioedema"] },
      { by: "Pregnancy", when: pregnant, codes: ["bhcg_positive"] },
      { by: "Febrile child", when: (f) => f.febrileChild, codes: ["fever_rash"] },
    ],
    promotionCap: 4,
    derived: DERIVED_CODES.C,
    findings: grouped("C", [
      ["look", CIRCULATION_LOOK],
      ["feel", CIRCULATION_FEEL],
      ["measure", CIRCULATION_MEASURE],
    ]),
    ladder: CIRCULATORY_STATES,
  },
  D: {
    step: "D",
    overall: DISABILITY_STATES,
    key: [
      "pinpoint_pupils",
      "unequal_pupil",
      "fixed_dilated_pupil",
      "active_seizure",
      "focal_deficit",
      "meningism",
      "decorticate",
      "decerebrate",
    ],
    promotions: [
      {
        by: "Head injury",
        when: (f) => f.headInjury,
        codes: ["bilateral_fixed_dilated", "cushings_triad"],
      },
    ],
    promotionCap: 2,
    derived: DERIVED_CODES.D,
    findings: grouped("D", [
      ["look", DISABILITY_PUPILS],
      ["look", DISABILITY_FOCAL_SEIZURE],
      ["measure", DISABILITY_METABOLIC],
    ]),
    ladder: DISABILITY_STATES,
  },
  E: {
    step: "E",
    overall: EXPOSURE_STATES,
    key: [
      "non_blanching_rash",
      "urticaria_angioedema",
      "external_haemorrhage",
      "mottling_pallor_cyanosis",
      "pain_out_of_proportion",
      "transdermal_opioid_patch",
      "wound",
    ],
    promotions: [
      {
        by: "Trauma",
        when: (f) => f.trauma,
        codes: ["back_finding", "pelvic_instability", "long_bone_deformity", "bruising_haematoma"],
      },
      {
        by: "Environmental exposure",
        when: (f) => f.environmentalExposure,
        codes: ["burns_blistering"],
      },
    ],
    promotionCap: 4,
    derived: DERIVED_CODES.E,
    findings: grouped("E", [
      ["look", EXPOSURE_SKIN],
      ["feel", EXPOSURE_INJURY],
      ["look", EXPOSURE_PATCHES],
    ]),
    ladder: EXPOSURE_STATES,
  },
};

/** The catalog label of a step's finding code (the code itself if unknown). */
export function findingLabel(step: AbcdeLetter, code: string): string {
  return STEP_PRESENTATION[step].findings.find((f) => f.code === code)?.label ?? code;
}

/**
 * Search synonyms (search only, never displayed) — GATE A §3. A term lists
 * codes across steps; each step searches only its own codes.
 */
export const SEARCH_SYNONYMS: Record<string, readonly string[]> = {
  tension: [
    "trachea_deviated_away",
    "reduced_breath_sounds",
    "hyper_resonant",
    "tracheal_deviation",
    "unilateral_absent_breath_sounds",
  ],
  anaphylaxis: ["swelling_face", "stridor", "wheeze", "urticaria_angioedema"],
  bleed: [
    "external_haemorrhage",
    "abdominal_distension",
    "pelvic_instability",
    "long_bone_deformity",
    "back_finding",
  ],
  tamponade: ["muffled_heart_sounds", "raised_jvp", "us_tamponade", "ecg_tamponade"],
  stroke: ["focal_deficit", "gaze_deviation"],
  sepsis: ["fever_rash", "mottling", "flushing_warm", "non_blanching_rash"],
  opioid: ["pinpoint_pupils", "transdermal_opioid_patch", "track_marks"],
  fit: ["active_seizure", "non_convulsive_suspected"],
  convulsion: ["active_seizure", "non_convulsive_suspected"],
  asthma: ["wheeze", "silent_chest", "pef_33_50", "pef_lt33"],
  burns: ["burns_soot", "burns_blistering"],
  pe: ["us_rv_strain", "ecg_pe"],
  pregnant: ["bhcg_positive"],
  ectopic: ["bhcg_positive"],
};

/* ─── step-local controls (GATE A §3 "Step-local controls") ────────────── */

export interface StepLocalControl {
  id: string;
  step: AbcdeLetter;
  label: string;
  kind: "toggle" | "screen" | "picker" | "editor";
  /** "step" = in the step body; "more" = under More signs. */
  placement: "step" | "more";
  /** The StepLocalToggles key a toggle writes. */
  toggle?: keyof StepLocalToggles;
  /** The signed code whose derivation SUGGESTS this toggle (never auto-sets it). */
  suggestedBy?: string;
  /** Starts collapsed. */
  collapsed?: boolean;
  /** Opens by itself when any of these actions is indicated (a prompt, never a gate). */
  autoOpenOn?: readonly string[];
  /** The signed codes the control records. */
  codes?: readonly string[];
}

/** Advanced-airway actions = the signed Tier-3 airway actions (DAS ladder). */
const ADVANCED_AIRWAY_ACTIONS: readonly string[] = Object.values(AIRWAY_ACTIONS)
  .filter((a) => a.tier === 3)
  .map((a) => a.code);

export const STEP_LOCAL_CONTROLS: readonly StepLocalControl[] = [
  {
    id: "a_gag",
    step: "A",
    label: "Gag / clenched jaw",
    kind: "toggle",
    placement: "step",
    toggle: "gagPresent",
  },
  {
    id: "a_difficulty_screen",
    step: "A",
    label: "Difficult-airway screen",
    kind: "screen",
    placement: "step",
    collapsed: true,
    autoOpenOn: ADVANCED_AIRWAY_ACTIONS,
    codes: AIRWAY_DIFFICULTY.map((d) => d.code),
  },
  { id: "d_avpu", step: "D", label: "AVPU", kind: "picker", placement: "more" },
  {
    id: "d_low_rr",
    step: "D",
    label: "Low RR",
    kind: "toggle",
    placement: "more",
    toggle: "lowRespRate",
    suggestedBy: "rr_low_falling",
  },
  {
    id: "e_not_recovered",
    step: "E",
    label: "Left exposed (re-cover!)",
    kind: "toggle",
    placement: "step",
    toggle: "notRecovered",
  },
  { id: "e_ample", step: "E", label: "AMPLE", kind: "editor", placement: "step" },
];

/* ─── survey rule IDs (coverage key; GATE A §7, §10 item 3) ──────────── */

const ids = (prefix: string, n: number) =>
  Array.from({ length: n }, (_, i) => `${prefix}-${String(i + 1).padStart(2, "0")}`);

/**
 * Every survey rule ID. Each has ≥ 1 test whose name starts with it
 * (tests/resus/v2/presentation.test.ts checks). SV-CTX = context.ts, SV-VIT =
 * vitals-bands.ts (GATE A §5 table), SV-FLR = floor.ts, SV-DIS = disclosure.ts
 * (+ SV-DIS-08: every presentation code exists in its signed catalog), SV-DN =
 * do-now.ts, SV-EQ = the v1 equivalence suites (tests/resus/v2/equivalence-*).
 */
export const SURVEY_RULE_IDS: readonly string[] = [
  ...ids("SV-CTX", 22),
  ...ids("SV-VIT", 16),
  ...ids("SV-FLR", 13),
  ...ids("SV-DIS", 8),
  ...ids("SV-DN", 11),
  ...ids("SV-EQ", 13),
];

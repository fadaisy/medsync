/**
 * The patient symptom catalog and its classifier — the types three runtimes
 * share (PRD MS-PRD-SYM-001 §6.2, §5.3; ADR 0098). ZERO IMPORTS on purpose:
 * Next imports `@/supabase/functions/_shared/symptom-catalog/*`, Deno
 * `../_shared/symptom-catalog/*.ts`, the phone `@shared/symptom-catalog/*`.
 *
 * What this is: a versioned, CSO-signed content package (lay-language items
 * with a tier each, per-item qualifiers, deterministic rules) and a pure
 * classifier over it. What it is not: a diagnosis. Tiering is advice to the
 * patient — "get help now" / "be seen today" / "book a visit" — and hospital
 * triage v2 always re-assesses (PRD §5.1 principle 4).
 */

export type Tier = "E" | "U" | "R";

/** Who the symptoms are about. `all` on an item means every audience sees it. */
export type Audience = "adult" | "child_u2m" | "child_2m_5y" | "child_5_12" | "pregnant" | "all";

/** The concrete audience a submission is about (never `all`). */
export type SubmissionAudience = Exclude<Audience, "all">;

export type CategoryKey =
  | "breathing_chest"
  | "head_brain_nerves"
  | "belly_digestion"
  | "fever_infection"
  | "injuries_cuts_burns"
  | "blood_pressure_sugar"
  | "eyes_ears_nose_throat"
  | "urine_private_pregnancy"
  | "bones_joints_muscles"
  | "skin"
  | "mood_sleep_mind"
  | "child_illness";

export type ItemFlag = "isolation" | "crisis_route" | "sv_route" | "stroke_time";

/** Navigation, not diagnosis (PRD §2 non-goals): which clinic the R/U outcome points at. */
export type ServiceLineHint =
  | "general"
  | "cardiology"
  | "diabetes_ncd"
  | "renal"
  | "eye"
  | "ent"
  | "maternity"
  | "paediatrics"
  | "mental_health"
  | "surgery"
  | "dermatology"
  | "orthopaedics"
  | "tb";

export interface QualifierOption {
  key: string;
  labelKey: string;
  /** Answering this option raises the tier to at least this (rule R2). */
  escalatesTo?: Tier;
}

export interface Qualifier {
  key: string;
  promptKey: string;
  options: QualifierOption[];
}

export interface CatalogItem {
  /** Stable key, e.g. "SYM.CHEST.PAIN_SPREADING". */
  key: string;
  category: CategoryKey;
  audience: Audience[];
  tier: Tier;
  /** i18n key; the English label is ≤ 9 words, reading age ~11 (PRD §6.3). */
  labelKey: string;
  helperKey?: string;
  /** Lucide (web) / Ionicons (phone) name is resolved by the surface from this key. */
  icon: string;
  synonyms: string[];
  /** At most 2 (schema cap). */
  qualifiers?: Qualifier[];
  serviceLineHint?: ServiceLineHint;
  /** A `lib/triage/discriminators.ts` code, or null when no clean match exists. */
  triageDiscriminatorRef: string | null;
  /** A reasoning-token id, or null — no token catalog exists today (recon Q6). */
  reasoningTokenRef: string | null;
  flags?: ItemFlag[];
  /** Appendix C keys; required (≥ 1) for every E and U item. */
  sourceRefs: string[];
  /** Shown on the landing strip for these audiences (PRD Appendix A.0). */
  dangerSignFor?: SubmissionAudience[];
}

export interface Category {
  key: CategoryKey;
  labelKey: string;
  icon: string;
  /** Grid slot 1–12 (PRD §6.1). `child_illness` takes `skin`'s slot when audience is a child. */
  slot: number;
  /** Categories only some audiences see. Absent = every audience. */
  audience?: SubmissionAudience[];
}

/** The rules as data (R7): the engine interprets these; there are no code branches per rule. */
export type Rule =
  | { id: "R1"; kind: "item_tier"; tier: "E" }
  | { id: "R2"; kind: "qualifier_escalates" }
  | {
      id: "R3";
      kind: "audience_modifier";
      when: { audience: SubmissionAudience; anyOf: string[] };
      tier: Tier;
      note: string;
    }
  | {
      id: "R4";
      kind: "combination";
      when: { allOfGroups: string[][] };
      tier: Tier;
      flags: ItemFlag[];
      note: string;
    }
  | { id: "R5"; kind: "max_item_tier" }
  | { id: "R6"; kind: "free_text_inert" }
  | { id: "R7"; kind: "rules_are_data" };

export interface RuleSet {
  version: string;
  rules: Rule[];
}

export interface EmergencyContactSeed {
  /** Stable key for the seed row, e.g. "UG.NATIONAL.112". */
  key: string;
  label: string;
  number: string | null;
  scope: "national" | "district" | "facility";
  district: string | null;
  kind: "general" | "ambulance" | "crisis" | "sv";
  priority: number;
  verificationStatus: "verified" | "unverified" | "to_source";
  basis: string;
}

export interface CatalogPackage {
  version: string;
  status: "draft" | "signed" | "retired";
  categories: Category[];
  items: CatalogItem[];
  rules: RuleSet;
  /** Appendix C keys → citation text; every sourceRef must resolve here. */
  sources: Record<string, string>;
  /** English strings by key (labels, helpers, prompts, options). */
  en: Record<string, string>;
}

/* ── Submission and classification ─────────────────────────────────── */

export interface SubmissionInput {
  audience: SubmissionAudience;
  /** Catalog item keys the patient chose. */
  items: string[];
  /** Qualifier answers: item key → qualifier key → option key. */
  qualifiers: Record<string, Record<string, string>>;
  /** Free text never changes the tier (R6); carried for humans only. */
  freeText?: string | null;
}

export interface Classification {
  tier: Tier;
  /** Item keys that set the tier — "Because you chose…" (PRD §5.1 principle 3). */
  reasons: string[];
  flags: ItemFlag[];
  /** Every rule that fired, in order, with what it saw — reconstructable later (§5.1 principle 6). */
  trace: { rule: string; detail: string }[];
  serviceLineHint: ServiceLineHint | null;
  catalogVersion: string;
}

/** The tier as the patient reads it (PRD §5.2). */
export const TIER_LABEL_KEY: Record<Tier, string> = {
  E: "tier.E",
  U: "tier.U",
  R: "tier.R",
};

/** Higher is more urgent — the monotonicity invariant compares on this. */
export const TIER_RANK: Record<Tier, number> = { R: 0, U: 1, E: 2 };

export const MAX_ITEMS_PER_CATEGORY_VIEW = 8;
/**
 * How many items one report may carry; every selector stops at this and the
 * server refuses more. Equal to `MAX_SYMPTOMS` in `_shared/symptoms.ts`, the
 * wire cap on the appointment's descriptive list the report is rendered into.
 */
export const MAX_SELECTED_ITEMS = 8;
export const MAX_QUALIFIERS_PER_ITEM = 2;
export const MAX_LABEL_WORDS = 9;
export const MAX_FREE_TEXT = 500;

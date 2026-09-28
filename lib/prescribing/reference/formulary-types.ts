/**
 * MS-RX-CAT-001, the general formulary (ADR 0187): the shape of the catalogue and of a dose.
 *
 * The catalogue itself is generated from data/prescribing/drug-catalogue.v0.json into
 * general-formulary.ts. It carries no dose: every entry is `to-verify`. A regimen exists only where
 * a signed, verified source gives it (formulary-regimens.ts); nothing here is a remembered number.
 */

export const FORMULARY_ROUTES = [
  "oral",
  "iv",
  "im",
  "sc",
  "pr",
  "inhaled",
  "nebulised",
  "topical",
  "sublingual",
  "buccal",
  "intranasal",
  "infusion",
] as const;
export type FormularyRoute = (typeof FORMULARY_ROUTES)[number];

export const FORMULARY_CHARTS = [
  "mar",
  "fluid_balance",
  "glucose",
  "observations",
  "neuro",
  "temperature",
  "drug_level",
] as const;
export type FormularyChart = (typeof FORMULARY_CHARTS)[number];

export const SUPPORTIVE_IDS = ["fluids", "oxygen", "blood_products", "nutrition"] as const;
export type SupportiveId = (typeof SUPPORTIVE_IDS)[number];

export const DRUG_FLAG_KEYS = [
  "renal",
  "hepatic",
  "weightBasedInChildren",
  "weightBasedInAdults",
  "controlled",
  "highAlert",
  "narrowTherapeuticIndex",
  "reserveAntibiotic",
] as const;
export type DrugFlagKey = (typeof DRUG_FLAG_KEYS)[number];
export type DrugFlags = Record<DrugFlagKey, boolean>;

export const DOSE_BANDS = ["adult", "olderAdult", "child"] as const;
export type DoseBand = (typeof DOSE_BANDS)[number];

export const DOSE_UNITS = ["mg", "g", "µg", "mL", "units", "mmol"] as const;
export type DoseUnit = (typeof DOSE_UNITS)[number];

/** How often, as the dialog's chips: once (stat), once daily, 12-, 8-, 6- and 4-hourly. */
export const RX_FREQUENCIES = ["stat", "daily", "12h", "8h", "6h", "4h"] as const;
export type RxFrequency = (typeof RX_FREQUENCIES)[number];

export const RX_COURSES = ["single", "3d", "5d", "7d", "14d", "until_review"] as const;
export type RxCourse = (typeof RX_COURSES)[number];

export interface DrugSystem {
  id: string;
  name: string;
}

export interface AllergyGroup {
  id: string;
  name: string;
}

export interface DrugClass {
  id: string;
  name: string;
  system: string;
  parent: string | null;
  allergyGroup: string | null;
  note?: string;
}

/** Where a regimen's numbers come from: the verbatim quote holds every number it sets. */
export interface RegimenSource {
  /** Required for a verification-phase source; the signed emergency formulary cites by name. */
  url?: string;
  citation: string;
  quote: string;
  checkedAt: string;
}

export interface Regimen {
  id: string;
  /** Words only: the indication. No number. */
  label: string;
  band: DoseBand;
  /** A fixed dose. Absent for a per-kg or ranged regimen. */
  doseNum?: number;
  /** A range the prescriber chooses within (e.g. a bolus volume). */
  doseRange?: { low: number; high: number };
  unit: DoseUnit;
  /** The concentration named by the source (e.g. "10%"). Strengths otherwise come from pharmacy. */
  strength?: string;
  route: FormularyRoute;
  method?: string;
  /** How it is given, in the source's words (e.g. "over 10–15 min"). */
  admin?: string;
  freq: RxFrequency;
  course?: RxCourse;
  /** What happens next, in the source's words (e.g. "recheck CBG at 10–15 min; …"). */
  then?: string;
  perKg?: { amount: number; amountHigh?: number; unit: DoseUnit; max?: number };
  /** Which child row applies, where the source splits by age or weight (either criterion). */
  appliesWhen?: {
    ageYearsBelow?: number;
    ageYearsAtLeast?: number;
    weightKgBelow?: number;
    weightKgAtLeast?: number;
  };
  /** For a fluid regimen. */
  fluidPurpose?: "bolus" | "maintenance" | "replacement";
  sources: RegimenSource[];
}

export interface DrugDose {
  status: "to-verify" | "verified";
  /** Only the CSO sets this. A regimen shows by default only when verified and signed. */
  csoSigned?: boolean;
  /** Set when the regimens are the signed emergency formulary's, carried unchanged. */
  origin?: "emergency-formulary";
  verifyAt: string[];
  regimens: Regimen[];
  bands: Record<DoseBand, string | null>;
  renal: string | null;
  hepatic: string | null;
  pregnancy: string | null;
  /** The source's cautions, verbatim (signed entries only). */
  cautions?: readonly string[];
}

export interface Drug {
  id: string;
  generic: string;
  class: string;
  routes: FormularyRoute[];
  methods: Partial<Record<FormularyRoute, string[]>>;
  presentationsDraft: string[];
  allergyGroups: string[];
  flags: DrugFlags;
  charts: FormularyChart[];
  dose: DrugDose;
  onEmhsluDraft: boolean | null;
}

export interface SupportiveItem {
  id: SupportiveId;
  name: string;
  classes: string[];
  note: string;
}

export interface DiagnosisLink {
  profileId: string;
  classes: string[];
  supportive: SupportiveId[];
}

export interface FormularyMeta {
  id: string;
  version: string;
  createdAt: string;
  status: string;
  diagnosisCatalogue: string;
}

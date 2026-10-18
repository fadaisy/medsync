/**
 * What a patient reports about their own health on the phone (ADR 0355, migration 0175): their
 * conditions, allergies and family history, in the clinician's own vocabulary.
 *
 * Zero imports, shared by three readers: the phone (`@patient/reported-history`), the clerking
 * desk's loader (lib/clerking/desk-load.ts) and the desk itself. The lists are the signed clerking
 * catalogue's own ids and labels (MS-EMR-CLERK-CAT-001, data/clerking/clerking-history-catalogue.v1.json:
 * past_history.conditions, family_history.conditions, option_sets.relations, allergies.quick_picks,
 * .reactions, .severity), copied so the phone does not ship the 229 KB catalogue;
 * tests/patient/reported-history.test.ts fails the moment they drift.
 *
 * A patient's report is never a clinical record: the desk shows it as "patient-reported, not yet
 * confirmed" and only a clinician's confirm writes the record.
 */

export interface ReportedOption {
  id: string;
  label: string;
  /** The catalogue's sensitivity class (tb, hiv, mental_health…): never on the card, and on the
   *  desk only for clinicians who may see restricted entries. */
  sensitivity?: string;
  appliesToSex?: "female" | "male";
}

export const REPORTED_CATALOGUE_ID = "MS-EMR-CLERK-CAT-001";

export const REPORTED_CATALOGUE = {
  conditions: [
    { id: "hypertension", label: "Hypertension" },
    { id: "diabetes", label: "Diabetes" },
    { id: "kidney_disease", label: "Kidney disease" },
    { id: "heart_failure", label: "Heart failure" },
    { id: "heart_attack_or_angina", label: "Heart attack or angina" },
    { id: "stroke", label: "Stroke" },
    { id: "asthma_or_copd", label: "Asthma or COPD" },
    { id: "tuberculosis", label: "Tuberculosis", sensitivity: "tb" },
    { id: "hiv", label: "HIV", sensitivity: "hiv" },
    { id: "sickle_cell_disease", label: "Sickle cell disease" },
    { id: "epilepsy", label: "Epilepsy" },
    { id: "cancer", label: "Cancer" },
    { id: "liver_disease_or_hepatitis_b_c", label: "Liver disease or hepatitis B/C" },
    { id: "thyroid_disease", label: "Thyroid disease" },
    { id: "mental_illness", label: "Mental illness", sensitivity: "mental_health" },
    { id: "previous_blood_clot", label: "Previous blood clot" },
    { id: "gout", label: "Gout" },
    { id: "peptic_ulcer", label: "Peptic ulcer" },
    {
      id: "gestational_diabetes_before",
      label: "Gestational diabetes in a previous pregnancy",
      sensitivity: "sexual_reproductive_health",
      appliesToSex: "female",
    },
    { id: "pcos", label: "Polycystic ovary syndrome", appliesToSex: "female" },
    { id: "pancreatitis", label: "Pancreatitis" },
    { id: "sickle_cell_trait", label: "Sickle cell trait or another haemoglobin variant" },
    { id: "g6pd_deficiency", label: "G6PD deficiency" },
    { id: "iron_deficiency", label: "Iron deficiency" },
    { id: "b12_deficiency", label: "Vitamin B12 deficiency" },
  ],
  familyConditions: [
    { id: "diabetes", label: "Diabetes" },
    { id: "hypertension", label: "Hypertension" },
    { id: "heart_disease", label: "Heart disease" },
    { id: "stroke", label: "Stroke" },
    { id: "sudden_death_under_40", label: "Sudden death under 40" },
    { id: "cancer", label: "Cancer" },
    { id: "kidney_disease", label: "Kidney disease" },
    { id: "sickle_cell_disease", label: "Sickle cell disease" },
    { id: "tb_in_the_household", label: "TB in the household", sensitivity: "tb" },
    { id: "mental_illness", label: "Mental illness", sensitivity: "mental_health" },
    { id: "epilepsy", label: "Epilepsy" },
    { id: "bleeding_disorder", label: "Bleeding disorder" },
  ],
  relations: [
    { id: "mother", label: "Mother" },
    { id: "father", label: "Father" },
    { id: "sibling", label: "Sibling" },
    { id: "child", label: "Child" },
    { id: "grandparent", label: "Grandparent" },
    { id: "other_relative", label: "Other relative" },
  ],
  allergySubstances: [
    { id: "penicillins", label: "Penicillins" },
    { id: "cephalosporins", label: "Cephalosporins" },
    { id: "sulfonamides_co_trimoxazole", label: "Sulfonamides (co-trimoxazole)" },
    { id: "aspirin_or_nsaids", label: "Aspirin or NSAIDs" },
    { id: "codeine_or_morphine", label: "Codeine or morphine" },
    { id: "antimalarials", label: "Antimalarials" },
    { id: "anti_tb_drugs", label: "Anti-TB drugs" },
    { id: "contrast_media", label: "Contrast media" },
    { id: "latex", label: "Latex" },
    { id: "peanuts_or_other_nuts", label: "Peanuts or other nuts" },
    { id: "eggs", label: "Eggs" },
    { id: "insect_stings", label: "Insect stings" },
  ],
  reactions: [
    { id: "rash", label: "Rash" },
    { id: "hives_or_itch", label: "Hives or itch" },
    { id: "swelling_of_face_or_lips", label: "Swelling of face or lips" },
    { id: "wheeze_or_breathing_difficulty", label: "Wheeze or breathing difficulty" },
    { id: "collapse_anaphylaxis", label: "Collapse (anaphylaxis)" },
    {
      id: "severe_skin_peeling_or_blistering_sjs_ten",
      label: "Severe skin peeling or blistering (SJS/TEN)",
    },
    { id: "stomach_upset", label: "Stomach upset" },
    { id: "not_known", label: "Not known" },
  ],
  severity: [
    { id: "mild", label: "Mild" },
    { id: "moderate", label: "Moderate" },
    { id: "severe", label: "Severe" },
  ],
} satisfies Record<string, readonly ReportedOption[]>;

/** Something not on the list: the patient's own words in `other_text`. */
export const OTHER = "other";
export const OTHER_MAX = 120;

export type ReportedKind = "condition" | "allergy" | "family" | "no_known_allergies";

export interface ReportedItem {
  id: string;
  kind: ReportedKind;
  /** A catalogue id, or OTHER; null for no_known_allergies. */
  itemId: string | null;
  otherText: string | null;
  onsetYear: number | null;
  /** Conditions: the patient no longer has it. */
  resolved: boolean | null;
  relation: string | null;
  reactions: string[];
  severity: string | null;
  createdAt: string;
}

/** What a form fills; the database adds id, owner and time. */
export type ReportedInput = Omit<ReportedItem, "id" | "createdAt">;

export const REPORTED_COLUMNS =
  "id, kind, item_id, other_text, onset_year, resolved, relation, reactions, severity, created_at";

const KINDS: readonly ReportedKind[] = ["condition", "allergy", "family", "no_known_allergies"];
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);

/** One `patient_reported_history` row (snake_case, as PostgREST or Drizzle's raw rows give it). */
export function fromRow(r: Record<string, unknown>): ReportedItem | null {
  const kind = KINDS.find((k) => k === r.kind);
  if (!kind) return null;
  const year = Number(r.onset_year);
  return {
    id: String(r.id),
    kind,
    itemId: str(r.item_id),
    otherText: str(r.other_text),
    onsetYear: r.onset_year == null || !Number.isFinite(year) ? null : year,
    resolved: typeof r.resolved === "boolean" ? r.resolved : null,
    relation: str(r.relation),
    reactions: Array.isArray(r.reactions)
      ? r.reactions.filter((x): x is string => typeof x === "string")
      : [],
    severity: str(r.severity),
    createdAt:
      r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at ?? ""),
  };
}

/** The columns an insert writes, in 0175's shape (each kind carries only its own fields). */
export function toRow(i: ReportedInput): Record<string, unknown> {
  const other = i.itemId === OTHER ? i.otherText?.trim().slice(0, OTHER_MAX) || null : null;
  const base = {
    kind: i.kind,
    item_id: i.kind === "no_known_allergies" ? null : i.itemId,
    other_text: other,
  };
  if (i.kind === "condition") return { ...base, onset_year: i.onsetYear, resolved: i.resolved };
  if (i.kind === "allergy") return { ...base, reactions: i.reactions, severity: i.severity };
  if (i.kind === "family") return { ...base, relation: i.relation };
  return base;
}

const listFor = (kind: ReportedKind): readonly ReportedOption[] =>
  kind === "condition"
    ? REPORTED_CATALOGUE.conditions
    : kind === "allergy"
      ? REPORTED_CATALOGUE.allergySubstances
      : kind === "family"
        ? REPORTED_CATALOGUE.familyConditions
        : [];

export const optionFor = (kind: ReportedKind, id: string | null): ReportedOption | undefined =>
  id ? listFor(kind).find((o) => o.id === id) : undefined;

export const labelIn = (list: readonly ReportedOption[], id: string | null | undefined) =>
  list.find((o) => o.id === id)?.label ?? null;

/** "Hypertension", or the patient's own words for something not on the list. */
export function reportedLabel(i: Pick<ReportedItem, "kind" | "itemId" | "otherText">): string {
  if (i.kind === "no_known_allergies") return "No known allergies";
  if (i.itemId === OTHER) return i.otherText ?? "Something else";
  return optionFor(i.kind, i.itemId)?.label ?? i.otherText ?? "Not on the list";
}

/** A sensitive catalogue entry (HIV, TB, mental illness, reproductive health). */
export const isSensitive = (i: Pick<ReportedItem, "kind" | "itemId">) =>
  !!optionFor(i.kind, i.itemId)?.sensitivity;

/**
 * The desk's "known for" (option_sets.since) from the patient's onset year, counted in whole
 * calendar years: this year is under 1 year, 1 to 5 years back is 1 to 5, older is over 5.
 * Null without a year, or for a year in the future.
 */
export function sinceFromYear(
  year: number | null,
  now: Date,
): "under_1_year" | "1_to_5_years" | "over_5_years" | null {
  if (year == null) return null;
  const back = now.getFullYear() - year;
  if (back < 0) return null;
  return back < 1 ? "under_1_year" : back <= 5 ? "1_to_5_years" : "over_5_years";
}

/** "Since 2019 · still has it" / "2008 · resolved" (the desk says "has it"; the phone "I have it"). */
export function conditionLine(
  i: Pick<ReportedItem, "onsetYear" | "resolved">,
  who: "patient" | "clinician",
) {
  const status = i.resolved ? "resolved" : who === "patient" ? "I still have it" : "still has it";
  return [
    i.onsetYear ? (i.resolved ? `from ${i.onsetYear}` : `since ${i.onsetYear}`) : null,
    status,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** "Rash, hives or itch · moderate", from the catalogue's words. */
export function allergyLine(i: Pick<ReportedItem, "reactions" | "severity">): string {
  const r = i.reactions
    .map((id) => labelIn(REPORTED_CATALOGUE.reactions, id))
    .filter((x): x is string => !!x);
  const sev = labelIn(REPORTED_CATALOGUE.severity, i.severity);
  return [r.length ? r.join(", ") : "Reaction not given", sev?.toLowerCase()]
    .filter(Boolean)
    .join(" · ");
}

/**
 * The options matching what the patient typed: a label that starts with it first, then a word in
 * the label that starts with it, then anywhere in it; the catalogue's order within each. Empty
 * query: the whole list. Options that apply only to the other sex are left out.
 */
export function searchOptions(
  list: readonly ReportedOption[],
  query: string,
  sex: string | null = null,
): ReportedOption[] {
  const s = sex?.toLowerCase();
  const fits = list.filter(
    (o) => !o.appliesToSex || !s || (s !== "female" && s !== "male") || o.appliesToSex === s,
  );
  const q = query.trim().toLowerCase();
  if (!q) return fits;
  const rank = (o: ReportedOption) => {
    const l = o.label.toLowerCase();
    if (l.startsWith(q)) return 0;
    if (l.split(/[\s/(),-]+/).some((w) => w.startsWith(q))) return 1;
    return l.includes(q) ? 2 : 3;
  };
  return fits
    .map((o) => ({ o, r: rank(o) }))
    .filter((x) => x.r < 3)
    .sort((a, b) => a.r - b.r)
    .map((x) => x.o);
}

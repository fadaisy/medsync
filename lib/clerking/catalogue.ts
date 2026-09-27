import { z } from "zod";

/**
 * The clerking history catalogue (MS-EMR-CLERK-CAT-001) as data: schema, indexes and the resolved
 * property list for each symptom. Pure; runs on the server (loader) and in the browser (desk).
 * No clinical wording or threshold lives here: everything comes from the JSON (Law 2).
 */

const Opt = z.object({
  id: z.string(),
  label: z.string(),
  high_risk: z.boolean().optional(),
  sensitivity: z.string().optional(),
});
export type Option = z.infer<typeof Opt>;

const Phrase = z.object({ pre: z.string(), post: z.string() });
const PropKind = z.enum(["one", "many", "count", "scale", "text", "duration", "year"]);
const Prop = z.object({
  id: z.string(),
  label: z.string(),
  kind: PropKind,
  options: z.array(Opt).optional(),
  options_ref: z.string().optional(),
  exclusive_options: z.array(z.string()).optional(),
  phrase: Phrase.optional(),
  unit: z.string().optional(),
  note: z.string().optional(),
});
type RawProp = z.infer<typeof Prop>;

const RedFlag = z.object({
  id: z.string(),
  label: z.string(),
  kind: z.enum(["danger", "risk_factor", "exposure"]),
  sensitivity: z.string().optional(),
});
export type RedFlag = z.infer<typeof RedFlag>;

const Sex = z.enum(["female", "male"]).nullable();
const Sensitivity = z.enum([
  "standard",
  "hiv",
  "tb",
  "mental_health",
  "sexual_reproductive_health",
]);

const Symptom = z.object({
  id: z.string().regex(/^sym\./),
  label: z.string(),
  systems: z.array(z.string()),
  family: z.string(),
  synonyms: z.array(z.string()),
  local_terms: z.array(z.string()),
  applies_to_sex: Sex,
  sensitivity: Sensitivity,
  duration: z.boolean(),
  offer_as_complaint: z.boolean(),
  in_review_of_systems: z.boolean(),
  option_overrides: z.record(z.string(), z.array(Opt)).optional(),
  extra_properties: z.array(Prop).optional(),
  extra_families: z.array(z.string()).optional(),
  hide_properties: z.array(z.string()).optional(),
  red_flags: z.array(RedFlag),
  associated: z.array(z.string()),
  also_ask: z.array(z.object({ id: z.string(), label: z.string() })),
});
export type Symptom = z.infer<typeof Symptom>;

const Cond = z.record(z.string(), z.unknown());
const Rule = z.object({
  id: z.string(),
  level: z.enum(["urgent", "caution"]),
  badge: z.string(),
  reason: z.string(),
  applies_to: z.union([z.string(), z.array(z.string())]),
  when: Cond,
  source: z.union([z.string(), z.array(z.string())]),
  status: z.string(),
  shown_in: z.string(),
  restricted: z.boolean().optional(),
  note: z.string().optional(),
});
export type FlagRule = z.infer<typeof Rule>;

const RefEntry = z.object({
  value: z.union([z.number(), z.array(z.string())]),
  unit: z.string(),
  meaning: z.string().optional(),
  source: z.string(),
  status: z.string(),
});

const Labelled = z.array(Opt);
const CatalogueSchema = z
  .object({
    id: z.literal("MS-EMR-CLERK-CAT-001"),
    version: z.string(),
    sources: z.record(
      z.string(),
      z.object({ title: z.string(), verified: z.boolean() }).passthrough(),
    ),
    option_sets: z.record(z.string(), Labelled),
    property_families: z.record(
      z.string(),
      z.object({ label: z.string(), properties: z.array(Prop) }),
    ),
    symptoms: z.array(Symptom),
    review_of_systems: z.object({
      systems: z.array(
        z.object({
          id: z.string(),
          label: z.string(),
          applies_to_sex: Sex.optional(),
          items: z.array(z.string()),
        }),
      ),
      extra_placements: z.array(
        z.object({
          system: z.string(),
          item: z.string(),
          applies_to_sex: Sex,
          note: z.string().optional(),
        }),
      ),
    }),
    complaint_quick_picks: z.array(z.string()),
    linked_answers: z.object({
      rules: z.array(z.record(z.string(), z.unknown())),
      red_flag_symptom_map: z.record(z.string(), z.string()),
    }),
    reference_entries: z.record(z.string(), RefEntry),
    flag_rules: z.array(Rule),
    past_history: z
      .object({
        conditions: Labelled,
        since_options_ref: z.string(),
        transfusions: z
          .object({
            fields: z.array(
              z.object({ id: z.string(), kind: z.string(), options: Labelled.optional() }),
            ),
          })
          .passthrough(),
      })
      .passthrough(),
    medicines: z
      .object({ quick_picks: Labelled, frequency: Labelled, adherence: Labelled, source: Labelled })
      .passthrough(),
    allergies: z
      .object({
        quick_picks: Labelled,
        reactions: Labelled,
        severity: Labelled,
        source: Labelled,
        status_actions: Labelled,
      })
      .passthrough(),
    family_history: z.object({ conditions: Labelled, relations_ref: z.string() }).passthrough(),
    social_history: z.object({
      tobacco: z
        .object({ status: Labelled, other_forms: Labelled, quit_when: Labelled })
        .passthrough(),
      alcohol: z.object({ pattern: Labelled, types: Labelled }).passthrough(),
      other_substances: z.object({ options: Labelled, sensitivity: z.string() }),
      living: Labelled,
      activity: Labelled,
      occupation: z.object({ hints: z.array(z.string()) }).passthrough(),
      travel: z.object({ options: Labelled }).passthrough(),
      diet: Labelled,
    }),
  })
  .passthrough();
export type CatalogueData = z.infer<typeof CatalogueSchema>;

/** A property as the editor renders it: options resolved, overrides applied. */
export interface Property extends Omit<RawProp, "options" | "options_ref"> {
  options: Option[];
}

export interface Catalogue {
  data: CatalogueData;
  version: string;
  symptom: (id: string) => Symptom | undefined;
  symptoms: readonly Symptom[];
  /** Duration (when the symptom has one) comes first and is not in this list. */
  properties: (id: string) => Property[];
  refValue: (id: string) => number | string[] | undefined;
}

/** The complaint's "With" row: its associated symptoms, whose ids are symptom ids (linked answers). */
export const ASSOCIATED = "associated";

export function parseCatalogue(json: unknown): Catalogue {
  const data = CatalogueSchema.parse(json);
  const byId = new Map(data.symptoms.map((s) => [s.id, s]));
  const families = data.property_families;
  const resolve = (p: RawProp, overrides?: Record<string, Option[]>): Property => {
    const { options, options_ref, ...rest } = p;
    const set = options_ref ? data.option_sets[options_ref] : undefined;
    if (options_ref && !set) throw new Error(`Unknown option set ${options_ref} for ${p.id}`);
    return { ...rest, options: overrides?.[p.id] ?? set ?? options ?? [] };
  };
  const cache = new Map<string, Property[]>();
  const properties = (id: string): Property[] => {
    const hit = cache.get(id);
    if (hit) return hit;
    const s = byId.get(id);
    if (!s) return [];
    const fam = families[s.family];
    if (!fam) throw new Error(`Unknown family ${s.family} for ${id}`);
    const hidden = new Set(s.hide_properties ?? []);
    const list = [
      ...fam.properties.map((p) => resolve(p, s.option_overrides)),
      ...(s.extra_families ?? []).flatMap((f) => {
        const extra = families[f];
        if (!extra) throw new Error(`Unknown extra family ${f} for ${id}`);
        return extra.properties.map((p) => resolve(p, s.option_overrides));
      }),
      ...(s.extra_properties ?? []).map((p) => resolve(p, s.option_overrides)),
    ].filter(
      (p) =>
        !hidden.has(p.id) && (p.kind !== "one" && p.kind !== "many" ? true : p.options.length > 0),
    );
    if (s.associated.length)
      list.push({
        id: ASSOCIATED,
        label: "With",
        kind: "many",
        options: s.associated.flatMap((a) => {
          const t = byId.get(a);
          return t ? [{ id: a, label: t.label }] : [];
        }),
        phrase: { pre: "with ", post: "" },
      });
    cache.set(id, list);
    return list;
  };
  return {
    data,
    version: data.version,
    symptom: (id) => byId.get(id),
    symptoms: data.symptoms,
    properties,
    refValue: (id) => data.reference_entries[id]?.value,
  };
}

/* ─── Who a symptom or system applies to ────────────────────────── */

export type PatientSex = "female" | "male" | null;

export const appliesTo = (want: "female" | "male" | null | undefined, sex: PatientSex): boolean =>
  !want || sex === want;

export interface RosSystemView {
  id: string;
  label: string;
  items: Symptom[];
}

/** The review of systems for this patient: sex-appropriate systems and items only (C2). */
export function rosSystemsFor(cat: Catalogue, sex: PatientSex): RosSystemView[] {
  const extra = cat.data.review_of_systems.extra_placements.filter((p) =>
    appliesTo(p.applies_to_sex, sex),
  );
  return cat.data.review_of_systems.systems
    .filter((s) => appliesTo(s.applies_to_sex, sex))
    .map((s) => ({
      id: s.id,
      label: s.label,
      items: [...s.items, ...extra.filter((p) => p.system === s.id).map((p) => p.item)]
        .map((i) => cat.symptom(i))
        .filter((x): x is Symptom => !!x && appliesTo(x.applies_to_sex, sex)),
    }))
    .filter((s) => s.items.length > 0);
}

export const isRestricted = (sensitivity: string | undefined): boolean =>
  !!sensitivity && sensitivity !== "standard";

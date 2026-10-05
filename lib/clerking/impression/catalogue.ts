import { z } from "zod";

/**
 * The diagnosis reasoning catalogue (MS-EMR-DX-CAT-001, PROMPT-CLERKING-SUMMARY-IMPRESSION §6):
 * Zod schema, the indexes the engines read, and the sign-off gate (SI10). Pure. Clinical content
 * lives in the JSON; nothing here names a diagnosis, so a profile, rule or scale added to the JSON
 * works with no code. Terminology (display names, ICD-11 codes) stays owned by REF-DX-TERMS.
 */

export const RESTRICTED_CLASSES = [
  "hiv",
  "tb",
  "mental_health",
  "sexual_reproductive_health",
] as const;
export type RestrictedClass = (typeof RESTRICTED_CLASSES)[number];
const Restricted = z.enum(RESTRICTED_CLASSES);

/** An atom of the shared rule language (`flag_rule_language` plus the diagnosis atoms). The one
 *  evaluator (`lib/clerking/exam/context.ts` `evalCond`) reads it; the catalogue check validates
 *  every id inside it against the history and examination catalogues. */
export type Cond = Record<string, unknown>;
const CondSchema: z.ZodType<Cond> = z.record(z.string(), z.unknown());

const Evidence = z.object({ text: z.string(), atom: CondSchema }).strict();
export type EvidenceAtom = z.infer<typeof Evidence>;

const Ask = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("symptom"), id: z.string() }).strict(),
  z.object({ kind: z.literal("red_flag"), symptom: z.string(), red_flag: z.string() }).strict(),
  z.object({ kind: z.literal("past_condition"), id: z.string() }).strict(),
  z.object({ kind: z.literal("family_condition"), id: z.string() }).strict(),
  z.object({ kind: z.literal("medicine"), id: z.string() }).strict(),
  z.object({ kind: z.literal("social"), id: z.string() }).strict(),
  z.object({ kind: z.literal("exam_item"), id: z.string() }).strict(),
  z.object({ kind: z.literal("vital"), id: z.string() }).strict(),
  z.object({ kind: z.literal("classifier"), id: z.string() }).strict(),
  // EC-7: a vital-sign panel (vs.ketones) and a past-history detail ("diabetes.lows_12_months").
  z.object({ kind: z.literal("panel"), id: z.string() }).strict(),
  z
    .object({ kind: z.literal("past_detail"), id: z.string().regex(/^[a-z0-9_]+\.[a-z0-9_]+$/) })
    .strict(),
]);
export type AskTarget = z.infer<typeof Ask>;

const Onset = z.enum(["acute", "subacute", "chronic", "acute_on_chronic", "recurrent"]);
export type OnsetId = z.infer<typeof Onset>;

const Severity = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }).strict(),
  z.object({ kind: z.literal("clinician"), options: z.array(z.string()).min(1) }).strict(),
  z.object({ kind: z.literal("classifier"), id: z.string() }).strict(),
  z.object({ kind: z.literal("named_scale"), id: z.string() }).strict(),
]);
export type SeverityDef = z.infer<typeof Severity>;

const Profile = z
  .object({
    id: z.string().regex(/^dx\.[a-z0-9_]+$/),
    display_ref: z.literal("REF-DX-TERMS"),
    category: z.string(),
    kind: z.string(),
    restricted_class: Restricted.nullable(),
    onset: z.object({ allowed: z.array(Onset).min(1), default: Onset }).strict(),
    must_not_miss: z.boolean(),
    must_not_miss_reason: z.string().nullable(),
    time_critical: z.boolean(),
    severity: Severity,
    suggest_for: z.array(Evidence),
    suggest_against: z.array(Evidence),
    ask: z.array(Ask),
    tests_to_decide: z.array(z.string().regex(/^test\.[a-z0-9_]+$/)),
    problem_list: z.enum(["offer", "offer_when_final", "never"]),
    related: z.array(z.string()),
    note: z.string(),
    sources: z.array(z.string()),
    status: z.string(),
    /** A gate (EC-5): the profile is suggested, and its evidence read, only while this holds;
     *  unknown never opens it. `{ pregnancy: "current" }` bounds its results to the episode. */
    requires: CondSchema.optional(),
  })
  .strict()
  .refine((p) => !p.must_not_miss || !!p.must_not_miss_reason, {
    message: "a must-not-miss profile needs its reason",
  });
export type DxProfile = z.infer<typeof Profile>;

const Rule = z
  .object({
    id: z.string().regex(/^DDX-[A-Z0-9-]+$/),
    when: CondSchema,
    why: z.string(),
    suggest: z.array(z.string()).min(1),
    must_not_miss_first: z.array(z.string()),
    source: z.string(),
    status: z.string(),
  })
  .strict();
export type DdxRule = z.infer<typeof Rule>;

const RefEntry = z
  .object({
    // null: a product setting nobody has signed (D-DM-08); everything that reads it is unknown.
    value: z.union([z.number(), z.record(z.string(), z.number())]).nullable(),
    unit: z.string(),
    meaning: z.string(),
    source: z.string().nullable(),
    status: z.string(),
    /** The dossier entry this mirrors (provenance; MS-NCD-DM-PACK-001). */
    mirrors: z.union([z.string(), z.array(z.string())]).optional(),
    note: z.string().optional(),
  })
  .strict();

const NamedScale = z
  .object({
    label: z.string(),
    options: z.array(z.string()).min(1),
    source: z.string(),
    status: z.string(),
    note: z.string().optional(),
    ref_dm: z.union([z.string(), z.array(z.string())]).optional(),
  })
  .strict();
export type NamedScaleDef = z.infer<typeof NamedScale>;

const Raw = z
  .object({
    id: z.literal("MS-EMR-DX-CAT-001"),
    title: z.string(),
    version: z.string(),
    status: z.string(),
    generated: z.string(),
    scope: z.unknown(),
    owners: z.unknown(),
    conventions: z.record(z.string(), z.unknown()),
    categories: z.record(z.string(), z.string()),
    kinds: z.record(z.string(), z.string()),
    named_scales: z.record(z.string(), NamedScale),
    reference_entries: z.record(z.string().regex(/^REF-DX-[A-Z0-9-]+$/), RefEntry),
    sources: z.record(z.string(), z.unknown()),
    source_note: z.unknown(),
    profiles: z.record(z.string(), Profile),
    ddx_rules: z.array(Rule),
    engine_rules: z
      .object({
        sex_specific: z
          .object({
            female_only: z.array(z.string()),
            male_only: z.array(z.string()),
            rule: z.string(),
          })
          .strict(),
      })
      .catchall(z.string()),
    composer: z.unknown(),
    decisions_needed: z.array(z.unknown()),
    change_log: z.array(z.unknown()).optional(),
  })
  .strict()
  .superRefine((c, ctx) => {
    for (const [key, p] of Object.entries(c.profiles))
      if (key !== p.id)
        ctx.addIssue({ code: "custom", message: `profile key ${key} ≠ id ${p.id}` });
    const ids = new Set<string>();
    for (const r of c.ddx_rules) {
      if (ids.has(r.id)) ctx.addIssue({ code: "custom", message: `duplicate rule ${r.id}` });
      ids.add(r.id);
    }
  });
export type RawDxCatalogue = z.infer<typeof Raw>;

/** Which parts the CSO has signed (`data/clerking/dx-signoff.v1.json`). */
export interface DxSignoff {
  profiles: "all" | readonly string[];
  rules: "all" | readonly string[];
  referenceEntries: "all" | readonly string[];
  namedScales: "all" | readonly string[];
  withheld: readonly string[];
}

const signed = (list: "all" | readonly string[], withheld: readonly string[], id: string) =>
  !withheld.includes(id) && (list === "all" || list.includes(id));

export interface DxCatalogue {
  data: RawDxCatalogue;
  version: string;
  profile(id: string): DxProfile | undefined;
  readonly profiles: readonly DxProfile[];
  readonly rules: readonly DdxRule[];
  /** A REF-DX value: a number, or an object of limits ({ systolic_gte, diastolic_gte }). */
  refValue(id: string): number | Record<string, number> | null | undefined;
  refNumber(id: string): number | null;
  scale(id: string): NamedScaleDef | undefined;
  /** Profiles whose `ask` names this target key (see `askKey`). */
  askedBy(key: string): readonly DxProfile[];
}

/** One key per ask target, so the same question asked by two diagnoses is asked once. */
export function askKey(a: AskTarget): string {
  return a.kind === "red_flag" ? `red_flag:${a.symptom}#${a.red_flag}` : `${a.kind}:${a.id}`;
}

export function parseDxCatalogue(raw: unknown): DxCatalogue {
  const data = Raw.parse(raw);
  const profiles = Object.values(data.profiles);
  const byAsk = new Map<string, DxProfile[]>();
  for (const p of profiles)
    for (const a of p.ask) {
      const k = askKey(a);
      const list = byAsk.get(k);
      if (list) list.push(p);
      else byAsk.set(k, [p]);
    }
  return {
    data,
    version: data.version,
    profile: (id) => data.profiles[id],
    profiles,
    rules: data.ddx_rules,
    refValue: (id) => data.reference_entries[id]?.value,
    refNumber: (id) => {
      const v = data.reference_entries[id]?.value;
      return typeof v === "number" ? v : null;
    },
    scale: (id) => data.named_scales[id],
    askedBy: (key) => byAsk.get(key) ?? [],
  };
}

/** The live gate (SI10): unsigned or withheld content is never evaluated. */
export interface DxLive {
  profile(id: string): boolean;
  rule(id: string): boolean;
  ref(id: string): boolean;
  scale(id: string): boolean;
}

export function dxLive(s: DxSignoff): DxLive {
  return {
    profile: (id) => signed(s.profiles, s.withheld, id),
    rule: (id) => signed(s.rules, s.withheld, id),
    ref: (id) => signed(s.referenceEntries, s.withheld, id),
    scale: (id) => signed(s.namedScales, s.withheld, id),
  };
}

/** Every REF-DX id an atom reads (so a withheld reference switches off what reads it). */
export function refsOf(c: unknown, out: string[] = []): string[] {
  if (Array.isArray(c)) for (const x of c) refsOf(x, out);
  else if (c && typeof c === "object")
    for (const v of Object.values(c as Record<string, unknown>)) refsOf(v, out);
  else if (typeof c === "string" && c.startsWith("REF-DX-")) out.push(c);
  return out;
}

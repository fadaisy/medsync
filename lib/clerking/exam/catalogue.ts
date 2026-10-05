import { z } from "zod";

/**
 * The examination catalogue (MS-EMR-EXAM-CAT-001, PROMPT-CLERKING-EXAM-V2 §6): Zod schema and the
 * indexes the engines and the desk read. Pure. Clinical content lives in the JSON; nothing here
 * names an item, so an item of any response type added to the JSON renders with no code (E1).
 */

const Sensitivity = z.enum([
  "standard",
  "hiv",
  "sexual_reproductive_health",
  "mental_health",
  "tb",
]);
export type ExamSensitivity = z.infer<typeof Sensitivity>;
const Sex = z.enum(["female", "male"]).nullable();

const Mirror = z.object({
  item: z.string(),
  attribute: z.string().optional(),
  option: z.string().optional(),
  /** The owner item positive with these attribute values (e.g. pitting oedema of both legs). */
  attrs: z.record(z.string(), z.string()).optional(),
});
export type MirrorTarget = z.infer<typeof Mirror>;

const ShownWhenOne = z.object({ attribute: z.string(), any_of: z.array(z.string()) });
/** One condition, or `all` of several (EC-7: a retinopathy grade needs an adequate view AND a
 *  dilated or photographic method). */
const ShownWhen = z.union([ShownWhenOne, z.object({ all: z.array(ShownWhenOne).min(1) })]);
export type ShownWhenDef = z.infer<typeof ShownWhen>;
export const shownWhenParts = (s: ShownWhenDef) => ("all" in s ? s.all : [s]);

export interface ExamOption {
  id: string;
  label: string;
  expected?: boolean;
  attributes?: ExamAttribute[];
  who_stage_hint?: number | null;
  note?: string;
  mirror_of?: MirrorTarget | MirrorTarget[];
  mirror_rule?: string;
  sensitivity?: ExamSensitivity;
}

export interface ExamAttribute {
  id: string;
  label: string;
  kind: "one" | "many" | "number" | "zones" | "scale" | "shared";
  options?: ExamOption[];
  unit?: string;
  start?: number;
  step?: number;
  min?: number;
  /** null: no upper bound (a count, an ulcer area). */
  max?: number | null;
  range?: [number, number];
  scale?: string;
  body_map?: string;
  shared_with?: { item: string; attribute: string };
  shown_when?: ShownWhenDef;
  applies_to_sex?: "female" | "male" | null;
  /** Recorded on a normal finding too, and recording it never makes the finding abnormal (how a
   *  fundus was looked at, and the grade it showed). */
  any_state?: boolean;
}

const Option: z.ZodType<ExamOption> = z.lazy(() =>
  z
    .object({
      id: z.string().regex(/^[a-z0-9_]+$/),
      label: z.string(),
      expected: z.boolean().optional(),
      attributes: z.array(Attribute).optional(),
      who_stage_hint: z.number().nullable().optional(),
      note: z.string().optional(),
      mirror_of: z.union([Mirror, z.array(Mirror)]).optional(),
      mirror_rule: z.string().optional(),
      sensitivity: Sensitivity.optional(),
    })
    .strict(),
);

const Attribute: z.ZodType<ExamAttribute> = z.lazy(() =>
  z
    .object({
      id: z.string().regex(/^[a-z0-9_]+$/),
      label: z.string(),
      kind: z.enum(["one", "many", "number", "zones", "scale", "shared"]),
      options: z.array(Option).optional(),
      unit: z.string().optional(),
      start: z.number().optional(),
      step: z.number().optional(),
      min: z.number().optional(),
      max: z.number().nullable().optional(),
      stored: z.string().optional(),
      range: z.tuple([z.number(), z.number()]).optional(),
      scale: z.string().optional(),
      body_map: z.string().optional(),
      shared_with: z.object({ item: z.string(), attribute: z.string() }).optional(),
      shown_when: ShownWhen.optional(),
      applies_to_sex: Sex.optional(),
      any_state: z.boolean().optional(),
      in_prototype: z.boolean().optional(),
      prototype_id: z.string().optional(),
    })
    .strict()
    .superRefine((a, ctx) => {
      const needsOptions = a.kind === "one" || a.kind === "many";
      if (needsOptions && !a.options?.length)
        ctx.addIssue({ code: "custom", message: `${a.id}: ${a.kind} needs options` });
      if (a.kind === "number" && (a.min === undefined || a.max === undefined || !a.step))
        ctx.addIssue({
          code: "custom",
          message: `${a.id}: number needs min, max (or null) and step`,
        });
      if (a.kind === "shared" && !a.shared_with)
        ctx.addIssue({ code: "custom", message: `${a.id}: shared needs shared_with` });
      if (a.kind === "zones" && !a.options?.length && !a.body_map)
        ctx.addIssue({ code: "custom", message: `${a.id}: zones needs a body map or options` });
    }),
);

const Paired = z.object({
  negative_label: z.string(),
  positive_label: z.string(),
  severity: z.object({ classifier: z.string(), components: z.array(z.string()) }).optional(),
});
const Response = z.discriminatedUnion("type", [
  Paired.extend({ type: z.literal("presence") }),
  Paired.extend({ type: z.literal("test") }),
  Paired.extend({ type: z.literal("state") }),
  Paired.extend({ type: z.literal("device") }),
  z.object({ type: z.literal("choice"), options: z.array(Option).min(2) }),
  z.object({ type: z.literal("classified"), classifier: z.string() }),
  z.object({ type: z.literal("measured"), classifier: z.string() }),
  z.object({
    type: z.literal("link"),
    owner: z.string(),
    also: z.string().optional(),
    shows: z.string().optional(),
  }),
]);
export type ResponseType = z.infer<typeof Response>["type"];

const Item = z
  .object({
    id: z.string().regex(/^ex\.[a-z_]+\.[a-z0-9_]+$/),
    label: z.string(),
    response: Response,
    attributes: z.array(Attribute).optional(),
    phrase: z.object({ negative: z.string(), positive: z.string() }).optional(),
    sensitivity: Sensitivity,
    applies_to_sex: Sex,
    hint: z.object({ text: z.string().optional(), shows: z.string().optional() }).optional(),
    in_prototype: z.boolean().optional(),
    prototype_id: z.string().optional(),
  })
  .strict();
export type ExamItem = z.infer<typeof Item>;

const Part = z.object({
  id: z.string(),
  label: z.string(),
  method: z.string(),
  items: z.array(z.string()),
  block: z.string().optional(),
});
const System = z.object({
  id: z.string(),
  name: z.string(),
  parts: z.array(Part).min(1),
  gate: z.string().optional(),
  in_prototype: z.boolean().optional(),
});
export type ExamSystem = z.infer<typeof System>;
export type ExamPart = z.infer<typeof Part>;

const Cond = z.record(z.string(), z.unknown());
const FlagRule = z.object({
  id: z.string().regex(/^FLAG-EX-/),
  level: z.enum(["urgent", "caution"]),
  badge: z.string(),
  reason: z.string(),
  when: Cond,
  source: z.string(),
  also_source: z.string().optional(),
  status: z.string(),
  shown_in: z.string(),
  section: z.string(),
  restricted: z.boolean().optional(),
  note: z.string().optional(),
});
export type ExamFlagRule = z.infer<typeof FlagRule>;

const SuggestionRule = z.object({
  id: z.string().regex(/^SUG-/),
  when: Cond,
  why: z.string(),
  suggest: z.array(z.object({ target: z.string(), label: z.string() })).min(1),
  source: z.string(),
  status: z.string(),
});
export type SuggestionRule = z.infer<typeof SuggestionRule>;

const VitalField = z
  .object({
    id: z.string().regex(/^vs\./),
    label: z.string(),
    unit: z.string().optional(),
    plausible: z
      .union([
        z.tuple([z.number(), z.number()]),
        z.record(z.string(), z.tuple([z.number(), z.number()])),
      ])
      .optional(),
    qualifiers: z.record(z.string(), z.array(z.string())).optional(),
    from: z.string().optional(),
    classifier: z.string().optional(),
  })
  .passthrough();

const RefEntry = z
  .object({
    value: z.unknown(),
    unit: z.string().optional(),
    meaning: z.string().optional(),
    source: z.string(),
    status: z.string(),
  })
  .passthrough();

const Loose = z.record(z.string(), z.unknown());

const ExamCatalogueSchema = z
  .object({
    id: z.literal("MS-EMR-EXAM-CAT-001"),
    version: z.string(),
    sources: z.record(
      z.string(),
      z.object({ title: z.string(), verified: z.boolean() }).passthrough(),
    ),
    reference_entries: z.record(z.string().regex(/^REF-EX-/), RefEntry),
    scales: z.record(z.string(), Loose),
    classifiers: z.record(z.string(), Loose),
    vital_signs: z.object({ fields: z.array(VitalField), panels: z.unknown() }).passthrough(),
    blocks: z.record(z.string(), Loose),
    body_maps: z.object({
      lungs: z.object({ front: z.array(z.string()), back: z.array(z.string()) }),
      abdomen: z.array(z.string()).length(9),
      spine: z.array(z.string()),
    }),
    systems: z.array(System),
    items: z.record(z.string(), Item),
    shared_facts: z.array(Loose),
    not_examined: z.object({
      rule: z.string(),
      reasons: z.array(
        z
          .object({ id: z.string(), label: z.string(), equipment: z.array(z.string()).optional() })
          .passthrough(),
      ),
    }),
    gates: z.object({
      intimate: z
        .object({
          applies_to: z.array(z.string()),
          before_first_item: z.array(Loose),
          rules: z.array(z.string()),
        })
        .passthrough(),
    }),
    flag_rules: z.array(FlagRule),
    suggestion_rules: z.object({ principle: z.string(), rules: z.array(SuggestionRule) }),
    composer: z.object({ principle: z.string(), rules: z.array(z.string()) }),
    medicine_groups: z
      .record(
        z.string(),
        z.object({
          label: z.string(),
          drug_class: z.string(),
          name_stems: z.array(z.string()),
          exclude_words: z.array(z.string()).optional(),
        }),
      )
      .optional(),
  })
  .passthrough();
export type ExamCatalogueData = z.infer<typeof ExamCatalogueSchema>;

/** Where an option's value lives: the item, the attribute and the option. */
export interface OptionRef {
  item: string;
  attribute: string;
  option: string;
}

export interface MirrorEdge {
  from: OptionRef;
  to: readonly MirrorTarget[];
  /** Several owners (read-only here; true when any owner is), or a rule that says so. */
  readOnly: boolean;
}

export interface ExamCatalogue {
  data: ExamCatalogueData;
  version: string;
  item: (id: string) => ExamItem | undefined;
  items: readonly ExamItem[];
  systems: readonly ExamSystem[];
  system: (id: string) => ExamSystem | undefined;
  /** The system and part an item sits in. */
  placeOf: (itemId: string) => { system: ExamSystem; part: ExamPart } | undefined;
  itemsOf: (systemId: string, partId?: string) => ExamItem[];
  /** Every attribute an item can show, including a choice option's own attributes. */
  allAttributes: (item: ExamItem) => ExamAttribute[];
  attribute: (itemId: string, attributeId: string) => ExamAttribute | undefined;
  mirror: (ref: OptionRef) => MirrorEdge | undefined;
  mirrors: readonly MirrorEdge[];
  refValue: (id: string) => unknown;
  refNumber: (path: string) => number | null;
  /** The zones of a body-map attribute (`zones` kind), as options: id = the zone's slug. */
  zones: (a: ExamAttribute) => { id: string; label: string; view?: "front" | "back" }[];
  /** The grid rows, from the scales. */
  grids: {
    power: readonly { movement: string; root: string }[];
    reflexes: readonly { reflex: string; root: string }[];
    pulses: readonly string[];
  };
}

const GridScales = z.object({
  mrc_power: z
    .object({ rows: z.array(z.object({ movement: z.string(), root: z.string() })) })
    .passthrough(),
  ninds_reflex: z
    .object({ rows: z.array(z.object({ reflex: z.string(), root: z.string() })) })
    .passthrough(),
  pulses_grid: z.object({ rows: z.array(z.string()) }).passthrough(),
});

/** Applies to this patient: an item limited to one sex is hidden for the other recorded sex. An
 *  unrecorded sex shows the item (the desk prompts to record it); it is never assumed. */
export function appliesToSex(
  x: { applies_to_sex?: "female" | "male" | null },
  sex: "female" | "male" | null,
): boolean {
  return !x.applies_to_sex || !sex || x.applies_to_sex === sex;
}

export function parseExamCatalogue(json: unknown): ExamCatalogue {
  const data = ExamCatalogueSchema.parse(json);
  const items = Object.values(data.items);
  const byId = new Map(items.map((i) => [i.id, i]));
  const place = new Map<string, { system: ExamSystem; part: ExamPart }>();
  for (const system of data.systems)
    for (const part of system.parts)
      for (const id of part.items) {
        if (!byId.has(id))
          throw new Error(`Exam catalogue: ${system.id}/${part.id} lists unknown item ${id}`);
        if (place.has(id)) throw new Error(`Exam catalogue: ${id} is placed twice`);
        place.set(id, { system, part });
      }
  for (const i of items)
    if (!place.has(i.id)) throw new Error(`Exam catalogue: ${i.id} is in no part`);

  const allAttributes = (item: ExamItem): ExamAttribute[] => [
    ...(item.attributes ?? []),
    ...(item.response.type === "choice"
      ? item.response.options.flatMap((o) => o.attributes ?? [])
      : []),
  ];
  const attrIndex = new Map<string, ExamAttribute>();
  for (const i of items)
    for (const a of allAttributes(i)) {
      const key = `${i.id}:${a.id}`;
      if (attrIndex.has(key)) throw new Error(`Exam catalogue: duplicate attribute ${key}`);
      attrIndex.set(key, a);
    }
  const optionExists = (r: { item: string; attribute?: string; option?: string }) => {
    const it = byId.get(r.item);
    if (!it) return false;
    if (!r.attribute) return true;
    const a = attrIndex.get(`${r.item}:${r.attribute}`);
    return !!a && (!r.option || !!a.options?.some((o) => o.id === r.option));
  };

  // A block is addressed by its id, or by its part ("ex.general/consciousness" → "ex.general.consciousness").
  const blockIds = new Set(
    Object.values(data.blocks).map((b) => String(b.id ?? String(b.part).replace("/", "."))),
  );

  // Every shown_when names a real attribute and real options of the same item or option.
  for (const i of items) {
    const groups: ExamAttribute[][] = [
      i.attributes ?? [],
      ...(i.response.type === "choice" ? i.response.options.map((o) => o.attributes ?? []) : []),
    ];
    for (const group of groups)
      for (const a of group) {
        if (!a.shown_when) continue;
        for (const sw of shownWhenParts(a.shown_when)) {
          const parent = group.find((x) => x.id === sw.attribute);
          if (!parent?.options)
            throw new Error(`Exam catalogue: ${i.id}:${a.id} shown_when names no attribute`);
          for (const o of sw.any_of)
            if (!parent.options.some((p) => p.id === o))
              throw new Error(
                `Exam catalogue: ${i.id}:${a.id} shown_when names unknown option ${o}`,
              );
        }
      }
    for (const a of allAttributes(i))
      if (a.shared_with && !optionExists(a.shared_with))
        throw new Error(`Exam catalogue: ${i.id}:${a.id} shares an unknown attribute`);
    if (i.response.type === "link") {
      for (const owner of [i.response.owner, i.response.also].filter(Boolean) as string[])
        if (!byId.has(owner) && !blockIds.has(owner))
          throw new Error(`Exam catalogue: link ${i.id} names unknown owner ${owner}`);
    }
  }

  const mirrors: MirrorEdge[] = [];
  const mirrorIndex = new Map<string, MirrorEdge>();
  for (const i of items)
    for (const a of allAttributes(i))
      for (const o of a.options ?? []) {
        if (!o.mirror_of) continue;
        const to = Array.isArray(o.mirror_of) ? o.mirror_of : [o.mirror_of];
        for (const t of to)
          if (!optionExists(t))
            throw new Error(`Exam catalogue: mirror ${i.id}:${a.id}=${o.id} → unknown owner`);
        const edge: MirrorEdge = {
          from: { item: i.id, attribute: a.id, option: o.id },
          to,
          readOnly: to.length > 1 || /read-only/i.test(o.mirror_rule ?? ""),
        };
        mirrors.push(edge);
        mirrorIndex.set(`${i.id}:${a.id}:${o.id}`, edge);
      }

  const refValue = (id: string) => data.reference_entries[id]?.value;
  const scales = GridScales.parse(data.scales);
  const zoneSlug = (z: string) =>
    z
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
  const zones = (a: ExamAttribute) => {
    if (a.options?.length) return a.options.map((o) => ({ id: o.id, label: o.label }));
    const m = data.body_maps;
    if (a.body_map === "lungs")
      return [
        ...m.lungs.front.map((z) => ({ id: zoneSlug(z), label: z, view: "front" as const })),
        ...m.lungs.back.map((z) => ({ id: zoneSlug(z), label: z, view: "back" as const })),
      ];
    if (a.body_map === "abdomen" || a.body_map === "spine")
      return m[a.body_map].map((z) => ({ id: zoneSlug(z), label: z }));
    return [];
  };
  return {
    zones,
    grids: {
      power: scales.mrc_power.rows,
      reflexes: scales.ninds_reflex.rows,
      pulses: scales.pulses_grid.rows,
    },
    data,
    version: data.version,
    item: (id) => byId.get(id),
    items,
    systems: data.systems,
    system: (id) => data.systems.find((s) => s.id === id),
    placeOf: (id) => place.get(id),
    itemsOf: (systemId, partId) =>
      (data.systems.find((s) => s.id === systemId)?.parts ?? [])
        .filter((p) => !partId || p.id === partId)
        .flatMap((p) => p.items.map((id) => byId.get(id)!)),
    allAttributes,
    attribute: (itemId, attributeId) => attrIndex.get(`${itemId}:${attributeId}`),
    mirror: (r) => mirrorIndex.get(`${r.item}:${r.attribute}:${r.option}`),
    mirrors,
    refValue,
    /** "REF-EX-PEF-BANDS.severe_gte" reads a key of an object value. */
    refNumber: (path) => {
      const [id, key] = path.split(".");
      const v = refValue(id!);
      const n = key ? (v as Record<string, unknown> | undefined)?.[key] : v;
      return typeof n === "number" ? n : null;
    },
  };
}

import type { Catalogue } from "./catalogue";
import { z } from "zod";

/**
 * The legacy conversion table (MS-EMR-CLERK-LEGACY-001, data/clerking/legacy-conversion.v1.json):
 * what each v1 finding token becomes in payload v2, as data (Law 2). Signed by the CSO on
 * 2026-09-28 (docs/emr/clerking-v2/legacy-conversion-proposal.md §7); the sign-off file pins its
 * SHA-256. Pure.
 */

const sym = z.string().regex(/^sym\./);
const preset = z.record(z.string(), z.union([z.string(), z.array(z.string())]));

const Yes = z.union([
  z
    .object({
      set: sym,
      preset: preset.optional(),
      review: z.boolean().optional(),
      flag: z.string().optional(),
      prompt: z.string().optional(),
    })
    .strict(),
  z
    .object({
      choose: z.array(sym).min(1),
      preset: preset.optional(),
      text: z.boolean().optional(),
      flag: z.string().optional(),
    })
    .strict(),
  z.object({ property: z.object({ symptom: sym, property: z.string() }).strict() }).strict(),
  z.object({ bySex: z.object({ male: sym, female: sym }).strict() }).strict(),
  z.object({ route: z.enum(["pregnancy", "lnmp"]), propose: z.string().optional() }).strict(),
  z.object({ activity: z.array(z.string()).min(1) }).strict(),
  z.object({ text: z.literal(true) }).strict(),
]);

const No = z.union([
  z.null(),
  z.object({ set: z.array(sym).min(1) }).strict(),
  z.object({ notAsked: z.literal(true) }).strict(),
  z.object({ omit: z.literal(true) }).strict(),
  z.object({ bySex: z.object({ male: sym, female: sym }).strict() }).strict(),
  z.object({ route: z.literal("pregnancy"), propose: z.string() }).strict(),
  z.object({ activity: z.array(z.string()).length(1) }).strict(),
]);

const Row = z
  .object({
    label: z.string().optional(),
    outcome: z.enum([
      "convert",
      "convert_with_preset",
      "needs_choice",
      "split_by_sex",
      "route",
      "text",
    ]),
    yes: Yes,
    no: No,
  })
  .strict();
export type LegacyRow = z.infer<typeof Row>;
/** The conversion flags' signed wording (all the desk needs of the table in the browser). */
export type ConversionFlagDefs = Record<
  string,
  { level: "urgent" | "caution"; badge: string; reason: string; restricted: boolean }
>;
export type LegacyYes = z.infer<typeof Yes>;
export type LegacyNo = z.infer<typeof No>;

const TableSchema = z.object({
  id: z.literal("MS-EMR-CLERK-LEGACY-001"),
  version: z.string(),
  catalogue: z.literal("MS-EMR-CLERK-CAT-001"),
  catalogueVersion: z.string(),
  proposal: z.string(),
  note: z.string(),
  flags: z.record(
    z.string(),
    z.object({
      level: z.enum(["urgent", "caution"]),
      badge: z.string(),
      reason: z.string(),
      restricted: z.boolean(),
    }),
  ),
  codes: z.record(z.string(), Row),
  concepts: z.record(z.string(), Row),
});
export type LegacyTable = z.infer<typeof TableSchema> & {
  /** One lookup over codes and concepts. */
  row: (token: string) => LegacyRow | undefined;
  /** "MS-EMR-CLERK-LEGACY-001 1.0.0" */
  ref: string;
};

export function parseLegacyTable(json: unknown): LegacyTable {
  const t = TableSchema.parse(json);
  return {
    ...t,
    row: (token) =>
      Object.hasOwn(t.codes, token)
        ? t.codes[token]
        : Object.hasOwn(t.concepts, token)
          ? t.concepts[token]
          : undefined,
    ref: `${t.id} ${t.version}`,
  };
}

const PREGNANCY_STATES = ["pregnant", "postpartum", "not_pregnant", "unknown"];

/** Every id the table names exists in the catalogue (clerking:catalogue-check and the tests). */
export function legacyTableProblems(t: LegacyTable, cat: Catalogue): string[] {
  const out: string[] = [];
  if (t.catalogueVersion !== cat.version)
    out.push(`table is for catalogue ${t.catalogueVersion}, catalogue is ${cat.version}`);
  const symptom = (where: string, id: string) => {
    if (!cat.symptom(id)) out.push(`${where}: unknown symptom ${id}`);
  };
  const presetOk = (where: string, ids: readonly string[], p: Record<string, unknown>) => {
    for (const id of ids)
      for (const [prop, v] of Object.entries(p)) {
        const def = cat.properties(id).find((x) => x.id === prop);
        if (!def) {
          out.push(`${where}: ${id} has no property ${prop}`);
          continue;
        }
        const vals = Array.isArray(v) ? v : [v];
        if (Array.isArray(v) !== (def.kind === "many"))
          out.push(`${where}: ${id}.${prop} is ${def.kind}`);
        for (const x of vals)
          if (!def.options.some((o) => o.id === x))
            out.push(`${where}: ${id}.${prop} has no option ${x}`);
      }
  };
  const activity = new Set(cat.data.social_history.activity.map((o) => o.id));
  const check = (token: string, r: LegacyRow) => {
    const y = r.yes;
    if ("set" in y) {
      symptom(token, y.set);
      if (y.preset) presetOk(token, [y.set], y.preset);
      if (y.prompt && !cat.properties(y.set).some((p) => p.id === y.prompt))
        out.push(`${token}: ${y.set} has no property ${y.prompt}`);
      if (y.flag && !t.flags[y.flag]) out.push(`${token}: unknown flag ${y.flag}`);
    } else if ("choose" in y) {
      y.choose.forEach((s) => symptom(token, s));
      if (y.preset) presetOk(token, y.choose, y.preset);
      if (y.flag && !t.flags[y.flag]) out.push(`${token}: unknown flag ${y.flag}`);
    } else if ("property" in y) {
      symptom(token, y.property.symptom);
      if (!cat.properties(y.property.symptom).some((p) => p.id === y.property.property))
        out.push(`${token}: ${y.property.symptom} has no property ${y.property.property}`);
    } else if ("bySex" in y) {
      symptom(token, y.bySex.male);
      symptom(token, y.bySex.female);
    } else if ("activity" in y) {
      y.activity.forEach((a) => activity.has(a) || out.push(`${token}: unknown activity ${a}`));
    } else if ("route" in y && y.propose && !PREGNANCY_STATES.includes(y.propose))
      out.push(`${token}: unknown pregnancy state ${y.propose}`);
    const n = r.no;
    if (n && "set" in n) n.set.forEach((s) => symptom(token, s));
    if (n && "bySex" in n) {
      symptom(token, n.bySex.male);
      symptom(token, n.bySex.female);
    }
    if (n && "activity" in n)
      n.activity.forEach((a) => activity.has(a) || out.push(`${token}: unknown activity ${a}`));
    if (n && "route" in n && !PREGNANCY_STATES.includes(n.propose))
      out.push(`${token}: unknown pregnancy state ${n.propose}`);
  };
  for (const [k, r] of Object.entries(t.codes)) check(k, r);
  for (const [k, r] of Object.entries(t.concepts)) check(k, r);
  return out;
}

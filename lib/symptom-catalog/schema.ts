import type {
  CategoryKey,
  SubmissionAudience,
} from "@/supabase/functions/_shared/symptom-catalog/types";
import { z } from "zod";

import {
  MAX_ITEMS_PER_CATEGORY_VIEW,
  MAX_LABEL_WORDS,
  MAX_QUALIFIERS_PER_ITEM,
} from "@/supabase/functions/_shared/symptom-catalog/types";

/**
 * Zod schemas for the patient symptom catalog content package (PRD
 * MS-PRD-SYM-001 §6.2, §9.1; ADR 0098 ruling 4). Web-side only — the
 * package itself is zero-import and the phone and Edge Functions trust the
 * generated const; this is the gate the build and the content test run.
 *
 * The hard caps are here, not in copy: ≤ 8 items per category PER AUDIENCE
 * VIEW (what one audience actually sees in a sheet — the one-screen budget,
 * PRD §7.2), ≤ 2 qualifiers per item, a label of ≤ 9 words, and at least one
 * source for every E and U item. Cross-references (sources, i18n keys) are
 * checked on the whole package so a dangling key cannot ship.
 */

const TIER = z.enum(["E", "U", "R"]);
const SUBMISSION_AUDIENCE = z.enum(["adult", "child_u2m", "child_2m_5y", "child_5_12", "pregnant"]);
const AUDIENCE = z.enum([...SUBMISSION_AUDIENCE.options, "all"]);
const CATEGORY_KEY = z.enum([
  "breathing_chest",
  "head_brain_nerves",
  "belly_digestion",
  "fever_infection",
  "injuries_cuts_burns",
  "blood_pressure_sugar",
  "eyes_ears_nose_throat",
  "urine_private_pregnancy",
  "bones_joints_muscles",
  "skin",
  "mood_sleep_mind",
  "child_illness",
]);
const ITEM_FLAG = z.enum(["isolation", "crisis_route", "sv_route", "stroke_time"]);
const SERVICE_LINE = z.enum([
  "general",
  "cardiology",
  "diabetes_ncd",
  "renal",
  "eye",
  "ent",
  "maternity",
  "paediatrics",
  "mental_health",
  "surgery",
  "dermatology",
  "orthopaedics",
  "tb",
]);

/** `SYM.<CAT>.<NAME>` — and the CAT segment names the item's category. */
export const ITEM_KEY = /^SYM\.([A-Z]+)\.([A-Z0-9_]+)$/;
export const CATEGORY_CODE: Record<CategoryKey, string> = {
  breathing_chest: "CHEST",
  head_brain_nerves: "HEAD",
  belly_digestion: "BELLY",
  fever_infection: "FEVER",
  injuries_cuts_burns: "INJURY",
  blood_pressure_sugar: "NCD",
  eyes_ears_nose_throat: "ENT",
  urine_private_pregnancy: "URINE",
  bones_joints_muscles: "BONES",
  skin: "SKIN",
  mood_sleep_mind: "MOOD",
  child_illness: "CHILD",
};

export const qualifierOptionSchema = z.object({
  key: z.string().min(1),
  labelKey: z.string().min(1),
  escalatesTo: TIER.optional(),
});

export const qualifierSchema = z.object({
  key: z.string().min(1),
  promptKey: z.string().min(1),
  options: qualifierOptionSchema.array().min(2),
});

export const catalogItemSchema = z.object({
  key: z.string().regex(ITEM_KEY, "Item keys are shaped SYM.<CAT>.<NAME>"),
  category: CATEGORY_KEY,
  // Empty is legal for exactly one kind of row: a landing affordance that no
  // category sheet lists (today: SYM.NCD.ROUTINE_REVIEW). The content test
  // pins that list so an accidental [] cannot hide a symptom.
  audience: AUDIENCE.array(),
  tier: TIER,
  labelKey: z.string().min(1),
  helperKey: z.string().min(1).optional(),
  icon: z.string().min(1),
  synonyms: z.string().min(1).array(),
  qualifiers: qualifierSchema.array().max(MAX_QUALIFIERS_PER_ITEM).optional(),
  serviceLineHint: SERVICE_LINE.optional(),
  triageDiscriminatorRef: z.string().min(1).nullable(),
  reasoningTokenRef: z.string().min(1).nullable(),
  flags: ITEM_FLAG.array().optional(),
  sourceRefs: z.string().min(1).array(),
  dangerSignFor: SUBMISSION_AUDIENCE.array().optional(),
});

export const categorySchema = z.object({
  key: CATEGORY_KEY,
  labelKey: z.string().min(1),
  icon: z.string().min(1),
  slot: z.number().int().min(1).max(12),
  audience: SUBMISSION_AUDIENCE.array().min(1).optional(),
});

const ruleSchema = z.discriminatedUnion("kind", [
  z.object({ id: z.literal("R1"), kind: z.literal("item_tier"), tier: z.literal("E") }),
  z.object({ id: z.literal("R2"), kind: z.literal("qualifier_escalates") }),
  z.object({
    id: z.literal("R3"),
    kind: z.literal("audience_modifier"),
    when: z.object({ audience: SUBMISSION_AUDIENCE, anyOf: z.string().array().min(1) }),
    tier: TIER,
    note: z.string().min(1),
  }),
  z.object({
    id: z.literal("R4"),
    kind: z.literal("combination"),
    when: z.object({ allOfGroups: z.string().array().min(1).array().min(2) }),
    tier: TIER,
    flags: ITEM_FLAG.array(),
    note: z.string().min(1),
  }),
  z.object({ id: z.literal("R5"), kind: z.literal("max_item_tier") }),
  z.object({ id: z.literal("R6"), kind: z.literal("free_text_inert") }),
  z.object({ id: z.literal("R7"), kind: z.literal("rules_are_data") }),
]);

export const ruleSetSchema = z.object({
  version: z.string().min(1),
  rules: ruleSchema.array().min(1),
});

export const emergencyContactSeedSchema = z.object({
  key: z.string().regex(/^[A-Z0-9_.]+$/),
  label: z.string().min(1),
  number: z.string().min(1).nullable(),
  scope: z.enum(["national", "district", "facility"]),
  district: z.string().min(1).nullable(),
  kind: z.enum(["general", "ambulance", "crisis", "sv"]),
  priority: z.number().int().min(1),
  verificationStatus: z.enum(["verified", "unverified", "to_source"]),
  basis: z.string().min(1),
});

const packageShape = z.object({
  version: z.string().min(1),
  status: z.enum(["draft", "signed", "retired"]),
  categories: categorySchema.array().length(12),
  items: catalogItemSchema.array().min(1),
  rules: ruleSetSchema,
  sources: z.record(z.string(), z.string().min(1)),
  en: z.record(z.string(), z.string().min(1)),
});

const wordCount = (s: string) => s.trim().split(/\s+/).length;

/** The whole package, with every cross-reference and cap checked. */
export const catalogPackageSchema = packageShape.superRefine((pkg, ctx) => {
  const issue = (path: (string | number)[], message: string) =>
    ctx.addIssue({ code: "custom", path, message });
  const inEn = (key: string | undefined, path: (string | number)[]) => {
    if (key !== undefined && !(key in pkg.en)) issue(path, `i18n key "${key}" missing from en`);
  };

  const itemKeys = new Set<string>();
  const perView = new Map<string, number>();
  const audiences = SUBMISSION_AUDIENCE.options;

  pkg.categories.forEach((c, i) => inEn(c.labelKey, ["categories", i, "labelKey"]));

  pkg.items.forEach((item, i) => {
    const path = ["items", i];
    if (itemKeys.has(item.key)) issue([...path, "key"], `duplicate item key ${item.key}`);
    itemKeys.add(item.key);
    const code = ITEM_KEY.exec(item.key)?.[1];
    if (code !== CATEGORY_CODE[item.category]) {
      issue(
        [...path, "key"],
        `${item.key} is in ${item.category}, expected SYM.${CATEGORY_CODE[item.category]}.*`,
      );
    }

    inEn(item.labelKey, [...path, "labelKey"]);
    inEn(item.helperKey, [...path, "helperKey"]);
    const label = pkg.en[item.labelKey];
    if (label !== undefined && wordCount(label) > MAX_LABEL_WORDS) {
      issue([...path, "labelKey"], `label "${label}" is over ${MAX_LABEL_WORDS} words`);
    }

    item.qualifiers?.forEach((q, qi) => {
      inEn(q.promptKey, [...path, "qualifiers", qi, "promptKey"]);
      q.options.forEach((o, oi) =>
        inEn(o.labelKey, [...path, "qualifiers", qi, "options", oi, "labelKey"]),
      );
    });

    if (item.tier !== "R" && item.sourceRefs.length === 0) {
      issue([...path, "sourceRefs"], `${item.key} is tier ${item.tier} and needs a source`);
    }
    item.sourceRefs.forEach((ref, ri) => {
      if (!(ref in pkg.sources)) issue([...path, "sourceRefs", ri], `unknown source ${ref}`);
    });

    // Per audience VIEW: an "all" item is in every view; a listed one in its own.
    const sees = (a: SubmissionAudience) =>
      item.audience.includes("all") || item.audience.includes(a);
    for (const a of audiences) {
      if (!sees(a)) continue;
      const k = `${item.category}/${a}`;
      perView.set(k, (perView.get(k) ?? 0) + 1);
    }
  });

  for (const [view, n] of perView) {
    if (n > MAX_ITEMS_PER_CATEGORY_VIEW) {
      issue(["items"], `${view} shows ${n} items; the cap is ${MAX_ITEMS_PER_CATEGORY_VIEW}`);
    }
  }

  const ruleRefs = (keys: string[], path: (string | number)[]) =>
    keys.forEach((k, ki) => {
      if (!itemKeys.has(k)) issue([...path, ki], `rule references unknown item ${k}`);
    });
  pkg.rules.rules.forEach((r, ri) => {
    if (r.kind === "audience_modifier")
      ruleRefs(r.when.anyOf, ["rules", "rules", ri, "when", "anyOf"]);
    if (r.kind === "combination") {
      r.when.allOfGroups.forEach((g, gi) =>
        ruleRefs(g, ["rules", "rules", ri, "when", "allOfGroups", gi]),
      );
    }
  });
});

export type CatalogPackageInput = z.input<typeof catalogPackageSchema>;

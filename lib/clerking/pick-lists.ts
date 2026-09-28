import type { PatientSex } from "./catalogue";
import { z } from "zod";

import occupationsRaw from "@/data/clerking/occupations.v1.json";
import raw from "@/data/clerking/operations.v1.json";
import { appliesTo } from "./catalogue";

/**
 * Pick lists beside a free-text field: past operations (MS-EMR-CLERK-OPS-001, by specialty) and
 * occupations (MS-EMR-CLERK-OCC-001, by kind of work). A pick stores its id beside the label as text;
 * anything else is typed as the patient names it (text, no id).
 */

const Item = z.object({
  id: z.string().regex(/^(op|occ)\.[a-z0-9_]+$/),
  label: z.string().min(1),
  terms: z.array(z.string()).default([]),
  applies_to_sex: z.enum(["female", "male"]).optional(),
  sensitivity: z.enum(["standard", "sexual_reproductive_health"]).default("standard"),
});
const File = z.object({
  id: z.string(),
  version: z.string(),
  groups: z.array(z.object({ id: z.string(), label: z.string(), items: z.array(Item).min(1) })),
});

export type Operation = z.infer<typeof Item>;
export const OPERATIONS = File.parse(raw);

const BY_ID = new Map(OPERATIONS.groups.flatMap((g) => g.items.map((o) => [o.id, o] as const)));
export const operationById = (id: string | undefined) => (id ? BY_ID.get(id) : undefined);

/** The groups for this patient: items for the other sex drop out, empty groups with them. */
export function operationGroups(sex: PatientSex) {
  return OPERATIONS.groups
    .map((g) => ({ ...g, items: g.items.filter((o) => appliesTo(o.applies_to_sex, sex)) }))
    .filter((g) => g.items.length);
}

export const OCCUPATIONS = File.parse(occupationsRaw);
const OCC_BY_LABEL = new Map(
  OCCUPATIONS.groups.flatMap((g) => g.items.map((o) => [o.label.toLowerCase(), o] as const)),
);
/** The list's occupation these words name exactly (any case), if any. */
export const occupationByLabel = (text: string) => OCC_BY_LABEL.get(text.trim().toLowerCase());

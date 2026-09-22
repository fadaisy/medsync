/**
 * A stored `symptom_submissions` row → the words the clinic reads (ADR 0098
 * ruling 3). The submission keeps catalog KEYS and the qualifier answers;
 * the appointment's `symptoms` jsonb and the intake's `presenting_complaint`
 * carry lay LABELS, because a staff card prints words, never keys. Both the
 * same-day path (`pt-request-same-day`) and the queue door
 * (`pt-declare-intake`) go through here so the two doors cannot phrase one
 * report two ways. Unknown keys (a retired catalog) are dropped, never
 * thrown: the row already passed `pt-submit-symptoms`.
 */
import type { CatalogPackage, Tier } from "./symptom-catalog/types.ts";
import type { BookingSymptom } from "./symptoms.ts";

import { t } from "./symptom-catalog/classify.ts";
import { MAX_SYMPTOMS } from "./symptoms.ts";

/** The columns both doors read off a submission. */
export interface SubmissionSymptomsRow {
  items: unknown;
  qualifiers: unknown;
}

/** Advisory tier → the intake's `priority_hint` (PRD §4 "priority flag"; ADR 0098 ruling 6). */
export const TIER_PRIORITY_HINT: Record<Tier, "urgent" | "high" | "routine"> = {
  E: "urgent",
  U: "high",
  R: "routine",
};

export function submissionSymptoms(
  pkg: CatalogPackage,
  row: SubmissionSymptomsRow,
): BookingSymptom[] {
  const keys = Array.isArray(row.items) ? row.items.filter((k) => typeof k === "string") : [];
  const answers =
    row.qualifiers && typeof row.qualifiers === "object" && !Array.isArray(row.qualifiers)
      ? (row.qualifiers as Record<string, Record<string, string> | undefined>)
      : {};
  const byKey = new Map(pkg.items.map((i) => [i.key, i]));
  const out: BookingSymptom[] = [];
  for (const key of keys) {
    if (out.length >= MAX_SYMPTOMS) break;
    const item = byKey.get(key);
    if (!item) continue;
    const entry: BookingSymptom = { code: item.key, label: t(pkg, item.labelKey) };
    const qualifiers = (item.qualifiers ?? []).flatMap((q) => {
      const chosen = answers[item.key]?.[q.key];
      const option = q.options.find((o) => o.key === chosen);
      return option ? [{ key: q.key, option: option.key, label: t(pkg, option.labelKey) }] : [];
    });
    if (qualifiers.length) entry.qualifiers = qualifiers;
    out.push(entry);
  }
  return out;
}

import type { History } from "./answers";
import type { ReportedItem } from "@/lib/patient/reported-history";

import { OTHER, reportedLabel, sinceFromYear } from "@/lib/patient/reported-history";

/**
 * The desk's view of what the patient reported on their phone (ADR 0414): which rows are still
 * open (neither answered in this note, nor on the record, nor dismissed at this visit), and the
 * draft a confirm makes. Pure; components/clerking/patient-reported.tsx draws the rows.
 */

const live = (items: readonly ReportedItem[] | undefined, h: History, kind: ReportedItem["kind"]) =>
  (items ?? []).filter((i) => i.kind === kind && !(h.reportedDismissed ?? []).includes(i.id));

/** Conditions the clinician has not answered yet in this note. */
export function openConditions(items: readonly ReportedItem[] | undefined, h: History) {
  return live(items, h, "condition").filter(
    (i) => i.itemId === OTHER || !i.itemId || !h.past.conditions[i.itemId],
  );
}

/** Confirm: a yes in this note, with "known for" from the patient's year (kept if already set). */
export function withReportedCondition(h: History, i: ReportedItem, now: Date): History {
  if (!i.itemId || i.itemId === OTHER) return h;
  const cur = h.past.conditions[i.itemId];
  const since = sinceFromYear(i.onsetYear, now) ?? cur?.since;
  return {
    ...h,
    past: {
      ...h.past,
      conditions: {
        ...h.past.conditions,
        [i.itemId]: { ...cur, answer: "yes", ...(since ? { since } : {}) },
      },
    },
  };
}

/** Family conditions not answered in this note, one row per condition with every relative named. */
export function openFamily(items: readonly ReportedItem[] | undefined, h: History) {
  const rows = new Map<
    string,
    { itemId: string | null; label: string; relations: string[]; ids: string[] }
  >();
  for (const i of live(items, h, "family")) {
    if (i.itemId && i.itemId !== OTHER && h.family[i.itemId]) continue;
    const key = i.itemId && i.itemId !== OTHER ? i.itemId : `own:${i.id}`;
    const row = rows.get(key) ?? {
      itemId: i.itemId === OTHER ? null : i.itemId,
      label: reportedLabel(i),
      relations: [],
      ids: [],
    };
    if (i.relation && !row.relations.includes(i.relation)) row.relations.push(i.relation);
    row.ids.push(i.id);
    rows.set(key, row);
  }
  return [...rows.values()];
}

/** Confirm: a yes in this note for those relatives (any already chosen stay). */
export function withReportedFamily(
  h: History,
  itemId: string,
  relations: readonly string[],
): History {
  const cur = h.family[itemId];
  const all = [...new Set([...(cur?.relations ?? []), ...relations])].slice(0, 6);
  return {
    ...h,
    family: { ...h.family, [itemId]: { answer: "yes", ...(all.length ? { relations: all } : {}) } },
  };
}

/** Allergies not already on the record under the same name. */
export function openAllergies(
  items: readonly ReportedItem[] | undefined,
  h: History,
  recorded: readonly string[],
) {
  const names = new Set(recorded.map((n) => n.trim().toLowerCase()));
  return live(items, h, "allergy").filter((i) => !names.has(reportedLabel(i).trim().toLowerCase()));
}

/** The patient says "no known allergies" and the record has no status yet. */
export function reportsNoKnownAllergies(
  items: readonly ReportedItem[] | undefined,
  h: History,
  recordStatus: string,
) {
  return recordStatus === "not_recorded" && live(items, h, "no_known_allergies").length > 0;
}

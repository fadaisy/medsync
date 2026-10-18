import type { ReportedInput, ReportedItem, ReportedKind } from "@patient/reported-history";
import { isSensitive, OTHER, OTHER_MAX, reportedLabel } from "@patient/reported-history";

/**
 * The history editor's pure rules (ADR 0355): which section is which kind, what a draft must hold
 * before it saves, and the draft → rows a save writes.
 */

export type Section = "conditions" | "allergies" | "family";

export const SECTION_KIND: Record<Section, Exclude<ReportedKind, "no_known_allergies">> = {
  conditions: "condition",
  allergies: "allergy",
  family: "family",
};

export const SECTION_WORDS: Record<
  Section,
  { title: string; add: string; pick: string; empty: string; one: string }
> = {
  conditions: {
    title: "My conditions",
    add: "Add a condition",
    pick: "Which condition?",
    empty: "No conditions added yet.",
    one: "condition",
  },
  allergies: {
    title: "Allergies",
    add: "Add an allergy",
    pick: "Allergic to what?",
    empty: "No allergies added yet.",
    one: "allergy",
  },
  family: {
    title: "Family history",
    add: "Add a family condition",
    pick: "Which condition runs in your family?",
    empty: "Nothing added yet.",
    one: "family condition",
  },
};

export const asSection = (v: unknown): Section =>
  v === "allergies" || v === "family" ? v : "conditions";

export interface Draft {
  itemId: string | null;
  otherText: string;
  /** As typed: "2019", or "". */
  year: string;
  resolved: boolean;
  /** Family: one or more when adding, exactly one when changing a row. */
  relations: string[];
  reactions: string[];
  severity: string | null;
}

export const EMPTY_DRAFT: Draft = {
  itemId: null,
  otherText: "",
  year: "",
  resolved: false,
  relations: [],
  reactions: [],
  severity: null,
};

export function draftOf(i: ReportedItem): Draft {
  return {
    itemId: i.itemId,
    otherText: i.otherText ?? "",
    year: i.onsetYear ? String(i.onsetYear) : "",
    resolved: !!i.resolved,
    relations: i.relation ? [i.relation] : [],
    reactions: i.reactions,
    severity: i.severity,
  };
}

/** Why the draft cannot be saved yet, or null. Mirrors 0175's checks. */
export function draftProblem(section: Section, d: Draft, now: Date): string | null {
  if (!d.itemId) return "Pick one from the list, or add it in your own words.";
  if (d.itemId === OTHER) {
    const n = d.otherText.trim().length;
    if (!n) return "Write what it is.";
    if (n > OTHER_MAX) return `Use ${OTHER_MAX} characters or fewer.`;
  }
  if (section === "conditions" && d.year.trim()) {
    const y = Number(d.year);
    if (!/^\d{4}$/.test(d.year.trim()) || y < 1900 || y > now.getFullYear())
      return `Write the year as four digits, ${now.getFullYear()} or earlier.`;
  }
  if (section === "family" && !d.relations.length) return "Choose who in your family.";
  return null;
}

/** The rows a save writes: one, or one per relative for a new family condition. */
export function rowsOf(section: Section, d: Draft): ReportedInput[] {
  const base: ReportedInput = {
    kind: SECTION_KIND[section],
    itemId: d.itemId,
    otherText: d.itemId === OTHER ? d.otherText.trim() : null,
    onsetYear: null,
    resolved: null,
    relation: null,
    reactions: [],
    severity: null,
  };
  if (section === "conditions")
    return [{ ...base, onsetYear: d.year.trim() ? Number(d.year) : null, resolved: d.resolved }];
  if (section === "allergies") return [{ ...base, reactions: d.reactions, severity: d.severity }];
  return d.relations.map((relation) => ({ ...base, relation }));
}

/** Toggle a reaction; "Not known" stands alone. */
export function toggleReaction(list: string[], id: string): string[] {
  if (list.includes(id)) return list.filter((r) => r !== id);
  if (id === "not_known") return ["not_known"];
  return [...list.filter((r) => r !== "not_known"), id];
}

/**
 * The card's back and Help's medic card: the conditions the patient still has (never a private
 * one: HIV, TB, mental health, pregnancy), and every allergy. Older free-text conditions from the
 * web profile stand in while nothing is listed here.
 */
export function cardLines(
  h: { conditions: ReportedItem[]; allergies: ReportedItem[]; noKnownAllergies: boolean },
  legacy: readonly string[],
): { conditions: string; allergies: string } {
  const current = h.conditions.filter((c) => !c.resolved && !isSensitive(c)).map(reportedLabel);
  const conditions = current.length ? current : h.conditions.length ? [] : [...legacy];
  return {
    conditions: conditions.length ? conditions.join(" · ") : "None listed",
    allergies: h.allergies.length
      ? h.allergies.map(reportedLabel).join(" · ")
      : h.noKnownAllergies
        ? "No known allergies"
        : "None listed",
  };
}

import type { ReportedInput, ReportedItem, ReportedKind } from "../../lib/patient/reported-history";

import { isSensitive, OTHER, OTHER_MAX, reportedLabel } from "../../lib/patient/reported-history";

/**
 * Me: the health card and the history editors' pure rules, moved verbatim from the phone's
 * `mobile/src/features/history/logic.ts` (ADR 0414) and the formatting half of `mobile/src/data/me.ts`, so
 * the phone and the web cannot disagree about what the card's back shows (S18: a private entry, HIV, TB,
 * mental health or pregnancy, never does). The phone re-exports these once its files switch over.
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

/** Why the draft cannot be saved yet, or null. Mirrors 0189's checks. */
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

/** The history split by kind, as the phone's `useHistory` gives it. */
export function splitHistory(items: readonly ReportedItem[]) {
  const of = (k: ReportedKind) => items.filter((i) => i.kind === k);
  return {
    conditions: of("condition"),
    allergies: of("allergy"),
    family: of("family"),
    noKnownAllergies: of("no_known_allergies").length > 0,
  };
}

/* ── Card formatting (mobile/src/data/me.ts) ─────────────────────────── */

/** "MS-2026-00042" → "MS 2026 00042": spaced for the card's mono line. */
export function cardNumber(code: string | null): string {
  return code ? code.replace(/-/g, " ") : "Given at your first visit";
}

/**
 * Whole years from a "YYYY-MM-DD" date of birth to `now`, or null when there
 * is no usable date. A birthday later this year has not happened yet.
 */
export function ageFrom(dob: string | null, now: Date): number | null {
  const m = dob ? /^(\d{4})-(\d{2})-(\d{2})/.exec(dob) : null;
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const before =
    now.getMonth() + 1 < mo || (now.getMonth() + 1 === mo && now.getDate() < d) ? 1 : 0;
  const age = now.getFullYear() - y - before;
  return age >= 0 && age < 130 ? age : null;
}

/** "34 years", or null. */
export function ageWords(dob: string | null, now: Date): string | null {
  const age = ageFrom(dob, now);
  return age === null ? null : `${age} ${age === 1 ? "year" : "years"}`;
}

/** `patient_profiles.sex` → the card's one letter; anything else says nothing. */
export function sexLetter(sex: string | null): string | null {
  const s = sex?.toLowerCase();
  return s === "female" ? "F" : s === "male" ? "M" : null;
}

/** "First Last" → "FL". */
export function initials(name: string | null): string {
  if (!name) return "Me";
  const parts = name.split(/\s+/).filter(Boolean);
  if (!parts.length) return "Me";
  return (
    (parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")
  ).toUpperCase();
}

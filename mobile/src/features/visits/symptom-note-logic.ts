import type { CatalogPackage, SubmissionAudience, Tier } from "@shared/symptom-catalog/types";
import type { BookingSymptom } from "@shared/symptoms";
import { classify, t } from "@shared/symptom-catalog/classify";

/**
 * What the patient chose on Ask for a day from the symptom catalogue v0.1
 * (MS-PRD-SYM-001, ADR 0098): item keys and their qualifier answers, the
 * classifier's own input shape.
 */
export interface NoteSelection {
  items: string[];
  qualifiers: Record<string, Record<string, string>>;
}

export const EMPTY_NOTE: NoteSelection = { items: [], qualifiers: {} };

/**
 * The tier the catalogue gives these choices, or null when nothing is chosen.
 * Advice to the patient only (E: get help now, U: be seen today); the booking
 * goes ahead whatever it says, and hospital triage always re-assesses.
 */
export function noteTier(
  sel: NoteSelection,
  audience: SubmissionAudience,
  pkg: CatalogPackage,
): { tier: Tier; because: string } | null {
  if (!sel.items.length) return null;
  const c = classify({ audience, items: sel.items, qualifiers: sel.qualifiers }, pkg);
  const item = pkg.items.find((i) => i.key === c.reasons[0]);
  return { tier: c.tier, because: item ? t(pkg, item.labelKey) : "" };
}

/** The choices as the request's `symptoms` (ADR 0095 as amended by ADR 0098): words for the clinic, no tier. */
export function bookingSymptoms(sel: NoteSelection, pkg: CatalogPackage): BookingSymptom[] {
  return sel.items.flatMap((key) => {
    const item = pkg.items.find((i) => i.key === key);
    if (!item) return [];
    const answers = sel.qualifiers[key] ?? {};
    const qualifiers = (item.qualifiers ?? []).flatMap((q) => {
      const option = q.options.find((o) => o.key === answers[q.key]);
      return option ? [{ key: q.key, option: option.key, label: t(pkg, option.labelKey) }] : [];
    });
    return [
      {
        code: key,
        label: t(pkg, item.labelKey),
        duration: null,
        ...(qualifiers.length ? { qualifiers } : {}),
      },
    ];
  });
}

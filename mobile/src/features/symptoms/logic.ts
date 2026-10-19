import type {
  CatalogItem,
  CatalogPackage,
  Qualifier,
  SubmissionAudience,
} from "@shared/symptom-catalog/types";
import type { SymptomDuration } from "@shared/symptoms";
import { classify } from "@shared/symptom-catalog/classify";
import { MAX_FREE_TEXT } from "@shared/symptom-catalog/types";
import { symptomDurationLabel } from "@shared/symptoms";

/** What the three steps hand to the review: the classifier's input plus the patient's words. */
export interface StepsSelection {
  audience: SubmissionAudience;
  pregnant: boolean;
  items: string[];
  qualifiers: Record<string, Record<string, string>>;
}

/**
 * The emergency item to open the in-place Help panel for, or null. Derived
 * from the local classification (PRD §5.4), so a qualifier answer or a
 * combination rule that makes the whole choice E opens it too. A reason the
 * patient said is not happening now stays declined until it is chosen again.
 */
export function interruptOf(
  sel: StepsSelection,
  declined: string[],
  pkg: CatalogPackage,
): CatalogItem | null {
  if (!sel.items.length) return null;
  const c = classify(sel, pkg);
  if (c.tier !== "E") return null;
  const key = c.reasons.find((k) => !declined.includes(k));
  return pkg.items.find((i) => i.key === key) ?? null;
}

/** Step 2's cards: each chosen item's own follow-up questions, catalogue order. */
export function followUps(chosen: CatalogItem[]): { item: CatalogItem; q: Qualifier }[] {
  return chosen.flatMap((item) => (item.qualifiers ?? []).map((q) => ({ item, q })));
}

/**
 * The note the clinic reads: when it started first, then the patient's own
 * words, within the server's cap. The report has no duration field, so the
 * answer rides in the words.
 */
export function noteFor(freeText: string, since: SymptomDuration | null): string {
  const words = freeText.trim();
  const label = since ? symptomDurationLabel(since) : "";
  const when = !label
    ? ""
    : /^started/i.test(label)
      ? `${label}.`
      : `Started: ${label.toLowerCase()}.`;
  return [when, words].filter(Boolean).join(" ").slice(0, MAX_FREE_TEXT);
}

/** Who the symptoms are about, as the patient answers it (PRD §6.1). */
export interface AudienceChoice {
  who: "me" | "child" | "other";
  band: "child_u2m" | "child_2m_5y" | "child_5_12";
  pregnant: boolean;
}

export const DEFAULT_AUDIENCE: AudienceChoice = { who: "me", band: "child_2m_5y", pregnant: false };
export const CHILD_BANDS: AudienceChoice["band"][] = ["child_u2m", "child_2m_5y", "child_5_12"];

/** The catalogue audience the choice resolves to: what `classify` and the server see. */
export function toAudience(choice: AudienceChoice): SubmissionAudience {
  if (choice.who === "child") return choice.band;
  return choice.pregnant ? "pregnant" : "adult";
}

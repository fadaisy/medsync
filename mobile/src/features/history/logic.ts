import type { Section } from "@patient-core/me-health";

export type { Draft, Section } from "@patient-core/me-health";
export {
  EMPTY_DRAFT,
  SECTION_KIND,
  SECTION_WORDS,
  cardLines,
  draftOf,
  draftProblem,
  rowsOf,
  toggleReaction,
} from "@patient-core/me-health";

export const asSection = (v: unknown): Section =>
  v === "allergies" || v === "family" ? v : "conditions";

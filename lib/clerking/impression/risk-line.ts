import RISKS from "@/data/clerking/dx-risk-factors.v1.json";
import { riskFactorsOf } from "./relations-catalogue";

/**
 * "Risk factors on record: …" under an outcome (R2, D-REL-04): derived from what the record already
 * holds (this visit's diagnoses, the problem list, the social history), never asserted by the desk.
 * A factor already linked as this outcome's cause is left out, so nothing is named twice; the line
 * takes the stricter restricted class of the outcome and every factor it names. Pure.
 */

export interface RiskOnRecord {
  dxId: string;
  display: string;
  restrictedClass: string | null;
}

export interface RiskLine {
  factors: RiskOnRecord[];
  exposures: { id: string; display: string }[];
  restrictedClasses: string[];
}

const EXPOSURES = (
  RISKS as unknown as {
    exposures_from_social_history: { id: string; display: string; outcomes: string[] }[];
  }
).exposures_from_social_history;

export function riskLine(
  outcome: string,
  i: {
    onRecord: readonly RiskOnRecord[];
    /** dx ids already linked as this outcome's cause (due_to). */
    linkedCauses: ReadonlySet<string>;
    /** Social-history exposures that are recorded present (exposure.tobacco_current …). */
    exposuresPresent: ReadonlySet<string>;
    outcomeClass: string | null;
  },
): RiskLine | null {
  const wanted = new Map(riskFactorsOf(outcome).map((r) => [r.id, r]));
  const factors = i.onRecord.filter((r) => wanted.has(r.dxId) && !i.linkedCauses.has(r.dxId));
  const exposures = EXPOSURES.filter(
    (e) => e.outcomes.includes(outcome) && i.exposuresPresent.has(e.id),
  ).map(({ id, display }) => ({ id, display }));
  if (!factors.length && !exposures.length) return null;
  const restrictedClasses = [
    ...new Set(
      [i.outcomeClass, ...factors.map((f) => f.restrictedClass)].filter((c): c is string => !!c),
    ),
  ];
  return { factors, exposures, restrictedClasses };
}

/** The line's words: "Risk factors on record: type 2 diabetes, hypertension; current tobacco use." */
export const riskWords = (l: RiskLine) =>
  `Risk factors on record: ${[
    l.factors.map((f) => f.display.toLowerCase()).join(", "),
    l.exposures.map((e) => e.display.toLowerCase()).join(", "),
  ]
    .filter(Boolean)
    .join("; ")}.`;

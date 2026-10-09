import RISKS from "@/data/clerking/dx-risk-factors.v1.json";
import { refinesFrom, riskFactorsOf } from "./relations-catalogue";

/**
 * "Risk factors on record: …" under an outcome (R2, D-REL-04): derived from what the record already
 * holds (this visit's diagnoses, the problem list, the social history), never asserted by the desk.
 * A factor already linked as this outcome's cause is left out, so nothing is named twice; the line
 * takes the stricter restricted class of the outcome and every factor it names. Pure.
 */

export interface RiskOnRecord {
  dxId: string;
  /** The condition on record (a `risk_factor_for` relation names it when the line is included). */
  logicalId?: string;
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

/** Where an included factor came from, stored on its `risk_factor_for` relation. */
export const riskRef = (factor: string, outcome: string) =>
  `${RISKS.id}@${RISKS.version}:${factor}->${outcome}`;

/** The line's words: "Risk factors on record: type 2 diabetes, hypertension; current tobacco use." */
export const riskWords = (l: RiskLine) =>
  `Risk factors on record: ${[
    l.factors.map((f) => f.display.toLowerCase()).join(", "),
    l.exposures.map((e) => e.display.toLowerCase()).join(", "),
  ]
    .filter(Boolean)
    .join("; ")}.`;

/** The outcome a diagnosis's risk factors are listed under: itself, or what it was refined from
 *  (NSTEMI → NSTE-ACS → ACS). */
export function outcomeOf(dx: string): string {
  let d = dx;
  for (let n = 0; n < 4; n++) {
    if (riskFactorsOf(d).length || EXPOSURES.some((e) => e.outcomes.includes(d))) return d;
    const up = refinesFrom(d);
    if (!up) break;
    d = up;
  }
  return dx;
}

/** The social history's exposures present, by the clerking's own rules (as lib/ncd/pack/
 *  from-clerking.ts reads them): tobacco current (or another form), CAGE two or more yes,
 *  exercise inactive. Blank is never present. */
export function exposuresFrom(so: {
  tobacco?: string;
  otherForms?: readonly string[];
  cage?: Readonly<Record<string, string | undefined>>;
  exercise?: string;
}): Set<string> {
  const out = new Set<string>();
  if (so.tobacco === "current" || so.otherForms?.length) out.add("exposure.tobacco_current");
  if (Object.values(so.cage ?? {}).filter((a) => a === "yes").length >= 2)
    out.add("exposure.alcohol_harmful");
  if (so.exercise === "inactive") out.add("exposure.physical_inactivity");
  return out;
}

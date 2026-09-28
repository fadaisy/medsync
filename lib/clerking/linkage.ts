import type { Complaint, History, YesNo } from "./answers";
import type { Catalogue } from "./catalogue";

import { ASSOCIATED } from "./catalogue";

/**
 * Complaint → review-of-systems linked answers (catalogue `linked_answers`, D-CV-08). One fact, one
 * answer: a symptom recorded in Complaint reads as a linked answer in Systems and cannot be
 * answered there. Derived on every render, never stored, so removing the complaint brings back
 * whatever the clinician had answered before (C3).
 */

export interface Linked {
  answer: YesNo;
  /** The complaint it comes from. */
  from: string;
}

interface SelfRule {
  from: string;
  property: "self";
  sets: Record<string, "yes" | "yes_if_property">;
  conditions?: Record<string, { property: string; equals?: string; gte?: number }>;
}

export function linkedAnswers(
  cat: Catalogue,
  complaints: readonly Complaint[],
): Map<string, Linked> {
  const out = new Map<string, Linked>();
  const put = (symptom: string, answer: YesNo, from: string) => {
    const cur = out.get(symptom);
    // A yes from anywhere beats a no (the symptom is there).
    if (!cur || (cur.answer === "no" && answer === "yes")) out.set(symptom, { answer, from });
  };
  const selfRules = cat.data.linked_answers.rules.filter(
    (r): r is SelfRule & Record<string, unknown> =>
      r.property === "self" && typeof r.from === "string",
  );
  const flagMap = cat.data.linked_answers.red_flag_symptom_map;

  for (const c of complaints) {
    if (!c.symptom) continue; // uncatalogued: never drives engines
    put(c.symptom, "yes", c.key);
    for (const r of selfRules.filter((x) => x.from === c.symptom)) {
      for (const [sym, how] of Object.entries(r.sets)) {
        if (how === "yes") put(sym, "yes", c.key);
        const cond = r.conditions?.[sym];
        if (how === "yes_if_property" && cond) {
          const v = c.props[cond.property];
          const ok =
            cond.equals !== undefined
              ? v === cond.equals
              : cond.gte !== undefined
                ? typeof v === "number" && v >= cond.gte
                : false;
          if (ok) put(sym, "yes", c.key);
        }
      }
    }
    const assoc = c.props[ASSOCIATED];
    if (Array.isArray(assoc)) for (const a of assoc) put(a, "yes", c.key);
    for (const [flag, answer] of Object.entries(c.flags)) {
      const sym = flagMap[flag];
      if (sym) put(sym, answer, c.key);
    }
  }
  return out;
}

/** The answer the review of systems shows: linked first, then the clinician's own. */
export function rosAnswer(
  h: History,
  linked: ReadonlyMap<string, Linked>,
  symptom: string,
): YesNo | undefined {
  return linked.get(symptom)?.answer ?? h.ros[symptom];
}

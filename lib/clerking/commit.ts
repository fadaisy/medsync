import type { History, SymptomEntry } from "./answers";
import type { Catalogue, PatientSex } from "./catalogue";

import { durationDays } from "./answers";
import { isRestricted, rosSystemsFor } from "./catalogue";
import { linkedAnswers, rosAnswer } from "./linkage";
import { RELATION_TO_SUBJECT } from "./record-map";

/**
 * What a signed v2 note commits (gate-a §5, D-EMR-01), as observation lines for
 * insertObservations, in the note's transaction:
 *   - every catalogued complaint: a present finding, with its catalogue qualifiers;
 *   - every review-of-systems answer (the clinician's own and the linked ones): present or absent;
 *   - tobacco status as `soc.tobacco` (H4). Pack-years and the rest of social history stay in the
 *     note until the CFC v1.2 addendum is signed.
 * Findings map to the shared vocabulary through data/clerking/token-map.v1.json; a token with no
 * CFC concept stays in the note (counted as unmapped), as v1 does. Pure.
 */

export interface CommitLine {
  conceptId: string;
  value: { type: "presence"; presence: "present" | "absent" } | { type: "coded"; code: string };
  context: Record<string, unknown>;
  restricted: boolean;
}

export function v2CommitLines(
  cat: Catalogue,
  tokenMap: Readonly<Record<string, string>>,
  conceptForToken: (token: string) => string | null,
  history: History,
  sex: PatientSex,
): { lines: CommitLine[]; unmapped: number } {
  const lines: CommitLine[] = [];
  const seen = new Set<string>();
  let unmapped = 0;
  const catalogue = { id: cat.data.id, version: cat.version };

  const add = (
    symptom: string,
    presence: "present" | "absent",
    e: SymptomEntry | undefined,
    complaint: boolean,
  ) => {
    if (seen.has(symptom)) return;
    seen.add(symptom);
    const s = cat.symptom(symptom);
    const token = tokenMap[symptom];
    const conceptId = token ? conceptForToken(token) : null;
    if (!s || !conceptId) {
      unmapped++;
      return;
    }
    const context: Record<string, unknown> = {
      elicitedBy: "history",
      catalogue,
      catalogueSymptom: symptom,
    };
    if (complaint) context.presentingComplaint = true;
    if (e) {
      const days = durationDays(e.duration);
      if (days !== null) context.durationDays = Math.round(days * 100) / 100;
      if (typeof e.props.onset === "string") context.onset = e.props.onset;
      if (Object.keys(e.props).length) context.qualifiers = e.props;
      if (Object.keys(e.flags).length) context.redFlags = e.flags;
    }
    lines.push({
      conceptId,
      value: { type: "presence", presence },
      context,
      restricted: isRestricted(s.sensitivity),
    });
  };

  for (const c of history.complaints) if (c.symptom) add(c.symptom, "present", c, true);
  const linked = linkedAnswers(cat, history.complaints);
  for (const sys of rosSystemsFor(cat, sex))
    for (const s of sys.items) {
      const a = rosAnswer(history, linked, s.id);
      if (a) add(s.id, a === "yes" ? "present" : "absent", history.rosDetail[s.id], false);
    }

  const t = history.social;
  const smokeless = (t.otherForms ?? []).some((f) => f === "snuff" || f === "chewed");
  const code =
    t.tobacco === "current"
      ? "current_daily"
      : smokeless
        ? "smokeless_current"
        : t.tobacco === "former"
          ? "former"
          : t.tobacco === "never"
            ? "never"
            : null;
  if (code)
    lines.push({
      conceptId: "soc.tobacco",
      value: { type: "coded", code },
      context: { catalogue },
      restricted: false,
    });

  return { lines, unmapped };
}

/** Family history answered yes, one line per relative (H3: never `self`; H13: written at signing). */
export function familyConditions(cat: Catalogue, history: History) {
  const out: {
    condition: string;
    label: string;
    relation: string;
    subject: (typeof RELATION_TO_SUBJECT)[string];
    restricted: boolean;
  }[] = [];
  for (const c of cat.data.family_history.conditions) {
    const a = history.family[c.id];
    if (a?.answer !== "yes") continue;
    for (const r of a.relations?.length ? a.relations : ["other_relative"]) {
      const subject = RELATION_TO_SUBJECT[r];
      if (subject)
        out.push({
          condition: c.id,
          label: c.label,
          relation: r,
          subject,
          restricted: isRestricted(c.sensitivity),
        });
    }
  }
  return out;
}

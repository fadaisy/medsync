import type { ExamCatalogue } from "./catalogue";
import type { ExamContext } from "./context";
import type { AttrValue, ExamDraft } from "./payload";

import { readAttr } from "./answers";
import { dehydration } from "./classifiers";

/**
 * What signing charts from the examination (PROMPT-CLERKING-EXAM-V2 §8, GATE A HX5–HX6): the
 * findings whose token map names an existing CFC concept (exam-token-map.csv, "matched" or
 * "broader"), each with its option ids as qualifiers and `elicitedBy: examination`; MUAC,
 * capillary refill and the pain score as observations; GTFCC as `sign.dehydration`; BMI and
 * waist-to-height as derived facts with their inputs. Everything else stays in the signed note
 * with its catalogue ids until the CFC v1.3 addendum adds concepts. Pure.
 */

export interface ExamCommitLine {
  conceptId: string;
  value:
    | { type: "presence"; presence: "present" | "absent" }
    | { type: "coded"; code: string }
    | { type: "quantity"; value: number; unit: string };
  context: Record<string, unknown>;
  restricted: boolean;
}

/** Item → CFC presence finding (the token map's item-level matches). */
const ITEM_FINDING: Record<string, string> = {
  "ex.general.pallor": "sign.pallor",
  "ex.general.jaundice": "sign.jaundice",
  "ex.general.cyanosis": "sign.cyanosis",
  "ex.general.clubbing": "sign.clubbing",
  "ex.general.lymph_nodes": "sign.lymphadenopathy",
  "ex.general.oedema": "sign.oedema",
  "ex.nervous.neck_stiffness": "sign.neck_stiffness",
};
/** Feet findings: laterality is required context. */
const FOOT_FINDING: Record<string, string> = {
  "ex.feet.ulcer": "sign.foot_ulcer",
  "ex.feet.gangrene": "sign.gangrene",
  "ex.feet.deformity": "sign.foot_deformity",
};
/** Option → CFC presence finding (present only when ticked; never inferred absent). */
const OPTION_FINDING: { item: string; attribute: string; option: string; concept: string }[] = [
  {
    item: "ex.general.odour",
    attribute: "smells",
    option: "ketones_fruity",
    concept: "sign.ketotic_breath",
  },
  {
    item: "ex.respiratory.breathing_pattern",
    attribute: "pattern",
    option: "kussmaul_deep_sighing",
    concept: "sign.kussmaul_breathing",
  },
  { item: "ex.feet.skin_nails", attribute: "seen", option: "callus", concept: "sign.foot_callus" },
];

const LATERALITY: Record<string, string> = { left: "left", right: "right", both: "bilateral" };
const restrictedClass = (s?: string) => !!s && s !== "standard";

export function examCommitLines(
  ecat: ExamCatalogue,
  exam: ExamDraft,
  /** Only for the GTFCC grade (it reads the history for diarrhoea or vomiting). */
  x: ExamContext | null,
): { lines: ExamCommitLine[]; unmapped: number } {
  const lines: ExamCommitLine[] = [];
  const catalogue = { id: ecat.data.id, version: ecat.version };
  const ctx = (item: string, extra: Record<string, unknown> = {}) => ({
    elicitedBy: "examination",
    catalogue,
    catalogueItem: item,
    ...extra,
  });
  const qualifiers = (attrs?: Record<string, AttrValue>) =>
    attrs && Object.keys(attrs).length ? { qualifiers: attrs } : {};
  const written = new Set<string>();

  for (const [item, concept] of Object.entries(ITEM_FINDING)) {
    const e = exam.entries[item];
    if (!e || e.state === "not_examined") continue;
    written.add(item);
    lines.push({
      conceptId: concept,
      value: { type: "presence", presence: e.state === "positive" ? "present" : "absent" },
      context: ctx(item, qualifiers(e.attrs)),
      restricted: restrictedClass(ecat.item(item)?.sensitivity),
    });
  }
  for (const [item, concept] of Object.entries(FOOT_FINDING)) {
    const e = exam.entries[item];
    if (!e || e.state === "not_examined") continue;
    const side = e.state === "negative" ? "bilateral" : LATERALITY[String(e.attrs?.side ?? "")];
    if (!side) continue; // a positive foot finding needs its side (CFC laterality)
    written.add(item);
    lines.push({
      conceptId: concept,
      value: { type: "presence", presence: e.state === "positive" ? "present" : "absent" },
      context: ctx(item, { laterality: side, ...qualifiers(e.attrs) }),
      restricted: false,
    });
  }
  for (const o of OPTION_FINDING) {
    const v = readAttr(ecat, exam, o.item, o.attribute);
    if (!(Array.isArray(v) ? v.includes(o.option) : v === o.option)) continue;
    const side = LATERALITY[String(exam.entries[o.item]?.attrs?.side ?? "")];
    lines.push({
      conceptId: o.concept,
      value: { type: "presence", presence: "present" },
      context: ctx(o.item, { catalogueOption: o.option, ...(side ? { laterality: side } : {}) }),
      restricted: false,
    });
  }

  // GTFCC: written only as none / some / severe; below the threshold or not graded writes nothing.
  const hydration = exam.entries["ex.general.hydration"];
  if (hydration && x) {
    const g = dehydration(x);
    if (
      g.status === "result" &&
      (g.result === "none" || g.result === "some" || g.result === "severe")
    ) {
      written.add("ex.general.hydration");
      lines.push({
        conceptId: "sign.dehydration",
        value: { type: "coded", code: g.result },
        context: ctx("ex.general.hydration", {
          classifier: "dehydration_gtfcc",
          inputs: g.inputs,
          ruleVersion: ecat.version,
        }),
        restricted: false,
      });
    }
  }

  const muac = exam.entries["ex.general.nutrition"]?.attrs?.muac;
  if (typeof muac === "number") {
    written.add("ex.general.nutrition");
    lines.push({
      conceptId: "obs.muac",
      value: { type: "quantity", value: muac, unit: "cm" },
      context: ctx("ex.general.nutrition"),
      restricted: false,
    });
  }
  const crt = exam.entries["ex.cardiovascular.capillary_refill"];
  if (typeof crt?.attrs?.time === "number") {
    written.add("ex.cardiovascular.capillary_refill");
    lines.push({
      conceptId: "obs.capillary_refill",
      value: { type: "quantity", value: crt.attrs.time, unit: "s" },
      context: ctx(
        "ex.cardiovascular.capillary_refill",
        crt.attrs.site ? { site: crt.attrs.site } : {},
      ),
      restricted: false,
    });
  }
  const pain = exam.entries["ex.general.distress"]?.attrs?.pain_nrs;
  if (typeof pain === "number")
    lines.push({
      conceptId: "obs.pain_score",
      value: { type: "quantity", value: pain, unit: "{score}" },
      context: ctx("ex.general.distress", { scale: "nrs_0_10" }),
      restricted: false,
    });

  // Recorded items this commit could not chart (kept in the signed note with their ids).
  const unmapped = Object.entries(exam.entries).filter(
    ([id, e]) =>
      e.state !== "not_examined" && !written.has(id) && ecat.item(id)?.response.type !== "link",
  ).length;
  return { lines, unmapped };
}

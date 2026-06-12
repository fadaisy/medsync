/**
 * General Examination — PURE projections. Renders captured three-state findings
 * into readable documentation (honest: not-examined ≠ normal) and into reasoning
 * tokens (present → positives, absent → negatives) that feed the differential.
 * A "normal exam" fast path. No fabrication; nothing auto-recorded.
 */

import type { ExamObservation, FindingState } from "@/lib/clerkship/exam/types";

import { EXAM_FINDINGS, EXAM_GROUPS } from "@/lib/clerkship/exam/catalog";

const NORMAL_SELECT = new Set([
  "well",
  "none",
  "normal",
  "not raised",
  "central",
  "present",
  "warm",
  "≤2 s",
  "well-hydrated",
]);

const phrase = (o: ExamObservation): string => {
  const finding = EXAM_FINDINGS.find((x) => x.code === o.code);
  const v = (o.values ?? []).join(", ");
  if (finding?.kind === "select")
    return v ? `${o.display.toLowerCase()} ${v}` : o.display.toLowerCase();
  return v ? `${o.display}: ${v}` : o.display;
};

/** Grammatical list join: "a", "a and b", "a, b and c". */
const listJoin = (xs: string[]): string =>
  xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;

/**
 * Flowing general-exam narrative — present findings (with values) first, then
 * pertinent normals, then an honest note of what was not examined. Same facts as
 * the structured projection, narrated in clinician prose; not-examined ≠ normal.
 */
export function renderExamProse(obs: ExamObservation[]): string {
  if (!obs.length) return "";
  const byState = (s: FindingState) => obs.filter((o) => o.state === s);
  const present = byState("present");
  const absent = byState("absent");
  const notExamined = byState("not_examined");

  // group present in catalog order for readability
  const orderedPresent = EXAM_GROUPS.flatMap((g) => present.filter((o) => o.group === g.key));

  const clauses: string[] = [];
  if (orderedPresent.length) clauses.push(`there is ${listJoin(orderedPresent.map(phrase))}`);
  if (absent.length) clauses.push(`${absent.map((o) => o.display).join(", ")} examined and normal`);

  let sentence = clauses.length ? `On general examination, ${clauses.join("; ")}.` : "";

  if (notExamined.length) {
    const verb = notExamined.length > 1 ? "were" : "was";
    const tail = `${listJoin(notExamined.map((o) => o.display))} ${verb} not examined.`;
    sentence = sentence ? `${sentence} ${tail}` : `On general examination, ${tail}`;
  }

  return sentence;
}

export interface ExamReasoningTokens {
  positives: string[];
  negatives: string[];
}

/** Exam findings → reasoning context: present (incl. values) raise; absent panels lower. */
export function examReasoningTokens(obs: ExamObservation[]): ExamReasoningTokens {
  const positives: string[] = [];
  const negatives: string[] = [];
  for (const o of obs) {
    const finding = EXAM_FINDINGS.find((x) => x.code === o.code);
    if (o.state === "present") {
      // for a select, a clearly-normal value is not a positive
      if (finding?.kind === "select" && (o.values ?? []).every((v) => NORMAL_SELECT.has(v)))
        continue;
      positives.push(o.display, ...(o.values ?? []));
    } else if (o.state === "absent") {
      negatives.push(o.display);
    }
  }
  return { positives: Array.from(new Set(positives)), negatives: Array.from(new Set(negatives)) };
}

/** "Normal general exam" fast path — panels examined-normal (absent) + gestalt
 * selects set to their normal value; never not-examined / blank. */
export function normalGeneralExam(): ExamObservation[] {
  return EXAM_FINDINGS.map((x) => {
    const base = { code: x.code, group: x.group, display: x.display };
    if (x.kind === "panel") return { ...base, state: "absent" as const };
    const normal = x.options.find((o) => NORMAL_SELECT.has(o)) ?? x.options[0];
    return { ...base, state: "present" as const, values: normal ? [normal] : [] };
  });
}

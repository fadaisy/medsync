/**
 * External quality assessment (Lab Phase 3 §6.7, EA-1..EA-6; GATE A P8, §3.2 0115). Pure.
 *
 * Scores are the provider's: MedSync records them and never re-scores (EA-3). The look-back over a round is
 * `eqaLookBack` in `lib/lab/lookback.ts` (EA-4); HIV panel tests are counted by `count105` (EA-6).
 */
import { addDays, daysBetween } from "@/lib/lab/stock";

/** EA-1: `lab_eqa_schemes`; `covers` is the enrolment (test codes). */
export interface EqaScheme {
  hospitalId: string;
  id: string;
  provider: string;
  covers: string[];
  roundsPerYear: number;
  active: boolean;
}

export interface EqaSample {
  sampleId: string;
  conceptId: string;
  /** EA-3: as the provider reports it. */
  score?: "acceptable" | "unacceptable";
  /** The provider's bias for the sample, when its report gives one (EA-4). */
  bias?: number;
  /** HIV panels: the kit the sample was tested on (EA-6). */
  kit?: string;
}

/** EA-2: `lab_eqa_rounds`. Dates are hospital-local date keys. */
export interface EqaRound {
  hospitalId: string;
  id: string;
  schemeId: string;
  receivedOn: string;
  dueOn: string;
  submittedOn: string | null;
  scoredOn: string | null;
  testedBy: string[];
  samples: EqaSample[];
}

/**
 * EA-2: testers who released no patient result for the scheme's tests in the `windowDays` before the round was
 * received (operational check; a warning only).
 */
export function testerWarnings(input: {
  round: EqaRound;
  scheme: EqaScheme;
  releases: readonly { hospitalId: string; userId: string; testCode: string; day: string }[];
  windowDays: number;
}): string[] {
  const from = addDays(input.round.receivedOn, -input.windowDays);
  return input.round.testedBy.filter(
    (u) =>
      !input.releases.some(
        (r) =>
          r.hospitalId === input.round.hospitalId &&
          r.userId === u &&
          input.scheme.covers.includes(r.testCode) &&
          r.day >= from &&
          r.day < input.round.receivedOn,
      ),
  );
}

/** EA-2: results not submitted by the due date. */
export const roundOverdue = (round: EqaRound, today: string) =>
  round.submittedOn === null && today > round.dueOn;

/**
 * EA-3, EA-4: the round's outcome from the provider's scores, and the follow-up: an unacceptable sample opens a
 * nonconformity with a look-back from receipt to scoring, with the provider's bias only when it gave one.
 */
export function roundOutcome(round: EqaRound): {
  outcome: "acceptable" | "unacceptable" | "mixed" | null;
  unacceptable: EqaSample[];
  lookBack: { from: string; to: string } | null;
} {
  const scored = round.samples.filter((s) => s.score);
  if (scored.length === 0) return { outcome: null, unacceptable: [], lookBack: null };
  const unacceptable = scored.filter((s) => s.score === "unacceptable");
  const outcome =
    unacceptable.length === 0
      ? "acceptable"
      : unacceptable.length === scored.length
        ? "unacceptable"
        : "mixed";
  return {
    outcome,
    unacceptable,
    lookBack:
      unacceptable.length > 0
        ? { from: round.receivedOn, to: round.scoredOn ?? round.receivedOn }
        : null,
  };
}

/**
 * EA-5: each orderable in-house test is covered by an active scheme, or by an alternative assessment done within
 * the lead's period; tests with neither are counted (Intra-EQA).
 */
export function eqaCoverage(input: {
  hospitalId: string;
  tests: readonly string[];
  schemes: readonly EqaScheme[];
  alternatives: readonly { hospitalId: string; testCode: string; doneOn: string }[];
  today: string;
  periodDays: number;
}): { testCode: string; covered: "scheme" | "alternative" | "none" }[] {
  return input.tests.map((testCode) => ({
    testCode,
    covered: input.schemes.some(
      (s) => s.hospitalId === input.hospitalId && s.active && s.covers.includes(testCode),
    )
      ? "scheme"
      : input.alternatives.some(
            (a) =>
              a.hospitalId === input.hospitalId &&
              a.testCode === testCode &&
              daysBetween(a.doneOn, input.today) <= input.periodDays,
          )
        ? "alternative"
        : "none",
  }));
}

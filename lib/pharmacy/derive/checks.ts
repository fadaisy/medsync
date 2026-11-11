import type { RxCheckAnswer } from "@/db/schema/pharmacy-rework";
import type { LineChecks } from "@/lib/pharmacy/checks";

import { answeredChecks } from "@/lib/pharmacy/checks";

/**
 * The checks panel at the window (rework PRD §6.2, test 8). The flags are the prescriber's signed checks stored on
 * each line (`answeredChecks`); nothing here runs a clinical rule. Before a line is handed over the pharmacist answers
 * every flag on it: "checked" with a reason, "prescriber confirmed" naming the prescriber (the only answer a stop
 * takes), or "query", which holds the line for the prescriber.
 */
export interface RxFlag {
  /** `${lineId}:${code}` */
  id: string;
  lineId: string;
  code: string;
  title: string;
  level: "stop" | "check";
  /** What the prescriber chose when warned, in their words. */
  prescriberAnswer: string | null;
}

export interface RxAnswer {
  lineId: string;
  code: string;
  answer: RxCheckAnswer;
  /** Oldest first or newest first; the newest `at` wins. */
  at: Date;
}

export function rxFlags(lines: readonly ({ id: string } & LineChecks)[]): RxFlag[] {
  return lines.flatMap((l) =>
    answeredChecks(l).map((c) => ({
      id: `${l.id}:${c.code}`,
      lineId: l.id,
      code: c.code,
      title: c.title,
      level: c.level,
      prescriberAnswer: c.answer,
    })),
  );
}

/** The latest answer per flag. */
export function latestAnswers(answers: readonly RxAnswer[]): Map<string, RxAnswer> {
  const out = new Map<string, RxAnswer>();
  for (const a of answers) {
    const k = `${a.lineId}:${a.code}`;
    const had = out.get(k);
    if (!had || had.at < a.at) out.set(k, a);
  }
  return out;
}

/** An answer that lets the line be given: a stop only with the prescriber; a query holds the line. */
export const answerGives = (f: RxFlag, a: RxAnswer | undefined): boolean =>
  !!a && a.answer !== "query" && (f.level !== "stop" || a.answer === "prescriber_confirmed");

/** The flags still open on the lines being given; hand-over waits until this is empty. */
export function rxChecksOpen(
  flags: readonly RxFlag[],
  answers: readonly RxAnswer[],
  givenLineIds: readonly string[],
): RxFlag[] {
  const given = new Set(givenLineIds);
  const latest = latestAnswers(answers);
  return flags.filter((f) => given.has(f.lineId) && !answerGives(f, latest.get(f.id)));
}

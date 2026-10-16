import type { QcStatus } from "@/lib/lab/qc";

import { QUALITY } from "./copy";

export type QcTone = "passed" | "amber" | "dark" | "dashed";

/** §5.1's status column: the word and its chip (no red, no green: Law 11). */
export function qcWord(s: {
  status: QcStatus;
  held: boolean;
  blocked: boolean;
  rules: readonly string[];
}): { word: string; tone: QcTone } {
  const S = QUALITY.status;
  const rules = s.rules.join(", ");
  if (s.status === "failed")
    return s.blocked
      ? { word: S.failed(rules), tone: "dark" }
      : { word: S.failedLogged(rules), tone: "amber" };
  if (s.held && s.blocked) return { word: S.heldAfterPass, tone: "dark" };
  if (s.status === "warning") return { word: S.warning, tone: "amber" };
  if (s.status === "provisional_target") return { word: S.provisional, tone: "passed" };
  if (s.status === "passed") return { word: S.passed, tone: "passed" };
  if (s.status === "no_plan") return { word: S.noPlan, tone: "amber" };
  return { word: S.notRun, tone: s.blocked ? "dark" : "dashed" };
}

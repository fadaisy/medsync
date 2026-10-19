/**
 * Enter a paper form, the three steps (prompt 5.10, 5.14): step 2 opens only after the patient and order are
 * confirmed; step 3 only after the form's own times are valid and in order. Paper-form times have no default:
 * they come only from the form. Pure; values are the "YYYY-MM-DDTHH:mm" strings a datetime-local gave.
 */

/** Paper-form times start empty, always (5.14). */
export const PAPER_TIMES_START = { collected: "", resulted: "", callAt: "" } as const;

const VALUE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export type TimesProblem = "missing" | "order" | "future";

export function formTimesProblem(
  collected: string,
  resulted: string,
  nowLocal: string,
): TimesProblem | null {
  if (!VALUE.test(collected) || !VALUE.test(resulted)) return "missing";
  if (resulted < collected) return "order";
  if (collected > nowLocal || resulted > nowLocal) return "future";
  return null;
}

export function entryStep(s: {
  confirmed: boolean;
  collected: string;
  resulted: string;
  nowLocal: string;
}): 1 | 2 | 3 {
  if (!s.confirmed) return 1;
  return formTimesProblem(s.collected, s.resulted, s.nowLocal) ? 2 : 3;
}

export type SaveBlock = "form" | "patient" | "times" | "releasedBy" | "values";

/** Why Save cannot be pressed yet, in the order the paper is filled; null when it can. */
export function saveBlock(s: {
  formNumber: string;
  confirmed: boolean;
  times: TimesProblem | null;
  releasedBy: string;
  valuesEntered: number;
}): SaveBlock | null {
  if (!s.formNumber) return "form";
  if (!s.confirmed) return "patient";
  if (s.times) return "times";
  if (s.releasedBy.trim().length < 2) return "releasedBy";
  if (s.valuesEntered < 1) return "values";
  return null;
}

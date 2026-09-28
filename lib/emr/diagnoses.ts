import type { Condition, DiagnosisTerm } from "@/db/schema/emr";

import { normaliseTyped } from "@/lib/clerking/impression/board";

/**
 * A visit's diagnoses as the desk and the signed note see them (PROMPT-CLERKING-SUMMARY-IMPRESSION
 * §8, D-SI-19, D-SI-20). PURE: the rows come from the caller (the desk's reader transaction, or the
 * signing transaction), so both read one rule.
 *
 * - One row per logical diagnosis: its current version, never an entered-in-error, cancelled or
 *   refuted one.
 * - `code` is the ICD-11 code only when the term's code is verified (`verified_on` set); a typed
 *   diagnosis, or a term still "As typed, not coded" (D-SI-26), has none.
 * - `onProblemList`: the patient's own current problem-list item for the same term or the same
 *   typed words (normalised as the picker does, lib/clerking/impression/board normaliseTyped).
 * - `cosignPending`: a confirm_diagnosis request is open for the logical id (D-SI-09).
 */

export type DxRow = Pick<
  Condition,
  | "id"
  | "logicalId"
  | "version"
  | "category"
  | "subjectRelation"
  | "clinicalStatus"
  | "verification"
  | "status"
  | "encounterId"
  | "rank"
  | "termId"
  | "icd11Code"
  | "sensitivity"
>;
export type DxTermRow = Pick<DiagnosisTerm, "id" | "display" | "icd11Code" | "verifiedOn">;

export interface EncounterDiagnosisView {
  /** The current version's row id. */
  id: string;
  logicalId: string;
  termId: string | null;
  display: string;
  code: string | null;
  rank: "primary" | "secondary";
  verification: string;
  restricted: boolean;
  onProblemList: boolean;
  cosignPending: boolean;
}

export function newestVersions<R extends { logicalId: string; version: number }>(
  rows: readonly R[],
): R[] {
  const m = new Map<string, R>();
  for (const r of rows) if ((m.get(r.logicalId)?.version ?? 0) < r.version) m.set(r.logicalId, r);
  return [...m.values()];
}

const voided = (status: string) => status === "entered_in_error" || status === "cancelled";

/** One identity per diagnosis: its term, or its typed words normalised (S-3). */
export const diagnosisKey = (termId: string | null, text: string | null): string | null =>
  termId ? `t:${termId}` : text?.trim() ? `x:${normaliseTyped(text)}` : null;

/** The keys of the patient's own problem list: current, not resolved, refuted or voided. */
export function problemListKeys<R extends DxRow>(
  rows: readonly R[],
  textOf: (r: R) => string | null,
): Set<string> {
  return new Set(
    newestVersions(rows)
      .filter(
        (c) =>
          c.category === "problem_list_item" &&
          c.subjectRelation === "self" &&
          !voided(c.status) &&
          c.verification !== "refuted" &&
          c.clinicalStatus !== "resolved",
      )
      .flatMap((c) => diagnosisKey(c.termId, c.termId ? null : textOf(c)) ?? []),
  );
}

export function encounterDiagnoses<R extends DxRow>(input: {
  /** The patient's condition rows, every version (problem-list items too). */
  rows: readonly R[];
  encounterId: string;
  terms: ReadonlyMap<string, DxTermRow>;
  /** The decrypted typed words of a row, or null. */
  textOf: (r: R) => string | null;
  displayOf: (r: R) => string;
  /** Logical ids with an open confirm_diagnosis request. */
  cosignPending: ReadonlySet<string>;
}): EncounterDiagnosisView[] {
  const onList = problemListKeys(input.rows, input.textOf);
  return newestVersions(input.rows)
    .filter(
      (c) =>
        c.category === "encounter_diagnosis" &&
        c.encounterId === input.encounterId &&
        !voided(c.status) &&
        c.verification !== "refuted",
    )
    .map((c): EncounterDiagnosisView => {
      const term = c.termId ? input.terms.get(c.termId) : undefined;
      const key = diagnosisKey(c.termId, c.termId ? null : input.textOf(c));
      return {
        id: c.id,
        logicalId: c.logicalId,
        termId: c.termId,
        display: input.displayOf(c),
        code: term?.verifiedOn && c.icd11Code ? c.icd11Code : null,
        rank: c.rank === "primary" ? "primary" : "secondary",
        verification: c.verification,
        restricted: c.sensitivity === "restricted",
        onProblemList: key !== null && onList.has(key),
        cosignPending: input.cosignPending.has(c.logicalId),
      };
    })
    .sort((a, b) => (a.rank === "primary" ? -1 : b.rank === "primary" ? 1 : 0));
}

/** The logical ids named by open confirm_diagnosis requests (their PHI-free payloads). */
export function pendingCosignIds(payloads: readonly unknown[]): Set<string> {
  return new Set(
    payloads.flatMap((p) => {
      const id = (p as { conditionLogicalId?: unknown } | null)?.conditionLogicalId;
      return typeof id === "string" ? [id] : [];
    }),
  );
}

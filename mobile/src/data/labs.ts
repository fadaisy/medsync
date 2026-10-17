import type { RecordsStatus, VisitRecord } from "@/data/records";
import { TESTS_NOTE } from "@patient/visit-summary";

import { useRecords } from "@/data/records";

/**
 * Lab tests (ADR 0342 §2). No result value reaches a patient anywhere in
 * MedSync yet, so this shows only what is true: the tests a clinician ordered
 * on a shared visit, grouped by visit, each with that summary's own sentence
 * about results. No values, ranges or targets exist here, real or invented.
 */
export interface LabVisit {
  /** The visit record's id, for `/records/[id]`. */
  recordId: string;
  startedAt: string;
  hospitalName: string;
  tests: { id: string; name: string }[];
  /** The summary's own words: "Results will be shared after your clinician reviews them." */
  note: string;
}

/** Visits with at least one test, newest first (the records' own order). */
export function labsFromRecords(records: readonly VisitRecord[]): LabVisit[] {
  return records
    .filter((r) => r.tests.length > 0)
    .map((r) => ({
      recordId: r.id,
      startedAt: r.startedAt,
      hospitalName: r.hospitalName,
      tests: r.tests,
      note: r.testsNote ?? TESTS_NOTE,
    }));
}

/**
 * The Labs screen and the Care hub's lab preview read this.
 *
 * Shape:
 * - `status`: "loading" | "ready" | "error" | "off" (records not switched on in this build).
 * - `message`: plain words for error or off, or that the list is the phone's saved copy; else null.
 * - `visits`: `LabVisit[]`, newest first; empty for a new patient.
 * - `testCount`: tests across those visits.
 * - `latest`: the newest visit with tests, or null.
 * - `reload()`: retry.
 * There are no values: a preview names what was ordered and says results come after review.
 */
export function useLabsSummary(): {
  status: RecordsStatus;
  message: string | null;
  visits: LabVisit[];
  testCount: number;
  latest: LabVisit | null;
  reload: () => void;
} {
  const r = useRecords();
  const visits = labsFromRecords(r.items);
  return {
    status: r.status,
    message: r.message,
    visits,
    testCount: visits.reduce((n, v) => n + v.tests.length, 0),
    latest: visits[0] ?? null,
    reload: r.reload,
  };
}

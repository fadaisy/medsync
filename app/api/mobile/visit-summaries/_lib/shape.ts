import type { VisitSummaryContent } from "@/lib/patient/visit-summary";

import { TESTS_NOTE } from "@/lib/patient/visit-summary";

/**
 * What the phone receives for one shared visit summary (ADR 0342 §2): the web's copy, minus what the phone
 * must not show. A medicine's `detail` is the prescription as written (dose, route, frequency, duration,
 * instructions joined into one string), so it is dropped whole: the phone shows the name and "As your
 * clinician prescribed" (law L5). The other sections pass through as the clinician shared them.
 */
export interface MobileVisitSummary {
  id: string;
  /** ISO instant the clinician shared it. */
  sharedAt: string;
  /** A later version replaced the first one shared. */
  updated: boolean;
  hospitalName: string;
  /** ISO instant the visit started. */
  startedAt: string;
  clinician: string | null;
  outcome: string;
  outcomeNote: string | null;
  found: { id: string; text: string; detail: string | null }[];
  medicines: { prescriptionId: string; name: string; inMyMedicines: boolean }[];
  stopped: { id: string; name: string }[];
  tests: { id: string; name: string }[];
  /** The summary's own sentence about results; null when no test was ordered. */
  testsNote: string | null;
  next: string | null;
  comeBackIf: string | null;
}

export function toMobileSummary(
  meta: { id: string; decidedAt: Date; updated: boolean; hospitalName: string },
  c: VisitSummaryContent,
  inTracker: ReadonlySet<string>,
): MobileVisitSummary {
  return {
    id: meta.id,
    sharedAt: meta.decidedAt.toISOString(),
    updated: meta.updated,
    hospitalName: c.visit.hospitalName || meta.hospitalName,
    startedAt: c.visit.startedAt,
    clinician: c.visit.clinician,
    outcome: c.outcome,
    outcomeNote: c.outcomeNote,
    found: c.sections.found.map(({ id, text, detail }) => ({ id, text, detail })),
    medicines: c.sections.medicines.map((m) => {
      // The cut `takeHomePrescriptionIds` and the web's visit page make.
      const prescriptionId = m.id.slice("rx:".length);
      return { prescriptionId, name: m.text, inMyMedicines: inTracker.has(prescriptionId) };
    }),
    stopped: c.sections.stopped.map((m) => ({ id: m.id, name: m.text })),
    tests: c.sections.tests.map((t) => ({ id: t.id, name: t.text })),
    testsNote: c.sections.tests.length > 0 ? TESTS_NOTE : null,
    next: c.next,
    comeBackIf: c.comeBackIf,
  };
}

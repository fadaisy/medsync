import type { VisitSummaryContent } from "@/lib/patient/visit-summary";

import { routeWord } from "@/components/emr/prescribing/views";
import { takeHomePrescriptionIds } from "@/lib/patient/visit-summary";

/**
 * "Add to my medicines" (ADR 0203 §7), the pure half: is this prescription a take-home item on this shared copy,
 * and the tracker row the prescription becomes. No DB, no clock. Never a dose or a time the prescription did not
 * state: the dose is copied as written, and the times are left for the patient to set.
 */

export function isTakeHomeOn(content: VisitSummaryContent, prescriptionId: string): boolean {
  return takeHomePrescriptionIds(content).includes(prescriptionId);
}

export interface PrescriptionForTracker {
  id: string;
  drugName: string;
  dose: string;
  route: string;
  frequency: string | null;
  duration: string | null;
}

export function selfMedicationFromPrescription(
  rx: PrescriptionForTracker,
  visit: VisitSummaryContent["visit"],
  timeZone = "Africa/Kampala",
) {
  const date = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone,
  }).format(new Date(visit.startedAt));
  const instructions = [
    routeWord(rx.route),
    rx.frequency,
    rx.duration ? `for ${rx.duration}` : null,
  ]
    .filter((x): x is string => !!x && x.trim() !== "")
    .join(", ");
  return {
    name: rx.drugName,
    dose: rx.dose,
    instructions: instructions || null,
    schedule_pattern: "as_needed" as const,
    schedule_times: null,
    notes: `From your visit at ${visit.hospitalName} on ${date}.`,
    source_prescription_id: rx.id,
  };
}

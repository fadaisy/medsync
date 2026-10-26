import "server-only";

import type { MedRow, TakeRec } from "@patient-core/medicines";
import { nameWithoutDose } from "@patient-core/care-no-dose";

import { PATIENT_COPY } from "@/lib/pharmacy/messages";
import { getPatientMedicineList, patientListLive } from "@/lib/pharmacy/patient-list";
import { withoutDose } from "./care-view";
import { loadMedicines } from "./day";

/**
 * Care's medicines: the day's own read (`loadMedicines`, the phone's query), every name and instruction passed
 * through the no-dose rule first (S15), so a medicine added from a visit record or written by the pharmacy
 * shows its name and times of day only.
 */
export async function loadCareMedicines(
  userId: string,
): Promise<{ meds: MedRow[]; takes: TakeRec[] }> {
  const { meds, takes } = await loadMedicines(userId);
  return { meds: meds.map(withoutDose), takes };
}

export interface GivenGroup {
  handoverId: string;
  head: string;
  medicines: { lineId: string; medicine: string; refill: string | null }[];
}
export interface NotGiven {
  lineId: string;
  medicine: string;
  lead: string;
  text: string;
  canReport: boolean;
  couldNotGet: boolean;
}
export interface Given {
  section: string;
  notGivenSection: string;
  saidCouldNotGet: string;
  boughtIt: string;
  couldNotGet: string;
  groups: GivenGroup[];
  notGiven: NotGiven[];
  /** Tracker rows the pharmacy section covers, left out of "My medicines" as on the old page. */
  covered: string[];
}

/**
 * "What you were given" (Pharmacy Phase 1, 5.11), only where the old page shows it (`PHARMACY_PATIENT_LIST`
 * and the hospital's list live). Names, the hand-over line and the refill line in the signed words; the
 * directions and the "{n} {units} given" line hold amounts, so they stay on the label (S15). Null: nothing.
 */
export async function loadGiven(userId: string): Promise<Given | null> {
  if (!process.env.PHARMACY_PATIENT_LIST?.trim()) return null;
  const list = await getPatientMedicineList(userId, (h) => patientListLive(h));
  if (!list.groups.length && !list.notGiven.length) return null;
  return {
    section: PATIENT_COPY.section,
    notGivenSection: PATIENT_COPY.notGivenSection,
    saidCouldNotGet: PATIENT_COPY.saidCouldNotGet,
    boughtIt: PATIENT_COPY.boughtIt,
    couldNotGet: PATIENT_COPY.couldNotGet,
    groups: list.groups.map((g) => ({
      handoverId: g.handoverId,
      head: g.head,
      medicines: g.medicines.map((m) => ({
        lineId: m.lineId,
        medicine: nameWithoutDose(m.medicine),
        refill: m.refill,
      })),
    })),
    notGiven: list.notGiven.map((l) => ({
      lineId: l.lineId,
      medicine: nameWithoutDose(l.medicine),
      lead: l.lead,
      text: l.text,
      canReport: l.canReport,
      couldNotGet: l.couldNotGet,
    })),
    covered: list.coveredMedicationIds,
  };
}

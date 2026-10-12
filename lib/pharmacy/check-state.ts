import { DRUGS, offersRegimens } from "@/lib/prescribing/formulary";

/**
 * What the pharmacy is not doing yet (Pharmacy Phase 0, ADR 0234; CS-1..CS-4). One function whose
 * body later phases replace, never its callers: the notice renders whenever any part is not done.
 *
 * doseReferences counts the shipped prescribing list (MS-RX-CAT-001) and the medicines on it with a
 * signed regimen, read at run time from the catalogue, never typed (Law 8). The list is global
 * today, so the hospital does not change the count; null if the list could not be counted.
 */
export interface PharmacyChecksState {
  dispensingRecorded: boolean;
  interactionsChecked: boolean;
  doseReferences: { signed: number; total: number } | null;
}

export function pharmacyChecksState(_hospitalId: string): PharmacyChecksState {
  const total = DRUGS.length;
  return {
    dispensingRecorded: false,
    interactionsChecked: false,
    doseReferences: total
      ? { signed: DRUGS.filter((d) => offersRegimens(d.dose)).length, total }
      : null,
  };
}

export const anythingNotDone = (s: PharmacyChecksState): boolean =>
  !s.dispensingRecorded ||
  !s.interactionsChecked ||
  s.doseReferences?.signed !== s.doseReferences?.total;

import { DRUGS, offersRegimens } from "@/lib/prescribing/formulary";

/**
 * What the pharmacy is not doing yet (Pharmacy Phase 0, ADR 0234; CS-1..CS-4). One function whose
 * body later phases replace, never its callers: the notice renders whenever any part is not done.
 *
 * doseReferences counts the shipped prescribing list (MS-RX-CAT-001) and the medicines on it with a
 * signed regimen, read at run time from the catalogue, never typed (Law 8). The list is global
 * today, so the hospital does not change the count; null if the list could not be counted.
 *
 * Pharmacy Phase 1 (CK-1, CK-2): the caller may pass the hospital's dispensing points with whether each
 * is live. `dispensingRecorded` is true when any is; `points` reports each. Without the list the Phase 0
 * answer stands (nothing recorded). `interactionsChecked` stays false.
 */
export interface PharmacyChecksState {
  dispensingRecorded: boolean;
  interactionsChecked: boolean;
  doseReferences: { signed: number; total: number } | null;
  points?: { id: string; live: boolean }[];
}

export function pharmacyChecksState(
  _hospitalId: string,
  points: readonly { id: string; live: boolean }[] = [],
): PharmacyChecksState {
  const total = DRUGS.length;
  return {
    dispensingRecorded: points.some((p) => p.live),
    interactionsChecked: false,
    doseReferences: total
      ? { signed: DRUGS.filter((d) => offersRegimens(d.dose)).length, total }
      : null,
    points: points.map((p) => ({ id: p.id, live: p.live })),
  };
}

export const anythingNotDone = (s: PharmacyChecksState): boolean =>
  !s.dispensingRecorded ||
  !s.interactionsChecked ||
  s.doseReferences?.signed !== s.doseReferences?.total;

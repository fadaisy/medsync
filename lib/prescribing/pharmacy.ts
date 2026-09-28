/**
 * The pharmacy seam (ADR 0190). The prescribing dialog and the stock check read availability
 * through this interface only. MedSync is linked to no pharmacy system, so today every drug is
 * `not_linked`: no stock is ever shown as fact until a real feed replaces this implementation.
 */

export type PharmacyStatus = "not_linked" | "in" | "low" | "out";

export interface PharmacyAvailability {
  status: PharmacyStatus;
  /** The dispensing point, when known. */
  point?: string;
}

export function pharmacyAvailability(_drugId: string, _hospitalId?: string): PharmacyAvailability {
  return { status: "not_linked" };
}

export const PHARMACY_WORD: Record<PharmacyStatus, string> = {
  not_linked: "Stock: not linked",
  in: "In stock",
  low: "Low stock",
  out: "Out of stock",
};

"use server";

import * as receiving from "@/lib/pharmacy/stores/receiving-store";
import { bare, storeAct } from "@/lib/pharmacy/stores/store-action";

/**
 * Deliveries (Pharmacy Phase 2, 5.2; Section 8): every action needs `pharmacy.store`. `receiveDelivery` writes
 * all its `received` movements in one transaction; the prints are logged in pharmacy_print_events.
 */

export async function startDelivery(raw: unknown) {
  return bare(
    await storeAct(
      "startDelivery",
      receiving.StartDeliveryInput,
      raw,
      "pharmacy.store",
      receiving.startDelivery,
    ),
  );
}
export async function saveDeliveryLine(raw: unknown) {
  return bare(
    await storeAct(
      "saveDeliveryLine",
      receiving.DeliveryLineInput,
      raw,
      "pharmacy.store",
      receiving.saveDeliveryLine,
    ),
  );
}
export async function recordShortDatedDecision(raw: unknown) {
  return bare(
    await storeAct(
      "recordShortDatedDecision",
      receiving.ShortDatedInput,
      raw,
      "pharmacy.store",
      receiving.recordShortDatedDecision,
    ),
  );
}
export async function receiveDelivery(raw: unknown) {
  return bare(
    await storeAct(
      "receiveDelivery",
      receiving.ReceiveDeliveryInput,
      raw,
      "pharmacy.store",
      receiving.receiveDelivery,
    ),
  );
}
export async function abandonDelivery(raw: unknown) {
  return bare(
    await storeAct(
      "abandonDelivery",
      receiving.AbandonInput,
      raw,
      "pharmacy.store",
      receiving.abandonDelivery,
    ),
  );
}
export async function printDiscrepancyReport(raw: unknown) {
  return bare(
    await storeAct(
      "printDiscrepancyReport",
      receiving.PrintDeliveryInput,
      raw,
      "pharmacy.store",
      receiving.printDiscrepancyReport,
    ),
  );
}
export async function printGrn(raw: unknown) {
  return bare(
    await storeAct(
      "printGrn",
      receiving.PrintDeliveryInput,
      raw,
      "pharmacy.store",
      receiving.printGrn,
    ),
  );
}

"use server";

import * as receiving from "@/lib/pharmacy/stores/receiving-store";
import * as shelves from "@/lib/pharmacy/stores/shelves";
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
/** 4.1 The scan field (catalogue slice Step 7): the result in words, and the line it filled. */
export async function scanIntoDelivery(raw: unknown) {
  return storeAct(
    "scanIntoDelivery",
    receiving.DeliveryScanInput,
    raw,
    "pharmacy.store",
    receiving.scanIntoDelivery,
  );
}
export async function pickIntoDelivery(raw: unknown) {
  return storeAct(
    "pickIntoDelivery",
    receiving.DeliveryPickInput,
    raw,
    "pharmacy.store",
    receiving.pickIntoDelivery,
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

/** Put a store batch on a shelf (0272), for the pick list. */
export async function putAway(raw: unknown) {
  return bare(
    await storeAct("putAway", shelves.PutAwayInput, raw, "pharmacy.store", shelves.putAway),
  );
}

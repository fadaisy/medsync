"use server";

import type { ReviewResult as ActionResult } from "@/lib/pharmacy/review/store";

import * as controlled from "@/lib/pharmacy/controlled-store";
import * as issues from "@/lib/pharmacy/stores/issue-store";
import * as places from "@/lib/pharmacy/stores/location-store";
import { bare, storeAct } from "@/lib/pharmacy/stores/store-action";

/**
 * Store actions for places, suppliers, GTINs, store counts, returns, loans and the witness (Pharmacy Phase 2,
 * Section 8). Each: Zod with a client key → requirePharmacyActor → `pharmacyStore` → runPharmacyWrite with the
 * permission the table names → the store's pages revalidated.
 */

export async function createLocation(raw: unknown) {
  return bare(
    await storeAct(
      "createLocation",
      places.CreateLocationInput,
      raw,
      "pharmacy.manage",
      places.createLocation,
    ),
  );
}
export async function setLocationInCharge(raw: unknown) {
  return bare(
    await storeAct(
      "setLocationInCharge",
      places.InChargeInput,
      raw,
      "pharmacy.manage",
      places.setLocationInCharge,
    ),
  );
}
export async function setWardSupplyModel(raw: unknown) {
  return bare(
    await storeAct(
      "setWardSupplyModel",
      places.SupplyModelInput,
      raw,
      "pharmacy.manage",
      places.setWardSupplyModel,
    ),
  );
}
export async function saveCounterparty(raw: unknown) {
  return bare(
    await storeAct(
      "saveCounterparty",
      places.CounterpartyInput,
      raw,
      "pharmacy.manage",
      places.saveCounterparty,
    ),
  );
}
/** SC-3: `pharmacy.stock`. */
export async function setGtin(raw: unknown) {
  return bare(await storeAct("setGtin", places.GtinInput, raw, "pharmacy.stock", places.setGtin));
}
/** A blind count at a store or quarantine (Law 5): the record comes back only with the saved figures. */
export async function recordStoreCount(raw: unknown) {
  const r = await storeAct(
    "recordStoreCount",
    places.StoreCountInput,
    raw,
    "pharmacy.stock",
    places.recordStoreCount,
  );
  return r.ok
    ? {
        ...bare(r),
        lines:
          "lines" in (r.data ?? {}) ? (r.data as { lines: places.StoreCountLine[] }).lines : [],
      }
    : r;
}
/** IS-5: `pharmacy.stock` at a pharmacy place. */
export async function returnStock(raw: unknown) {
  return bare(
    await storeAct("returnStock", issues.ReturnInput, raw, "pharmacy.stock", issues.returnStock),
  );
}
/** IS-7: `pharmacy.manage`. */
export async function lendStock(raw: unknown) {
  return bare(
    await storeAct("lendStock", issues.LendInput, raw, "pharmacy.manage", issues.lendStock),
  );
}
export async function borrowStock(raw: unknown) {
  return bare(
    await storeAct("borrowStock", issues.BorrowInput, raw, "pharmacy.manage", issues.borrowStock),
  );
}
export async function closeLoan(raw: unknown) {
  return bare(
    await storeAct("closeLoan", issues.CloseLoanInput, raw, "pharmacy.manage", issues.closeLoan),
  );
}
export async function printLoanRecord(raw: unknown) {
  return bare(
    await storeAct(
      "printLoanRecord",
      issues.PrintLoanInput,
      raw,
      "pharmacy.manage",
      issues.printLoanRecord,
    ),
  );
}

/**
 * D-PH1-42 at the store: the witness types their own password and code (never logged, stored or returned).
 * `pharmacy.controlled`, at no point: store work has no acting dispensing point.
 */
export async function attestStoreWitness(raw: unknown): Promise<ActionResult & { at?: string }> {
  const r = await storeAct(
    "attestStoreWitness",
    controlled.AttestInput,
    raw,
    "pharmacy.controlled",
    (ctx, i) => controlled.attestWitness(ctx, i),
  );
  if (!r.ok) return r;
  if (!r.data?.ok) return { ok: false, code: "forbidden", error: r.data?.words ?? "" };
  return { ...bare(r), at: r.data.at };
}

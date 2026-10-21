"use server";

import * as expiry from "@/lib/pharmacy/stores/expiry-store";
import * as month from "@/lib/pharmacy/stores/month-end-store";
import * as packs from "@/lib/pharmacy/stores/packs";
import { attestResult, bareResult, supplyAct } from "@/lib/pharmacy/stores/supply-action";

/**
 * Month end (5.8, MR-1 to MR-6; Section 8). Behind `pharmacyMonthEnd`. The count and difference reasons
 * `pharmacy.stock`; closing `pharmacy.manage` with a second approver's fresh attestation; prints `pharmacy.view`,
 * logged (stock status, tracer audit).
 */

export async function attestApprover(raw: unknown) {
  return attestResult(
    await supplyAct(
      "attestApprover",
      "monthEnd",
      packs.AttestPersonInput,
      raw,
      "pharmacy.view",
      packs.attestPerson,
    ),
  );
}
export async function recordMonthEndCount(raw: unknown) {
  const r = await supplyAct(
    "recordMonthEndCount",
    "monthEnd",
    month.MonthEndCountInput,
    raw,
    "pharmacy.stock",
    month.recordMonthEndCount,
  );
  return r.ok ? { ...bareResult(r), differences: r.data?.differences ?? 0 } : r;
}
export async function recordDifferenceReason(raw: unknown) {
  return bareResult(
    await supplyAct(
      "recordDifferenceReason",
      "monthEnd",
      month.DifferenceReasonInput,
      raw,
      "pharmacy.stock",
      month.recordDifferenceReason,
    ),
  );
}
export async function closeMonth(raw: unknown) {
  return bareResult(
    await supplyAct(
      "closeMonth",
      "monthEnd",
      month.CloseMonthInput,
      raw,
      "pharmacy.manage",
      month.closeMonth,
    ),
  );
}
export async function printStockStatus(raw: unknown) {
  return bareResult(
    await supplyAct(
      "printStockStatus",
      "monthEnd",
      expiry.PrintInput,
      { ...(raw as object), kind: "stock_status" },
      "pharmacy.view",
      expiry.logPrint,
    ),
  );
}
export async function printTracerAudit(raw: unknown) {
  return bareResult(
    await supplyAct(
      "printTracerAudit",
      "monthEnd",
      expiry.PrintInput,
      { ...(raw as object), kind: "tracer_audit" },
      "pharmacy.view",
      expiry.logPrint,
    ),
  );
}

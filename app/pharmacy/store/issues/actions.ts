"use server";

import * as distribution from "@/lib/pharmacy/distribution/store";
import * as issues from "@/lib/pharmacy/stores/issue-store";
import { bare, storeAct } from "@/lib/pharmacy/stores/store-action";

/**
 * Issues and requisitions at pharmacy places (Pharmacy Phase 2, 5.3; Section 8). Issuing and refusing need
 * `pharmacy.store`, or `pharmacy.dispense` at the issuing point (checked in the write); confirming a receipt at a
 * pharmacy place needs `pharmacy.stock`. A ward's requisitions and receipts are lane B's.
 */

export async function raiseRequisition(raw: unknown) {
  return bare(
    await storeAct(
      "raiseRequisition",
      issues.RaiseRequisitionInput,
      raw,
      "pharmacy.store",
      issues.raiseRequisition,
    ),
  );
}
export async function issueRequisition(raw: unknown) {
  return bare(
    await storeAct(
      "issueRequisition",
      issues.IssueRequisitionInput,
      raw,
      ["pharmacy.store", "pharmacy.dispense"],
      issues.issueRequisition,
    ),
  );
}
export async function refuseRequisitionLine(raw: unknown) {
  return bare(
    await storeAct(
      "refuseRequisitionLine",
      issues.RefuseInput,
      raw,
      ["pharmacy.store", "pharmacy.dispense"],
      issues.refuseRequisitionLine,
    ),
  );
}
export async function directIssue(raw: unknown) {
  return bare(
    await storeAct(
      "directIssue",
      issues.DirectIssueInput,
      raw,
      "pharmacy.store",
      issues.directIssue,
    ),
  );
}
export async function confirmIssueReceipt(raw: unknown) {
  return bare(
    await storeAct(
      "confirmIssueReceipt",
      issues.ConfirmReceiptInput,
      raw,
      "pharmacy.stock",
      issues.confirmIssueReceipt,
    ),
  );
}
export async function printVoucher(raw: unknown) {
  return bare(
    await storeAct(
      "printVoucher",
      issues.PrintVoucherInput,
      raw,
      "pharmacy.store",
      issues.printVoucher,
    ),
  );
}
/** 4.11 pick by scan, or ticked by hand: a check before the issue, never a movement (ADR 0463). */
export async function recordPick(raw: unknown) {
  return bare(
    await storeAct(
      "recordPick",
      distribution.RecordPickInput,
      raw,
      ["pharmacy.store", "pharmacy.dispense"],
      distribution.recordPick,
    ),
  );
}

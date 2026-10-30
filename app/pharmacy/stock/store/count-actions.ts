"use server";

import * as count from "@/lib/pharmacy/stores/count-sheet-store";
import { bareResult, supplyAct } from "@/lib/pharmacy/stores/supply-action";

/**
 * The count sheet (rework PRD §6.4, test 4): start, save a line as you type, send for approval, send back, approve.
 * Counting needs `pharmacy.stock`; approving `pharmacy.manage`, and the in-charge on the roster in SQL (0266).
 */
export async function startCount(raw: unknown) {
  return bareResult(
    await supplyAct(
      "startCount",
      "monthEnd",
      count.StartCountInput,
      raw,
      "pharmacy.stock",
      count.startCount,
    ),
  );
}
export async function saveCountLine(raw: unknown) {
  return bareResult(
    await supplyAct(
      "saveCountLine",
      "monthEnd",
      count.SaveCountLineInput,
      raw,
      "pharmacy.stock",
      count.saveCountLine,
    ),
  );
}
export async function sendCountForApproval(raw: unknown) {
  return bareResult(
    await supplyAct(
      "sendCount",
      "monthEnd",
      count.SheetInput,
      raw,
      "pharmacy.stock",
      count.sendCountForApproval,
    ),
  );
}
export async function sendCountBack(raw: unknown) {
  return bareResult(
    await supplyAct(
      "sendCountBack",
      "monthEnd",
      count.SheetInput,
      raw,
      "pharmacy.manage",
      count.sendCountBack,
    ),
  );
}
export async function approveCount(raw: unknown) {
  return bareResult(
    await supplyAct(
      "approveCount",
      "monthEnd",
      count.ApproveCountInput,
      raw,
      "pharmacy.manage",
      count.approveCount,
    ),
  );
}

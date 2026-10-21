"use server";

import { smsSender } from "@/lib/pharmacy/sms-sender";
import * as expiry from "@/lib/pharmacy/stores/expiry-store";
import * as packs from "@/lib/pharmacy/stores/packs";
import * as recall from "@/lib/pharmacy/stores/recall-store";
import { attestResult, bareResult, supplyAct } from "@/lib/pharmacy/stores/supply-action";

/**
 * Expiry, quarantine, write-off and recall (5.6, 5.7; Section 8). Behind `pharmacyRecall`. Permissions: moving to
 * quarantine and recording a recall contact `pharmacy.stock`; write-off, disposal, return to supplier and every
 * other recall action `pharmacy.manage`; prints `pharmacy.view` (pharmacy staff only) and logged.
 */

const PRINT =
  (kind: "write_off_register" | "recall_list" | "recall_reconciliation") => async (raw: unknown) =>
    bareResult(
      await supplyAct(
        `print:${kind}`,
        "recall",
        expiry.PrintInput,
        { ...(raw as object), kind },
        "pharmacy.view",
        expiry.logPrint,
      ),
    );

/** A witness's second factor (never the actor; never logged, stored or returned). */
export async function attestWitness(raw: unknown) {
  return attestResult(
    await supplyAct(
      "attestWitness",
      "recall",
      packs.AttestPersonInput,
      raw,
      "pharmacy.view",
      packs.attestPerson,
    ),
  );
}
export async function moveToQuarantine(raw: unknown) {
  return bareResult(
    await supplyAct(
      "moveToQuarantine",
      "recall",
      expiry.QuarantineInput,
      raw,
      "pharmacy.stock",
      expiry.moveToQuarantine,
    ),
  );
}
export async function writeOff(raw: unknown) {
  return bareResult(
    await supplyAct(
      "writeOff",
      "recall",
      expiry.WriteOffInput,
      raw,
      "pharmacy.manage",
      expiry.writeOff,
    ),
  );
}
export async function recordDisposalReference(raw: unknown) {
  return bareResult(
    await supplyAct(
      "recordDisposalReference",
      "recall",
      expiry.DisposalInput,
      raw,
      "pharmacy.manage",
      expiry.recordDisposalReference,
    ),
  );
}
export async function returnToSupplier(raw: unknown) {
  return bareResult(
    await supplyAct(
      "returnToSupplier",
      "recall",
      expiry.SupplierReturnInput,
      raw,
      "pharmacy.manage",
      expiry.returnToSupplier,
    ),
  );
}
export async function printRegisterEntry(raw: unknown) {
  return PRINT("write_off_register")(raw);
}

export async function startRecall(raw: unknown) {
  return bareResult(
    await supplyAct(
      "startRecall",
      "recall",
      recall.StartRecallInput,
      raw,
      "pharmacy.manage",
      recall.startRecall,
    ),
  );
}
export async function quarantineRecall(raw: unknown) {
  return bareResult(
    await supplyAct(
      "quarantineRecall",
      "recall",
      recall.QuarantineRecallInput,
      raw,
      "pharmacy.manage",
      recall.quarantineRecall,
    ),
  );
}
export async function postWardRecallNotice(raw: unknown) {
  return bareResult(
    await supplyAct(
      "postWardRecallNotice",
      "recall",
      recall.WardNoticeInput,
      raw,
      "pharmacy.manage",
      recall.postWardRecallNotice,
    ),
  );
}
export async function recordRecallContact(raw: unknown) {
  return bareResult(
    await supplyAct(
      "recordRecallContact",
      "recall",
      recall.ContactInput,
      raw,
      "pharmacy.stock",
      recall.recordRecallContact,
    ),
  );
}
/** D-PH2-17: the CSO's approval to message list 4 for this recall. */
export async function approveMayHaveMessages(raw: unknown) {
  return bareResult(
    await supplyAct(
      "approveMayHaveMessages",
      "recall",
      recall.ApproveMayHaveInput,
      raw,
      "pharmacy.manage",
      recall.approveMayHaveMessages,
    ),
  );
}
export async function sendRecallMessage(raw: unknown) {
  const r = await supplyAct(
    "sendRecallMessage",
    "recall",
    recall.SendInput,
    raw,
    "pharmacy.manage",
    (ctx, i) =>
      recall.sendRecallMessage(ctx, i, {
        sender: smsSender(),
        production: process.env.VERCEL_ENV === "production",
      }),
  );
  return r.ok ? { ...bareResult(r), sent: r.data?.sent ?? 0, printed: r.data?.printed ?? 0 } : r;
}
export async function closeRecall(raw: unknown) {
  return bareResult(
    await supplyAct(
      "closeRecall",
      "recall",
      recall.CloseRecallInput,
      raw,
      "pharmacy.manage",
      recall.closeRecall,
    ),
  );
}
export async function printRecallList(raw: unknown) {
  return PRINT("recall_list")(raw);
}
export async function printRecallReconciliation(raw: unknown) {
  return PRINT("recall_reconciliation")(raw);
}

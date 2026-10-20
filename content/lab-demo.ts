/**
 * Removing the lab demo (owner request, 20 Oct 2026; migration 0178). Read by the laboratory lead on Set-up → Demo.
 * Draft until the CSO signs it; `{n}` marks a count filled in by the caller.
 */
import type { SignedCopy } from "@/content/signed-copy";

export const LAB_DEMO_COPY_STATUS: SignedCopy = { status: "draft", signedBy: null, signedOn: null };

export const LAB_DEMO_REMOVE = {
  open: "Remove the demo",
  title: "Remove the demo data",
  description:
    "This deletes everything the demo loads put into this demo hospital. It cannot be undone. Real records are " +
    "never touched: if one points at demo data, nothing is removed.",
  what: "What will be removed",
  counts: {
    patients: "{n} demo patients, with their orders, specimens, results, alerts and referrals",
    staff: "{n} demo staff accounts",
    settings: "{n} signed settings and reference ranges",
    equipment: "{n} pieces of equipment, with their logs and QC",
    "stock items": "{n} stock items, with their lots and deliveries",
    partners: "{n} partner labs",
    "eqa schemes": "{n} EQA schemes",
    "downtime periods": "{n} downtime periods",
  } as Record<string, string>,
  kept:
    "Kept: the audit log, the units filled from the catalogue research, critical-call contacts, reserved paper " +
    "form numbers, and the list of loads below, marked Removed.",
  nothing: "There is no demo data to remove.",
  confirm: "Remove the demo data",
  cancel: "Cancel",
  busy: "Removing the demo… (up to a minute)",
  done: "Removed. The demo hospital no longer holds demo data.",
  notApplied: "Removing the demo needs migration 0178, which the owner applies.",
  removed: "Removed",
};

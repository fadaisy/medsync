import type { SignedCopy } from "@/content/signed-copy";

import { printDay, printTime } from "@/lib/pharmacy/print/label";

/**
 * The controlled register slip (Pharmacy Phase 1, §5.9, §6.10): LB-7, Law 9. It prints the facts of one
 * controlled entry for copying into, or attaching beside, the hospital's controlled drugs register. It is
 * never called the register: the heading says so (B-52, CSO; legal Q2). Pure.
 */

export const REGISTER_COPY = {
  status: "signed",
  signedBy: "Fadhul (CSO)",
  signedOn: "2026-10-13",
  heading: "Copy for the controlled drugs register. This is not the register.",
} as const satisfies SignedCopy & Record<string, unknown>;

export interface RegisterEntryFacts {
  hospital: string;
  point: string;
  recordedAt: string;
  patient: { name: string; medsyncNumber: string };
  /** Generic name, form and strength as supplied. */
  medicine: string;
  quantity: number;
  issueUnit: string;
  batchNumber: string;
  expiry: string;
  /** The balance the witness agreed after the supply (CD-2). */
  balanceAfter: number | null;
  prescriber: string | null;
  suppliedBy: string;
  witness: string;
  collectedBy: string | null;
  timeZone?: string;
}

export interface RegisterSlip {
  heading: string;
  rows: { label: string; value: string }[];
}

export function registerSlipFor(e: RegisterEntryFacts): RegisterSlip {
  const rows: [string, string | null][] = [
    ["Date", printDay(e.recordedAt, e.timeZone)],
    ["Time", printTime(e.recordedAt, e.timeZone)],
    ["Hospital", e.hospital],
    ["Dispensing point", e.point],
    ["Patient", `${e.patient.name} · ${e.patient.medsyncNumber}`],
    ["Medicine", e.medicine],
    ["Quantity", `${e.quantity} ${e.issueUnit}`],
    ["Batch and expiry", `${e.batchNumber} · ${e.expiry}`],
    ["Balance after", e.balanceAfter === null ? null : String(e.balanceAfter)],
    ["Prescriber", e.prescriber],
    ["Supplied by", e.suppliedBy],
    ["Witness", e.witness],
    ["Collected by", e.collectedBy],
  ];
  return {
    heading: REGISTER_COPY.heading,
    rows: rows
      .filter((r): r is [string, string] => r[1] !== null)
      .map(([label, value]) => ({ label, value })),
  };
}

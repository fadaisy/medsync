import type { SignedCopy } from "@/content/signed-copy";
import type { DowntimePeriod, DrillRecord, PharmacySheetState } from "@/lib/downtime/sheets";
import type { MoveKind } from "@/lib/pharmacy/lines";
import type { Batch } from "@/lib/pharmacy/stock/ledger";

import { sheetLabel, withinAPeriod } from "@/lib/downtime/sheets";
import { LOG_COPY } from "@/lib/pharmacy/print/dispensing-log";
import { printTime } from "@/lib/pharmacy/print/label";
import { daysBetween, isExpired, localDate } from "@/lib/pharmacy/stock/ledger";

/**
 * Pharmacy downtime (Pharmacy Phase 1, §5.12, §6.12): DT-2 to DT-11, H6, D-PH1-34, D-PH1-46, ADR 0271.
 * Pure. Sheet numbers, periods, moves and drills are the shared module (`lib/downtime/sheets.ts`, DT-1:
 * never two); this is what only the pharmacy's back-entry needs. The dispensing log is
 * `lib/pharmacy/print/dispensing-log.ts` (DL-1 to DL-3).
 *
 * Law 10, DT-10: entry after downtime refuses only what would make the record impossible (DT-4); every
 * check a live supply would have refused is evaluated at the sheet's time and flagged for look-back.
 * Law 13: the sheet's time is kept and shown beside the entry time.
 */

/** Appendix B, gate-a-content B-73, B-74, B-76, B-78 (B-72 is the log's), exactly as written. Draft. */
export const DOWNTIME_COPY = {
  status: "draft",
  signedBy: null,
  signedOn: null,
  noPeriod: "Ask the pharmacy in charge to record this downtime first.",
  transcribed: "Transcribed from a paper prescription by {cadre}",
  notRegistered: "Register this patient at reception first.",
  sheetFooter:
    'Write each time as it happened. MedSync keeps that time and marks the record "Entered after downtime". Controlled drugs also go in the register as usual.',
} as const satisfies SignedCopy & Record<string, unknown>;

/** Draft staff copy for the refusals and look-back reasons Appendix B does not word. */
export const DOWNTIME_DRAFT_COPY = {
  status: "draft",
  signedBy: null,
  signedOn: null,
  sheet_not_to_enter: "This sheet is not waiting to be entered.",
  row_entered: "This row is already entered.",
  future: "This time is in the future. Check the sheet.",
  quantity: "Enter a whole number above zero.",
  identity_not_checked: "The sheet does not show two identifiers checked.",
  no_pharmacist_initials:
    "A pharmacist was needed first, and the sheet has no pharmacist's initials.",
  awaiting_cosign: "The prescription was awaiting co-signature at that time.",
  cancelled: "The prescription was cancelled at that time.",
  version_changed: "The prescriber had changed this line before that time.",
  batch_expired: "The batch had expired by that time.",
  other_medicine: "The product is not of the prescribed medicine.",
  possible_double_supply:
    "This line already has a supply on record. It may have been supplied twice.",
} as const satisfies SignedCopy & Record<string, unknown>;

/** DT-2, D-PH1-46: DS-00031. */
export const pharmacySheetLabel = (n: number): string => sheetLabel(n, "pharmacy");

/** DT-4, S72: recording a downtime period needs `pharmacy.manage` (the in-charge, D-PH1-34). */
export const mayRecordPeriod = (permissions: readonly string[]): boolean =>
  permissions.includes("pharmacy.manage");

// ─── DT-4: what entry refuses ────────────────────────────────────────────

export type RowRefusal =
  | "sheet_not_to_enter"
  | "row_entered"
  | "future"
  | "no_period"
  | "not_registered"
  | "quantity";

/**
 * DT-2, DT-4: the only refusals, because the record itself would be impossible. A sheet takes rows only
 * while `to_enter` (a complete sheet takes no more). `quantity` is null on a "not supplied" row.
 */
export function rowRefusal(input: {
  sheetState: PharmacySheetState;
  suppliedAt: Date;
  now: Date;
  periods: readonly DowntimePeriod[];
  patientRegistered: boolean;
  rowAlreadyEntered: boolean;
  quantity: number | null;
}): { refusal: RowRefusal; words: string } | null {
  const refuse = (refusal: RowRefusal) => ({
    refusal,
    words:
      refusal === "no_period"
        ? DOWNTIME_COPY.noPeriod
        : refusal === "not_registered"
          ? DOWNTIME_COPY.notRegistered
          : DOWNTIME_DRAFT_COPY[refusal],
  });
  if (input.sheetState !== "to_enter") return refuse("sheet_not_to_enter");
  if (input.rowAlreadyEntered) return refuse("row_entered");
  if (input.suppliedAt > input.now) return refuse("future");
  if (!withinAPeriod(input.periods, input.suppliedAt)) return refuse("no_period");
  if (!input.patientRegistered) return refuse("not_registered");
  if (input.quantity !== null && !(Number.isInteger(input.quantity) && input.quantity > 0))
    return refuse("quantity");
  return null;
}

// ─── DT-6, DT-10: the look-back ──────────────────────────────────────────

/** DT-6: identity as written on the sheet. */
export type SheetIdentity = "checked" | "not_checked" | "not_recorded";

export type LookBackReason =
  | "identity_not_checked"
  | "no_pharmacist_initials"
  | "awaiting_cosign"
  | "cancelled"
  | "version_changed"
  | "batch_expired"
  | "other_medicine"
  | "possible_double_supply";

/**
 * DT-10: never refuses. Each check a live supply (SU-2) would have refused, evaluated at the sheet's
 * time, becomes a reason on the `needs_look_back` flag. An empty list means no look-back. A line still
 * awaiting review in the standard lane is not a reason (S74).
 */
export function lookBackReasons(input: {
  identityOnSheet: SheetIdentity;
  pharmacistFirst: boolean;
  pharmacistInitials: string | null;
  cosignAwaitingAtTime: boolean;
  cancelledAtTime: boolean;
  versionChangedBefore: boolean;
  batch: Pick<Batch, "expiry" | "expiryMonthOnly">;
  suppliedAt: Date;
  productOfMedicine: boolean;
  alreadySupplied: boolean;
}): { reason: LookBackReason; words: string }[] {
  const flags: [LookBackReason, boolean][] = [
    ["identity_not_checked", input.identityOnSheet !== "checked"],
    ["no_pharmacist_initials", input.pharmacistFirst && !input.pharmacistInitials?.trim()],
    ["awaiting_cosign", input.cosignAwaitingAtTime],
    ["cancelled", input.cancelledAtTime],
    ["version_changed", input.versionChangedBefore],
    ["batch_expired", isExpired(input.batch, localDate(input.suppliedAt))],
    ["other_medicine", !input.productOfMedicine],
    ["possible_double_supply", input.alreadySupplied],
  ];
  return flags
    .filter(([, on]) => on)
    .map(([reason]) => ({ reason, words: DOWNTIME_DRAFT_COPY[reason] }));
}

// ─── Law 13: the tag ─────────────────────────────────────────────────────

/** B-72 (the log's template, one copy): "Entered after downtime · Supplied 13:40 · entered 14:52 · sheet DS-00031". */
export const downtimeTag = (input: {
  suppliedAt: Date;
  enteredAt: Date;
  sheet: number;
  timeZone?: string;
}): string =>
  LOG_COPY.downtime
    .replace("{time}", printTime(input.suppliedAt.toISOString(), input.timeZone))
    .replace("{entered}", printTime(input.enteredAt.toISOString(), input.timeZone))
    .replace("{number}", pharmacySheetLabel(input.sheet));

// ─── H6: sheets nobody named ─────────────────────────────────────────────

/** H6: pharmacy sheets reserved more than 7 days ago and still `unused`, listed for the in-charge. */
export function staleUnusedSheets<S extends { number: number; state: string; reservedAt: Date }>(
  sheets: readonly S[],
  today: string,
): S[] {
  return sheets.filter(
    (s) => s.state === "unused" && daysBetween(localDate(s.reservedAt), today) > 7,
  );
}

// ─── DT-5: a paper prescription ──────────────────────────────────────────

export interface PaperLineInput {
  medicineId: string | null;
  medicineAsWritten: string;
  directionsAsWritten: string;
  quantityAsWritten: string | null;
}

export interface PaperPrescriptionInput {
  prescriberName: string;
  prescriberCadre: string;
  /** YYYY-MM-DD, as on the paper. */
  writtenOn: string;
  lines: readonly PaperLineInput[];
}

const between = (s: string, min: number, max: number) =>
  s.trim().length > 0 && s.length >= min && s.length <= max;

/**
 * DT-5, 0128's CHECKs: a paper prescription is its own record (`paper_prescriptions` and its lines).
 * It never creates a `prescriptions` row: `table` says where it goes. Every text is kept exactly as
 * typed from the paper (Law 7); nothing is trimmed or reformatted.
 */
export function paperPrescriptionValid(
  p: PaperPrescriptionInput,
  today: string,
):
  | { ok: true; table: "paper_prescriptions"; record: PaperPrescriptionInput }
  | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!between(p.prescriberName, 2, 120)) errors.push("prescriber_name");
  if (!between(p.prescriberCadre, 2, 80)) errors.push("prescriber_cadre");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.writtenOn) || p.writtenOn > today) errors.push("written_on");
  if (p.lines.length === 0) errors.push("lines");
  p.lines.forEach((l, i) => {
    if (!between(l.medicineAsWritten, 2, 200)) errors.push(`line_${i + 1}_medicine`);
    if (!between(l.directionsAsWritten, 1, 500)) errors.push(`line_${i + 1}_directions`);
    if (l.quantityAsWritten !== null && l.quantityAsWritten.length > 80)
      errors.push(`line_${i + 1}_quantity`);
  });
  return errors.length
    ? { ok: false, errors }
    : { ok: true, table: "paper_prescriptions", record: p };
}

/** B-74. */
export const transcribedText = (cadre: string): string =>
  DOWNTIME_COPY.transcribed.replace("{cadre}", cadre);

// ─── DT-8: a controlled supply on the sheet ──────────────────────────────

export interface BackEnteredControlled {
  id: string;
  kind: "back_entered_supply" | "back_entry_confirmed";
  confirmsEntryId: string | null;
}

/**
 * DT-8, 0127 `pce_witness`: a back-entered controlled supply stores the witness's name as written (2–120
 * characters) and the tick that the register entry was made. Both are required; the name stays text.
 */
export function controlledBackEntry(input: {
  witnessNameAsWritten: string;
  registerAttested: boolean;
}):
  | {
      ok: true;
      entry: { kind: "back_entered_supply"; witnessNameAsWritten: string; registerAttested: true };
    }
  | { ok: false; reason: "witness_name" | "register" } {
  if (!between(input.witnessNameAsWritten, 2, 120)) return { ok: false, reason: "witness_name" };
  if (!input.registerAttested) return { ok: false, reason: "register" };
  return {
    ok: true,
    entry: {
      kind: "back_entered_supply",
      witnessNameAsWritten: input.witnessNameAsWritten,
      registerAttested: true,
    },
  };
}

/** DT-8, S75: back-entered controlled supplies listed until a `back_entry_confirmed` names them. */
export function awaitingRegisterConfirmation<E extends BackEnteredControlled>(
  entries: readonly E[],
): E[] {
  const confirmed = new Set(
    entries.filter((e) => e.kind === "back_entry_confirmed").map((e) => e.confirmsEntryId),
  );
  return entries.filter((e) => e.kind === "back_entered_supply" && !confirmed.has(e.id));
}

// ─── DT-9, DT-11 ─────────────────────────────────────────────────────────

/** DT-9: a "not supplied" row is that line's outcome, through LO-4's downtime moves. */
export const notSuppliedMove = (outcome: "owed" | "buying_outside"): MoveKind =>
  outcome === "owed" ? "downtime_not_supplied_owed" : "downtime_not_supplied_outside";

/** DT-11: a pharmacy drill is a `downtime_drills` row and nothing else. */
export const pharmacyDrill = (
  input: Omit<DrillRecord, "workspace" | "dispensingPointId"> & { dispensingPointId: string },
): DrillRecord => ({
  ...input,
  workspace: "pharmacy",
});

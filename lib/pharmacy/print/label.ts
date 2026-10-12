import type { SignedCopy } from "@/content/signed-copy";
import type { RxCourse, RxFrequency } from "@/lib/prescribing/reference/formulary-types";

/**
 * The dispensing label (Pharmacy Phase 1, §5.6, §6.10): LB-1 to LB-4, Law 7, gate-a-proposal §1 W2.
 * Pure: no I/O, no clock. The caller passes the supply event, its line, the point, the hospital and the
 * signed label set in force (null while unsigned).
 *
 * - LB-1 One label per supply event (one batch). Fields in the signed order; while unsigned, the full
 *   proposed set in the proposed order (D-PH1-17, provisional until legal Q6).
 * - LB-2 Directions byte for byte (Law 7: never trimmed, reformatted, converted or completed). The
 *   pharmacist's line as stored, marked "From the pharmacist: {line}" (B-15). A plain-words line only
 *   where the line holds structured parts and a signed template covers them; none signed, none printed.
 * - LB-3 Warning lines and additional instructions only from the signed lists.
 * - LB-4 Print is CSS only (the page's concern); the document title is fixed and carries no PHI.
 * - W2 The hub holds no street address: the supplier prints as the point, the hospital name and its
 *   district.
 */

export const LABEL_COPY = {
  status: "draft",
  signedBy: null,
  signedOn: null,
  /** B-15 (CSO + PR). */
  pharmacistLine: "From the pharmacist: {line}",
} as const satisfies SignedCopy & Record<string, unknown>;

export const DEFAULT_TIME_ZONE = "Africa/Kampala";

/** "12 Oct 2026", hospital-local. */
export const printDay = (iso: string, timeZone = DEFAULT_TIME_ZONE) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone,
  }).format(new Date(iso));

/** "14:05", hospital-local, 24-hour. */
export const printTime = (iso: string, timeZone = DEFAULT_TIME_ZONE) =>
  new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(new Date(iso));

/**
 * Law 7, LB-2: the directions shown on a screen, a label and a slip are the stored string, unchanged.
 * Every surface goes through this one helper so the byte-equality test covers them all. (The page keeps
 * the whitespace with `white-space: pre-wrap`; that is CSS, not this function.)
 */
export const directionsAsWritten = (stored: string): string => stored;

export type LabelFieldKey =
  | "patient_name"
  | "medicine"
  | "directions"
  | "pharmacist_line"
  | "quantity"
  | "batch_expiry"
  | "date"
  | "supplier"
  | "warning_lines"
  | "additional_instructions";

/** gate-a-content §2.13: the proposed order, used while the label fields are unsigned (D-PH1-17). */
export const PROPOSED_LABEL_FIELDS: readonly LabelFieldKey[] = [
  "patient_name",
  "medicine",
  "directions",
  "pharmacist_line",
  "quantity",
  "batch_expiry",
  "date",
  "supplier",
  "warning_lines",
  "additional_instructions",
];

export interface PlainWordsTemplate {
  frequency: RxFrequency;
  course: RxCourse | null;
  /** The signed words, printed as signed. */
  words: string;
}

export interface SignedLabelSet {
  fields: readonly LabelFieldKey[];
  warningLines: readonly string[];
  /** The signed list the supplier chose from. */
  additionalInstructions: readonly string[];
  plainWords: readonly PlainWordsTemplate[];
}

export interface LabelInput {
  /** One supply event: one batch. */
  supply: {
    patientName: string;
    /** Generic name, form and strength as supplied (the product). */
    medicine: string;
    quantity: number;
    issueUnit: string;
    batchNumber: string;
    /** As stored on the batch (a month-only expiry stays month-only). */
    expiry: string;
    suppliedAt: string;
    pharmacistLine: string | null;
    /** Chosen at hand-over from the signed list; anything else is dropped (LB-3). */
    chosenInstructions?: readonly string[];
  };
  line: {
    directions: string;
    /** Plan lines only; EMR-sheet lines are free text and never get plain words. */
    structured: { frequency: RxFrequency | null; course: RxCourse | null } | null;
  };
  point: { name: string };
  hospital: { name: string; district: string | null };
  signed: SignedLabelSet | null;
  timeZone?: string;
}

export interface LabelField {
  key: LabelFieldKey | "plain_words";
  text: string;
}

export function labelFor({
  supply,
  line,
  point,
  hospital,
  signed,
  timeZone,
}: LabelInput): LabelField[] {
  const order = signed?.fields ?? PROPOSED_LABEL_FIELDS;
  const template =
    signed && line.structured?.frequency
      ? signed.plainWords.find(
          (t) => t.frequency === line.structured!.frequency && t.course === line.structured!.course,
        )
      : undefined;
  const allowed = new Set(signed?.additionalInstructions ?? []);
  const supplier = [point.name, hospital.name, hospital.district]
    .filter((x): x is string => !!x)
    .join(", ");

  const out: LabelField[] = [];
  for (const key of order) {
    switch (key) {
      case "patient_name":
        out.push({ key, text: supply.patientName });
        break;
      case "medicine":
        out.push({ key, text: supply.medicine });
        break;
      case "directions":
        out.push({ key, text: directionsAsWritten(line.directions) });
        if (template) out.push({ key: "plain_words", text: template.words });
        break;
      case "pharmacist_line":
        if (supply.pharmacistLine !== null)
          out.push({
            key,
            text: LABEL_COPY.pharmacistLine.replace("{line}", () => supply.pharmacistLine!),
          });
        break;
      case "quantity":
        out.push({ key, text: `${supply.quantity} ${supply.issueUnit}` });
        break;
      case "batch_expiry":
        out.push({ key, text: `Batch ${supply.batchNumber} · Expiry ${supply.expiry}` });
        break;
      case "date":
        out.push({ key, text: printDay(supply.suppliedAt, timeZone) });
        break;
      case "supplier":
        out.push({ key, text: supplier });
        break;
      case "warning_lines":
        for (const w of signed?.warningLines ?? []) out.push({ key, text: w });
        break;
      case "additional_instructions":
        for (const a of supply.chosenInstructions ?? [])
          if (allowed.has(a)) out.push({ key, text: a });
        break;
    }
  }
  return out;
}

export type PrintKind = "label" | "slip" | "register_entry" | "dispensing_log" | "downtime_sheets";

const PRINT_TITLES: Record<PrintKind, string> = {
  label: "MedSync pharmacy label",
  slip: "MedSync pharmacy slip",
  register_entry: "MedSync register copy",
  dispensing_log: "MedSync dispensing log",
  downtime_sheets: "MedSync downtime sheets",
};

/**
 * LB-4: the browser offers the document title as the PDF file name, so every print page uses this fixed
 * title. It takes the kind only, so no patient detail can reach a file name; print URLs carry ids only.
 */
export const printFileSafe = (kind: PrintKind): string => PRINT_TITLES[kind];

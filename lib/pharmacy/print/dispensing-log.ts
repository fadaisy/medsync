import type { SignedCopy } from "@/content/signed-copy";

import { printTime } from "@/lib/pharmacy/print/label";

/**
 * The Daily Dispensing Log (Pharmacy Phase 1, §5.12, §6.12): DL-1 to DL-3. Pure: the caller reads one
 * point's supply events for one hospital-local day, by `supplied_at` (so a back-entered supply lands on the
 * day it was supplied, DL-2), and passes the hospital's column map.
 *
 * - DL-1 One row per supply event (one batch). Columns follow the hospital's HMIS 016 map; until the
 *   pharmacy in charge confirms it, the log carries B-77 at the top and prints MedSync's own order.
 * - DL-2 A back-entered row shows the sheet's time and is marked (B-74). A reversed supply, and one
 *   recorded in error, stay on the log, struck through, with the reason (B-48, B-49).
 * - DL-3 Rows = supply events. Nothing is filtered or merged here.
 */

export const LOG_COPY = {
  status: "draft",
  signedBy: null,
  signedOn: null,
  notConfirmed: "Columns not yet confirmed against this hospital's dispensing log.",
  downtime: "Entered after downtime · Supplied {time} · entered {entered} · sheet {number}",
  reversed: "Reversed {time} by {cadre}: {reason}",
  inError: "Recorded in error. {reason}",
} as const satisfies SignedCopy & Record<string, unknown>;

export type LogFact =
  | "time"
  | "patient_name"
  | "medsync_number"
  | "medicine"
  | "quantity"
  | "batch"
  | "expiry"
  | "prescription"
  | "supplied_by";

/** MedSync's order, printed while the map is unconfirmed. */
export const DEFAULT_LOG_COLUMNS: readonly { heading: string; fact: LogFact }[] = [
  { heading: "Time", fact: "time" },
  { heading: "Patient", fact: "patient_name" },
  { heading: "MedSync number", fact: "medsync_number" },
  { heading: "Medicine", fact: "medicine" },
  { heading: "Quantity", fact: "quantity" },
  { heading: "Batch", fact: "batch" },
  { heading: "Expiry", fact: "expiry" },
  { heading: "Prescription", fact: "prescription" },
  { heading: "Supplied by", fact: "supplied_by" },
];

export interface LogColumnMap {
  confirmed: boolean;
  /** In the book's order; `fact: null` is a column MedSync cannot fill (printed blank). */
  columns: readonly { heading: string; fact: LogFact | null }[];
}

export interface LogSupply {
  id: string;
  suppliedAt: string;
  patientName: string;
  medsyncNumber: string;
  medicine: string;
  quantity: number;
  issueUnit: string;
  batchNumber: string;
  expiry: string;
  prescription: string;
  suppliedBy: string;
  downtime: { enteredAt: string; sheetNumber: string } | null;
  reversal: { at: string; byCadre: string; reason: string } | null;
  inError: { reason: string } | null;
}

export interface DispensingLog {
  notice: string | null;
  headings: string[];
  rows: { supplyId: string; cells: string[]; struck: boolean; notes: string[] }[];
}

const fill = (s: string, v: Record<string, string>) =>
  s.replace(/\{(\w+)\}/g, (m, k: string) => v[k] ?? m);

export function dispensingLog(
  supplies: readonly LogSupply[],
  columnMap: LogColumnMap | null,
  timeZone?: string,
): DispensingLog {
  const confirmed = columnMap?.confirmed === true;
  const columns = confirmed ? columnMap.columns : DEFAULT_LOG_COLUMNS;
  const cell = (s: LogSupply, fact: LogFact | null): string => {
    switch (fact) {
      case "time":
        return printTime(s.suppliedAt, timeZone);
      case "patient_name":
        return s.patientName;
      case "medsync_number":
        return s.medsyncNumber;
      case "medicine":
        return s.medicine;
      case "quantity":
        return `${s.quantity} ${s.issueUnit}`;
      case "batch":
        return s.batchNumber;
      case "expiry":
        return s.expiry;
      case "prescription":
        return s.prescription;
      case "supplied_by":
        return s.suppliedBy;
      case null:
        return "";
    }
  };
  const rows = [...supplies]
    .sort((a, b) => Date.parse(a.suppliedAt) - Date.parse(b.suppliedAt))
    .map((s) => {
      const notes: string[] = [];
      if (s.downtime)
        notes.push(
          fill(LOG_COPY.downtime, {
            time: printTime(s.suppliedAt, timeZone),
            entered: printTime(s.downtime.enteredAt, timeZone),
            number: s.downtime.sheetNumber,
          }),
        );
      if (s.reversal)
        notes.push(
          fill(LOG_COPY.reversed, {
            time: printTime(s.reversal.at, timeZone),
            cadre: s.reversal.byCadre,
            reason: s.reversal.reason,
          }),
        );
      if (s.inError) notes.push(fill(LOG_COPY.inError, { reason: s.inError.reason }));
      return {
        supplyId: s.id,
        cells: columns.map((c) => cell(s, c.fact)),
        struck: !!(s.reversal || s.inError),
        notes,
      };
    });
  return {
    notice: confirmed ? null : LOG_COPY.notConfirmed,
    headings: columns.map((c) => c.heading),
    rows,
  };
}

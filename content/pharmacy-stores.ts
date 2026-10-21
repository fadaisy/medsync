import type { SignedCopy } from "@/content/signed-copy";

/**
 * Pharmacy Phase 2: stores, wards and supply. Every string staff or patients read on the Store group, the ward
 * stock page and the cart check. Draft until the CSO signs (Appendix B); in production the six Phase 2 flags
 * stay off while this is draft (CS-5). Never edit the status here without a signature.
 */
export const PHARMACY_STORES_COPY: SignedCopy = { status: "draft", signedBy: null, signedOn: null };

/** Appendix B, word for word. */
export const STORES_B = {
  notSent:
    "MedSync does not send this order. A public hospital enters these quantities in the National Medical Stores portal.",
  countFirst: (interval: string) =>
    `Count the ward first. The last count is older than ${interval}.`,
  dosesContext: (n: number) =>
    `${n} ${n === 1 ? "dose" : "doses"} charted on the administration record since the last count. They are not taken from the stock figure.`,
  moreThanIssued: "More on the ward than was issued. Check returns and the last count.",
  cartUsesContext: (n: number) =>
    `${n} ${n === 1 ? "use" : "uses"} recorded against this cart since the last check. They are not taken from the count.`,
  explainDifference: (unit: string) => `Say what you found. It goes to ${unit} nurse in charge.`,
  onlyCounted:
    "Only what was counted goes into stock. Every difference from the delivery note goes on the discrepancy report.",
  issuedUnconfirmed: (time: string, location: string) =>
    `Issued ${time}, not yet confirmed by ${location}.`,
  mayHaveReceived: "May have received it. The administration record does not name the batch.",
  batchesMixed:
    "This ward keeps one figure per product, so batches cannot be told apart after they reach the ward.",
  recallPatientMessage: (messageName: string, phone: string) =>
    `${messageName} pharmacy needs to speak to you about a medicine you collected. Please call ${phone} or come to the pharmacy.`,
  monthNotClosed: "Month not closed. Figures may change.",
  belongsTo: (month: string, date: string) => `Belongs to ${month}, recorded ${date}.`,
  noCost: "No cost recorded.",
  parameterMissing: (parameter: string, role: string) =>
    `This needs ${parameter}, which is not set yet. ${role} sets it.`,
  columnsUnconfirmed: (form: string) =>
    `Columns not yet confirmed against this hospital's ${form}.`,
  paperStillApplies: "The controlled drugs register entry is still made on paper.",
} as const;

/** 5.1: the second group on the pharmacy rail. Its item labels live in lib/pharmacy/nav.ts, as Phase 1's do. */
export const STORES_NAV = { group: "Store" } as const;

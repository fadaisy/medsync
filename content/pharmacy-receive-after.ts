import type { SignedCopy } from "@/content/signed-copy";

import { money, num, plural } from "@/lib/pharmacy/derive/receive/format";

/**
 * Stock › Receive a delivery, after a delivery is in: put away, papers, claims, labels, dispatches and the figures
 * (RECEIVE.md §E to §G, verbatim from receive.dc.html). Draft until the Clinical Safety Officer signs.
 */
export const PHARMACY_RECEIVE_AFTER_COPY: SignedCopy = {
  status: "draft",
  signedBy: null,
  signedOn: null,
};

const first = (name: string) => name.split(" ")[0] ?? name;

export const RA = {
  back: "‹ Receive",
  title: (place: string) => `Added to ${place}`,
  sub: (parts: readonly string[]) => parts.join(" · "),
  put: {
    title: "Put away",
    left: (n: number) => `${n} left`,
    allDone: "all done",
    labels: "Print shelf labels",
    note: "Each batch goes to the shelf where its medicine already is. Cold-chain lines first.",
    cold: "2–8 °C · first",
    controlled: "Controlled",
    row: (batch: string, exp: string, qty: string) => `${batch} · exp ${exp} · ${qty}`,
    sentOn: (n: number) => ` (${num(n)} sent on)`,
    aria: (med: string) => `Shelf for ${med}`,
    mark: "Mark put away",
    already: (bin: string) => `Already on ${bin}`,
    newShelf: "New on this shelf",
    allSent: "All sent on ✓",
    on: (shelf: string) => `On ${shelf} ✓`,
    undo: "Undo",
    undoAria: (med: string) => `Undo put away of ${med}`,
    toast: (med: string, shelf: string) => `${med} put away on ${shelf}.`,
    undone: (med: string) => `${med} is back to put away.`,
    straight: (n: number, place: string) => `Send ${num(n)} straight to ${place}`,
    straightToast: (n: number, place: string, voucher: string) =>
      `Sent ${num(n)} straight to ${place} on ${voucher}. It joins their stock when they confirm it.`,
  },
  moved: {
    title: "What moved",
    cols: ["Medicine", "Batch", "Into stock", "Not accepted", "Result"],
    quarantine: "in quarantine",
    driver: "back with the driver",
    rejected: (packs: string, where: string) => `${packs} · ${where}`,
  },
  papers: {
    title: "Papers",
    grn: "Goods received note",
    report: "Discrepancy report (HMIS 087)",
    noReport: "Every line matched the note, so there is no discrepancy report.",
    claim: (ref: string) => `Claim ${ref}`,
    second: (name: string) => `Count checked by ${name}.`,
    photoAlt: (kind: string, n: number) => `${kind} photo ${n}`,
    notNational:
      "The columns of the national form are not confirmed yet. MedSync does not send this report.",
    head: {
      facility: "Facility",
      supplier: "Supplier",
      note: "Delivery note",
      arrived: "Arrived",
      place: "Received at",
      deliverer: "Deliverer",
      vehicle: "Vehicle",
      grn: "Goods received note",
    },
    grnCols: ["Line", "Product", "Batch", "Expiry", "Accepted", "Cost per pack, UGX", "Witness"],
    reportCols: [
      "Line",
      "Product",
      "Batch",
      "Expiry",
      "On the note",
      "Counted",
      "Accepted",
      "Rejected",
      "Discrepancy",
      "Decision",
    ],
    noCost: "No cost given",
    notRecorded: "Not recorded",
    decision: { accept: "Accept", accept_tell: "Accept and tell the supplier", reject: "Reject" },
    signs: ["Received by", "Witnessed by", "Delivered by"],
    signHint: "Name, signature and date",
    close: "Close",
    print: "Print",
  },
  order: {
    closed: "Closed",
    part: "Partly delivered",
    nothing: "Nothing is still owed on this order.",
    rest: "Record the rest",
  },
  claim: {
    title: "Claims to suppliers",
    note: "Made automatically when a delivery is short, damaged, rejected or charged above the order price. Followed until the credit note arrives.",
    state: { draft: "Draft", sent: "Sent", credit: "Credit received" },
    send: "Send the claim",
    receive: "Credit received",
    row: (
      note: string,
      lines: readonly { med: string; kind: string; packs: number }[],
      credit: string,
    ) =>
      `${note} · ${lines.map((x) => `${first(x.med)}: ${x.kind.toLowerCase()} (${plural(x.packs, "pack")})`).join("; ")}${credit ? ` · credit note ${credit}` : ""}`,
    dialogTitle: (ref: string, supplier: string) => `${ref} · ${supplier}`,
    total: (n: number) => `Total ${money(n)}`,
    line: (kind: string, packs: number) => `${kind} · ${plural(packs, "pack")}`,
    message: "Message to the supplier",
    creditNote: "Credit note number",
    needCredit: "Type the credit note number.",
    close: "Close",
    copy: "Copy the message",
    markSent: "Mark as sent",
    copied: "Copied.",
    blocked: "Copy is blocked here: select the text and copy it.",
    sent: (ref: string, supplier: string) => `${ref} marked as sent to ${supplier}.`,
    credited: (note: string, ref: string) => `Credit note ${note} recorded. ${ref} is closed.`,
    draft: (a: {
      supplier: string;
      ref: string;
      note: string;
      grn: string;
      lines: readonly { med: string; kind: string; packs: number; value: number }[];
      total: number;
      place: string;
    }) =>
      `Dear ${a.supplier},\n\nClaim ${a.ref} for delivery note ${a.note} (our ${a.grn}):\n${a.lines
        .map(
          (x) =>
            `- ${x.med}: ${x.kind.toLowerCase()}, ${plural(x.packs, "pack")}, ${money(x.value)}`,
        )
        .join(
          "\n",
        )}\n\nTotal: ${money(a.total)}. Please issue a credit note or replace the items.\n\nPharmacy, ${a.place}`,
  },
  labels: {
    title: (grn: string) => `Shelf labels · ${grn}`,
    lead: "One per batch. Stick it on the shelf edge or the box; the barcode scans like the pack.",
    meta: (batch: string, exp: string, qty: string) => `Batch ${batch} · exp ${exp} · ${qty}`,
    noCode: "no code",
    own: "In-house code: this medicine had no barcode",
    barcode: (digits: string) => `EAN-13 barcode ${digits}`,
    given: (given: readonly string[]) =>
      `No barcode on ${given.join(", ")}: it now has an in-house code. Scanning the label counts it next time.`,
    none: "Nothing to label: every batch of this delivery went on.",
    close: "Close",
    print: "Print",
  },
  confirm: {
    title: "Confirm what arrived",
    lead: (kind: string, from: string, to: string) => `${kind} from ${from} to ${to}`,
    note: "Difference, if any",
    hint: "A difference is kept with the voucher and opens a case for the in-charge.",
    cancel: "Cancel",
    submit: "Confirm",
    ok: (place: string) => `Confirmed. It is in ${place}'s stock.`,
    diff: "Confirmed with a difference. A case is open for the in-charge.",
  },
  figures: {
    title: "Receiving figures",
    group: "Receiving figures",
    suppliers: "Suppliers",
    suppliersNote: "Last 6 months. Fill rate is the share of ordered lines delivered in full.",
    cols: ["Supplier", "Fill rate", "Lead time", "On time", "Differences"],
    lead: (days: number, promised: number) =>
      `${plural(days, "day")}${days > promised ? ` (promised ${promised})` : ""}`,
    noData: "Shows after the first delivery is finished.",
    noSuppliers: "Shows after an order to a supplier has been delivered.",
    noClaims: "No claim is open.",
    chartLabel: (label: string) => `${label}, last deliveries`,
    yZero: "0",
  },
} as const;

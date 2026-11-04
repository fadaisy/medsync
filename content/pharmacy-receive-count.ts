import type { SignedCopy } from "@/content/signed-copy";

import { num, plural } from "@/lib/pharmacy/derive/receive/format";

/**
 * Stock › Receive a delivery › counting a delivery (RECEIVE.md §D): every word of the count view, verbatim from
 * receive.dc.html. Strings marked `new` are not in the prototype and need the CSO's eye. Draft until the CSO signs.
 */
export const PHARMACY_RECEIVE_COUNT_COPY: SignedCopy = {
  status: "draft",
  signedBy: null,
  signedOn: null,
};

export const RCT = {
  head: {
    back: "‹ Receive",
    counting: "Counting",
    blind: "Blind count",
    lead: "Nothing is in stock until you add it. Everything here saves as you go.",
    /** new: the word before the reason a delivery came back from the device. */
    conflict: "Came back to counting:",
  },
  lines: {
    title: "Lines",
    counted: (n: number, pending: number) =>
      `${n} counted${pending ? ` · ${pending} still to count` : ""}`,
    empty: "No line yet. Scan the first pack.",
    add: "+ Add a line",
  },
  scan: {
    label: "Scan the next pack, or type a name",
    read: "Read",
    pick: "Pick from the catalogue (Ctrl K)",
    hint: "A scanner types here and presses Enter. A 2D code fills the batch and expiry too. Scanning the same pack again counts one more.",
    unknown:
      "This barcode is new here. Which medicine is on the pack? It is linked for this hospital only, nothing is guessed.",
    unknownLabel: "Which medicine this barcode is",
    choose: "Choose the medicine on the pack",
    link: "Link it and add the line",
    needPick: "Choose the medicine on the pack first. Nothing is guessed.",
    /** new: offline, the barcode cannot be linked on the server yet. */
    unknownOffline:
      " Counted on this device. The barcode is linked when the connection is back: scan it again then.",
    added: (no: number) => `Line ${no} added from the scan.`,
    more: (no: number, packs: string) => `One more pack on line ${no} (${packs} packs).`,
    recall: (batch: string, notice: string, why: string) =>
      ` Batch ${batch} is on recall (${notice}, ${why}): it cannot go into stock.`,
  },
  line: {
    sr: "Line ",
    tag: {
      cold: (lo: number, hi: number) => `${lo}–${hi} °C`,
      controlled: "Controlled",
      regLapsed: "Registration lapsed",
      local: "Local line",
      vaccine: "Vaccine · VVM",
    },
    source: {
      scan: "Scanned",
      catalogue: "Picked",
      typed: "Typed",
      order: "Typed",
      fromOrder: "From the order",
    },
    change: "Change",
    count: "Count",
    close: "Close",
    remove: "Remove",
    done: "Done with this line",
    fact: {
      into: "Into stock",
      batch: "Batch",
      exp: "Exp",
      rejected: "Not accepted",
      arrived: "Arrived at",
      onOrder: "On the order",
      notCounted: (owed: string) => `${owed}, not counted yet`,
      blind: "On the order · count it first, the quantity stays hidden",
      none: "Not counted yet",
    },
  },
  edit: {
    batch: "Batch",
    exp: "Expiry",
    expPh: "2028-06 or 2028-06-30",
    packs: "Packs counted",
    per: (unit: string) => `Per pack (${unit}s)`,
    note: "On the note (packs)",
    notePh: (n: string) => `${n} on the order`,
    cost: "Cost per pack, UGX",
    allArrived: (n: string) => `All ${n} packs arrived`,
    temp: "Temperature on arrival, °C (read from the cool box)",
    vvm: "Vaccine vial monitor (VVM) on the vials",
    vvmStage: [
      { value: "1", label: "Stage 1 · use" },
      { value: "2", label: "Stage 2 · use" },
      { value: "3", label: "Stage 3 · discard" },
      { value: "4", label: "Stage 4 · discard" },
    ],
    freeze: "Freeze indicator in the box",
    freezeOptions: [
      { value: "ok", label: "Fine, not frozen" },
      { value: "tripped", label: "Tripped" },
    ],
    decide: "Short-dated: decide",
    decisions: [
      { value: "accept", label: "Accept" },
      { value: "accept_tell", label: "Accept and tell the supplier" },
      { value: "reject", label: "Reject" },
    ],
    approval: "Accepting needs the in-charge (Rules › Receiving)",
    /** new: the button that sends the request to the in-charge's device. */
    ask: "Ask the in-charge",
    asked: "Asked the in-charge.",
    askOffline: "Asking the in-charge needs the network.",
    waiting: "Waiting for approval",
    approved: (name: string) => `Approved by ${name}`,
    regCaution: "Registration lapsed. Say why it is received; it is listed for the in-charge.",
    regWhy: "Why it is received",
    regChoose: "Choose",
    regOptions: [
      { value: "donation", label: "Donated stock" },
      { value: "no_registered_alternative", label: "No registered alternative could be had" },
      { value: "renewal_pending", label: "Registration renewal pending (supplier's letter)" },
      { value: "other", label: "Other (with text)" },
    ],
    regNote: "What happened",
    rejToggle: "Some are not accepted",
    rejPacks: "Packs not accepted",
    rejWhy: "Why",
    rejChoose: "Choose",
    rejWhere: "Where they go",
    fates: [
      { value: "driver", label: "Back with the driver" },
      { value: "quarantine", label: "Keep in quarantine" },
    ],
    rejectAll: "Reject all of it",
  },
  note: {
    abovePrice: (cost: string, unit: string, price: string) =>
      `Costs ${cost} per ${unit}, above its price of ${price}. Review the price in Set-up › Medicines.`,
    tempIn: (t: string, lo: number, hi: number) =>
      `Arrived at ${t} °C, inside ${lo}–${hi} °C. It goes straight into the fridge.`,
    tempOut: (t: string, lo: number, hi: number) =>
      `Arrived at ${t} °C, outside ${lo}–${hi} °C. Keep it apart in the fridge, call the supplier, and reject it or receive it after their answer.`,
    expired: (exp: string) =>
      `Expired ${exp}. It cannot go into stock: keep it apart and return it.`,
    short: (months: number, exp: string) =>
      `Short expiry: ${months} months left (${exp}). Receive it only if it will be used by then, or reject it.`,
    pack: (per: number, usual: number) => `Packs of ${per} this time; the usual pack is ${usual}.`,
    recall: (batch: string, notice: string, why: string) =>
      `Batch ${batch} is on recall: ${notice}, ${why}. It cannot go into stock. Reject it into quarantine and keep it for the supplier.`,
    price: (cost: number, fromOrder: boolean, ref: number, pct: number) =>
      `UGX ${num(cost)} a pack; ${fromOrder ? "the order says" : "the usual price is"} UGX ${num(ref)} (${pct > 0 ? "+" : ""}${pct}%). ${
        pct > 0
          ? "The difference goes on the claim unless the invoice is corrected."
          : "Check the invoice uses the same price."
      }`,
    vvmBad: "The vial monitor has reached the discard point. Do not use; reject it.",
    frozen:
      "The freeze indicator tripped. Freezing destroys this vaccine. Keep it apart for a shake test, or reject it.",
  },
  card: {
    title: "The delivery",
    change: "Change",
    into: "Into",
    arrived: "Arrived",
    order: "Order",
    noOrder: "No order",
    kind: "Kind",
    people: "Brought by",
    notGiven: "Not given",
    invoice: "Invoice",
    invoiceNo: "Invoice number",
    invoiceTotal: "Invoice total, UGX",
    photos: "Photos",
    photoKind: { note: "Delivery note", invoice: "Invoice", damage: "Damage" },
    photoPlus: (label: string) => `+ ${label}`,
    photoAlt: (label: string, n: number) => `${label} photo ${n}`,
    photoAdded: (label: string, note: string) => `${label} photo added to ${note}.`,
    /** new */
    photoOffline: "Photos need the network",
    photoNote: "For claims and audits.",
    summary: (lines: number, units: number, value: number) =>
      `${plural(lines, "line")} · ${num(units)} units${value ? ` · UGX ${num(value)}` : ""}`,
    todo: "Still to finish",
    controlled:
      "A witness on duty confirms each controlled line when you add it. The paper register still applies.",
    kept: "Rejected and kept goes to quarantine.",
    add: (n: number) => `Add ${plural(n, "line")} to stock`,
    saveHere: "Save on this device",
    noCount: "Count at least one line first.",
    things: (n: number) => `${plural(n, "thing")} to finish before it is added.`,
    later: "Finish later",
    abandon: "Abandon this delivery",
    owed: "Still owed on the order",
    nothingOwed: "Nothing is still owed on this order.",
  },
  picker: {
    title: "Pick from the catalogue",
    find: "Find a medicine",
    none: "Nothing by that name in your medicines.",
    pack: (per: number) => `Pack of ${per}`,
    here: (text: string) => `${text} here`,
    controlled: "Controlled",
    notStocked: "Not stocked yet? Add it",
    generic: "Generic name",
    strength: "Strength",
    per: "Counted per",
    units: ["tablet", "capsule", "vial", "ampoule", "bottle", "sachet", "tube"],
    note: "It joins Set-up › Medicines as a local line. The in-charge reviews why it is stocked.",
    addLocal: "Add to medicines",
    /** new */
    localOffline: "Adding a medicine needs the network.",
    tickOne: "Tick at least one medicine.",
    keys: "↑↓ with Tab · Space ticks · Esc closes",
    cancel: "Cancel",
    add: (n: number) => (n === 1 ? "Add 1 line" : `Add ${n} lines`),
  },
  finish: {
    titleBoth: "Witness and second check",
    titleSecond: "A second person checks the count",
    titleWitness: "A witness confirms the controlled lines",
    leadSecond: (value: number, limit: number) =>
      `This delivery is worth UGX ${num(value)}, above the UGX ${num(limit)} limit (Rules › Receiving), so someone else checks the count before it goes into stock.`,
    leadWitness:
      "Someone on duty who watched the count, not you. The paper register still applies.",
    second: "Count checked by",
    chooseSecond: "Choose who checked it",
    chooseWitness: "Choose who is witnessing",
    line: (no: number, med: string, batch: string) => `Line ${no} · ${med} · ${batch}`,
    /** new: what the witness reads on their own screen. */
    witnessWhat: (no: number, med: string, batch: string, units: string, note: string) =>
      `Line ${no} · ${med} · batch ${batch} · ${units} received on ${note}`,
    secondWhat: (note: string, value: number) => `Count of ${note} (UGX ${num(value)})`,
    confirmedBy: (name: string) => `Confirmed by ${name}`,
    change: "Change",
    needWitness: "Each controlled line needs its witness.",
    needSecond: "Choose who checked the count.",
    cancel: "Cancel",
  },
  abandon: {
    title: "Abandon this delivery",
    why: "Why it is abandoned",
    need: "Say why it is abandoned.",
    keep: "Keep counting",
    go: "Abandon it",
  },
  saved: "Saved on this device. It is added to stock as soon as the connection is back.",
  added: (place: string, store: boolean, claim: { supplier: string; total: number } | null) =>
    `Added to ${place}.${store ? " Put each batch on its shelf next." : ""}${
      claim ? ` A claim to ${claim.supplier} is drafted for UGX ${num(claim.total)}.` : ""
    }`,
} as const;

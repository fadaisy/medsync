import type { SignedCopy } from "@/content/signed-copy";

import { atText, plural } from "@/lib/pharmacy/derive/receive/format";

/** Stock › Receive a delivery, the words the engines give (RECEIVE.md, verbatim from receive.dc.html). Draft until the CSO signs. */
export const PHARMACY_RECEIVE_COPY: SignedCopy = {
  status: "draft",
  signedBy: null,
  signedOn: null,
};

const line = (no: number) => `Line ${no}`;

/** The kinds of dispatch, as a place sees them (§F). */
export const CATALOGUE_DISPATCH_WORDS = {
  requisition: "Requisition",
  topup: "Top-up",
  urgent: "Urgent",
  transfer: "Transfer",
  straight: "Straight from delivery",
  no_requisition: "Without a requisition",
  expiry_move: "Near expiry",
  return: "Return",
};

export const RC = {
  dash: "—",
  why: {
    damaged: "Damaged",
    wrong_product: "Wrong product",
    expired: "Expired",
    short_dated: "Rejected as short-dated",
    recall: "Batch on recall",
    cold_chain: "Cold chain broken",
    other: "Other",
  },
  word: {
    fewer: " fewer than the note",
    more: " more than the note",
    left: " left on the order",
    short: " short of the order",
    notOnOrder: "Not on the order",
    expired: "Expired",
    under: (look: number) => `Expires in under ${look} days`,
    price: (pct: number, fromOrder: boolean) =>
      `Price ${Math.abs(pct)}% ${pct > 0 ? "above" : "below"}${fromOrder ? " the order" : " the usual price"}`,
    vvm: (stage: string) => `VVM stage ${stage}: do not use`,
    frozen: "Freeze indicator tripped",
    matches: "Matches",
  },
  problem: {
    packs: (no: number) => `${line(no)}: give how many packs.`,
    per: (no: number, unit: string) => `${line(no)}: give how many ${unit}s in each pack.`,
    batch: (no: number) => `${line(no)}: give the batch number from the pack, or scan it.`,
    exp: (no: number) =>
      `${line(no)}: give the expiry from the pack (2028-06 or 2028-06-30), or scan it.`,
    badExp: (no: number) => `${line(no)}: write the expiry as 2028-06 or 2028-06-30.`,
    expired: (no: number) => `${line(no)} has expired. It cannot go into stock: reject it.`,
    temp: (no: number) => `${line(no)}: give the temperature on arrival.`,
    coldBroken: (no: number) =>
      `${line(no)}: the cold chain was broken. Reject it, or keep it apart until the supplier answers.`,
    decide: (no: number) => `${line(no)}: short-dated. Decide.`,
    approval: (no: number) =>
      `${line(no)}: accepting a short-dated batch needs the in-charge's approval.`,
    recall: (no: number, batch: string, notice: string) =>
      `${line(no)}: batch ${batch} is on recall (${notice}). Reject it into quarantine.`,
    vvm: (no: number) => `${line(no)}: record the vaccine vial monitor (VVM) stage.`,
    vvmBad: (no: number) => `${line(no)}: the VVM is at the discard point. Reject it.`,
    freeze: (no: number) => `${line(no)}: check the freeze indicator.`,
    frozen: (no: number) =>
      `${line(no)}: the freeze indicator tripped. Reject it, or keep it apart for a shake test.`,
    reg: (no: number) => `${line(no)}: registration lapsed. Say why it is received.`,
    regNote: (no: number) => `${line(no)}: say what happened, in a few words.`,
    rejMore: (no: number) => `${line(no)}: more are rejected than were counted.`,
    rejWhy: (no: number) => `${line(no)}: say why it was rejected.`,
  },
  match: {
    priced: (n: number) =>
      `${plural(n, "line")}${n === 1 ? " is" : " are"} priced differently from the order`,
    pricesOk: "Prices match the order",
    differ: (n: number) =>
      `${plural(n, "line")}${n === 1 ? " differs" : " differ"} from the delivery note`,
    countsOk: "Counts match the delivery note",
    invoiceOk: (total: string) => `Invoice matches the count (${total})`,
    invoiceGap: (gap: string, more: boolean) =>
      `Invoice is ${gap}${more ? " more" : " less"} than what was counted`,
    noInvoice: "No invoice entered yet",
  },
  due: {
    late: (n: number) => `${plural(n, "day")} late`,
    today: "Due today",
    inDays: (n: number) => `Due in ${plural(n, "day")}`,
  },
  claim: { short: "Short on the note", above: "Charged above the order price" },
  cold: {
    over: (t: string, lim: number) =>
      `Cold lines arrived ${t} ago, over the ${lim} min limit. Put them in the fridge now, then finish counting.`,
    within: (t: string, lim: number) =>
      `Cold lines arrived ${t} ago. Into the fridge within ${lim} min (Rules › Cold chain).`,
  },
  chase: (
    supplier: string,
    ref: string,
    sentOn: string,
    dueIso: string,
    owed: readonly { name: string; packs: string }[],
    place: string,
  ) =>
    `Dear ${supplier},\n\nOur order ${ref}, sent on ${atText(sentOn)}, was due on ${atText(dueIso)} and has not been fully delivered. Still outstanding:\n${owed
      .map((l) => `- ${l.name}: ${l.packs}`)
      .join("\n")}\n\nPlease confirm when it will be delivered.\n\nPharmacy, ${place}`,
  figure: {
    stock: "Arrival to in stock",
    shelf: "In stock to shelved",
    matched: "Lines that matched the note",
    claims: "Claims open",
    median: "Median",
    lastDelivery: "Last delivery",
    last: (n: number) => `last ${n} deliveries`,
    target: (t: string) => `Target ${t}`,
    ago: (n: number) => `${n} deliveries ago`,
    latest: "Latest",
    on: "on target",
    missed: "missed target",
    onTarget: "On target",
    offTarget: "Off target",
    same: "Same as the delivery before",
    moved: (up: boolean, size: string) => `${up ? "Up " : "Down "}${size} on the delivery before`,
    points: (n: number) => `${n} points`,
    waiting: (n: number) => `${plural(n, "claim")} waiting for credit`,
    oldest: "Open the oldest claim →",
  },
  stage: {
    expected: [
      "Expected",
      "Orders that were sent. Start from one and its lines are already there to count.",
      "No order is waiting.",
    ],
    counting: ["Counting", "Saved as you go. No stock has moved yet.", "Nothing being counted."],
    put: ["To put away", "In stock. Each batch still needs its shelf.", "Everything is shelved."],
    received: ["Received", "Closed deliveries, newest first.", "Nothing received yet."],
    way: [
      "On the way",
      "From Main store. It joins this place’s stock when you confirm it arrived.",
      "Nothing is on the way.",
    ],
    placeReceived: ["Received", "Confirmed, newest first.", "Nothing received yet."],
  },
  says: {
    finished: "This delivery is already finished.",
    future: "The arrival time is in the future.",
    arrival: "Give the date and time it arrived.",
    duplicate:
      "This delivery note is already recorded for this supplier, so the stock cannot come in twice.",
    witness: "Each controlled line needs its witness.",
    second: "Choose who checked the count.",
    sameChecker: "The person who checked the count cannot be the person receiving it.",
    abandon: "Say why it is abandoned.",
    serial: (serial: string, note: string) =>
      `This pack was already scanned (serial ${serial}, on ${note}). The same serial twice can mean a copied pack: set it aside and tell the in-charge. It was not counted.`,
    cold: (med: string, bin: string) =>
      `Cold-chain first: put the ${med}${bin ? ` in ${bin}` : " away"}.`,
    shelf: "Give the shelf code first.",
    inCharge: "Only the in-charge can approve this.",
    below: (name: string, n: number) =>
      `${name}: ordered can't be less than the ${plural(n, "pack")} that already arrived.`,
    orderEmpty: "An order needs at least one line.",
    lineEmpty: (name: string) => `${name}: give the packs and the price.`,
    credit: "Give the credit note number.",
    noQuarantine: "There is no quarantine place to keep these in. Add one in Set-up › Places.",
    localBlank: "Give the generic name and the strength.",
    photo: "We couldn't start the upload. Try again.",
  },
  device: {
    offline: (n: number) =>
      `Offline. Scans and counts are saved on this device.${n ? ` ${plural(n, "delivery", "deliveries")} waiting for the network.` : ""}`,
    saved: "Saved on this device. It is added to stock as soon as the connection is back.",
    back: (n: number) =>
      n
        ? `Back online. ${plural(n, "delivery", "deliveries")} saved on this device ${n === 1 ? "was" : "were"} added to stock.`
        : "Back online.",
    conflict: (note: string, why: string) => `${note} came back to counting: ${why}`,
    needsPeople: "It needs a witness or a second check, who have to confirm now. Finish it again.",
  },
  kind: {
    supplier: "Supplier delivery",
    donation: "Donation",
    facility: "From another facility",
    ward: "Return from a ward",
  },
} as const;

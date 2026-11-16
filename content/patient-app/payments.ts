/**
 * Patient app v2 · paying the booking fee, receipts and refunds (§5.4, P1–P5), phone and web. Drafts for GATE A.
 * Payment states are never red (MR5). Amounts come only from the engine's fee resolution; nothing here holds a
 * number. The CSO signs; Claude never edits the status.
 */
import type { SignedCopy } from "@/content/signed-copy";

export const PAYMENTS_COPY_STATUS: SignedCopy = {
  status: "draft",
  signedBy: null,
  signedOn: null,
};

export const PAYMENTS_COPY = {
  choice: {
    title: "How will you pay?",
    momo: "Pay now with Mobile Money",
    momoNote: "A prompt comes to your phone. You approve it with your own Mobile Money PIN.",
    change: "Change",
    hospital: "Pay at the hospital",
    hospitalNote: "Pay at the cash office when you arrive. Your booking stands either way.",
    feeNote:
      "Medical officer fee now. If a specialist sees you, the difference is added on the day.",
  },
  confirm: {
    pay: "Confirm and pay UGX {amount}",
    book: "Confirm booking",
  },
  prompt: {
    waiting: "Approve on your phone",
    waitingNote: "Enter your PIN in your phone's own Mobile Money prompt, not here.",
    nothingTaken: "Nothing was taken",
    nothingTakenNote: "Your booking stands. You will pay at the hospital.",
    tryAgain: "Try again",
  },
  line: {
    paid: "Paid · UGX {amount} · {network} · Receipt {receipt}",
    paidNote: "Skip the cash office",
    toPay: "UGX {amount} to pay",
    payNow: "Pay now",
  },
  chip: {
    paidApp: "Paid in the app",
    paidCounter: "Paid at the counter",
    atHospital: "Pays at the hospital",
  },
  onTheDay: {
    title: "Your bill",
    payMomo: "Pay with MoMo",
    cashOffice: "I'll pay at the cash office",
    where: "The cash office is {where}.",
  },
  topUp: {
    title: "Top-up · specialist",
    paidAtBooking: "Paid at booking",
    difference: "Difference to pay",
  },
  refund: {
    rule: "You paid UGX {amount}. Cancel before {cutoff} and it goes back to the same Mobile Money.",
    confirmCancel: "Cancel and ask for a refund",
    keep: "Keep my visit",
    steps: ["Booking cancelled", "Refund approved", "Back on your {network}"],
    smsNote: "We text you when it lands.",
  },
  receipt: {
    title: "Receipt",
    number: "Receipt number",
    clinicVisit: "Clinic visit",
    total: "Total",
    method: "Paid by",
    reference: "Reference",
    paidBy: "Paid by {payer} for {patient}",
    efris: "EFRIS number",
  },
  announce: {
    waiting: "Approve on your phone",
    paid: "Paid",
    nothingTaken: "Nothing was taken",
  },
} as const;

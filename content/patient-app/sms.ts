/**
 * Patient app v2 · text messages (PROMPT patient app v2 §5.4, §8.2 Notifications). Drafts for GATE A.
 * Rules: GSM-7 only and at most 160 characters after the longest fill (tests/patient-app at Step 2, S5);
 * no clinic name in a confidential variant (MR7); no dose amounts (MR3); no queue position or wait (MR4);
 * no PHI beyond what the patient already knows (MR12). Fills in {braces}. The CSO signs; Claude never edits
 * the status.
 */
import type { SignedCopy } from "@/content/signed-copy";

export const PATIENT_APP_SMS_COPY_STATUS: SignedCopy = {
  status: "draft",
  signedBy: null,
  signedOn: null,
};

/** The longest each fill can be, for the 160-character check. */
export const SMS_FILL_MAX = {
  hospital: 32,
  clinic: 28,
  day: 14,
  code: 7,
  amount: 11,
  receipt: 10,
  network: 12,
  where: 30,
} as const;

export const PATIENT_APP_SMS = {
  booked:
    "Tether: you are booked at {hospital}, {clinic}, {day}. Your code is {code}. Show it at the desk.",
  bookedConfidential:
    "Tether: you are booked at {hospital} on {day}. Your code is {code}. Show it at the desk.",
  payPrompt:
    "Tether: approve UGX {amount} for your visit on your phone's {network} prompt. Your booking stands.",
  paid: "Tether: UGX {amount} paid for your visit at {hospital}. Receipt {receipt}. Skip the cash office.",
  paymentFailed:
    "Tether: nothing was taken. Your booking stands. Please pay at the cash office, {where}.",
  topUp:
    "Tether: UGX {amount} is due for your specialist visit at {hospital}. Pay in the app or at the cash office.",
  refundSent: "Tether: UGX {amount} is back on your {network}. Receipt {receipt}.",
  refundWaiting:
    "Tether: your visit is cancelled. Your refund of UGX {amount} is waiting for approval.",
  called: "Tether: you are called. Please go to Room {room} now. Code {code}.",
} as const;

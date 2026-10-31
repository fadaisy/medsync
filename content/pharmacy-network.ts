import type { SignedCopy } from "@/content/signed-copy";

import { PACK_TEXT } from "@/content/pharmacy-stores-supply";

/**
 * Pharmacy Phase 4: repeats, refills and the partner network. Every string staff, partners and patients read for it,
 * Appendix B word for word. Nothing here is a clinical value.
 *
 * Two records (CS-5): `PHARMACY_NETWORK_COPY` covers the Steps 2 to 5 wording (repeats, renewals, refills, the Packs
 * page, and the screen words in their components), signed by the CSO alone under D-PH4-29. `PHARMACY_PARTNER_COPY`
 * covers the partner wording (`NETWORK_PARTNER`) and the seven message templates (`NETWORK_MESSAGES`): draft until
 * Step 6 (the DPO or legal adviser) and the two-user template approval. Partner and message flags gate on it.
 */
// Rework copy sweep (30 Oct 2026): build codes taken out of the words, so this waits for one re-sign with the
// rework wording (PHARMACY_REWORK_COPY). Previously signed by Fadhul (CSO).
export const PHARMACY_NETWORK_COPY: SignedCopy = {
  status: "draft",
  signedBy: null,
  signedOn: null,
};

export const PHARMACY_PARTNER_COPY: SignedCopy = {
  status: "draft",
  signedBy: null,
  signedOn: null,
};

/** "1 more supply", "2 more supplies": Appendix B's plural, with its singular. */
const supplies = (n: number) => (n === 1 ? "1 more supply" : `${n} more supplies`);

/** Appendix B. */
export const NETWORK_B = {
  repeatsStep: (n: number, d: number, date: string) =>
    `After the first supply, the pharmacy may supply this ${n === 1 ? "once more" : `${n} more times`}, at least ${d} days apart, until ${date}. You can stop the repeats at any time.`,
  repeatsPrint: (n: number, d: number, date: string, name: string, council: string) =>
    `Repeats: ${n}, at least ${d} days apart, not after ${date}. Prescriber: ${name}, ${council}.`,
  repeatsStopped: (cadre: string, date: string) => `Stopped by ${cadre} on ${date}.`,
  patientDue: (date: string) => `Next supply due around ${date}.`,
  patientCanAsk: "You can ask for this now.",
  patientRenew: "Your doctor needs to renew this before the next supply.",
  patientNever: "Not refilled without seeing a clinician.",
  patientAllowed: (n: number, date: string, review: string) =>
    `${supplies(n)} allowed until ${date}. Next review by ${review}.`,
  patientReady: (place: string, date: string) => `Ready to collect at ${place}, until ${date}.`,
} as const;

/** Appendix B, the partner side (Step 6). Under `PHARMACY_PARTNER_COPY`: draft. */
export const NETWORK_PARTNER = {
  patientNotPossible: (reason: string, whatToDo: string) => `Not possible: ${reason}. ${whatToDo}.`,
  consent: (pharmacy: string) =>
    `${pharmacy} will see your name, age and sex, these medicines and how to take them, and your prescriber's name. It will not see anything else in your record. When you collect, it will ask your date of birth or phone number and MedSync will check it, without showing it to them. You will pay ${pharmacy} directly. Take your printed prescription with you.`,
  consentTick: (pharmacy: string) => `I agree to ${pharmacy} seeing this.`,
  collectHere: "Collect this one at the hospital.",
  routedPrint: (pharmacy: string, code: string) =>
    `Routed to ${pharmacy}. Code ${code}. This prescription can be supplied once.`,
  partnerMinimum:
    "You see only what is needed to supply this medicine. The patient's diagnosis, other medicines and results stay with the hospital.",
  licenceWarning: (date: string) =>
    `Your licence expires on ${date}. Upload the renewed licence to keep receiving prescriptions.`,
  verified: (date: string) => `Documents checked by MedSync on ${date}.`,
  partnerSuspended: "Partner suspended: arrange supply.",
  routeRefusals: {
    no_consent: "No consent recorded for this pharmacy",
    partner_not_in_force: "The partner pharmacy is not in force today",
    agreement_not_in_force: "No agreement in force covers this point and kind",
    not_on_routing_list: "Not on the routing list",
    never_routed: "On the never-routed list",
    controlled: "Controlled drugs are never routed",
    already_taken: "Already prepared, routed, supplied or closed",
    repeat_not_allowed: "The repeat does not allow a supply now",
    needs_pharmacist_acceptance: "Needs a pharmacist's acceptance first",
    programme_not_in_agreement: "The agreement does not name this programme",
    no_quantity: "No quantity recorded",
    routing_unsigned: "The routing lists are not signed",
  },
} as const;

/** Under `PHARMACY_PARTNER_COPY`: draft until the two-user template approval. */
/** 5.10, the seven message kinds. `{hospital}`, `{pharmacy}`, `{date}` and `{phone}` are filled by NM-1. */
export const NETWORK_MESSAGES = {
  refill_due:
    "{hospital} pharmacy: a medicine supply is due soon. You can ask for it in MedSync or at the pharmacy.",
  refill_ready:
    "{hospital} pharmacy: your medicines are ready to collect until {date}. Bring your MedSync number.",
  sent_to_clinic:
    "{hospital}: your clinic has been asked to renew a medicine. We will tell you when it is done.",
  renewal_answered:
    "{hospital}: your clinic has answered about your medicine. Open MedSync or call {phone}.",
  partner_accepted:
    "{pharmacy} can supply your medicines. Take your printed prescription with you.",
  partner_declined:
    "{pharmacy} cannot supply your medicines. Contact {hospital} pharmacy on {phone}.",
  not_collected: "{hospital} pharmacy: your medicines are still waiting until {date}.",
} as const;

/** Words the engines return; shown with the reason they stand for. */
export const NETWORK_UI = {
  preparedPlace: "Held refills",
  renewalReasons: {
    no_authorisation: "No repeats authorised",
    none_left: "No repeats left",
    expired: "Repeats past their last date",
    stopped: "Repeats stopped",
    blocked: "Held for a clinical review",
    too_early: "Asked before the interval",
    asked_by_pharmacy: "Asked by the pharmacy",
  },
  /** Step 5: refills at the hospital (5.4 hospital places, 5.5). */
  refills: {
    title: "Refills",
    lead: "Refill requests from patients and the window. Nothing is prepared early, and nothing closes by itself.",
    tabs: {
      to_prepare: "To prepare",
      needs_clinic: "Needs the clinic",
      prepared: "Prepared, waiting",
      collected: "Collected today",
      not_collected: "Not collected",
      partner: "With a partner",
    },
    empty: "Nothing here.",
    allows: (n: number, d: number, date: string) =>
      `${supplies(n)}, at least ${d} days apart, until ${date}`,
    noneLeft: "None left",
    noRepeats: "No repeats authorised",
    early: (date: string) => `Early: possible from ${date}`,
    late: "Late: asked well after the refill date",
    askedBefore: (n: number) => `asked ${n} days before it was due`,
    askedAfter: (n: number) => `${n} days after it was due`,
    heldUntil: (date: string) => `Held until ${date}`,
    self: "The patient",
    actions: {
      setAside: "Set aside",
      handOver: "Hand over",
      release: "Release to the shelf",
      holdLonger: "Hold longer",
      askClinic: "Ask the clinic",
      record: "Record a request",
    },
    unsignedHold: "Refills cannot be set aside until the hold rules are signed.",
    notYours: "That medicine is not on this patient's record.",
    notHere: "That refill is not at this hospital.",
    firstSupplyOpen: "The first supply of this medicine is still open: supply it from the queue.",
    collectorGone: "That collector is no longer saved.",
    notToPrepare: "This refill is not waiting to be prepared.",
    otherPoint: "This refill is for another dispensing point.",
    notAllowedNow: "The repeats no longer allow a supply now. Ask the clinic.",
    wrongProduct: "Choose a product of this medicine.",
    notHeld: "Nothing is held for this refill.",
    oneRequest: "Hand over the lines of one request at a time.",
    payment: "Record the payment status.",
    identity: "Check the date of birth or phone number first.",
    identityRoute: "Choose a way of identifying from the signed list.",
    setAside: {
      unsigned: "Refills cannot be set aside until the hold rules are signed.",
      invalid_quantity: "The quantity is a whole number above zero.",
      not_enough_in_date: "Not enough stock here lasts to the held-until date.",
    },
    holdLonger: {
      unsigned: "The hold rules are not signed.",
      released: "This refill was released.",
      no_extensions_left: "No more extensions are allowed.",
      past_maximum: "That is past the longest a refill may be held.",
      not_later: "Choose a date after the current one.",
    },
    handOver: {
      released: "released to the shelf; it cannot be handed over",
      line_ended: "the prescriber stopped or changed this line; release it",
      repeat_not_allowed: "the repeats no longer allow this supply; release it",
      batch_expired: "a held batch has expired; release it",
      batch_blocked: "a held batch is recalled or quarantined; release it",
    },
    patient: {
      title: "Repeat medicines",
      ask: "Ask for my next supply",
      askClinic: "Ask my clinic to renew it",
      talk: "I need to talk to someone first",
      note: "Anything the pharmacy should know (optional)",
      notePlaceholder: "For example: I have 3 days left",
      who: "Who will collect",
      me: "Me",
      someone: "Someone else",
      name: "Their name",
      relationship: "Their relationship to you",
      save: "Save them for next time",
      where: "Where",
      send: "Send the request",
      sent: "Sent",
      preparing: "Being prepared",
      toClinic: "Sent to your clinic to renew",
      collected: "Collected",
      released: "Not collected in time: ask again when you need it",
    },
  },
} as const;

/**
 * Appendix D's Phase 4 rows for the Packs page (draft copy, Phase 4). Every pack takes two signers or the CSO alone by
 * the recorded exception, as Phase 2's do: hold rules and decline reasons name a second signer where Appendix D names
 * one, which is stricter, never looser.
 */
export const NETWORK_PACK_TEXT = {
  repeat_rules: {
    name: "Repeat rules",
    signers: ["Pharmacist reviewer", "CSO"],
    whileUnsigned: "No Repeats step is shown.",
  },
  refill_timing: {
    name: "Refill timing",
    signers: ["Pharmacy in charge", "CSO"],
    whileUnsigned:
      "Patients can ask at any time; nothing is labelled early or late except by the interval.",
  },
  hold_rules: {
    name: "Hold rules",
    signers: ["Pharmacy in charge", "CSO"],
    whileUnsigned: "Refills cannot be set aside.",
  },
  renewal_decline_reasons: {
    name: "Renewal decline reasons",
    signers: ["CSO", "Pharmacist reviewer"],
    whileUnsigned: "Renewals can be answered only by Renew or Book a visit.",
  },
  routing_rules: {
    name: "Routing rules",
    signers: ["Pharmacist reviewer", "CSO"],
    whileUnsigned: "Nothing can be routed.",
  },
} as const;

/** Phase 2's signed pack words and Phase 4's, for the one Packs page. */
export const ALL_PACK_TEXT = { ...PACK_TEXT, ...NETWORK_PACK_TEXT };

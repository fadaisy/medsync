import type { SignedCopy } from "@/content/signed-copy";

/**
 * Pharmacy Phase 4: repeats, refills and the partner network. Every string staff, partners and patients read for it,
 * Appendix B word for word. All `draft`: in production the Phase 4 flags stay off while it is (CS-5). The CSO and the
 * pharmacist reviewer sign it (Appendix D); nothing here is a clinical value.
 */
export const PHARMACY_NETWORK_COPY: SignedCopy = {
  status: "draft",
  signedBy: null,
  signedOn: null,
};

/** Appendix B. */
export const NETWORK_B = {
  repeatsStep: (n: number, d: number, date: string) =>
    `After the first supply, the pharmacy may supply this ${n} more times, at least ${d} days apart, until ${date}. You can stop the repeats at any time.`,
  repeatsPrint: (n: number, d: number, date: string, name: string, council: string) =>
    `Repeats: ${n}, at least ${d} days apart, not after ${date}. Prescriber: ${name}, ${council}.`,
  repeatsStopped: (cadre: string, date: string) => `Stopped by ${cadre} on ${date}.`,
  patientDue: (date: string) => `Next supply due around ${date}.`,
  patientCanAsk: "You can ask for this now.",
  patientRenew: "Your doctor needs to renew this before the next supply.",
  patientNever: "Not refilled without seeing a clinician.",
  patientAllowed: (n: number, date: string, review: string) =>
    `${n} more supplies allowed until ${date}. Next review by ${review}.`,
  patientReady: (place: string, date: string) => `Ready to collect at ${place}, until ${date}.`,
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
} as const;

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

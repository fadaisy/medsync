/**
 * What the patient website says about the cost of tests and medicines (ADR 0527). Draft wording: in production the
 * `PATIENT_PRICES` flag stays off until the CSO signs. Claude never edits the status. Nothing is charged here.
 */
import type { SignedCopy } from "@/content/signed-copy";

export const PATIENT_PRICES_COPY_STATUS: SignedCopy = {
  status: "draft",
  signedBy: null,
  signedOn: null,
};

export const PATIENT_PRICES = {
  free: "Free",
  notSet: "Ask at the hospital",
  payThere: "You pay at the hospital, not here.",
  tests: {
    cap: "What your tests cost",
    total: "Total for these tests",
    partial: "Total so far. {n} not priced yet: ask at the laboratory.",
    fasting: "Do not eat before this test. Ask the laboratory how long to fast.",
    readyIn: "Usual time for the result: {when}",
    unavailable: "The laboratory cannot run this test right now. Ask before you travel.",
  },
  medicines: {
    cap: "What your medicines cost",
    total: "Total for these medicines",
    partial: "Total so far. {n} not priced yet: ask at the pharmacy.",
    ready: "Ready to collect",
    readyAt: "Ready to collect at {place}",
    preparing: "The pharmacy is preparing this",
  },
  visit: {
    cap: "What this visit costs",
    consultation: "Consultation",
    tests: "Tests",
    medicines: "Medicines",
    total: "Total",
    partial: "Some prices are not set yet, so the total may be higher.",
  },
} as const;

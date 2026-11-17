/**
 * Patient app v2 · Me, the membership card and Plus (§5.9, M10–M11). Drafts for GATE A. Prices come from the
 * server (D-MR-10); nothing here holds a number. The CSO signs; Claude never edits the status.
 */
import type { SignedCopy } from "../signed-copy";

export const MEMBERSHIP_COPY_STATUS: SignedCopy = {
  status: "draft",
  signedBy: null,
  signedOn: null,
};

export const MEMBERSHIP_COPY = {
  card: {
    member: "Member",
    turnOver: "Turn over",
    turnBack: "Turn back",
    back: {
      title: "Medical ID",
      emergencyContact: "Emergency contact",
      bloodGroup: "Blood group",
      allergies: "Allergies",
      conditions: "Conditions",
      showConditions: "Show conditions",
      hospitalLine: "Hospital line",
      qrNote: "This code works for a short time only.",
      ageSex: "Age",
      nextOfKin: "Next of kin",
    },
  },
  tiers: {
    basic: "Basic",
    plusFamily: "Plus Family",
    plusCare: "Plus Care",
    familyCare: "Family + Care",
  },
  plans: {
    monthly: "Monthly",
    yearly: "Yearly",
    yearlyNote: "A year for the price of 10 months",
    trial: "Try it free for 30 days",
    trialNote: "No card. Nothing is charged when the trial ends.",
    trialReminder: "Your trial ends in 3 days.",
    neverAhead: "Plus never moves you ahead in line.",
    quarterly: "Every 3 months",
    choose: "Choose {tier}",
    current: "Your plan",
    trialEnds: "Free until {date}",
    paidUntil: "Paid until {date}",
    pay: "Pay UGX {amount} with Mobile Money",
    alwaysFree:
      "Always free, on every plan: booking, tickets, results, readings, your plan, danger alerts and Help.",
    features: {
      plus_family: [
        "Book for your household",
        "One calendar for the family",
        "Pay for a family member",
        "A family helper in the loop",
      ],
      plus_care: [
        "A family helper sees your readings",
        "Texts as well as app alerts",
        "Refills packed for you",
        "Your 12-month report",
      ],
      family_care: ["Everything in Plus Family", "Everything in Plus Care"],
    },
  },
  appVersion: "Tether {version}",
  reveal: {
    title: "Welcome to {tier}",
    note: "Your free month runs to {date}. Nothing is charged when it ends.",
    done: "See my card",
  },
  settings: {
    texts: "Texts as well as app alerts",
    biggerText: "Bigger text",
    sharing: "Sharing with the care team",
    helper: "Family helper",
    language: "Language",
    widgetNames: "Show names on widgets",
  },
} as const;

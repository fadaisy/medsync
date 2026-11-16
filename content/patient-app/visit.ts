/**
 * Patient app v2 · the ticket, the day of the visit and Questions for the doctor (§5.3, §5.5). Drafts for
 * GATE A. Stages only, never a number or wait (MR4). The CSO signs; Claude never edits the status.
 */
import type { SignedCopy } from "@/content/signed-copy";

export const VISIT_COPY_STATUS: SignedCopy = {
  status: "draft",
  signedBy: null,
  signedOn: null,
};

export const VISIT_COPY = {
  ticket: {
    kicker: "Tether visit ticket",
    seenInTurn: "Seen in turn · no hour promised",
    comeEarly: "Come 15 minutes early",
    labels: { clinic: "Clinic", room: "Room", patient: "Patient", block: "Block" },
    showCode: "Show this code at the desk",
  },
  actions: {
    calendar: "Add to calendar",
    calendarNeutral: "Clinic visit",
    directions: "Directions",
    share: "Share",
    text: "The text we sent",
  },
  stages: ["Booked", "Here", "Waiting for the nurse", "With the doctor", "Done"],
  called: {
    title: "Called to Room {room}",
    onMyWay: "I'm on my way",
  },
  questions: {
    title: "Questions for the doctor",
    note: "Write them while you wait. The nurse and the doctor see this list.",
    add: "Add a question",
    suggestions: [
      "What is this condition and what caused it?",
      "What should I do at home?",
      "When should I come back?",
    ],
    asked: "Asked",
    remove: "Remove",
    nurseNote: "Your note for the nurse",
    edit: "Edit",
  },
  done: {
    sent: "We also sent the code by text.",
    seeVisits: "See it in Visits",
  },
} as const;

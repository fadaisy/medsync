/**
 * Log a reading and the dangerous-reading interrupt on the web. Phone words are copied here (the phone files
 * import React Native) with their source named; the level words, signs and headlines come from
 * `@patient-core/readings`, never from here. The CSO signs; Claude never edits the status.
 */
import type { SignedCopy } from "@/content/signed-copy";
import type { ReadingKind } from "@patient-core/readings";

export const READINGS_COPY_STATUS: SignedCopy = {
  status: "draft",
  signedBy: null,
  signedOn: null,
};

export const READINGS_COPY = {
  // mobile/src/app/(app)/care/reading.tsx
  title: "Log a reading",
  backToCare: "Care",
  tiles: { bp: "Pressure", sugar: "Sugar", weight: "Weight", pulse: "Pulse" } satisfies Record<
    ReadingKind,
    string
  >,
  prompts: {
    bp: "Type the numbers from your machine",
    sugar: "The number on your meter",
    weight: "Morning, before breakfast",
    pulse: "Sitting still for a minute",
  } satisfies Record<ReadingKind, string>,
  // mobile/src/features/home/reading-sheet.tsx (the stepper labels)
  fields: {
    top: "Top number",
    bottom: "Bottom number",
    bpPulse: "Pulse (if your monitor shows it)",
    sugar: "Meter reading",
    weight: "On the scale",
    pulse: "Sitting still",
  },
  pulseUnit: "beats per minute",
  whenChecked: "When did you check?",
  lastTime: "Last time:",
  howFeel: "How do you feel?",
  optional: "(optional)",
  feelings: [
    { key: "fine", label: "I feel fine" },
    { key: "dizzy", label: "Dizzy" },
    { key: "head", label: "Headache" },
    { key: "tired", label: "Very tired" },
    { key: "chest", label: "Chest pain" },
  ],
  chestPain: "Chest pain needs help now. Tap to get help.",
  /** Web footnote: D-PW-04's line, then the phone's "not alerted" and the thresholds note. */
  notAlerted: "Your care team is not alerted.",
  savedToast: "Saved · {value}{watch} · only you can see it",
  savedWatch: " · outside your target",

  // mobile/src/features/home/reading-capture.tsx, mobile/src/data/reading-photo.ts
  sayIt: "Say it",
  photo: "Photo",
  photoBusy: "Reading…",
  photoFilled: "Read from the photo. Check the numbers, then save.",
  photoNoRead:
    "Couldn't read the numbers. Try again with the screen filling the photo, or type them.",
  photoOffline: "Couldn't reach MedSync. Check your connection, or type the numbers.",
  signInAgain: "Sign in again.",

  // mobile/src/app/(app)/danger.tsx and reading-sheet.tsx (the danger card)
  danger: {
    pill: "Danger · {time}",
    fallbackHeadline: "Check this reading",
    askSigns: "Do you have any of these right now?",
    yesHelp: "Yes, get help now",
    noFine: "No, I feel fine · check again in 5 min",
    hadSweet: "I had something sweet · check again in 15 min",
    sitQuietly: "Sit quietly and measure again in {n} minutes",
    measureAgain: "Measure again",
    rest: "Rest and keep this screen open. When the time is up, measure again.",
    timeUp: "Time is up. Measure again now.",
    notAlerted: "Your care team is not alerted. If you feel unwell, get help now.",
    signsStart: "If any of those signs start, press the red Help button at once.",
    pending: "Limits and signs pending CSO sign-off",
    left: "{mmss} left",
  },
} as const;

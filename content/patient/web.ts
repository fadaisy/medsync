/**
 * Patient web copy the phone does not have (PROMPT-PATIENT-WEB-TIDE §3, D-PW-03..06). Strings the phone and
 * the web share move here area by area (W6), so the CSO signs each once. `{name}` slots are filled by the
 * caller; emergency numbers always come from data (W5). The CSO signs; Claude never edits the status.
 */
import type { SignedCopy } from "@/content/signed-copy";

export const PATIENT_WEB_COPY_STATUS: SignedCopy = {
  status: "draft",
  signedBy: null,
  signedOn: null,
};

export const PATIENT_WEB_COPY = {
  /** The plus in the rail and the pill (§4.1). */
  addLabel: "Add: log a reading, a medicine, or book a visit",
  /** Any server call that never reached MedSync (§5.2). */
  offline: "Couldn't reach MedSync. Check your connection and try again.",
  /** A flag that is off (W2, Gate CS). */
  notAvailable: "This is not available yet.",
  unsignedCatalogue: "Unsigned clinical content: draft, for review only.",

  /** D-PW-03: SOS on a computer, after the same countdown. */
  desktopCall: "Your computer cannot place the call. Dial {number} on any phone now.",

  /** §3: steps on the web. */
  stepsFromPhone: "From your phone",
  stepsNeedPhone: "Steps come from the MedSync phone app.",

  /** §3: live location share in a browser. */
  keepOpenToShare: "Keep this page open to keep sharing.",

  /** D-PW-05: the own-device choice at sign-in. */
  ownDeviceQuestion: "Is this your own device?",
  ownDeviceYes: "Yes, this is my own device",
  ownDeviceNo: "No, others use it too",
  ownDeviceNoNote:
    "We will keep nothing on this device. You will be signed out after 15 minutes without use.",
  ownDeviceYesNote:
    "We keep Help, your latest ticket and your health card here, so they open without internet.",
  /** §3: the offline outbox (own device only). */
  savedOffline: "Saved on this device. It will send when you are online",
  /** D-PW-06. */
  idleSignedOut: "You were signed out because the page was not used for a while.",

  /** D-PW-04: one answer to "who sees what you log". */
  whoSeesLog: "Only you. Show it at your visit.",
  whoSeesHistory: "Your care team sees this. It stays unconfirmed until a clinician checks it.",
  whoSeesRecords: "You and the clinicians who treat you.",
} as const;

/**
 * The SMS-consent words (Gate E, ADR 0090; PRD §5.2). Client-safe — no
 * server import — so the signup form, the settings row and the mobile app
 * (`mobile/src/lib/consent-copy.ts`, byte-identical) read one text.
 *
 * ⚠ CSO-PROVISIONAL. PRD §5.2: "Declining means in-app only, and the app
 * says plainly that this makes missed appointments more likely." Plain, not
 * a threat: nothing is lost by declining except the SMS.
 */
export const SMS_CONSENT_COPY = {
  label: "Send me SMS about my bookings",
  /** What is sent, and what is not. Matches consent_versions v1.0 in spirit; the recorded text is the row's body. */
  what: "Confirmation, reminders and changes to your visits. No marketing.",
  /** The honest sentence, shown when SMS is off. */
  declined:
    "Without SMS we can only reach you inside the app. People who turn this off miss visits more often.",
  /** The booking receipt is the one SMS sent regardless (ADR 0090). */
  receiptException: "You will still get one SMS with the code each time you book.",
} as const;

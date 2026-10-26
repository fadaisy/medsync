/**
 * Help and safety (PROMPT-PATIENT-WEB-TIDE Step 7). Phone strings are copied word for word from mobile/src (the
 * file is named beside each group, since those files import React Native); web-only strings are marked "web".
 * The numbers SOS dials come from the phone's data (mobile/src/features/safety/config.ts, W5) and every other
 * number from `pt-emergency-sheet`'s answer, so `{number}` is always filled by the caller. The CSO signs;
 * Claude never edits the status.
 */
import type { SignedCopy } from "@/content/signed-copy";

export const HELP_COPY_STATUS: SignedCopy = {
  status: "draft",
  signedBy: null,
  signedOn: null,
};

export const HELP_COPY = {
  // mobile/src/app/help.tsx
  sos: {
    close: "Close",
    closeLabel: "Close help",
    locationOn: "Location on",
    idleTitle: "Do you need help now?",
    button: "SOS",
    tapToCall: (n: string) => `Tap to call ${n}`,
    buttonLabel: (n: string, s: number) => `SOS. Calls ${n} after ${s} seconds`,
    idleLine: (n: string, s: number) =>
      `We call ${n} after ${s} seconds, so you can cancel a press by mistake. Then show the medic the card on this screen.`,
    counting: (s: number) => `Calling in ${s}…`,
    cancel: "Cancel, I'm okay",
    onCall: (clock: string) => `On call · ${clock}`,
    didNotStart: "The call did not start",
    callingTitle: "Ask for an ambulance",
    callingLine:
      "Tell them where you are. Stay where you are. Keep your phone near you. Unlock your door if you can.",
    callAgain: (n: string) => `Call ${n} again`,
    /** web: the computer's calling state (D-PW-03); the line itself is PATIENT_WEB_COPY.desktopCall. */
    dialThis: "Dial this number",
    endEmergency: "End emergency",
  },
  told: {
    title: "We have told",
    line: (n: string, state: "started" | "failed" | "starting") =>
      `Emergency line ${n} · ${state === "started" ? "call started" : state === "failed" ? "call did not start" : "starting"}`,
    location: "Your location · not sent",
    readItOut: (where: string) => `Read it out: ${where}`,
    careTeam: "Your care team · not sent",
    contact: "Your emergency contact · not set up",
  },
  medic: {
    title: "Show this to the medic",
    noName: "Name not recorded",
    noConditions: "No conditions recorded",
    medicines: (names: string[]) => `Medicines: ${names.join(", ")}`,
    noMedicines: "No medicines on their list",
    allergies: (own: string | null, bp: string | null) =>
      `Allergies: ${own ? `${own} (their own words)` : "ask the patient"}${bp ? ` · Last BP ${bp}` : ""}`,
    reported: (list: string[]) => `Reported now: ${list.join(", ")}`,
  },
  what: {
    title: "What is happening?",
    hint: "optional · for the medic",
    sugar: "If your sugar is low and you can swallow, eat or drink something sweet now.",
  },
  rows: {
    title: "Not an emergency?",
    message: "Message my care team",
    messageSub: "Your care team",
    contact: "Call my emergency contact",
    contactIn: "Not set up yet · add one in Me",
    contactOut: "Sign in to use your emergency contact",
    nearest: "Nearest hospital",
    nearestNone: "Go to the nearest emergency unit",
    noPhone: "no phone number verified",
    share: "Share my live location",
    shareSub: "A private link for family, for a time you choose",
    lines: "All emergency lines",
    linesIn: "Your hospital's verified lines first",
    linesOut: "Verified national lines",
    crisis: "Thinking of hurting yourself?",
    crisisSub: "Calm support, no questions asked",
    sv: "After sexual violence",
    svSub: "Why time matters, and where to go",
  },
  footnote: (general: string, ambulance: string, dial: string) =>
    `General emergency ${general} · Ambulance ${ambulance} is not confirmed yet, so we dial ${dial}. Numbers and first-aid wording pending MoH and CSO sign-off.`,

  // mobile/src/components/emergency/emergency-sheet.tsx (the title is the catalogue's own "tier.E", W2)
  lines: {
    back: "Help",
    lead: "If the person is not breathing or can’t be woken, call now.",
    call: (label: string) => `Call ${label}`,
    callLabel: (label: string, n: string) => `Call ${label}, ${n}`,
    noNumberTitle: "Go to the nearest emergency unit",
    noNumberBody:
      "No verified emergency number is available here yet. They see the sickest people first.",
    kind: {
      general: "Emergency line",
      ambulance: "Ambulance",
      crisis: "Crisis support",
      sv: "Sexual violence support",
    },
    tell: "Tell a hospital I’m coming",
    unverified: " · Unverified",
    watermark: "These numbers are not yet verified and do not show in production.",
    /** web: the old page's two links, kept for parity (§6). */
    other: "Other help",
  },

  // mobile/src/app/(app)/emergency/crisis.tsx, sv.tsx, components/emergency/calm-screen.tsx
  calm: {
    back: "Help",
    callNumber: (n: string) => `Call ${n}`,
    crisis: {
      title: "You are not alone",
      lead: "You don't have to go through this alone.",
      body: "Talking to someone now can help. These people are there to listen.",
      fallback:
        "No crisis line is verified here yet. Go to the nearest hospital, or ask someone you trust to take you.",
    },
    sv: {
      title: "Care is here",
      lead: "Care within 72 hours matters. Go to a hospital as soon as you can — you decide what to share.",
      body: "Nothing about what happened is recorded in this app. At the hospital you can ask to speak to someone privately.",
      fallback:
        "No support line is verified here yet. Go to the nearest hospital's emergency entrance.",
      book: "Book a visit today",
    },
  },

  /** web: the pre-alert pages, which reuse the old Emergency Pathway's form and status panel. */
  tell: { title: "Tell a hospital I’m coming", back: "Emergency lines" },
  status: { title: "Your pre-alert", back: "Emergency lines", none: "No pre-alert to show." },

  // mobile/src/features/location-share/share-sheet.tsx, active-banner.tsx, data/location-share.ts. web: the
  // phone's "position" reads "location" here, since the queue-honesty scan (L8) refuses that word on patient pages.
  share: {
    title: "Share my live location",
    overline: "Location",
    overlineNow: "Sharing now",
    howLong: "For how long?",
    lengths: [
      { minutes: 15, label: "15 min" },
      { minutes: 60, label: "1 hour" },
      { minutes: null, label: "Until I stop" },
    ],
    consent:
      "Anyone with the link can see where this phone is, until the share ends. They see your location only, not your name. It ends when you stop it or when the time you chose runs out, at most 8 hours.",
    consentVersion: "location-share-v1",
    start: "Start sharing",
    until: (clock: string, left: string) => `Sharing until ${clock} · ${left}`,
    lastSent: (clock: string) => `Last sent at ${clock}. This is what your family sees.`,
    waiting: "Waiting for your location.",
    send: "Send the link",
    stop: "Stop sharing",
    stopShort: "Stop",
    stopLabel: "Stop sharing your location",
    message: (until: string, link: string) => `See where I am on MedSync${until}: ${link}`,
    bannerTitle: (clock: string) => `Sharing your location · ends ${clock}`,
    off: "Location sharing is not switched on yet.",
    failed: "Couldn't start sharing. Try again.",
    stopFailed: "Couldn't reach MedSync to stop sharing. Check your connection and try again.",
    /** web: the browser's own words for "Location is off for MedSync…". */
    denied: "Location is off for this page. Allow it in your browser's settings to share.",
    /** web: a browser with no location at all. */
    noGeo: "This browser cannot share a location.",
    /** web: a share started earlier (or on the phone) that this page is not sending to yet. */
    resume: "Keep sharing from this page",
    /** web: no share menu in this browser, so the message went to the clipboard. */
    copied: "Link copied. Paste it to your family.",
  },
} as const;

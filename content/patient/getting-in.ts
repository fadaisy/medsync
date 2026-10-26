/**
 * Getting in (PROMPT-PATIENT-WEB-TIDE Step 8): sign-up, the consent gate and the own-device choice. Phone
 * strings are copied word for word from mobile/src (the file is named beside each group, since those files
 * import React Native); web-only strings are marked "web". The notice, its summary lines and the SMS words
 * come from the live data through `/api/mobile/patient-signup`, as on the phone. The CSO signs; Claude never
 * edits the status.
 */
import type { SignedCopy } from "@/content/signed-copy";

export const GETTING_IN_COPY_STATUS: SignedCopy = {
  status: "draft",
  signedBy: null,
  signedOn: null,
};

export const GETTING_IN_COPY = {
  // mobile/src/app/sign-up.tsx
  cancel: "Cancel",
  back: "Back",
  continue: "Continue",
  create: "Create my account",
  under18: "You must be 18 or older to create an account.",
  failed: "We couldn't create your account. Try again.",
  signInInstead: "Sign in instead",
  /** web: the reason under a Continue that cannot be pressed yet (DESIGN-medsync rule 3). */
  notYet: {
    1: "Fill in your name, sex at birth, date of birth and a mobile number to continue.",
    2: "Choose where you live from the list to continue.",
    3: "Enter your email and a password of 12 or more characters to continue.",
    4: "Tick the box to agree before we create your account.",
  },

  // mobile/src/features/auth/steps.tsx
  stepOf: (n: number) => `Step ${n} of 4`,
  about: { title: "About you", sub: "We use this to find and keep your records." },
  firstName: "First name",
  firstNameEg: "e.g. Sarah",
  surname: "Surname",
  surnameEg: "e.g. Nakato",
  sex: "Sex at birth",
  dob: "Date of birth",
  dobParts: { dobDay: ["Day", "DD"], dobMonth: ["Month", "MM"], dobYear: ["Year", "YYYY"] },
  phone: "Mobile number",
  where: { title: "Where you live", sub: "So we can show clinics near you." },
  placeLabel: "District or subcounty",
  placeSearch: "Search, e.g. Kawempe",
  /** web: the phone adds ", or use your location"; the web has no geocoder (Step 8 report). */
  placeType: "Type at least 2 letters.",
  placeNone: "No match. Try the district name.",
  /** web: the phone says "Tap your area to choose it." */
  placePick: "Choose your area.",
  placeChange: "Change",
  placeChangeLabel: "Change where you live",
  village: "Village or address",
  villageEg: "e.g. Bwaise II, near the market",
  optional: "Optional",
  signIn: {
    title: "Your sign-in",
    sub: "You can also sign in later with a code sent to your phone.",
  },
  /** web: phone-code sign-in is behind `mobilePhoneOtp` on the web; off, the phone's line would not be true. */
  signInSubNoCode: "You will sign in with this email and password.",
  email: "Email",
  emailBad: "Enter a valid email, like name@example.com",
  password: "Password",
  passwordEg: "12 or more characters",
  /** web: the phone's eye toggle, in words. */
  showPassword: "Show password",
  hidePassword: "Hide password",
  consent: { title: "Your consent", sub: "Please read this before we create your account." },
  noticeLoading: "Loading the data notice…",
  noticeFailed: "We couldn't load the data notice. Check your connection and try again.",
  tryAgain: "Try again",
  notOpen: "Sign-up is not open yet. Please try again later.",
  noticeHead: "How we use your data",
  noticeTag: (v: string) => `Notice ${v}`,
  noticeShow: (v: string, effective: string) =>
    `Read the full notice (${v}, effective ${effective})`,
  noticeHide: "Hide the full notice",
  required: "Required to create your account",
  welcome: (name: string) => `Welcome, ${name}`,
  ready: "Your account is ready. Your MedSync number is given at your first visit.",
  nextDetails: "Next, a few details",
  nextDetailsSub: "About 2 minutes · all optional",
  later: ["Photo", "Title", "Preferred language", "Usual hospital", "National ID", "Next of kin"],

  // mobile/src/app/(app)/consent.tsx (the web's old app/patient/consent, the same words)
  gate: {
    title: "Please read and accept",
    lead: "We have no record of you accepting the current data-processing notice — your account may predate it. Read it below and agree to continue using MedSync.",
    meta: (v: string, effective: string) => `Data-processing notice · ${v}, effective ${effective}`,
    agree: "I agree to MedSync's data-processing notice",
    recorded: "The exact text above is recorded against your account.",
    accept: "Agree and continue",
    tick: "Tick the box to continue.",
    signOut: "Sign out instead",
  },
  // app/patient/consent/page.tsx (the gate once it is open)
  open: {
    overline: "Consent",
    title: "Consent & sharing",
    accepted: (v: string) => `Data-processing notice ${v} accepted`,
    acceptedOn: (date: string) => `On ${date}. The exact text is recorded against your account.`,
    privateTitle: "Your self-tracking is private",
  },
  // app/patient/_components/emergency-notice.tsx (ADR 0084 §2–3; the words are the decision, CSO pending)
  emergency: {
    label: "Emergency",
    body: "If you are very sick now, do not use this page. Go to the hospital’s emergency entrance. They see the sickest people first.",
    means: "Very sick means things like:",
    call: "Call",
  },

  /** web (D-PW-05): the offline set is not built yet, so "Yes" keeps nothing either (Step 8 report). */
  ownDeviceLater: "Coming later. For now nothing is kept on this device, whichever you choose.",
} as const;

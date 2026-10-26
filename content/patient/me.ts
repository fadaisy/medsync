/**
 * Me (PROMPT-PATIENT-WEB-TIDE Step 6). Phone strings are copied word for word from mobile/src (the file is
 * named beside each group, since those files import React Native); web-only strings are marked "web". The
 * SMS words stay in lib/notifications/consent-copy.ts (one text for phone and web). The CSO signs; Claude
 * never edits the status.
 */
import type { SignedCopy } from "@/content/signed-copy";

import { SMS_CONSENT_COPY } from "@/lib/notifications/consent-copy";

export const ME_COPY_STATUS: SignedCopy = {
  status: "draft",
  signedBy: null,
  signedOn: null,
};

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const ME_COPY = {
  // mobile/src/components/tide/health-card.tsx
  card: {
    brand: "Health card",
    facility: "Home facility",
    noFacility: "No home facility yet",
    holder: "Card holder",
    age: "Age",
    emergency: "In an emergency",
    number: "MedSync number",
    allergies: "Allergies",
    conditions: "Conditions",
    hidden: "Hidden by the card holder",
    nok: "Next of kin",
    written: "Written by the card holder · not confirmed by a clinician",
    label: (back: boolean) =>
      back ? "Health card, back. Press to turn over" : "Health card, front. Press to turn over",
  },

  // mobile/src/app/(app)/(tabs)/me.tsx
  title: "Me",
  /** web: the phone says "Tap"; a computer clicks. */
  turnHint: "Click or tap the card to turn it over",
  holderUnknown: "Name not recorded",
  nokOnFile: (facility: string | null) => `On file${facility ? ` at ${facility}` : ""}`,
  nokNone: "None given",
  ifFoundCall: (facility: string, phone: string) => `If found, call ${facility} on ${phone}`,
  ifFoundReturn: (facility: string | null) =>
    `If found, please return it to ${facility ?? "any hospital"}`,

  myHealth: "My health",
  conditions: "My conditions",
  allergies: "Allergies",
  family: "Family history",
  medicines: "My medicines",
  records: "Visits and documents",
  recordsSub: "What your clinician shared after a visit",
  historySub: (off: boolean, n: number, one: string, many: string, none: string) =>
    off ? "Not switched on yet" : n ? `${count(n, one, many)} · not yet confirmed` : none,
  noneAdded: "None added yet",
  noKnownAllergies: "No known allergies",
  familyNone: "Conditions that run in your family",
  medicinesSub: (n: number) =>
    n === 0 ? "None on your list yet" : `${count(n, "medicine", "medicines")} on your list`,

  people: "People I care for",
  peopleMe: "Me",
  peopleAdd: "Add",
  peopleNote: "Their readings, medicines and visits are kept separate.",

  places: "My places",
  placesRow: "Home, work and others",
  placesOff: "Saving places is not switched on yet",
  placesSub: (summary: string) => `${summary} · only you can see them`,

  details: "My details",
  detailsRow: "Profile details",
  /** web: no photo upload on the web yet, so the phone's "Photo, " is left out. */
  detailsSub: "Title, language, hospital, ID and next of kin",

  privacy: "Privacy and sharing",
  showOnCard: "Show conditions on my card",
  showOnCardOn: "Shown on the back of the card. Private ones never are.",
  showOnCardOff: "Hidden on the back of the card",
  /** web: the phone keeps this choice on the phone; the web keeps nothing in the browser (W3). */
  showOnCardWeb: "Off again each time you open this page, so nothing is kept in this browser.",
  whoSees: "Who sees what you log",
  /** web: D-PW-04's three groups; the sentences are PATIENT_WEB_COPY.whoSees*. */
  whoSeesLogLabel: "Readings, medicines and mood",
  whoSeesHistoryLabel: "My health",
  whoSeesRecordsLabel: "Visit records",

  app: "App",
  notifications: "Notifications",
  notificationsSub: "App and SMS",
  sms: SMS_CONSENT_COPY,
  smsTitle: (on: boolean) => `${SMS_CONSENT_COPY.label} · ${on ? "On" : "Off"}`,
  /** S20: what the row says; off carries the explanation. */
  smsSub: (on: boolean) =>
    on
      ? SMS_CONSENT_COPY.what
      : `${SMS_CONSENT_COPY.declined} ${SMS_CONSENT_COPY.receiptException}`,
  language: "Language",
  languageSub: (l: string | null) =>
    l ? `${l} · the language staff use with you` : "Tell staff which language you prefer",
  textSize: "Text size",
  /** web */
  textSizeSub: "Follows your browser. Make text larger in your browser's settings.",
  theme: "Theme",
  themeWords: { system: "Same as this device", light: "Light", dark: "Dark" },
  themeOptions: { system: "System", light: "Light", dark: "Dark" },
  signOut: "Sign out",
  version: (v: string) => `MedSync ${v}`,

  // mobile/src/app/(app)/history.tsx and features/history/editor.tsx
  historyIntro: {
    family: "Conditions that run in your family, from the list your clinician uses.",
    other: "Pick from the list your clinician uses.",
    tail: "Your care team can see what you add, and your clinician confirms it at your next visit.",
  },
  historyOff: "Saving your health history is not switched on yet.",
  historyFailed: "Couldn't load your list. Check your connection.",
  saveFailed: "Couldn't save. Check your connection and try again.",
  removeFailed: "Couldn't remove it. Check your connection and try again.",
  legacy: (list: string) =>
    `On your profile from before: ${list}. Add each one from the list so your clinician can confirm it.`,
  nkaTitle: "No known allergies?",
  nkaOn: "You said you have no known allergies. Adding an allergy replaces this.",
  nkaOff: "If you have never reacted badly to a medicine, food or anything else, say so.",
  nkaChip: "I have no known allergies",
  saving: "Saving…",
  loading: "Loading…",
  unconfirmed: "Not yet confirmed by a clinician",
  privateTag: "Private · ",
  privateNote:
    "HIV, TB, mental-health and pregnancy entries are private: only clinicians allowed to see them do, and they never show on your card.",
  change: (one: string) => `Change ${one}`,
  search: "Type to search",
  notOnList: "Not on the list.",
  ownWords: "Not on the list? Write it in your own words",
  inOwnWords: "In your own words",
  changePick: "Change",
  ownWordsHint: "For example: glaucoma",
  sinceYear: "Since which year? (optional)",
  stillHave: "Do you still have it?",
  still: "Still have it",
  resolved: "Resolved",
  whatHappened: "What happened? (optional)",
  howBad: "How bad was it? (optional)",
  whoNew: "Who? Choose everyone it applies to",
  who: "Who?",
  relative: "Relative",
  save: "Save",
  remove: "Remove",
  confirmsNext: "Your clinician confirms this at your next visit.",
  backToMe: "Me",

  // mobile/src/app/(app)/records/*.tsx and data/records.ts
  recordsTitle: "Visit records",
  recordsIntro: "What your clinicians shared with you after each visit",
  recordsEmpty:
    "No visit records yet. After a visit, your clinician can share a summary with you, and it shows here.",
  recordsFailed: "Couldn't load your visit records. Try again.",
  recordGone: "That visit record isn't available.",
  recordTitle: "Your visit",
  updated: "Updated",
  asPrescribed: "As your clinician prescribed",
  inMedicines: "In your medicines",
  addToMedicines: "Add to my medicines",
  adding: "Adding…",
  addLabel: (name: string) => `Add ${name} to my medicines`,
  noDoseTimes: "A medicine you add has no dose times yet. Set them in your medicines.",
  yourMedicines: "Your medicines",
  yourVisits: "Your visits",
  comeBackIf: "Come back if",

  // mobile/src/app/(app)/places/*.tsx
  placesTitle: "My places",
  placesIntro: "Only you can see these. We use your home place to suggest clinics near you.",
  placesEmpty: "No places saved yet. Add your home so we can suggest clinics near you.",
  placesFailed: "Couldn't load your places. Check your connection.",
  addPlace: "Add a place",
  makeHome: "Make this my home",
  homeFailed: "Couldn't change your home. Check your connection and try again.",
  noAddress: "No address",
  home: "Home",
  label: "Label",
  nameThis: "Name this place",
  nameHint: "e.g. Mum's house",
  whereItIs: "Where it is",
  address: "Address (optional)",
  addressHint: "e.g. Bwaise II, near the market",
  saveChanges: "Save changes",
  saveThisPlace: "Save this place",
  placeSaveFailed: "Couldn't save this place. Check your connection and try again.",
  placeDeleteFailed: "Couldn't delete this place. Check your connection.",
  deletePlace: "Delete this place",
  deleteConfirm: (label: string) => `Delete ${label}? This can't be undone.`,
  delete: "Delete",
  keepIt: "Keep it",
  /** web: no map in this build, so the pin comes from the browser, on the patient's press only (L9). */
  useLocation: "Use my location",
  mapLabel: "Map. Tap or click where this place is to move the pin.",
  mapHint: "Or tap the map where this place is.",
  pinMoved: "Pin moved on the map",
  locating: "Finding you…",
  pinSet: "Pin set where you are now",
  pinKept: "Pin kept where it was",
  noPin: "No pin yet. Press Use my location while you are at this place.",
  needPin: "Press Use my location first.",
  needConsent: "Tick Save this place to agree first.",
  locationRefused:
    "Your browser did not share your location. Allow it for this site, then try again.",
  locationNone: "This browser cannot share a location.",
  pinWords: "Saved pin · only you can see it",

  // mobile/src/app/(app)/profile/details.tsx and data/profile-details.ts
  detailsTitle: "A few more details",
  detailsIntro:
    "All optional. Your hospital uses these to find your records and reach someone for you.",
  added: "Added",
  addedRel: (rel: string) => `Added · ${rel}`,
  titlePart: "Title",
  languagePart: "Preferred language",
  yourLanguage: "Your language",
  other: "Other",
  hospitalPart: "Usual hospital",
  notChosen: "Not chosen yet",
  choose: "Choose",
  idPart: "National ID",
  idOnFile: (label: string) => `${label} on file. To change it, contact support.`,
  anId: "An ID",
  idOnce: "Once added, only support can change it.",
  idNumber: "Number, as printed",
  nokPart: "Next of kin",
  nokKept: "Their name and number are kept safe and not shown here.",
  replace: "Replace",
  nokIntro: "Someone your hospital can call for you. Add a name and a phone, or leave both empty.",
  theirName: "Their name",
  relationshipOptional: "Relationship (optional)",
  theirPhone: "Their phone",
  phoneHint: "+256, then their number",
  keepOnFile: "Keep the one on file",
  saved: "Saved",
  detailsLoadTail: "Your title, language, ID and next of kin will show here.",
  detailsFailed: "Couldn't load your details. Try again.",
  detailsSaveFailed: "Couldn't save your details. Try again.",
  nothingToSave: "Change something to save.",

  // mobile/src/app/(app)/household.tsx
  householdTitle: "People I book for",
  householdIntro: "Book a visit for an adult in your household. They get their own booking code.",
  householdFailed: "Couldn't load the people you book for.",
  householdFailedHint: "Check your connection and try again.",
  nobody: "Nobody yet.",
  onList: (name: string) => `${name} is on your list.`,
  addSomeone: "Add someone",
  phone: "Their phone number",
  phoneMemberHint: "Their own number. Booking messages for them go there.",
  phonePlaceholder: "+256XXXXXXXXX",
  age: "Age in years",
  dob: "Date of birth (optional)",
  whoToYou: "Who are they to you?",
  adultSwitch: "This person is an adult (18 or older)",
  addPerson: "Add this person",
  tryAgain: "Try again",
} as const;

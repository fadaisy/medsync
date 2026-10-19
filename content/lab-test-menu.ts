/**
 * Lab test menu v2 (docs/lab/test-menu-v2/PROMPT-LAB-TEST-MENU-V2.md §5, Appendix A word for word, and the labels
 * of boards 13–18). `{name}` marks a value the caller fills in. Low-value advisories are the catalogue's own
 * `advisory` field, never restated here. The CSO signs this copy; until then it is a draft.
 */
import type { SignedCopy } from "@/content/signed-copy";

export const LAB_TEST_MENU_COPY_STATUS: SignedCopy = {
  status: "draft",
  signedBy: null,
  signedOn: null,
};

export const LAB_TEST_MENU = {
  title: "Test menu",
  hubTitle: "Laboratory test menu",
  tabs: {
    menu: "Test menu",
    profiles: "Hospital profiles",
    catalogue: "Test catalogue",
    analysers: "Analyser profiles",
  },
  /* Appendix A */
  search: "Search a test, a short name like LFTs, or a result like ALT",
  sectionHelp:
    "Sections come from the catalogue. Change one only if your lab runs the test elsewhere.",
  recommended: "Recommended",
  changedFrom: (section: string) => `Changed from ${section}`,
  resultsLine:
    "These come with the test. Units, codes and ranges are set once in Test catalogue; nothing here needs a section of its own.",
  empty:
    "No tests on your menu yet. Start from your level to get a full menu in one step, or add tests one at a time. Each test arrives with its section, specimen and tube already set.",
  levelLead:
    "Every test arrives with its recommended section, specimen and tube, and where a hospital at your level usually does it. You change only what is different here.",
  levelSource:
    "Levels follow the National Standard Test Menu (MoH, 2017); tests it does not list follow MedSync's guide.",
  turnaroundLine:
    "Stated turnaround starts empty. It is your lab's own figure, never a clinical target.",
  preview: (a: number, b: number, c: number) =>
    `${a} new tests to add · ${b} already on your menu, kept as you set them · ${c} on your menu but not in the template, kept`,
  notSigned:
    "Not yet signed. It can be added once the lab lead and the CSO sign the catalogue update.",
  addedNote: "Added tests take their recommended section.",
  askLead: "Not in the catalogue?",
  ask: "Ask for a test to be added",
  requestSent: "Sent to the MedSync catalogue team. You will be told when it is added, or why not.",
  profileNote:
    "A profile orders several catalogue tests at once. Each test keeps its own section, results and restricted class.",
  /** Law 6, TM-10: a profile name may not name a restricted condition (whole words, any case or accent). */
  restrictedNames: [
    "HIV",
    "AIDS",
    "TB",
    "tuberculosis",
    "MDR",
    "XDR",
    "syphilis",
    "gonorrhoea",
    "gonorrhea",
    "chlamydia",
    "herpes",
    "HPV",
    "STI",
    "STD",
    "pregnancy",
    "mental health",
  ],
  profileRefused:
    "Choose a name that does not name a condition. Profile names appear on bills and order lists.",
  /* Board 13 */
  startLevel: "Start from your level",
  addTests: "Add tests",
  summary: {
    onMenu: "tests on your menu",
    inHouse: "in-house",
    referred: "referred",
    noSection: "without a section",
    changed: "changed from the recommended section",
    compare: (level: string) => `Compare with the ${level} guide`,
  },
  sectionsHead: "Sections",
  allSections: "All sections",
  whereHead: "Where",
  where: { in_house: "In-house", referred: "Referred", not_offered: "Not offered" },
  filters: { all: "All", in_house: "In-house", referred: "Referred", changed: "Changed sections" },
  cols: {
    select: "Select",
    test: "Test",
    section: "Section",
    where: "Where",
    hours: "Hours",
    turnaround: "Turnaround",
    last: "Referred to, or now",
  },
  groupCount: (n: number) => `${n} on your menu`,
  setSectionHours: "Set hours for the section",
  results: (n: number) => (n === 1 ? "1 result" : `${n} results`),
  notSet: "Not set",
  available: "Available",
  notKnown: "Not known today",
  restricted: "Restricted",
  restrictedTest: "Restricted test",
  hiddenSection: "Hidden section",
  hiddenWarning: "Your lab hides this section; its tests stay on the menu until you change them.",
  hide: "Hide section",
  show: "Show section",
  hours: { "24h": "24 h", scheduled: "Working hours", none: "Set later" },
  nothingMatches: (q: string) => `No test on your menu matches “${q}”.`,
  /* Bulk bar */
  selected: (n: number) => `${n} selected`,
  apply: "Apply",
  clear: "Clear",
  turnaroundMinutes: "Stated turnaround (minutes)",
  referredTo: "Referred to",
  keep: "Keep as set",
  applied: (n: number) => `${n} tests updated.`,
  /* Board 14 */
  levelTitle: "Start from your level",
  levels: {
    "HC III": "Health centre III",
    "HC IV": "Health centre IV",
    GH: "General hospital",
    RRH: "Regional referral",
    NRH: "National referral",
    private: "Private laboratory",
  },
  privateNote: "Choose the nearest level, then adjust.",
  levelCounts: (a: number, b: number) => `${a} in-house · ${b} referred`,
  yourLevel: "Your hospital's level",
  sectionTable: {
    section: "Section",
    inHouse: "In-house",
    referred: "Referred",
    examples: "For example",
  },
  hoursChoice: "Hours for in-house tests",
  referChoice:
    "Referred tests go to: choose per test later. National tests (viral load, EID, TB culture, VHF) are preset to their national lab.",
  addN: (n: number) => `Add ${n} tests`,
  cancel: "Cancel",
  done: (n: number) => `${n} tests added to your menu.`,
  /* Board 15 */
  addTitle: "Add tests",
  exact: "Matches",
  often: "Often ordered with these",
  add: "Add",
  onMenu: "On your menu",
  resultsPreview: (n: number, first: string) =>
    `${n === 1 ? "1 result" : `${n} results`}: ${first}`,
  specimenTube: (specimen: string, tube: string) => `${specimen} · ${tube}`,
  /* Board 16 */
  detailTitle: "Test detail",
  sectionLabel: "Section",
  recommendedMark: (section: string) => `${section} (recommended)`,
  hoursLabel: "Hours",
  hoursNote: "Days and times, for example Mon–Sat 8–17",
  turnaroundHelp: "Your lab's own figure, in minutes. Leave it empty until you know it.",
  downRefer: "When it is down, refer to",
  referredToLabel: "Referred to",
  fromCatalogue: "From the catalogue",
  specimen: "Specimen and tube",
  orderCode: "Order code",
  noOrderCode: "No order code",
  resultCols: { result: "Result", unit: "Unit", loinc: "LOINC" },
  catalogueLine:
    "Results, units and codes belong to the catalogue and are the same at every hospital. Ranges are set by your lab lead in Ranges and cut-offs.",
  remove: "Remove from the menu",
  removeConsequence: (profiles: number) =>
    `Doctors will no longer be able to order it. Orders already placed are not cancelled.${profiles ? ` ${profiles === 1 ? "1 profile contains" : `${profiles} profiles contain`} it and will be flagged.` : ""}`,
  confirmRemove: "Remove",
  save: "Save",
  saved: "Saved.",
  levelBasis: (table: string | null, narrative: string | null) =>
    `National menu: table ${table ?? "—"}, narrative ${narrative ?? "—"}`,
  judgement: "Level by MedSync's guide (not on the 2017 national menu)",
  /* Board 17 */
  profilesTitle: "Hospital profiles",
  newProfile: "New profile",
  editProfile: "Edit profile",
  profileName: "Name",
  profileNoteLabel: "Note",
  profileTests: "Tests",
  profileFlagged: "A test in this profile is no longer offered. Edit the profile.",
  noProfiles: "No profiles yet.",
  removeProfile: "Retire profile",
  profileNeedsOffered: "A profile holds only tests on your menu that are offered.",
  /* 5.6 */
  requestTitle: "Ask for a test to be added",
  requestFields: {
    name: "Test name",
    purpose: "What it is for",
    specimen: "Specimen",
    route: "Where the lab will do it",
    reference: "Reference (kit insert, guideline), optional",
  },
  routes: { in_house: "Run here", referred: "Send it out" },
  noPatientData: "Do not enter patient details. A request is about the test, never a patient.",
  identifierRefused: "That looks like a hospital number. Remove patient details and try again.",
  send: "Send request",
  myRequests: "Your requests",
  requestStates: {
    new: "Sent",
    in_review: "In review",
    added: "Added",
    declined: "Declined",
  },
  /* Superadmin queue */
  queueTitle: "Lab catalogue requests",
  queueEmpty: "No requests.",
  review: "Start review",
  markAdded: "Mark added",
  decline: "Decline",
  reasonLabel: "Reason the requester will see",
  testIdLabel: "Catalogue test id (after the signed addendum)",
  notInCatalogue: "That test is not in the signed catalogue yet.",
  /* Ordering (TM-12) */
  profilesHead: "Hospital profiles",
  addProfile: (n: number) => `Add ${n} tests`,
  addendum: {
    card: (n: number) => `${n} new tests in catalogue v2`,
    title: "Catalogue v2 (lab test menu)",
  },
} as const;

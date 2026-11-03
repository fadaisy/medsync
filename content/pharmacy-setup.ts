import type { SignedCopy } from "@/content/signed-copy";

/**
 * Set-up › Going live, Places and Messages: the data the four tabs share (SETUP-TABS.md §A3, §B, §D3) — the go-live
 * checklist, owners and phases, place kinds, opening hours and devices, and the SMS templates. Verbatim from the
 * prototypes' `constructor`s. The tabs' own words are in content/pharmacy-setup-<tab>.ts. Draft until the CSO signs.
 * No Luganda here: a native speaker enters and checks it (§D3).
 */
export const PHARMACY_SETUP_COPY: SignedCopy = { status: "draft", signedBy: null, signedOn: null };

export type ItemKind = "record" | "mark" | "auto";
export type ItemKey =
  | "q1"
  | "q24"
  | "wit"
  | "mfa"
  | "dev"
  | "demo"
  | "places"
  | "levels"
  | "prices"
  | "opening"
  | "sensor"
  | "supp"
  | "roster"
  | "lic"
  | "presc"
  | "train"
  | "words"
  | "rules"
  | "lug"
  | "hmis";
export type SetupTab = "places" | "medicines" | "rules" | "people" | "messages";

export interface ChecklistItem {
  key: ItemKey;
  group: 0 | 1 | 2 | 3;
  name: string;
  why: string;
  owner: string;
  blocks: boolean;
  kind: ItemKind;
  link: SetupTab | null;
  /** For record items with choices. */
  choices?: readonly string[];
  /** For auto items: the noun after "41 of 47". */
  unit?: string;
}

const I = (
  key: ItemKey,
  group: ChecklistItem["group"],
  name: string,
  why: string,
  owner: string,
  blocks: boolean,
  kind: ItemKind,
  link: SetupTab | null,
  x: Partial<Pick<ChecklistItem, "choices" | "unit">> = {},
): ChecklistItem => ({ key, group, name, why, owner, blocks, kind, link, ...x });

export const GOLIVE_GROUPS = [
  "Legal answers and safety switches",
  "Places and stock",
  "People and training",
  "Rules, wording and reports",
] as const;

export const CHECKLIST: readonly ChecklistItem[] = [
  I(
    "q1",
    0,
    "Who may dispense and hand over when no pharmacist is on duty",
    "Dispensing stays pharmacist-only until this is recorded.",
    "In-charge",
    true,
    "record",
    null,
    {
      choices: [
        "Pharmacist only",
        "Pharmacist or pharmacy technician",
        "Pharmacist, technician, or a named nurse at night",
      ],
    },
  ),
  I(
    "q24",
    0,
    "The controlled-drug register",
    "Electronic beside paper, ward and cart registers, and how long they are kept.",
    "Medical superintendent",
    true,
    "record",
    null,
    {
      choices: [
        "Electronic and paper side by side",
        "Electronic only, paper retired after the parallel run",
      ],
    },
  ),
  I(
    "wit",
    0,
    "Who may witness a controlled dose, by cadre",
    "The witness list on wards and in the pharmacy uses this.",
    "In-charge",
    true,
    "record",
    "rules",
  ),
  I(
    "mfa",
    0,
    "Two-step sign-in on every pharmacy account",
    "Witness approvals rely on it.",
    "IT officer",
    true,
    "auto",
    null,
    { unit: "accounts" },
  ),
  I(
    "dev",
    0,
    "Development overrides unset",
    "Production will not start with an override on.",
    "MedSync support",
    true,
    "mark",
    null,
  ),
  I(
    "demo",
    0,
    "Demo data kept in its own project",
    "Nothing marked demo is in this hospital.",
    "MedSync support",
    true,
    "mark",
    null,
  ),
  I(
    "places",
    1,
    "Places, devices and handover times",
    "Each place has a device and its handover times.",
    "In-charge",
    false,
    "auto",
    "places",
    { unit: "places" },
  ),
  I(
    "levels",
    1,
    "Top-up levels for every medicine at every place",
    "Without levels, Issue cannot suggest amounts.",
    "Store keeper",
    true,
    "auto",
    "medicines",
    { unit: "medicines" },
  ),
  I(
    "prices",
    1,
    "A price for every medicine stocked",
    "Losses in UGX and the order budget need it.",
    "Store keeper",
    false,
    "auto",
    "medicines",
    { unit: "medicines" },
  ),
  I(
    "opening",
    1,
    "Opening stock counted at every place",
    "The first balance in MedSync. Count blind, then sign.",
    "Store keeper",
    true,
    "auto",
    "medicines",
    { unit: "places" },
  ),
  I(
    "sensor",
    1,
    "A sensor on every fridge, or typed readings set up",
    "Fridges without a sensor have their readings typed at 08:00 and 17:00.",
    "Store keeper",
    false,
    "auto",
    "places",
    { unit: "fridges" },
  ),
  I(
    "supp",
    1,
    "Suppliers and the NMS cycle",
    "NMS every 2 months, JMS top-ups, UNEPI vaccines.",
    "In-charge",
    false,
    "mark",
    "places",
  ),
  I(
    "roster",
    2,
    "Roster published for the first two weeks",
    "Witness pickers and handover only offer people on duty.",
    "In-charge",
    true,
    "auto",
    "people",
    { unit: "weeks published" },
  ),
  I(
    "lic",
    2,
    "A current licence for every pharmacist and technician",
    "Nobody can be rostered after their licence expires.",
    "In-charge",
    true,
    "auto",
    "people",
    { unit: "people" },
  ),
  I(
    "presc",
    2,
    "Prescriber list, with who may prescribe controlled drugs",
    "Controlled entries pick the prescriber from this list.",
    "Medical superintendent",
    false,
    "mark",
    "people",
  ),
  I(
    "train",
    2,
    "Everyone trained on a practice day",
    "Each person signs in once in practice mode and dispenses a sample prescription.",
    "In-charge",
    true,
    "auto",
    null,
    { unit: "people trained" },
  ),
  I(
    "words",
    3,
    "Workspace wording signed",
    "New words show as drafts until signed.",
    "In-charge",
    false,
    "mark",
    null,
  ),
  I(
    "rules",
    3,
    "Every rule group signed",
    "Unsigned groups still use prototype defaults.",
    "In-charge",
    true,
    "auto",
    "rules",
    { unit: "groups signed" },
  ),
  I(
    "lug",
    3,
    "Luganda SMS templates checked",
    "Until then reminders go in English only.",
    "A Luganda speaker",
    false,
    "mark",
    "messages",
  ),
  I(
    "hmis",
    3,
    "HMIS 105 and NDA return columns confirmed",
    "Reports stay as drafts until the columns match the paper forms.",
    "Records officer",
    false,
    "record",
    null,
    {
      choices: ["Columns match the paper forms", "Columns need changes (say which)"],
    },
  ),
];

export const OWNERS = [
  "In-charge",
  "Medical superintendent",
  "Store keeper",
  "IT officer",
  "Records officer",
  "MedSync support",
  "A Luganda speaker",
  "Ward in-charges",
] as const;

export const PHASES = [
  ["Set up", "Work through the checklist. Nothing here affects patients."],
  [
    "Practice day",
    "Everyone signs in in practice mode and dispenses sample prescriptions. Practice data is wiped.",
  ],
  [
    "Parallel run · 2 weeks",
    "MedSync is the record. Paper registers continue beside it, and differences are checked daily.",
  ],
  ["Paper retired", "The in-charge and the medical superintendent stop the paper registers."],
] as const;

/* ─── Places ─────────────────────────────────────────────────────────── */

export type PlaceKind = "store" | "dispensing_point" | "ward" | "clinic" | "theatre";
export const PLACE_KINDS: Record<PlaceKind, string> = {
  store: "Store",
  dispensing_point: "Dispensing point",
  ward: "Ward",
  clinic: "Clinic",
  theatre: "Theatre",
};
export type Hours = "24h" | "day" | "weekdays";
export const HOURS: Record<Hours, string> = {
  "24h": "24 hours",
  day: "Day only, 08:00–17:00",
  weekdays: "Weekdays, 08:00–17:00",
};
export const DEVICES = [
  "Store desk",
  "OPD station",
  "Ward tablet",
  "EPI tablet",
  "Shared station",
] as const;
export const DEFAULT_DEVICE: Record<PlaceKind, string> = {
  store: "Store desk",
  dispensing_point: "OPD station",
  ward: "Ward tablet",
  clinic: "EPI tablet",
  theatre: "Shared station",
};
export const HANDOVER_SLOTS = ["08:00", "17:00", "20:00"] as const;
/** Typed fridge checks; a reading within 90 minutes counts for the check. */
export const READING_CHECKS = ["08:00", "17:00"] as const;

/* ─── Messages ───────────────────────────────────────────────────────── */

export type TemplateKey =
  | "refill_due"
  | "refill_missed"
  | "course"
  | "epi_tomorrow"
  | "epi_defaulter"
  | "staff_eve"
  | "staff_change"
  | "staff_unpub"
  | "staff_licence";
export interface SmsTemplate {
  key: TemplateKey;
  audience: "patients" | "staff";
  name: string;
  timingLabel: string;
  timingHint: string;
  timing: string;
  en: string;
  /** On unless set otherwise. */
  on: boolean;
}
const T = (
  key: TemplateKey,
  audience: SmsTemplate["audience"],
  name: string,
  timingLabel: string,
  timingHint: string,
  timing: string,
  en: string,
  on = true,
): SmsTemplate => ({ key, audience, name, timingLabel, timingHint, timing, en, on });

export const SMS_TEMPLATES: readonly SmsTemplate[] = [
  T(
    "refill_due",
    "patients",
    "Refill due",
    "Days before the refill date",
    "e.g. 3",
    "3",
    "MedSync {facility}: {first name}, your medicine refill is due on {date}. Please come to the OPD pharmacy. Reply STOP to stop.",
  ),
  T(
    "refill_missed",
    "patients",
    "Missed refill",
    "Days after the missed date",
    "comma-separated, e.g. 1, 7",
    "1, 7",
    "MedSync {facility}: {first name}, we missed you on {date}. Please come for your medicine refill soon. Reply STOP to stop.",
  ),
  T(
    "course",
    "patients",
    "Antibiotic course",
    "Day of the course to remind",
    "e.g. 3",
    "3",
    "MedSync {facility}: {first name}, keep taking {medicine} until the course is finished, even if you feel better. Reply STOP to stop.",
  ),
  T(
    "epi_tomorrow",
    "patients",
    "Immunisation visit tomorrow",
    "Days before the visit",
    "e.g. 1",
    "1",
    "MedSync {facility}: {child name} is due for immunisation on {date}. Please bring the child health card. Reply STOP to stop.",
  ),
  T(
    "epi_defaulter",
    "patients",
    "Missed immunisation",
    "Days after the missed visit",
    "comma-separated, e.g. 3, 14",
    "3, 14",
    "MedSync {facility}: {child name} missed an immunisation on {date}. Please come to the EPI clinic this week. Reply STOP to stop.",
    false,
  ),
  T(
    "staff_eve",
    "staff",
    "Shift tomorrow",
    "Time to send, the evening before",
    "e.g. 18:00",
    "18:00",
    "MedSync: Hello {first name}, you are on {shift} shift tomorrow, {date}, at {place}, {time}.",
  ),
  T(
    "staff_change",
    "staff",
    "Shift changed",
    "Sent when a published shift changes",
    "at once",
    "at once",
    "MedSync: {first name}, your {date} shift changed. You are now on {shift} at {place}, {time}.",
  ),
  T(
    "staff_unpub",
    "staff",
    "Next week not published",
    "Day to remind the in-charge",
    "e.g. Thursday 16:00",
    "Thursday 16:00",
    "MedSync: next week's pharmacy roster is not published yet. Please publish it today.",
  ),
  T(
    "staff_licence",
    "staff",
    "Licence expiring",
    "Days before the licence expires",
    "e.g. 30",
    "30",
    "MedSync: {first name}, your practising licence expires on {date}. Please renew it and bring the new licence to the in-charge.",
  ),
];

export const HOLES = {
  patients: ["facility", "first name", "date", "medicine", "child name"],
  staff: ["first name", "date", "shift", "place", "time"],
} as const;

/** Sample details for the editor's count and preview; never sent. */
export const SMS_SAMPLE: Record<string, string> = {
  "first name": "Sarah",
  date: "Fri 6 Nov",
  medicine: "amoxicillin",
  "child name": "Baby Amani",
  shift: "Day",
  place: "OPD dispensary",
  time: "08:00-17:00",
};

export const OPT_OUT_REASONS = [
  "Asked at the desk",
  "Wrong number",
  "Patient has died",
  "Shared phone, privacy",
] as const;

import type { SignedCopy } from "@/content/signed-copy";

/**
 * Set-up › Rules (SETUP-TABS.md §C3): the one rules registry. Every rule's default wording, what it applies to and,
 * for a rule with a number, that number with its unit and allowed range. Verbatim from the prototype's `constructor`
 * (rules.dc.html). A hospital changes a rule with two signatures (pharmacy_rules, 0270/0273); the checks read the
 * signed number through lib/pharmacy/rules/registry.ts. Draft until the CSO signs.
 */
export const PHARMACY_RULES_COPY: SignedCopy = { status: "draft", signedBy: null, signedOn: null };

export interface RuleParam {
  n: number;
  unit: string;
  min: number;
  max: number;
  step: number;
}
export interface RegistryRule {
  key: string;
  name: string;
  /** With `{n}` where the number goes. */
  text: string;
  appliesTo: string;
  param: RuleParam | null;
}
export interface RegistryGroup {
  key: string;
  title: string;
  showsOn: readonly string[];
  rules: readonly RegistryRule[];
}

const R = (
  key: string,
  name: string,
  text: string,
  appliesTo: string,
  p?: [n: number, unit: string, min: number, max: number, step?: number],
): RegistryRule => ({
  key,
  name,
  text,
  appliesTo,
  param: p ? { n: p[0], unit: p[1], min: p[2], max: p[3], step: p[4] ?? 1 } : null,
});

/** The one place the test-kit range is written (SUPPLIES.md §F); every word about kits is built from it. */
const KIT_TEMP = { low: 2, high: 30 };
export const KIT_RANGE = `${KIT_TEMP.low}–${KIT_TEMP.high} °C`;
export const kitAbove = `above ${KIT_TEMP.high} °C`;

export const RULE_REGISTRY: readonly RegistryGroup[] = [
  {
    key: "cd",
    title: "Controlled drugs",
    showsOn: ["Medicines", "Dispense", "Controls"],
    rules: [
      R(
        "witness_ward",
        "Witness on a ward",
        "Second nurse on shift, nurse in-charge or doctor on duty",
        "Controlled medicines on wards",
      ),
      R(
        "witness_pharmacy",
        "Witness in the pharmacy",
        "Pharmacy technician, second pharmacist or in-charge",
        "Controlled medicines in the pharmacy",
      ),
      R(
        "min_gap",
        "Minimum gap between doses",
        "Morphine inj 4 h · pethidine 3 h · oral morphine 4 h",
        "Morphine, pethidine",
      ),
      R(
        "balance_check",
        "Balance check",
        "Wards and dispensary daily · store weekly",
        "Every controlled line",
      ),
      R(
        "residue",
        "Residue",
        "Discarded in front of the witness, amount recorded",
        "Part-used ampoules",
      ),
      R("offline", "Offline entries", "Must reach the server within {n}", "Every device", [
        12,
        "hours",
        1,
        48,
      ]),
    ],
  },
  {
    key: "ho",
    title: "Shift handover",
    showsOn: ["Places", "Controls"],
    rules: [
      R("times", "Handover times", "Set per place (08:00 and 17:00 by default)", "Every place"),
      R(
        "missed",
        "Missed",
        "A handover not started {n} after its time is marked missed",
        "Every place",
        [30, "minutes", 10, 120, 5],
      ),
      R(
        "blind",
        "Counted blind",
        "Controlled and high-risk medicines at every handover",
        "Controlled, high-risk",
      ),
      R("who", "Who hands over", "Only the place you are working at", "Everyone"),
    ],
  },
  {
    key: "inv",
    title: "Investigations",
    showsOn: ["Controls"],
    rules: [
      R(
        "opened_from",
        "Opened from",
        'Controlled, high-risk or "Other" count differences',
        "Counts and handovers",
      ),
      R("deadline_high", "Deadline, high", "Closed within {n}", "High-severity cases", [
        24,
        "hours",
        4,
        72,
      ]),
      R("deadline_medium", "Deadline, medium", "Closed within {n}", "Medium cases", [
        48,
        "hours",
        12,
        120,
      ]),
      R(
        "balance_case",
        "Place balance",
        "A gap over {n}, or any controlled medicine, opens a case",
        "Every place",
        [100000, "UGX", 0, 10000000, 10000],
      ),
      R("past_deadline", "Past deadline", "Escalated to the in-charge", "Every case"),
      R("closed_by", "Closed by", "In-charge sign-off with the finding", "Every case"),
    ],
  },
  {
    key: "rx",
    title: "Prescription checks",
    showsOn: ["Dispense", "Medicines"],
    rules: [
      R(
        "child_mgkg",
        "Children, mg/kg a dose",
        "Paracetamol 10–15 · amoxicillin 12–30 · metronidazole 7.5–10 · cotrimoxazole 12–24",
        "4 medicines",
      ),
      R(
        "kidney_metformin",
        "Kidney: metformin",
        "Stop below eGFR 30 · max 1 g a day at 30–45",
        "Metformin",
      ),
      R("allergy", "Allergy", "Penicillin allergy blocks amoxicillin", "Penicillins"),
      R("pregnancy", "Pregnancy", "Metronidazole: caution in the first trimester", "Metronidazole"),
    ],
  },
  {
    key: "cold",
    title: "Stock and cold chain",
    showsOn: ["Medicines", "Places"],
    rules: [
      R("expiry_warning", "Expiry warning", "Warn {n} before expiry", "Every batch", [
        90,
        "days",
        30,
        365,
        15,
      ]),
      R("fridge_range", "Fridge range", "Kept at 2–8 °C", "Every fridge"),
      R(
        "near_limit",
        "Near the limit",
        "Within {n} of 2 or 8 °C shows as near the limit",
        "Every fridge",
        [0.5, "°C", 0.1, 2, 0.1],
      ),
      R("excursion", "Excursion", "{n} or more outside 2–8 °C opens an excursion", "Every fridge", [
        30,
        "minutes",
        5,
        120,
        5,
      ]),
      R("open_vials", "Open vials", "BCG, MR 6 h · bOPV, IPV, Penta, Td 28 days", "Vaccines"),
      // Main store (STORE.md §K): Places and Stock.
      R("running_out", "Running out", "{n} or fewer of cover at a place", "Every place", [
        7,
        "days",
        1,
        30,
      ]),
      R(
        "running_out_bad",
        "Running out, urgent",
        "Under {n} of cover shows as urgent",
        "Every place",
        [3, "days", 1, 14],
      ),
      R(
        "over_level",
        "Over the level",
        "Over {n} the top-up level shows as more than needed",
        "Every place",
        [1.5, "times", 1, 5],
      ),
      R(
        "asks_less",
        "Asks less",
        "Under {n} what the place needs reads as asking less",
        "Every place",
        [0.5, "times", 0.1, 1],
      ),
      R("cover_amber", "Cover, amber", "Under {n} of cover shows amber", "Every place", [
        14,
        "days",
        2,
        60,
      ]),
      R(
        "transfer_over",
        "Transfer from",
        "A place with over {n} of cover and excess",
        "Every place",
        [60, "days", 14, 365],
      ),
      R(
        "transfer_under",
        "Transfer to",
        "A place with under {n} of cover and a need",
        "Every place",
        [14, "days", 1, 60],
      ),
      R("count_every", "Shelf count", "Every shelf counted every {n}", "Main store", [
        30,
        "days",
        1,
        365,
      ]),
      R("cd_count", "Controlled cupboard", "Counted every {n}", "Main store", [1, "day", 1, 7]),
      R(
        "count_sign",
        "Count sign-off",
        "A difference over {n} needs the in-charge",
        "Every count",
        [50000, "UGX", 0, 1000000, 5000],
      ),
      R("room_temp", "Store room", "Below {n}", "Main store", [25, "°C", 15, 30, 0.5]),
      R("room_temp_warn", "Store room, amber", "Over {n} shows amber", "Main store", [
        24,
        "°C",
        15,
        30,
        0.5,
      ]),
      R("humidity", "Store room damp", "Below {n} humidity", "Main store", [60, "%", 30, 90]),
      R("humidity_warn", "Store room damp, amber", "Over {n} shows amber", "Main store", [
        55,
        "%",
        30,
        90,
      ]),
      R("expiry_window", "Expiry window", "Batches expiring within {n}", "Main store", [
        6,
        "months",
        1,
        24,
      ]),
      R("expiry_bad", "Expiry, red", "Expiry within {n} shows red", "Main store", [
        3,
        "months",
        1,
        12,
      ]),
      R(
        "count_reasons",
        "Count reasons",
        "Damaged · expired · found · miscount · Other (opens a case)",
        "Every count",
      ),
    ],
  },
  {
    key: "ord",
    title: "Ordering",
    showsOn: ["Stock", "Places"],
    rules: [
      R("covers", "Order covers", "The cycle plus a {n} buffer", "NMS orders", [1, "month", 0, 3]),
      R("stock_outs", "Stock-outs", "Use adjusted for days out of stock", "Every line"),
      R("over_budget", "Over budget", "Trim N lines first, then E · never V", "Every order"),
      R("order_due", "Order due", "{n} before the cycle date", "Every supplier with a cycle", [
        7,
        "days",
        1,
        30,
      ]),
      // Main store (STORE.md §K): Ordering, Rationing and Targets.
      R("months_to", "Months to order to", "Each line filled to {n} of use", "NMS orders", [
        4,
        "months",
        1,
        12,
      ]),
      R("short_under", "Short", "Under {n} of stock", "Every line", [2, "months", 1, 6]),
      R("too_much", "Too much", "Over {n} of stock", "Every line", [6, "months", 3, 24]),
      R("not_moving", "Not moving", "No movement for {n}", "Every line", [90, "days", 30, 365, 15]),
      R("use_months", "Use per month", "The last {n}, adjusted for days out", "Every line", [
        3,
        "months",
        1,
        12,
      ]),
      R("trim_to", "Trim to", "N, then E lines, down to {n} · never V", "Every order", [
        2,
        "months",
        1,
        6,
      ]),
      R(
        "urgent_days",
        "Rationing",
        "Urgent requests first, up to {n} of cover, then equal days",
        "Short medicines",
        [7, "days", 1, 30],
      ),
      R("fill_target", "Fill target", "{n} of requisition lines filled in full", "Requisitions", [
        90,
        "%",
        50,
        100,
      ]),
    ],
  },
  {
    key: "sup",
    title: "Health and lab supplies",
    showsOn: ["Medicines", "Stock"],
    rules: [
      R(
        "sterile",
        "Sterile packs",
        "A broken, wet or torn sterile pack is rejected as damaged, never stocked",
        "Sterile health supplies",
      ),
      R(
        "kits",
        "Test kits",
        `Kept at ${KIT_RANGE}; kits that got hotter are kept apart until the supplier answers`,
        "Laboratory test kits",
      ),
      R(
        "kit_warn",
        "Kit expiry warning",
        "Warn {n} before a test kit expires",
        "Laboratory test kits",
        [60, "days", 30, 180, 15],
      ),
      R(
        "no_expiry",
        "No expiry",
        "Received by batch or lot only, with no expiry date",
        "Safety boxes and items marked no expiry",
      ),
      R(
        "issued",
        "Issued, not sold",
        "Go out to places on requisition; patients are billed only when a price is set",
        "Health and lab supplies",
      ),
    ],
  },
  {
    key: "price",
    title: "Prices and billing",
    showsOn: ["Medicines", "Places"],
    rules: [
      R(
        "markup",
        "Price rule",
        "Received cost + {n}, rounded to UGX 50",
        "Lines without a typed price",
        [25, "%", 0, 100],
      ),
      R(
        "free_point",
        "Free point",
        "Every line at a free dispensing point is billed as free",
        "Free dispensing points",
      ),
      R(
        "pay_first",
        "Pay before collecting",
        "Never holds an emergency or an admitted patient",
        "Pay-first dispensing points",
      ),
    ],
  },
  {
    key: "roster",
    title: "Roster and people",
    showsOn: ["People"],
    rules: [
      R(
        "per_shift",
        "People per shift",
        "Day and night shifts have {n} people who can witness",
        "Wards and pharmacy",
        [2, "people", 1, 4],
      ),
      R(
        "shifts_week",
        "Shifts a week",
        "At most {n} a week per person, day or night",
        "Everyone rostered",
        [6, "shifts", 3, 7],
      ),
      R("rest", "Rest", "No day shift the morning after a night shift", "Everyone rostered"),
      R("late", "Late", "Signing in more than {n} after the start is late", "Pharmacy shifts", [
        10,
        "minutes",
        0,
        60,
        5,
      ]),
      R(
        "not_in",
        "Not signed in",
        "The in-charge is alerted {n} after the start",
        "Pharmacy shifts",
        [15, "minutes", 5, 60, 5],
      ),
      R("leave_notice", "Leave notice", "Ask {n} ahead, except sick leave", "Pharmacy staff", [
        7,
        "days",
        0,
        30,
      ]),
      R(
        "licence_warn",
        "Licence warning",
        "Warn {n} before a licence expires",
        "Pharmacists, technicians",
        [30, "days", 7, 90],
      ),
    ],
  },
  {
    key: "swap",
    title: "Swaps and who makes the roster",
    showsOn: ["People"],
    rules: [
      R(
        "swaps",
        "Swaps",
        "The colleague accepts first; only then can the in-charge approve",
        "Pharmacy staff",
      ),
      R(
        "unanswered",
        "Unanswered",
        "A request not answered before the shift starts expires",
        "Pharmacy staff",
      ),
      R(
        "maker",
        "Roster maker",
        "The pharmacy in-charge, or someone handed the duty, with an end date",
        "Pharmacy roster",
      ),
    ],
  },
  {
    key: "recv",
    title: "Receiving",
    showsOn: ["Stock › Receive a delivery"],
    rules: [
      R(
        "look",
        "Short-dated window",
        "A batch expiring within {n} days is short-dated",
        "Every delivery line",
        [180, "days", 30, 730],
      ),
      R(
        "short_approval",
        "Short-dated approval",
        "Accepting a short-dated batch needs the in-charge's approval",
        "Short-dated lines",
      ),
      R(
        "price_tol",
        "Price tolerance",
        "A price more than {n} from the order or usual price is flagged",
        "Every priced line",
        [5, "%", 0, 50],
      ),
      R(
        "second_check",
        "Second check",
        "A delivery above {n} needs a second person to check the count",
        "Every delivery",
        [2000000, "UGX", 0, 100000000, 100000],
      ),
      R(
        "inv_pct",
        "Invoice tolerance, share",
        "An invoice within {n} of the count matches",
        "Invoice check",
        [1, "%", 0, 10],
      ),
      R(
        "inv_ugx",
        "Invoice tolerance, amount",
        "An invoice within {n} of the count matches",
        "Invoice check",
        [1000, "UGX", 0, 100000, 500],
      ),
      R(
        "target_stock",
        "Target, arrival to stock",
        "Arrival to in stock within {n}",
        "Receiving figures",
        [120, "min", 15, 1440, 15],
      ),
      R(
        "target_shelf",
        "Target, stock to shelf",
        "In stock to shelved within {n}",
        "Receiving figures",
        [60, "min", 15, 1440, 15],
      ),
      R(
        "target_matched",
        "Target, lines matched",
        "At least {n} of lines match the note",
        "Receiving figures",
        [95, "%", 50, 100],
      ),
      R("temp_low", "Cold arrival, lowest", "A cold line arrives at {n} or warmer", "Cold lines", [
        2,
        "°C",
        -30,
        15,
      ]),
      R(
        "temp_high",
        "Cold arrival, highest",
        "A cold line arrives at {n} or cooler",
        "Cold lines",
        [8, "°C", 0, 30],
      ),
      R(
        "cold_mins",
        "Into the fridge",
        "Cold lines go into the fridge within {n} of arriving",
        "Cold lines",
        [30, "min", 5, 240, 5],
      ),
    ],
  },
  {
    key: "msg",
    title: "Messages",
    showsOn: ["Messages"],
    rules: [
      R(
        "consent",
        "Consent",
        "Only patients who agreed at registration get SMS",
        "Every patient SMS",
      ),
      R("quiet", "Quiet hours", "No SMS between 20:00 and 07:00; held until 07:00", "Every SMS"),
      R(
        "per_patient",
        "Per patient",
        "At most {n} reminders a week per patient",
        "Patient reminders",
        [3, "SMS", 1, 7],
      ),
      R(
        "monthly_cap",
        "Monthly cap",
        "Stop sending at {n} of the monthly SMS budget",
        "Every SMS",
        [100, "%", 50, 100, 5],
      ),
    ],
  },
];

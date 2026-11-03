import type { SignedCopy } from "@/content/signed-copy";

import { longDate, shortDate } from "@/content/pharmacy-roster";

/**
 * Set-up › Places (SETUP-TABS.md §B): every word on the tab, verbatim from places.dc.html where it says it. Kinds,
 * hours, devices, slots and checks are the shared words in content/pharmacy-setup.ts; dates from
 * content/pharmacy-roster.ts. Draft until the CSO signs.
 */
export const PHARMACY_SETUP_PLACES_COPY: SignedCopy = {
  status: "draft",
  signedBy: null,
  signedOn: null,
};

const s = (n: number, one: string, many: string) => (n === 1 ? one : many);
const ugx = (n: number) =>
  n >= 1e6 ? `UGX ${Math.round(n / 1e5) / 10} m` : `UGX ${n.toLocaleString("en-GB")}`;
const diffs = (n: number) => `${n} ${s(n, "difference", "differences")}`;

export const PL = {
  ugx,
  needsDb:
    "Places need the set-up database update (0274). Until it is applied, places stay as they are.",
  title: "Places that hold stock",
  count: (open: number, closed: number) => (closed ? `${open} open · ${closed} closed` : `${open}`),
  lead: "Each place has its own stock, counts and handover. People hand over only the place they are working at.",
  addPlace: "Add a place",

  /* B1 rule badges */
  rules: "Rules",
  rulesAria: "Rules for places",
  badges: {
    ho: { scope: "Handover", affects: "Every place with handover times" },
    cold: { scope: "Cold chain", affects: "Every fridge" },
    price: { scope: "Billing", affects: "Dispensing points" },
    ord: { scope: "Supply", affects: "Every place" },
  },
  badgeAria: (scope: string, n: number, issue: string | null, pending: number) =>
    `${scope} rules, ${n}${issue ? `, ${issue}` : ""}${pending ? `, ${pending} waiting for signatures` : ""}`,
  toSign: (n: number) => `${n} to sign`,
  missedToday: (n: number) => `${n} missed today`,
  missedLine: (place: string, t: string) => `${place}: ${t} handover not started`,
  coldIssue: (act: number, noFridge: number) =>
    [act ? `${act} to act on` : "", noFridge ? `${noFridge} no fridge` : ""]
      .filter(Boolean)
      .join(" · "),
  fridgeLine: (code: string, temp: number, state: string) =>
    `${code}: ${temp.toFixed(1)} °C, ${state.toLowerCase()}`,
  notTypedLine: (code: string, t: string) => `${code}: ${t} reading not typed`,
  noFridgeLine: (place: string, lines: string[]) =>
    `${place}: ${lines.join(", ")} kept with no fridge`,
  ordersDue: (n: number) => `${n} ${s(n, "order", "orders")} due soon`,
  dueLine: (name: string, days: number, cycle: string, lead: number) =>
    `${name}: order due ${days <= 0 ? "now" : `in ${days} days`} (cycle ${shortDate(cycle)}, lead time ${lead} days)`,
  rightNow: "Right now",
  signerOnRecord: "on record",

  /* B1 tiles */
  glanceAria: "Places at a glance",
  tiles: {
    places: "Places",
    placesSub: (wards: number, other: number) => `${wards} wards · ${other} other`,
    fridges: "Fridges in range",
    fridgesValue: (ok: number, all: number) => `${ok} of ${all}`,
    fridgesSub: (need: number) =>
      need
        ? `${need} ${s(need, "place needs", "places need")} a fridge`
        : "all cold-chain stock covered",
    missed: "Handovers missed today",
    none: "none",
    out: "Places with medicines out",
    outSub: (n: number) => `${n} lines out in all`,
  },

  /* B1 flow, chips, search */
  flowTitle: "Stock flow",
  flowAria: "Where stock comes from",
  kindAria: "Kind",
  all: "All",
  closedKind: "Closed",
  chip: (label: string, n: number) => `${label} · ${n}`,
  search: "Search places",

  /* B2 grid */
  cols: ["Place", "Supplied from", "Stock", "Fridge", "Handover today", "On duty now"] as const,
  closedTag: "Closed",
  free: "free",
  charged: "charged",
  payFirst: ", pay first",
  notSet: "Not set",
  lines: (n: number) => `${n} lines`,
  out: (n: number) => `${n} out`,
  low: (n: number) => `${n} low`,
  allOk: "All OK",
  noFridgeCold: "No fridge · cold stock here",
  none: "None",
  noReading: "No reading yet",
  noHandover: "No handover",
  nobodyNow: "Nobody now",
  slot: {
    done: (t: string, d: number) => `${t} ✓${d ? ` · ${d} diff` : ""}`,
    missed: (t: string) => `${t} missed`,
    now: (t: string) => `${t} now`,
    due: (t: string) => `${t} due`,
  },
  slotTip: {
    done: (from: string, to: string, at: string, d: number) =>
      `${from} → ${to} · at ${at} · ${d ? diffs(d) : "no differences"}`,
    missed: (t: string, min: number) => `Not started ${min} minutes after ${t}`,
    due: (t: string) => `Due at ${t}`,
  },
  openAria: (open: boolean, name: string) => `${open ? "Close" : "Open"} ${name}`,
  noMatch: "No places match.",
  showAll: "Show all",

  /* B3 open row */
  about: "About",
  name: "Name",
  kind: "Kind",
  kindHub: "Set on the hospital hub",
  open: "Open",
  suppliedFrom: "Supplied from",
  direct: "Direct from suppliers",
  suppliers: "Suppliers",
  noSuppliers: "No suppliers yet. Add them under Suppliers.",
  workedFrom: "Worked from",
  device: {
    online: (min: number) => `Online · seen ${min <= 1 ? "just now" : `${min} min ago`}`,
    offline: (min: number) =>
      `Offline · last seen ${min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`} ago · entries will sync when back`,
    none: "Not in use",
  },
  billing: "Billing at this point · from today",
  billingNow: (free: boolean, payFirst: boolean) =>
    `${free ? "Free point: every line here is billed as free" : "Charged point"}${payFirst ? " · pay before collecting" : ""}`,
  neverHeld: "An emergency or an admitted patient is never held.",
  billingToday: "Billing changes apply from today.",
  stockHere: "Stock here",
  stockLine: (lines: number, low: number, out: number, value: number | null, clinic: boolean) =>
    `${lines} lines · ${low} low · ${out} out${value ? ` · ${ugx(value)} on hand` : clinic ? " · vaccines, counted in doses" : ""}`,
  shortState: { low: "Low", out: "Out" },
  openMedicines: "Open in Medicines",
  handover: "Handover",
  slotsAria: "Handover times",
  histWhen: (date: string, slot: string) => `${shortDate(date)}, ${slot}`,
  histWho: (from: string, to: string) => `${from} → ${to}`,
  histResult: (at: string | null, d: number) => `${at ?? ""} · ${d ? diffs(d) : "no differences"}`,
  histMissed: "Missed",
  noHandovers: "No handovers yet",
  cold: "Cold chain",
  sensorSub: (sensor: string, at: string | null, min: string) =>
    `Sensor ${sensor} · live${at ? ` ${at}` : ""} · today ${min}`,
  typedSub: (checks: string[], min: string) =>
    `No sensor · typed at ${checks.length ? checks.join(", ") : "no checks yet"} · today ${min}`,
  range: (lo: number | null, hi: number | null) =>
    lo === null || hi === null ? "no readings" : `${lo.toFixed(1)}–${hi.toFixed(1)} °C`,
  coldWarn: (lines: string[]) =>
    `No fridge here, but ${lines.join(", ")} ${lines.length === 1 ? "is" : "are"} kept here. Add a fridge below and keep it at this place, or move the stock.`,
  noColdNeed: "No fridge here, and no cold-chain medicines are kept here.",
  onDutyToday: "On duty today",
  shift: { day: "Day", night: "Night", call: "On call" },
  nobodyRostered: "Nobody rostered.",
  openRoster: "Open the roster",
  close: "Close this place",
  reopen: "Reopen this place",
  guardStock: (n: number) => `Move or issue out its stock first: ${n} lines are still here.`,
  guardHandover: "A handover is open. Finish it first.",
  closedLine: (at: string, by: string, note: string | null) =>
    `Closed ${longDate(at)}${by ? ` by ${by}` : ""}${note ? ` · ${note}` : ""}`,
  cancel: "Cancel",
  save: "Save changes",
  errName: "Give the place a name.",
  errDup: "A place with this name already exists.",
  errStoreSelf: "A store cannot be supplied from itself. Pick its supplier.",
  inChargeOnly: "Only the in-charge changes places.",
  saved: (n: string) => `Saved ${n}`,
  closedFlash: (n: string) => `${n} closed. Its history is kept.`,
  reopened: (n: string) => `${n} reopened`,

  /* B4 add a place */
  add: {
    title: "Add a place",
    namePh: "e.g. Ward 5 · Surgical",
    unit: "Hospital unit",
    ward: "Ward on the hospital hub",
    pickUnit: "Pick the hospital unit this store belongs to.",
    pickWard: "Pick the ward.",
    noUnit: "Every hospital unit is already a place",
    noWard: "Every ward is already a place",
    dispHub: "Made on the hospital hub; it then shows here",
    hint: "Handover times are set from the opening hours: 24 hours → 08:00 and 17:00; day only → 08:00. Change them after adding. Add a fridge in Cold chain if cold-chain medicines will be kept here.",
    submit: "Add place",
    added: (n: string) => `Added ${n}. Set its top-up levels on Medicines.`,
  },

  /* B5 cold chain */
  coldTitle: "Cold chain",
  live: "Live",
  coldNote:
    "2–8 °C. Sensors report every 15 minutes; fridges without one are typed at 08:00 and 17:00.",
  addFridge: "Add a fridge",
  noFridges: "No fridges yet.",
  fridgeName: (code: string, name: string) => `${code} · ${name}`,
  where: (place: string | null, sensor: string | null, at: string | null) =>
    `${place ?? "Not placed yet"}${sensor ? ` · sensor ${sensor}${at ? ` · live ${at}` : ""}` : " · no sensor, typed readings"}`,
  state: { ok: "In range", near: "Near limit", out: "Out of range" },
  gaugeAria: (temp: string, state: string) =>
    `${temp} on a 0 to 10 °C scale, ${state.toLowerCase()}`,
  stats: (range: string, n: number) =>
    `Today ${range} · ${n ? `${n} ${s(n, "excursion", "excursions")}` : "no excursions"} in 7 days`,
  typed: {
    ok: (t: string, temp: number) => `${t} · ${temp.toFixed(1)} °C`,
    late: (t: string) => `${t} · not typed`,
    due: (t: string) => `${t} · due`,
  },
  excursion: (temp: number, day: string, at: string, note: string | null, by: string | null) =>
    `${temp.toFixed(1)} °C at ${at} on ${shortDate(day)}${note ? ` · ${note}` : ""}${by ? ` · checked by ${by}` : ""}`,
  ongoing: "still open",
  record: "Record a reading",
  link: "Link a sensor",
  unlink: "Unlink sensor",
  linkAria: (code: string) => `Link a sensor to ${code}`,
  unlinkAria: (code: string) => `Unlink the sensor from ${code}`,
  keptAt: "Kept at",
  keptAria: (code: string) => `Where ${code} is kept`,
  notPlaced: "Not placed",
  moved: (code: string, place: string | null) =>
    place ? `${code} is now kept at ${place}` : `${code} is not placed anywhere`,
  reading: {
    title: (code: string) => `Record a reading · ${code}`,
    lead: (name: string) =>
      `${name}. Read the thermometer and type the temperature. Readings within 90 minutes of 08:00 or 17:00 count for that check.`,
    time: "Time",
    temp: "Temperature (°C)",
    tempPh: "e.g. 5.2",
    note: "If outside 2–8 °C: what did you do?",
    notePh: "e.g. moved vaccines to CR-01, called the technician",
    outNote: "Outside 2–8 °C. Saving opens an excursion; say what you did below.",
    save: "Save reading",
    errTime: "Type the time as HH:MM.",
    errTemp: "Type the temperature in °C, e.g. 5.2.",
    errNote: "Outside 2–8 °C: say what you did.",
    savedOut: (code: string) => `Saved. Excursion opened for ${code}; the in-charge is told.`,
    saved: (temp: number, t: string) => `Reading saved: ${temp.toFixed(1)} °C at ${t}`,
  },
  sensor: {
    title: (code: string) => `Link a sensor to ${code}`,
    lead: "Type the ID printed on the sensor. Readings then arrive every 15 minutes.",
    label: "Sensor ID",
    ph: "e.g. SN-44C2",
    save: "Link sensor",
    err: "Type the sensor ID.",
    linked: "Sensor linked. Readings arrive every 15 minutes.",
    keyTitle: (code: string) => `Sensor key for ${code}`,
    keyLine: "Copy this key into the sensor now. It is shown only once.",
    keyAria: "Sensor key",
    done: "Done",
    unlinked: (code: string) =>
      `Sensor unlinked from ${code}. Readings will be typed at 08:00 and 17:00.`,
  },
  fridge: {
    title: "Add a fridge",
    lead: "Give it a short ID people will see on the fridge label, then choose where it is kept.",
    id: "Fridge ID",
    idPh: "RF-04",
    kind: "Kind of fridge",
    kindPh: "e.g. Ice-lined fridge",
    save: "Add fridge",
    err: "Give the fridge an ID and say what kind it is.",
    used: (code: string) => `${code} is already used.`,
    added: (code: string) => `Added ${code}. Choose where it is kept.`,
  },

  /* B6 suppliers */
  supTitle: "Suppliers",
  supNote: "The order builder uses the cycle, the lead time and the budget.",
  addSupplier: "Add a supplier",
  noSupplierRows: "No suppliers yet.",
  orderNow: "Order now",
  orderIn: (d: number) => `Order due in ${d} days`,
  terms: (cycle: number, next: string | null, lead: number) =>
    `${cycle ? `Every ${cycle} ${s(cycle, "month", "months")}` : "As needed"}${next ? ` · next cycle ${shortDate(next)}` : ""} · lead time ${lead} days`,
  budget: (used: number, budget: number, period: string | null, pct: number) =>
    `${ugx(used)} of ${ugx(budget)}${period ? ` ${period}` : ""} · ${pct}%`,
  budgetAria: (pct: number, tone: string) => `Budget used ${pct}%${tone ? `, ${tone}` : ""}`,
  budgetTone: { ok: "", warn: "nearly used", bad: "almost all used" },
  contact: (c: string | null, phone: string | null) =>
    `${c || "No contact"}${phone ? ` · ${phone}` : " · no phone saved"}`,
  call: "Call",
  edit: "Edit",
  editAria: (n: string) => `Edit ${n}`,
  sup: {
    titleEdit: (n: string) => `Edit ${n}`,
    titleAdd: "Add a supplier",
    lead: "What they supply, and the terms the order builder uses.",
    name: "Name",
    what: "What they supply",
    cycle: "Order cycle (months; 0 = as needed)",
    next: "Next cycle date",
    noNext: "No date",
    clearNext: "Clear the date",
    lead2: "Lead time (days)",
    budget: "Budget (UGX)",
    used: "Used so far (UGX)",
    period: "Budget period",
    periodPh: "e.g. this cycle",
    contactL: "Contact",
    contactPh: "e.g. Account manager",
    phone: "Phone",
    phoneHint: "Leave empty until the number is confirmed.",
    phoneSaved: (masked: string) =>
      `Saved: ${masked}. Leave this empty to keep it, or type a new number.`,
    save: "Save supplier",
    add: "Add supplier",
    errName: "Give the supplier a name.",
    errUsed: "Used so far is more than the budget.",
    errNumber: "Type whole numbers only.",
    saved: (n: string) => `Saved ${n}`,
    added: (n: string) => `Added ${n}`,
  },
} as const;

import type { RuleModule } from "./index";
import type { SignedCopy } from "@/content/signed-copy";
import type { Built, Kit } from "@/lib/protocols/engine/kit";
import type { Btn, ChartVersion, Interp, Row } from "@/lib/protocols/engine/types";
import { z } from "zod";

import { fill } from "@/content/protocol-charts";
import { QuickRules, supplyOf } from "@/lib/protocols/quick";

/**
 * HHS (adult, JBDS-IP), FEATURES.md §2.2: the prototype's `PC.hhs.build(K)` on the generic kit.
 * Every number is the version's `seed` (0284); the words are HHS_COPY (draft). Insulin is offered
 * only when ketones are over the seed's value or the glucose has plateaued on fluids, and only with
 * a weight (P7). Osmolality (2 Na + glucose + urea) is worked out when a slot is saved (`derive`).
 */

// ponytail: the words live here, not in content/protocol-charts-rules.ts, while three P5 agents
// port in parallel; move HHS_COPY there with the other modules' copy when the lead merges.
export const HHS_COPY = {
  status: "draft",
  signedBy: null,
  signedOn: null,
  short: "HHS",
  seedMissing: "This HHS version has no numbers, so it cannot chart.",
  ph1: "Immediate",
  ph2: "Fluids and targets",
  ph3: "Continue",
  ph4: "Resolve",
  w1: "0 to 60 min",
  w2: "{a} to {b} hours",
  w4: "Beyond {a} hours",
  // a1 confirm
  a1: "Confirm HHS",
  a1Sub:
    "All 4 to confirm. Values come from the latest results; order what is missing. Osmolality is worked out: 2 × sodium + glucose + urea.",
  lglu: "Lab glucose",
  cbg: "Capillary glucose",
  na: "Sodium",
  urea: "Urea",
  ket: "Capillary ketones",
  ph: "Venous pH",
  hco3: "Venous HCO₃⁻",
  k: "Potassium",
  sbp: "Systolic BP",
  pulse: "Pulse",
  hypovHead: "Hypovolaemia on examination (dry mucosa, low BP, fast pulse, little urine)",
  yes: "Yes",
  no: "No",
  c1: "1. Hypovolaemia",
  c2: "2. Glucose {n} mmol/L or more",
  c3: "3. Osmolality {n} mOsm/kg or more",
  c4: "4. No marked ketosis or acidosis: ketones under {ket}, pH {ph} or more, bicarbonate {hco3} or more",
  notAssessed: "not assessed",
  noValue: "no value",
  needsOsm: "needs sodium, glucose and urea",
  osmRow: "Osmolality, 2 × Na + glucose + urea",
  osmHigh: "{v} mOsm/kg · over {n}: high risk",
  osmRange: "{v} mOsm/kg · HHS range",
  osmUnder: "{v} mOsm/kg · under {n}",
  needsOsmRow: "Needs sodium, glucose and urea",
  confirmed: "HHS confirmed: all 4 criteria met.",
  notConfirmed: "Not confirmed yet. If the criteria are not met, think of another cause.",
  mixed:
    "Ketones {n} or more with acidosis: mixed DKA and HHS. Treat the ketoacidosis on the DKA chart, keeping the slower HHS fluid and sodium targets.",
  openDka: "Open the DKA chart",
  confirmedShort: "HHS confirmed · osmolality {v}",
  mixedShort: "Mixed DKA and HHS",
  notConfirmedShort: "Not confirmed yet",
  // a2 high risk
  a2: "High-risk signs: HDU or ICU",
  a2Sub:
    "Any one of these means level 2 care. Also high risk: hypothermia, a new heart attack or stroke, pregnancy.",
  sOsm: "Osmolality over {n} mOsm/kg",
  sNa: "Sodium over {n} mmol/L",
  sPh: "Venous pH under {n}",
  sK: "Potassium under {a} or over {b}",
  sGcs: "GCS under {n}",
  sSpo2: "SpO₂ under {n}% on air",
  sSbp: "Systolic BP under {n} mmHg",
  sPulse: "Pulse over {a} or under {b}",
  sUo: "Urine under {n} ml/kg/hour",
  sCreat: "Creatinine over {n} µmol/L",
  nowIs: "Now: {v}",
  present: "Present",
  notPresent: "Not present",
  sevLine: "High-risk signs: {n}. Senior review and admit to HDU or ICU.",
  noSev: "No high-risk signs on the values so far.",
  hduAt: "HDU or ICU team informed at {t}.",
  seniorAt: "Senior informed at {t}.",
  hduBtn: "HDU or ICU team informed",
  seniorBtn: "Senior informed",
  sevShort: "High-risk signs: {n}",
  hduShort: " · HDU informed {t}",
  noneSoFar: "None so far",
  // a3 fluids
  a3: "IV fluids: the first hour",
  a3Sub: "Fluids alone bring the glucose down. Aim for {aim}.",
  aimEach: "+{a} to {b} L by {h} hours",
  enterSbp: "Enter the systolic BP to choose the branch.",
  shockedThis: "This patient: shocked ({v} mmHg)",
  notShockedThis: "This patient: not shocked ({v} mmHg)",
  brShock: "Systolic under {n}",
  brShockText:
    "Give {ml} ml 0.9% sodium chloride over {min} minutes. Repeat if still under {n}, and call the senior.",
  brOk: "{n} or more",
  brOkText: "Give 1 L 0.9% sodium chloride over 1 hour.",
  bolusGiven: "{ml} ml bolus given",
  bolusN: "{ml} ml bolus {n} given",
  litreStarted: "1 L started now",
  litreAt: "First litre started at {t}.",
  bolusAt: "Bolus {n} at {t}.",
  elderly:
    "Older patient or heart disease: reassess the chest after each litre; slower rates may be needed.",
  noBp: "No BP",
  shockedShort: "Shocked · boluses: {n}",
  notShockedShort: "Not shocked",
  litreShort: " · 1 L started {t}",
  // a4 insulin
  a4: "Insulin: only if needed",
  a4Sub:
    "Do not start insulin straight away unless ketones are over {n} mmol/L. Insulin before enough fluid drops the osmolality too fast: risk of cerebral oedema and collapse.",
  rKet: "Ketones",
  rFall: "Glucose fall",
  rIf: "If started",
  needsValue: "Needs a value",
  fallIs: "{v} mmol/L an hour",
  plateauTag: " · plateau",
  needs2: "Needs 2 readings",
  ifStarted: "{u} units/kg/hour = {r} units/hour = {ml} ml/hour ({s} units in {s} ml)",
  needsWeight: "Needs a weight",
  needsKet: "Needs a ketone result.",
  thisPatient: "This patient",
  brIns: "Ketones over {n}, or glucose stops falling on fluids",
  brInsText:
    "Fixed-rate IV insulin {u} units/kg/hour. If glucose then falls over {f} mmol/L an hour, halve the rate.",
  brNoIns: "Ketones {n} or less, glucose falling",
  brNoInsText: "No insulin yet. Fluids only; recheck hourly.",
  whyKet: "ketones {v}, over {n}",
  whyPlateau: "glucose has stopped falling on fluids",
  startIns: "Start insulin {r} units/hour",
  infusionStarted: "Infusion started now",
  insPrescribed: "Prescribed at {t}; the nurses start the pump.",
  insRunning: "Prescribed at {t}; running since {s}.",
  keepLong: "Keep any long-acting insulin the patient already takes.",
  weightWhy: "for the insulin rate",
  insShort: "{r} units/hour since {t}",
  neededShort: "Needed: {why}",
  notNeeded: "Not needed yet",
  // a5 potassium
  a5: "Potassium",
  a5Sub:
    "Venous potassium decides the potassium chloride in each litre from bag 2. No more than {n} mmol an hour.",
  needsK: "Needs a potassium result.",
  latestK: "Latest potassium {k} mmol/L",
  kNone: "None",
  kEach: "{n} mmol in each litre",
  kSenior: "Senior advice: more potassium is needed",
  kRate: "Potassium chloride at {r} mmol an hour now (no more than {n}).",
  kOver: "Potassium chloride at {r} mmol an hour: over {n}. Slow it or reduce it.",
  anuric: "Anuric at the last check: no potassium chloride.",
  anuricNote: "No potassium chloride if the patient is anuric.",
  kShort: "K {k} → {t}",
  needsKShort: "Needs potassium",
  // a6 tests, cause, protection
  a6: "Tests, cause and protection",
  a6Sub: "Clots and foot ulcers are common in HHS: protect from the start.",
  ecg: "ECG",
  cxr: "Chest X-ray",
  bc: "Blood cultures",
  msu: "Urine microscopy and culture",
  ck: "Creatine kinase (muscle breakdown)",
  trop: "Troponin",
  ct: "CT head",
  vte: "Clot prevention: low-molecular-weight heparin",
  vteSub: "Whole admission unless contraindicated",
  givenAt: "Given {t}",
  notYet: "Not yet",
  given: "Given",
  feet: "Feet: check both heels; heel protectors",
  feetSub: "Check, protect, refer · daily",
  checkedAt: "Checked {t}",
  feetChecked: "Feet checked",
  causeHead: "Cause: pick all that apply",
  causes: [
    "Infection",
    "Heart attack or stroke",
    "Steroids or thiazides",
    "New diabetes",
    "Poor fluid intake",
    "Missed treatment",
  ],
  infection: "Infection",
  onProblems: "On the problem list: {list}. Consider infection.",
  prescribeCause: "Prescribe for the cause",
  causeNotSet: "Cause not set",
  heparinShort: " · heparin given",
  feetShort: " · feet checked",
  // b1 bags
  b1: "IV fluids by the bag",
  b1Sub:
    "Potassium chloride in each bag follows the latest potassium (step 5). Fluid balance comes from the monitoring chart.",
  bag: "Bag {n} · 1 L 0.9% sodium chloride{k}",
  plusK: " + {n} mmol potassium chloride",
  noK: ", no potassium",
  bagSub: "Over {h} h at {r} ml/hour · {a} to {b}",
  upAt: "Up at {t}",
  dueNow: "Due now",
  overdue: "Overdue",
  later: "Later",
  hungNow: "Hung now",
  balRow: "Fluid balance so far",
  balIs: "{b} L (in {i} L, urine {o} L)",
  aimRow: "Aim",
  behind: "Behind the fluid target: speed up if the chest is clear, and review.",
  lessFluid:
    "Less aggressive in heart failure, low body weight or kidney failure with little urine.",
  balShort: "{b} L so far",
  nextBag: " · bag {n} at {t}",
  // b2 targets
  b2: "Treatment targets",
  b2Sub:
    "Worked out from the monitoring chart. A rise in sodium early on is expected as the glucose falls; it is not a reason to change the fluid if the osmolality is falling.",
  tGlu: "Glucose falls no more than {n} mmol/L an hour",
  tOsm: "Osmolality falls {a} to {b} mOsm/kg an hour",
  tNa: "Sodium falls no more than {n} mmol/L in 24 hours",
  uGlu: "mmol/L an hour",
  uOsm: "mOsm/kg an hour",
  uNa: "mmol/L so far",
  met: " · met",
  notMet: " · not met",
  gFastIns: "Glucose falling over {n} mmol/L an hour: halve the insulin rate.",
  gFastNo: "Glucose falling over {n} mmol/L an hour: slow the fluids and review.",
  oFast: "Osmolality falling over {n} an hour: slow the fluids (and the insulin, if running).",
  oSlow:
    "Osmolality falling under {n} an hour despite +{l} L: consider 0.45% sodium chloride, with the senior.",
  naFast: "Sodium has fallen over {n} mmol/L: slow the correction now.",
  plateau: "Glucose has stopped falling on fluids: start insulin (step 4).",
  slowAt: "Fluids slowed at {t}.",
  halfAt: "Switched to 0.45% sodium chloride at {t}.",
  slowBtn: "Fluids slowed",
  halfBtn: "Switch to 0.45% sodium chloride",
  tMet: "{m} of {n} targets met",
  // d1 glucose
  d1: "Fluids continue; add glucose when low",
  glucLow:
    "Glucose {v}, under {n}: start 10% glucose at {r} ml/hour alongside the sodium chloride.",
  glucOn: "Glucose {v}, under {n}: 10% glucose running at {r} ml/hour since {t}.",
  glucRule:
    "When glucose is under {n} mmol/L, add 10% glucose at {r} ml/hour. Keep it between {a} and {b}.",
  glucStarted: "10% glucose started",
  glucShort: "10% glucose running",
  glucIs: "Glucose {v}",
  // d2 reassess
  d2: "Reassess and refer",
  cv: "Reassess circulation, urine and mental state",
  cvSub: "Pulse, BP, urine at least {n} ml/kg/hour, confusion",
  doneAt: "Done {t}",
  toDo: "To do",
  done: "Done",
  ref: "Refer to the diabetes team",
  refSub: "As early as possible",
  referredAt: "Referred {t}",
  referred: "Referred",
  mg: "Magnesium, calcium and phosphate",
  mgSub: "Correct if low",
  mgWord: "With the U&Es",
  reassessedShort: "reassessed {t}",
  referredShort: "referred {t}",
  // e1 resolve
  e1: "Resolution",
  e1Sub:
    "Full recovery of the biochemistry can take up to {n} hours. Continue IV fluids until eating and drinking.",
  rOsm: "Osmolality under {n} mOsm/kg",
  rUo: "Urine at least {n} ml/kg/hour",
  rMind: "Mental state back to usual",
  rGlu: "Glucose under {n} mmol/L",
  noUo: "no urine charted",
  uoIs: "{v} ml/kg/hour",
  mindHead: "Mental state",
  minds: ["Back to usual", "Still confused"],
  resolvedChoose: "Resolved. Choose the next step:",
  whenResolves: "When it resolves:",
  eating: "Eating and drinking",
  scText:
    "Subcutaneous insulin or tablets, with the diabetes team. Keep the heparin until discharge.",
  chosen: "Chosen",
  toSc: "Switch to SC insulin or tablets",
  prescribe: "Prescribe",
  resolvedLine: "HHS has resolved. Inform the diabetes team.",
  review24:
    "{n} hours and not resolved: keep going, but get a senior review; recovery can take up to {m} hours.",
  keepHeparin: "Keep the heparin and daily foot checks until discharge.",
  resolvedShort: "Resolved",
  // rn card
  rnTitle: "Fluid status and feet",
  rnNote: "Tap each one as you reassess it. The time is kept.",
  check: "Check",
  vs: ["Heart rate", "Blood pressure", "Urine output", "Chest", "Mental state"],
  heels: "Heels and feet",
  heelsSub: "Daily: check, protect, refer",
  // flow
  fConfirm: "HHS confirmed? All 4 criteria",
  fContinue: "Continue the chart",
  fMixed: "Mixed with DKA",
  fMixedSub: "Ketones {n}+, acidosis → DKA chart",
  fOsm: "Osmolality {v}",
  fSevere: "High-risk signs?",
  fHduN: "{n} → HDU or ICU",
  fHdu: "HDU or ICU",
  fWard: "Ward, monitored bed",
  fShock: "Systolic under {n}?",
  fBoluses: "{ml} ml boluses",
  fLitre: "1 L over 1 hour",
  fSystolic: "Systolic {v}",
  fIns: "Ketones over {n}, or glucose plateau?",
  fInsYes: "Insulin {u} units/kg/h",
  fInsNo: "Fluids only",
  fK: "Potassium?",
  fLatest: "Latest {v}",
  fTests: "Tests, cause, heparin, feet",
  fBags: "Fluids by the bag",
  fTargets: "Targets met? {m} of {n}",
  fKeep: "Keep going",
  fOff: "Too fast: slow · osmolality stuck: 0.45% · glucose stuck: insulin ↺",
  fGluc: "Glucose under {n}?",
  fGlucYes: "10% glucose {r} ml/h",
  fGlucNo: "Sodium chloride only",
  fReassess: "Reassess and refer",
  fResolved: "Resolved? Osmolality under {n}, urine, mind, glucose",
  fSc: "SC insulin or tablets",
  fOn: "Continue; up to {n} h",
  // tasks
  tBolus: "Give {ml} ml 0.9% sodium chloride over {min} minutes",
  tBolusSub: "Systolic {v}. Repeat if still under {n}.",
  tLitre: "Start 1 L 0.9% sodium chloride over 1 hour",
  tLitreSub: "Bag 1 at {r} ml/hour",
  tIns: "Start the insulin infusion at {ml} ml/hour",
  tInsSub: "Soluble insulin {s} units in {s} ml 0.9% sodium chloride ({u} unit/ml)",
  tBag: "Hang bag {n}: 1 L 0.9% sodium chloride{k}",
  tBagSub: "At {r} ml/hour",
  tGluc: "Start 10% glucose at {r} ml/hour",
  tGlucSub: "Glucose {v}, under {n}",
  tHypo: "Treat hypoglycaemia now: glucose {v}",
  tHypoSub: "{ml} ml 10% glucose IV over 15 minutes; recheck in {m} minutes",
  hypoTreated: "Hypo treated",
  tVte: "Give the clot prevention injection",
  tVteSub: "Low-molecular-weight heparin, as prescribed",
  tFeet: "Check both feet and heels; heel protectors",
  tFeetSub: "Daily",
  // monitoring chart
  gCbg: "Glucose, mmol/L",
  gOsm: "Osmolality",
  gNa: "Sodium",
  gK: "Potassium",
  gUrea: "Urea",
  gNacl: "0.9% NaCl, ml/h",
  gIns: "Insulin, ml/h",
  gGluc: "10% glucose, ml/h",
  gUo: "Urine, ml/h",
  fmCbg: "Glucose",
  fmNacl: "0.9% NaCl",
  fmIns: "Insulin",
  fmGluc: "10% glucose",
  fmUo: "Urine",
  fmNa: "Sodium",
  fmK: "Potassium",
  fmUrea: "Urea",
  recWhat: "glucose, fluids, urine",
  recLabs: ", sodium, potassium, urea",
  recHintYes:
    "Rates come from the chart. Bloods due this hour: yes, add sodium, potassium and urea; osmolality is worked out.",
  recHintNo: "Rates come from the chart. Bloods due this hour: no, leave them empty.",
  pCbg: "Capillary glucose",
  pOsm: "Osmolality",
  pNa: "Sodium",
  pK: "Potassium",
  thrGluc: "Under {n}: add 10% glucose",
  thrOsm: "Over {n}: HHS range",
  thrOsmOk: "Under {n}: resolved",
  thrNa: "Lowest safe in 24 h",
  thrKHigh: "Over {n}: no KCl",
  thrKLow: "Under {n}: senior",
  tooFast: "Too fast",
  tooSlow: "Too slow",
  onTarget: "On target",
  needs2v: "Needs 2 values",
  naFastWord: "Falling too fast",
  within: "Within limits",
  osmWord: "HHS range",
  osmHighWord: "High risk",
  osmOkWord: "Resolved range",
  lowWord: "Low",
  sGlucose: "Glucose",
  sOsmo: "Osmolality",
  sBal: "Fluid balance",
  sIns: "Insulin",
  sResolved: "Resolved",
  hourN: "Hour {n}",
  baseline: "Baseline",
  aimBy: "Aim +{a} to {b} L by {h} h",
  unitsH: "{r} units/h",
  none: "None",
  sinceAt: "Since {t}",
  needed: "Needed",
  notYetWord: "Not yet",
  resolvedRule: "Osmolality under {n}",
  medsNote:
    "Collect at the ward. With no IV line on record, the nurses get a task to insert a cannula.",
  phNacl: "0.9% sodium chloride",
  phBags: "{n} of {of} bags up.",
  phNext: " Next: bag {n} at {t}.",
  phIns: "Insulin",
  phInsOn: "Running at {r} units/hour: one {s} ml syringe lasts about {h} hours.",
  phInsNeeded: "Needed now: {why}.",
  phInsNot: "Not needed yet. In HHS insulin starts only if ketotic or the glucose plateaus.",
  phKcl: "Potassium chloride",
  phKclIs: "{n} mmol a litre (potassium {k}).",
  phKclNone: "None for now (potassium {k}).",
  waitingK: "Waiting for a potassium.",
  phHep: "Heparin",
  phHepIs:
    "Prophylactic low-molecular-weight heparin for the whole admission: prescribed separately in Prescribe.",
  log: {
    fluid1At: "First litre started",
    bolus: "Bolus given",
    insOrder: "Insulin prescribed",
    insAt: "Insulin infusion started",
    hdu: "HDU or ICU team informed",
    senior: "Senior informed",
    glucAt: "10% glucose started",
    feet: "Feet checked",
    vte: "Clot prevention given",
    ref: "Referred to the diabetes team",
    cv6: "Circulation, urine and mental state reassessed",
    hypoAt: "Hypoglycaemia treated",
    half: "Switched to 0.45% sodium chloride",
    slow: "Fluids slowed",
    hypov: "Hypovolaemia",
    precip: "Cause",
    mind: "Mental state",
    next: "Next step",
  },
} as const satisfies SignedCopy & Record<string, unknown>;
const W = HHS_COPY;

const num = z.number().finite();
const Band = z.object({
  gt: num.optional(),
  gte: num.optional(),
  lt: num.optional(),
  lte: num.optional(),
  range: z.string(),
  kclMmolL: num,
  senior: z.boolean().optional(),
});
export const HhsSeed = z.object({
  phases: z.array(z.object({ id: z.string(), from: num, to: num.nullable() })).length(4),
  confirm: z.object({
    glucoseFrom: num,
    osmFrom: num,
    ketonesUnder: num,
    phFrom: num,
    hco3From: num,
  }),
  severe: z.object({
    osmOver: num,
    naOver: num,
    phUnder: num,
    kUnder: num,
    kOver: num,
    gcsUnder: num,
    spo2Under: num,
    sbpUnder: num,
    pulseOver: num,
    pulseUnder: num,
    urineMlKgHUnder: num,
    creatOver: num,
  }),
  shock: z.object({ sbpUnder: num, bolusMl: num, bolusMinutes: num, boluses: num }),
  bagMl: num,
  bags: z.array(z.object({ from: num, to: num, mlH: num })).min(2),
  balance: z.array(z.object({ byH: num, fromL: num, toL: num })).min(1),
  insulin: z.object({
    unitsPerKgH: num,
    minUnitsH: num,
    ketonesOver: num,
    plateauUnderH: num,
    unitsPerMl: num,
    syringeMl: num,
  }),
  kBands: z.array(Band).min(1),
  kMaxMmolH: num,
  glucose: z.object({ addUnder: num, mlH: num, keepFrom: num, keepTo: num }),
  hypo: z.object({ under: num, ml: num, recheckMinutes: num }),
  targets: z.object({
    glucoseFallMaxH: num,
    osmFallMinH: num,
    osmFallMaxH: num,
    naFallMax24h: num,
    halfFromL: num,
  }),
  monitor: z.object({ labH: z.array(num), overdueMinutes: num }),
  feetEveryH: num,
  caution: z.object({ elderlyFrom: num }),
  resolve: z.object({
    osmUnder: num,
    urineMlKgHFrom: num,
    glucoseUnder: num,
    reviewAtH: num,
    recoveryH: num,
  }),
  refs: z.record(z.string(), z.unknown()),
});
export type HhsSeed = z.infer<typeof HhsSeed>;

const hhs: RuleModule = {
  id: "hhs",
  short: () => W.short,
  check: (v: ChartVersion) =>
    (v.rules as { module?: string | null } | null)?.module === "hhs" &&
    HhsSeed.safeParse(v.seed).success &&
    QuickRules.safeParse(v.rules).success
      ? null
      : W.seedMissing,
  build: (K) => buildHhs(K),
};
export default hhs;

const inBand = (b: z.infer<typeof Band>, x: number) =>
  (b.gt == null || x > b.gt) &&
  (b.gte == null || x >= b.gte) &&
  (b.lt == null || x < b.lt) &&
  (b.lte == null || x <= b.lte);
const r1 = (x: number) => Math.round(x * 10) / 10;
/** 2 × Na + glucose + urea, to one decimal; null when any is missing. */
export const osmOf = (na: number | null, g: number | null, u: number | null) =>
  na !== null && g !== null && u !== null ? r1(2 * na + g + u) : null;
const numOrNull = (x: string | undefined, dflt: number | null) => {
  if (x === undefined) return dflt;
  const n = parseFloat(x);
  return Number.isNaN(n) ? null : n;
};

export function buildHhs(K: Kit): Built {
  const S = HhsSeed.parse(K.version.seed);
  const rules = QuickRules.parse(K.version.rules);
  const { v, T, c, facts: p, now, hNow, w, due, hh, L, A, btn, st, mark, fld, it, row, val } = K;
  const pf = { ageYears: p.ageYears, sex: p.sex, weightKg: p.weightKg, pregnant: p.pregnant };
  const hrs = (slots: number) => (slots * K.slotMin) / 60;
  const signed = (x: number) => `${x >= 0 ? "+" : ""}${x}`;

  // ─── Immediate ───
  const CF = S.confirm;
  const glu0 = val("lglu") ?? val("cbg");
  const na0 = val("na");
  const osm0 = osmOf(na0, glu0, val("urea"));
  const ket = val("ket");
  const ph = val("ph");
  const hco3 = val("hco3");
  const hyp = v.hypov ?? "";
  const acid = (ph !== null && ph < CF.phFrom) || (hco3 !== null && hco3 < CF.hco3From);
  const c1 = glu0 !== null && glu0 >= CF.glucoseFrom;
  const c2 = osm0 !== null && osm0 >= CF.osmFrom;
  const c3 = ket !== null && ket < CF.ketonesUnder && !acid;
  const c4 = hyp === W.yes;
  const confirmed = c1 && c2 && c3 && c4;
  const mixed = ket !== null && ket >= CF.ketonesUnder && acid;
  const sbp = val("sbp");
  const pulse = val("pulse");
  const gcs = val("gcs");
  const spo2 = val("spo2");
  const k = K.latest("k");
  const uoL = K.lastObs("uo");
  const uoKg = uoL && w ? parseFloat(uoL.values.uo!) / w : null;
  const SV = S.severe;
  const kNow = val("k");
  const creat = val("creat");
  const SEV: [string, boolean, string | number | null][] = [
    [fill(W.sOsm, { n: SV.osmOver }), osm0 !== null && osm0 > SV.osmOver, osm0],
    [fill(W.sNa, { n: SV.naOver }), na0 !== null && na0 > SV.naOver, na0],
    [fill(W.sPh, { n: SV.phUnder }), ph !== null && ph < SV.phUnder, ph],
    [
      fill(W.sK, { a: SV.kUnder, b: SV.kOver }),
      kNow !== null && (kNow < SV.kUnder || kNow > SV.kOver),
      kNow,
    ],
    [fill(W.sGcs, { n: SV.gcsUnder }), gcs !== null && gcs < SV.gcsUnder, gcs],
    [fill(W.sSpo2, { n: SV.spo2Under }), spo2 !== null && spo2 < SV.spo2Under, spo2],
    [fill(W.sSbp, { n: SV.sbpUnder }), sbp !== null && sbp < SV.sbpUnder, sbp],
    [
      fill(W.sPulse, { a: SV.pulseOver, b: SV.pulseUnder }),
      pulse !== null && (pulse > SV.pulseOver || pulse < SV.pulseUnder),
      pulse,
    ],
    [
      fill(W.sUo, { n: SV.urineMlKgHUnder }),
      uoKg !== null && uoKg < SV.urineMlKgHUnder,
      uoKg !== null ? K.n1(uoKg) : null,
    ],
    [fill(W.sCreat, { n: SV.creatOver }), creat !== null && creat > SV.creatOver, creat],
  ];
  const sev = SEV.filter((x) => x[1]);

  const a1 = A(
    {
      n: 1,
      title: W.a1,
      sub: W.a1Sub,
      fields: [
        fld("lglu", W.lglu, "mmol/L"),
        fld("cbg", W.cbg, "mmol/L"),
        fld("na", W.na, "mmol/L"),
        fld("urea", W.urea, "mmol/L"),
        fld("ket", W.ket, "mmol/L"),
        fld("ph", W.ph, ""),
        fld("hco3", W.hco3, "mmol/L"),
      ],
      chipHead: W.hypovHead,
      chips: K.pick1("hypov", [W.yes, W.no]),
      chipWho: "dr",
      crit: [
        K.crit(W.c1, hyp || W.notAssessed, c4, !!hyp),
        K.crit(
          fill(W.c2, { n: CF.glucoseFrom }),
          glu0 !== null ? `${glu0} mmol/L` : W.noValue,
          c1,
          glu0 !== null,
        ),
        K.crit(
          fill(W.c3, { n: CF.osmFrom }),
          osm0 !== null ? `${osm0} mOsm/kg` : W.needsOsm,
          c2,
          osm0 !== null,
        ),
        K.crit(
          fill(W.c4, { ket: CF.ketonesUnder, ph: CF.phFrom, hco3: CF.hco3From }),
          [
            ket !== null ? `ketones ${ket}` : "",
            ph !== null ? `pH ${ph}` : "",
            hco3 !== null ? `HCO₃ ${hco3}` : "",
          ]
            .filter(Boolean)
            .join(" · ") || W.noValue,
          c3,
          ket !== null,
        ),
      ],
      rows: [
        row(
          W.osmRow,
          osm0 === null
            ? W.needsOsmRow
            : osm0 > SV.osmOver
              ? fill(W.osmHigh, { v: osm0, n: SV.osmOver })
              : osm0 >= CF.osmFrom
                ? fill(W.osmRange, { v: osm0 })
                : fill(W.osmUnder, { v: osm0, n: CF.osmFrom }),
          osm0 !== null && osm0 >= CF.osmFrom ? "warn" : undefined,
        ),
      ],
      btns: [
        ...K.orderMissing(["lglu", "na", "urea", "ket", "ph", "hco3"]),
        ...(mixed ? [btn(W.openDka, { t: "proto", id: "dka" }, "dr")] : []),
      ],
      lines: [
        confirmed ? L(W.confirmed, "ok") : L(W.notConfirmed, "warn"),
        ...(mixed ? [L(fill(W.mixed, { n: CF.ketonesUnder }), "alert")] : []),
      ],
    },
    st(confirmed, mixed || (!confirmed && glu0 !== null && osm0 !== null && ket !== null && !!hyp)),
  );
  a1.brief = confirmed
    ? fill(W.confirmedShort, { v: osm0! })
    : mixed
      ? W.mixedShort
      : W.notConfirmedShort;

  const a2 = A(
    {
      n: 2,
      title: W.a2,
      sub: W.a2Sub,
      items: SEV.map(([name, hit, now2]) =>
        it(
          name,
          fill(W.nowIs, { v: now2 ?? W.noValue }),
          hit ? W.present : W.notPresent,
          hit ? "alert" : "na",
        ),
      ),
      lines: [
        sev.length
          ? L(fill(W.sevLine, { n: sev.length }), T.hdu ? "warn" : "alert")
          : L(W.noSev, "ok"),
        ...(T.hdu ? [L(fill(W.hduAt, { t: hh(T.hdu) }), "ok")] : []),
        ...(T.senior ? [L(fill(W.seniorAt, { t: hh(T.senior) }), "ok")] : []),
      ],
      btns: [
        ...(sev.length && !T.hdu ? [btn(W.hduBtn, mark("hdu"), "dr", "main")] : []),
        ...(T.senior ? [] : [btn(W.seniorBtn, mark("senior"), "dr")]),
      ],
    },
    st(sev.length ? !!T.hdu : !!T.senior, sev.length > 0 && !T.hdu),
  );
  a2.brief = sev.length
    ? fill(W.sevShort, { n: sev.length }) + (T.hdu ? fill(W.hduShort, { t: hh(T.hdu) }) : "")
    : W.noneSoFar;

  const SH = S.shock;
  const shocked = sbp !== null && sbp < SH.sbpUnder;
  const bol = K.gv("bolus");
  const aimText = S.balance
    .map((b) => fill(W.aimEach, { a: b.fromL, b: b.toL, h: b.byH }))
    .join(" · ");
  const elderly =
    (p.ageYears ?? 0) >= S.caution.elderlyFrom || p.problems.some((x) => /heart failure/i.test(x));
  const bolusBtn = btn(
    bol.length
      ? fill(W.bolusN, { ml: SH.bolusMl, n: bol.length + 1 })
      : fill(W.bolusGiven, { ml: SH.bolusMl }),
    K.give("bolus"),
    "rn",
    "main",
  );
  const a3 = A(
    {
      n: 3,
      title: W.a3,
      sub: fill(W.a3Sub, { aim: aimText }),
      fields: [fld("sbp", W.sbp, "mmHg"), fld("pulse", W.pulse, "/min")],
      branchHead:
        sbp === null ? W.enterSbp : fill(shocked ? W.shockedThis : W.notShockedThis, { v: sbp }),
      branches: [
        K.br(
          fill(W.brShock, { n: SH.sbpUnder }),
          fill(W.brShockText, { ml: SH.bolusMl, min: SH.bolusMinutes, n: SH.sbpUnder }),
          shocked,
          sbp !== null,
          true,
        ),
        K.br(fill(W.brOk, { n: SH.sbpUnder }), W.brOkText, sbp !== null && !shocked, sbp !== null),
      ],
      btns: [
        ...K.ivBtn(),
        ...(shocked
          ? [bolusBtn]
          : T.fluid1At
            ? []
            : [btn(W.litreStarted, mark("fluid1At"), "rn", "main")]),
      ],
      lines: [
        K.ivLine(),
        ...(T.fluid1At ? [L(fill(W.litreAt, { t: hh(T.fluid1At) }), "ok")] : []),
        ...bol.map((t, i) => L(fill(W.bolusAt, { n: i + 1, t: hh(t) }), "ok")),
        ...(elderly ? [L(W.elderly, "warn")] : []),
      ],
    },
    st(shocked ? bol.length > 0 : !!T.fluid1At, shocked && !bol.length),
  );
  a3.brief =
    sbp === null
      ? W.noBp
      : shocked
        ? fill(W.shockedShort, { n: bol.length })
        : W.notShockedShort + (T.fluid1At ? fill(W.litreShort, { t: hh(T.fluid1At) }) : "");

  const I = S.insulin;
  const insR = Math.max(I.minUnitsH, Math.round(I.unitsPerKgH * w));
  const insMl = K.n1(insR / I.unitsPerMl);
  const gF = K.perH("cbg", -1);
  const last2 = K.ptsOf("cbg").slice(-2);
  const plateau =
    last2.length === 2 &&
    last2[1]!.h > last2[0]!.h &&
    (last2[0]!.v - last2[1]!.v) / hrs(last2[1]!.h - last2[0]!.h) < I.plateauUnderH;
  const ketotic = ket !== null && ket > I.ketonesOver;
  const insWhy = ketotic
    ? fill(W.whyKet, { v: ket!, n: I.ketonesOver })
    : plateau
      ? W.whyPlateau
      : "";
  const a4 = A(
    {
      n: 4,
      title: W.a4,
      sub: fill(W.a4Sub, { n: I.ketonesOver }),
      rows: [
        row(W.rKet, ket !== null ? `${ket} mmol/L` : W.needsValue, ketotic ? "warn" : undefined),
        row(
          W.rFall,
          gF !== null ? fill(W.fallIs, { v: gF }) + (plateau ? W.plateauTag : "") : W.needs2,
        ),
        row(
          W.rIf,
          w
            ? fill(W.ifStarted, { u: I.unitsPerKgH, r: insR, ml: insMl, s: I.syringeMl })
            : W.needsWeight,
          "strong",
        ),
      ],
      branchHead: ket === null && !plateau ? W.needsKet : W.thisPatient,
      branches: [
        K.br(
          fill(W.brIns, { n: I.ketonesOver }),
          fill(W.brInsText, { u: I.unitsPerKgH, f: S.targets.glucoseFallMaxH }),
          !!insWhy,
          ket !== null || plateau,
        ),
        K.br(
          fill(W.brNoIns, { n: I.ketonesOver }),
          W.brNoInsText,
          ket !== null && !insWhy,
          ket !== null,
        ),
      ],
      // P7: the rate is per kg, so a weight comes first.
      btns:
        insWhy && !T.insOrder && w
          ? [btn(fill(W.startIns, { r: insR }), mark("insOrder"), "dr", "main")]
          : T.insOrder && !T.insAt
            ? [btn(W.infusionStarted, mark("insAt"), "rn", "main")]
            : [],
      lines: T.insOrder
        ? [
            L(
              T.insAt
                ? fill(W.insRunning, { t: hh(T.insOrder), s: hh(T.insAt) })
                : fill(W.insPrescribed, { t: hh(T.insOrder) }),
              T.insAt ? "ok" : "warn",
            ),
          ]
        : [L(W.keepLong)],
    },
    st(insWhy ? !!T.insAt : ket !== null, !!insWhy && !T.insOrder),
  );
  a4.fields = K.wtBits(W.weightWhy).fields;
  a4.brief = T.insAt
    ? fill(W.insShort, { r: insR, t: hh(T.insAt) })
    : insWhy
      ? fill(W.neededShort, { why: insWhy })
      : W.notNeeded;

  const kb = k !== null ? (S.kBands.find((b) => inBand(b, k)) ?? null) : null;
  const anuric = !!uoL && parseFloat(uoL.values.uo!) === 0;
  const bagOf = (h: number) =>
    S.bags.find((b) => h >= b.from && h < b.to) ?? S.bags[S.bags.length - 1]!;
  const kAdd = kb ? kb.kclMmolL : null;
  // Potassium goes in from bag 2.
  const kPerH =
    kb && !anuric && S.bags.indexOf(bagOf(hNow)) > 0
      ? r1((kb.kclMmolL * bagOf(hNow).mlH) / S.bagMl)
      : 0;
  const kText = (b: (typeof S.kBands)[number]) =>
    b.senior ? W.kSenior : b.kclMmolL ? fill(W.kEach, { n: b.kclMmolL }) : W.kNone;
  const a5 = A(
    {
      n: 5,
      title: W.a5,
      sub: fill(W.a5Sub, { n: S.kMaxMmolH }),
      fields: [fld("k", W.k, "mmol/L")],
      branchHead: k === null ? W.needsK : fill(W.latestK, { k }),
      branches: S.kBands.map((b) =>
        K.br(`${b.range} mmol/L`, kText(b), b === kb, !!kb, !!b.senior),
      ),
      lines: [
        anuric ? L(W.anuric, "alert") : L(W.anuricNote),
        ...(kPerH
          ? [
              kPerH > S.kMaxMmolH
                ? L(fill(W.kOver, { r: kPerH, n: S.kMaxMmolH }), "alert")
                : L(fill(W.kRate, { r: kPerH, n: S.kMaxMmolH })),
            ]
          : []),
      ],
      btns: K.orderMissing(["k"]),
    },
    st(!!kb && !anuric, !!kb?.senior || anuric),
  );
  a5.brief = k !== null && kb ? fill(W.kShort, { k, t: kText(kb).toLowerCase() }) : W.needsKShort;

  const INV: [string, string, boolean?][] = [
    ["ecg", W.ecg],
    ["cxr", W.cxr],
    ["bc", W.bc],
    ["msu", W.msu],
    ["ck", W.ck, true],
    ["trop", W.trop, true],
    ["ct", W.ct, true],
  ];
  const feetDue = !T.feet || now - T.feet > S.feetEveryH * 3600000;
  const feetBtn = btn(W.feetChecked, mark("feet"), "rn", feetDue ? "main" : undefined);
  const infProbs = p.problems.filter((x) => /infection|pneumonia|sepsis/i.test(x));
  const causes = K.many("precip");
  const a6 = A(
    {
      n: 6,
      title: W.a6,
      sub: W.a6Sub,
      items: [
        ...K.invItems(INV),
        it(
          W.vte,
          W.vteSub,
          T.vte ? fill(W.givenAt, { t: hh(T.vte) }) : W.notYet,
          T.vte ? "done" : "todo",
          T.vte ? [] : [btn(W.given, mark("vte"), "rn", "main")],
        ),
        it(
          W.feet,
          W.feetSub,
          T.feet ? fill(W.checkedAt, { t: hh(T.feet) }) : W.notYet,
          T.feet && !feetDue ? "done" : "todo",
          [feetBtn],
        ),
      ],
      chipHead: W.causeHead,
      chips: K.pickN("precip", W.causes),
      chipWho: "dr",
      btns: causes.length ? [btn(W.prescribeCause, { t: "rx" }, "dr")] : [],
      lines:
        infProbs.length && !causes.includes(W.infection)
          ? [L(fill(W.onProblems, { list: infProbs.join(", ") }), "warn")]
          : [],
    },
    st(K.invDone(INV) && !!T.vte && !!T.feet && causes.length > 0, false),
  );
  a6.brief =
    (causes.join(", ") || W.causeNotSet) +
    (T.vte ? W.heparinShort : "") +
    (T.feet ? W.feetShort : "");

  // ─── Fluids and targets ───
  const PH = S.phases;
  const bagUp = (i: number) => (i === 0 ? T.fluid1At : T[`bag${i}`]);
  const bagIdx = (from: number, to: number | null) =>
    S.bags.flatMap((b, i) => (i > 0 && b.from >= from && (to === null || b.from < to) ? [i] : []));
  const bagRows = (idx: number[]) =>
    idx.map((i) => {
      const b = S.bags[i]!;
      const up = bagUp(i);
      const running = hNow >= b.from && hNow < b.to;
      return it(
        fill(W.bag, { n: i + 1, k: kAdd ? fill(W.plusK, { n: kAdd }) : kAdd === 0 ? W.noK : "" }),
        fill(W.bagSub, { h: hrs(b.to - b.from), r: b.mlH, a: hh(due(b.from)), b: hh(due(b.to)) }),
        up
          ? fill(W.upAt, { t: hh(up) })
          : running
            ? W.dueNow
            : due(b.from) < now
              ? W.overdue
              : W.later,
        up ? "done" : running || due(b.from) < now ? "alert" : "todo",
        up ? [] : [btn(W.hungNow, mark(`bag${i}`), "rn", running ? "main" : undefined)],
      );
    });
  const slotH = hrs(1);
  const inMl =
    K.obs.reduce(
      (a, o) => a + ((parseFloat(o.values.nacl!) || 0) + (parseFloat(o.values.gluc!) || 0)) * slotH,
      0,
    ) +
    bol.length * SH.bolusMl;
  const outMl = K.obs.reduce((a, o) => a + (parseFloat(o.values.uo!) || 0), 0);
  const bal = Math.round((inMl - outMl) / 100) / 10;
  const hoursNow = hrs(hNow);
  const lowBal = S.balance.some((b) => hoursNow >= b.byH && bal < b.fromL);
  const lateBag = (i: number) => !bagUp(i) && due(S.bags[i]!.from) < now;
  const midIdx = bagIdx(PH[1]!.from, PH[2]!.from);
  const b1 = A(
    {
      n: 1,
      title: W.b1,
      sub: W.b1Sub,
      items: bagRows(midIdx),
      rows: [
        row(
          W.balRow,
          fill(W.balIs, { b: signed(bal), i: r1(inMl / 1000), o: r1(outMl / 1000) }),
          lowBal ? "warn" : undefined,
        ),
        row(W.aimRow, aimText),
      ],
      lines: [lowBal ? L(W.behind, "alert") : L(W.lessFluid)],
    },
    st(
      midIdx.every((i) => bagUp(i) || due(S.bags[i]!.from) > now),
      midIdx.some(lateBag) || lowBal,
    ),
  );
  const nb = S.bags.findIndex((_, i) => i > 0 && !bagUp(i));
  b1.brief =
    fill(W.balShort, { b: signed(bal) }) +
    (nb > 0 ? fill(W.nextBag, { n: nb + 1, t: hh(due(S.bags[nb]!.from)) }) : "");

  const TG = S.targets;
  const oP = K.ptsOf("osm");
  const naP = K.ptsOf("na");
  const oF = K.perH("osm", -1);
  const naDrop = naP.length >= 2 ? r1(naP[0]!.v - naP[naP.length - 1]!.v) : null;
  const gFast = gF !== null && gF > TG.glucoseFallMaxH;
  const oFast = oF !== null && oF > TG.osmFallMaxH;
  const oSlow = oF !== null && oF < TG.osmFallMinH && bal >= TG.halfFromL;
  const naFast = naDrop !== null && naDrop > TG.naFallMax24h;
  const targets = [
    {
      word: fill(W.tGlu, { n: TG.glucoseFallMaxH }),
      r: gF,
      ok: gF !== null && !gFast,
      unit: W.uGlu,
    },
    {
      word: fill(W.tOsm, { a: TG.osmFallMinH, b: TG.osmFallMaxH }),
      r: oF,
      ok: oF !== null && oF >= TG.osmFallMinH && oF <= TG.osmFallMaxH,
      unit: W.uOsm,
    },
    {
      word: fill(W.tNa, { n: TG.naFallMax24h }),
      r: naDrop,
      ok: naDrop !== null && !naFast,
      unit: W.uNa,
    },
  ];
  const tMet = targets.filter((t) => t.ok).length;
  const tKnown = targets.filter((t) => t.r !== null).length;
  const b2 = A(
    {
      n: 2,
      title: W.b2,
      sub: W.b2Sub,
      rows: targets.map((t) =>
        row(
          t.word,
          t.r === null
            ? W.needs2
            : `${t.r < 0 ? "−" : ""}${Math.abs(t.r)} ${t.unit}${t.ok ? W.met : W.notMet}`,
          t.r === null ? undefined : t.ok ? "okv" : "warn",
        ),
      ),
      lines: [
        ...(gFast
          ? [L(fill(T.insAt ? W.gFastIns : W.gFastNo, { n: TG.glucoseFallMaxH }), "alert")]
          : []),
        ...(oFast ? [L(fill(W.oFast, { n: TG.osmFallMaxH }), "alert")] : []),
        ...(oSlow ? [L(fill(W.oSlow, { n: TG.osmFallMinH, l: TG.halfFromL }), "warn")] : []),
        ...(naFast ? [L(fill(W.naFast, { n: TG.naFallMax24h }), "alert")] : []),
        ...(plateau && !T.insOrder ? [L(W.plateau, "alert")] : []),
        ...(T.slow ? [L(fill(W.slowAt, { t: hh(T.slow) }), "ok")] : []),
        ...(T.half ? [L(fill(W.halfAt, { t: hh(T.half) }), "ok")] : []),
      ],
      btns:
        (oFast || gFast) && !T.slow
          ? [btn(W.slowBtn, mark("slow"), "dr", "main")]
          : oSlow && !T.half
            ? [btn(W.halfBtn, mark("half"), "dr")]
            : [],
    },
    st(
      tKnown === targets.length && tMet === targets.length,
      gFast || oFast || naFast || (plateau && !T.insOrder),
    ),
  );
  b2.brief = fill(W.tMet, { m: tMet, n: targets.length });

  // ─── Continue ───
  const G = S.glucose;
  const cbgNow = K.latest("cbg");
  const glucOn = !!T.glucAt;
  const glucLow = cbgNow !== null && cbgNow < G.addUnder;
  const lateIdx = bagIdx(PH[2]!.from, null);
  const d1 = A(
    {
      n: 1,
      title: W.d1,
      items: bagRows(lateIdx),
      lines: [
        glucLow
          ? glucOn
            ? L(fill(W.glucOn, { v: cbgNow!, n: G.addUnder, r: G.mlH, t: hh(T.glucAt!) }), "ok")
            : L(fill(W.glucLow, { v: cbgNow!, n: G.addUnder, r: G.mlH }), "alert")
          : L(fill(W.glucRule, { n: G.addUnder, r: G.mlH, a: G.keepFrom, b: G.keepTo })),
      ],
      btns: glucLow && !glucOn ? [btn(W.glucStarted, mark("glucAt"), "rn", "main")] : [],
    },
    st(
      lateIdx.every((i) => bagUp(i) || due(S.bags[i]!.from) > now),
      glucLow && !glucOn,
    ),
  );
  d1.brief = glucOn ? W.glucShort : cbgNow !== null ? fill(W.glucIs, { v: cbgNow }) : "";

  const RS = S.resolve;
  const d2 = A(
    {
      n: 2,
      title: W.d2,
      items: [
        it(
          W.cv,
          fill(W.cvSub, { n: RS.urineMlKgHFrom }),
          T.cv6 ? fill(W.doneAt, { t: hh(T.cv6) }) : W.toDo,
          T.cv6 ? "done" : "todo",
          T.cv6 ? [] : [btn(W.done, mark("cv6"), "rn", "main")],
        ),
        it(
          W.ref,
          W.refSub,
          T.ref ? fill(W.referredAt, { t: hh(T.ref) }) : W.notYet,
          T.ref ? "done" : "todo",
          T.ref ? [] : [btn(W.referred, mark("ref"), "dr", "main")],
        ),
        it(W.mg, W.mgSub, W.mgWord, "na"),
      ],
    },
    st(!!T.cv6 && !!T.ref, false),
  );
  d2.brief =
    [
      T.cv6 ? fill(W.reassessedShort, { t: hh(T.cv6) }) : "",
      T.ref ? fill(W.referredShort, { t: hh(T.ref) }) : "",
    ]
      .filter(Boolean)
      .join(" · ") || W.notYet;

  // ─── Resolve ───
  const oL = oP.length ? oP[oP.length - 1]!.v : osm0;
  const uoOk = uoKg !== null && uoKg >= RS.urineMlKgHFrom;
  const mind = v.mind === W.minds[0];
  const resolved =
    oL !== null && oL < RS.osmUnder && uoOk && mind && cbgNow !== null && cbgNow < RS.glucoseUnder;
  const next = v.next ?? "";
  const e1 = A(
    {
      n: 1,
      title: W.e1,
      sub: fill(W.e1Sub, { n: RS.recoveryH }),
      crit: [
        K.crit(
          fill(W.rOsm, { n: RS.osmUnder }),
          oL !== null ? `${oL} mOsm/kg` : W.noValue,
          oL !== null && oL < RS.osmUnder,
          oL !== null,
        ),
        K.crit(
          fill(W.rUo, { n: RS.urineMlKgHFrom }),
          uoKg !== null ? fill(W.uoIs, { v: K.n1(uoKg) }) : W.noUo,
          uoOk,
          uoKg !== null,
        ),
        K.crit(W.rMind, v.mind || W.notAssessed, mind, !!v.mind),
        K.crit(
          fill(W.rGlu, { n: RS.glucoseUnder }),
          cbgNow !== null ? `${cbgNow} mmol/L` : W.noValue,
          cbgNow !== null && cbgNow < RS.glucoseUnder,
          cbgNow !== null,
        ),
      ],
      chipHead: W.mindHead,
      chips: K.pick1("mind", W.minds),
      chipWho: "dr",
      branchHead: resolved ? W.resolvedChoose : W.whenResolves,
      branches: [
        {
          range: W.eating,
          text: W.scText,
          on: next === "sc",
          known: !!next,
          ...(next === "sc" ? { tag: W.chosen } : {}),
        },
      ],
      btns: resolved
        ? [
            btn(W.toSc, K.set("next", "sc"), "dr", next === "sc" ? undefined : "main"),
            ...(next ? [btn(W.prescribe, { t: "rx" }, "dr"), K.endBtn(W.short)] : []),
          ]
        : [],
      lines: [
        resolved
          ? L(W.resolvedLine, "ok")
          : hoursNow >= RS.reviewAtH
            ? L(fill(W.review24, { n: RS.reviewAtH, m: RS.recoveryH }), "warn")
            : L(W.keepHeparin),
      ],
    },
    st(resolved, false),
  );
  e1.brief = resolved ? W.resolvedShort : W.notYetWord;

  // ─── The nurse's card ───
  const rn1 = A(
    {
      n: 1,
      head: W.check,
      title: W.rnTitle,
      sub: W.rnNote,
      chips: W.vs.map((x) => ({
        word: T[`vs_${x}`] ? `${x} · ${hh(T[`vs_${x}`]!)}` : x,
        on: !!T[`vs_${x}`],
        act: mark(`vs_${x}`),
      })),
      chipWho: "rn",
      items: [
        it(
          W.heels,
          W.heelsSub,
          T.feet ? fill(W.checkedAt, { t: hh(T.feet) }) : W.notYet,
          T.feet && !feetDue ? "done" : "todo",
          [feetBtn],
        ),
      ],
    },
    st(
      W.vs.every((x) => T[`vs_${x}`]),
      false,
    ),
  );

  // ─── Nurse tasks ───
  const H = S.hypo;
  const lastCbg = K.lastObs("cbg");
  const tasks: [string, string, string, number, Btn[]][] = [];
  const tk = (key: string, title: string, sub: string, at: number, b: Btn[]) =>
    tasks.push([key, title, sub, at, b]);
  if (shocked && bol.length < SH.boluses)
    tk(
      `bolus${bol.length}`,
      fill(W.tBolus, { ml: SH.bolusMl, min: SH.bolusMinutes }),
      fill(W.tBolusSub, { v: sbp!, n: SH.sbpUnder }),
      c.start,
      [bolusBtn],
    );
  if (!shocked && !T.fluid1At)
    tk("fluid1", W.tLitre, fill(W.tLitreSub, { r: S.bags[0]!.mlH }), c.start, [
      btn(W.litreStarted, mark("fluid1At"), "rn", "main"),
    ]);
  if (T.insOrder && !T.insAt)
    tk(
      "ins",
      fill(W.tIns, { ml: insMl }),
      fill(W.tInsSub, { s: I.syringeMl, u: I.unitsPerMl }),
      T.insOrder,
      [btn(W.infusionStarted, mark("insAt"), "rn", "main")],
    );
  if (nb > 0)
    tk(
      `bag${nb}`,
      fill(W.tBag, { n: nb + 1, k: kAdd ? fill(W.plusK, { n: kAdd }) : "" }),
      fill(W.tBagSub, { r: S.bags[nb]!.mlH }),
      due(S.bags[nb]!.from),
      [btn(W.hungNow, mark(`bag${nb}`), "rn", "main")],
    );
  if (glucLow && !glucOn)
    tk("gluc", fill(W.tGluc, { r: G.mlH }), fill(W.tGlucSub, { v: cbgNow!, n: G.addUnder }), now, [
      btn(W.glucStarted, mark("glucAt"), "rn", "main"),
    ]);
  if (cbgNow !== null && cbgNow < H.under && !(T.hypoAt && lastCbg && T.hypoAt > lastCbg.at))
    tk(
      `hypo${lastCbg?.at ?? 0}`,
      fill(W.tHypo, { v: cbgNow }),
      fill(W.tHypoSub, { ml: H.ml, m: H.recheckMinutes }),
      now,
      [btn(W.hypoTreated, mark("hypoAt"), "rn", "main")],
    );
  if (!T.vte) tk("vte", W.tVte, W.tVteSub, c.start, [btn(W.given, mark("vte"), "rn", "main")]);
  if (feetDue)
    tk(
      `feet${T.feet ?? 0}`,
      W.tFeet,
      W.tFeetSub,
      T.feet ? T.feet + S.feetEveryH * 3600000 : c.start,
      [btn(W.feetChecked, mark("feet"), "rn", "main")],
    );

  // ─── The monitoring chart ───
  const isLab = (h: number) => S.monitor.labH.includes(h);
  const flag = (lvl: Interp["lvl"], word: string, text: string): Interp => ({
    lvl,
    word,
    text,
    ref: "",
  });
  const cellFlag = (key: string, x: string): Interp | null => {
    const n = parseFloat(x);
    if (Number.isNaN(n)) return null;
    if (key === "osm")
      return n > SV.osmOver
        ? flag("crit", W.osmHighWord, fill(W.sOsm, { n: SV.osmOver }))
        : n >= CF.osmFrom
          ? flag("abn", W.osmWord, fill(W.thrOsm, { n: CF.osmFrom }))
          : n < RS.osmUnder
            ? flag("ok", W.osmOkWord, fill(W.thrOsmOk, { n: RS.osmUnder }))
            : null;
    if (key === "uo")
      return w && n / w < SV.urineMlKgHUnder
        ? flag("abn", W.lowWord, fill(W.sUo, { n: SV.urineMlKgHUnder }))
        : null;
    return K.interp(key, x);
  };
  const supply = supplyOf(rules, pf);
  const hungN = S.bags.filter((_, i) => bagUp(i)).length;
  const phRows: Row[] = [
    row(
      W.phNacl,
      fill(W.phBags, { n: hungN, of: S.bags.length }) +
        (nb > 0 ? fill(W.phNext, { n: nb + 1, t: hh(due(S.bags[nb]!.from)) }) : ""),
    ),
    row(
      W.phIns,
      T.insAt
        ? fill(W.phInsOn, {
            r: insR,
            s: I.syringeMl,
            h: Math.round(I.syringeMl / (insR / I.unitsPerMl)),
          })
        : insWhy
          ? fill(W.phInsNeeded, { why: insWhy })
          : W.phInsNot,
      insWhy && !T.insAt ? "warn" : undefined,
    ),
    row(
      W.phKcl,
      kb && k !== null
        ? kb.kclMmolL
          ? fill(W.phKclIs, { n: kb.kclMmolL, k })
          : fill(W.phKclNone, { k })
        : W.waitingK,
      kb?.senior ? "warn" : undefined,
    ),
    row(W.phHep, W.phHepIs),
  ];

  const win = (i: number) =>
    i === 0
      ? W.w1
      : PH[i]!.to === null
        ? fill(W.w4, { a: hrs(PH[i]!.from) })
        : fill(W.w2, { a: hrs(PH[i]!.from), b: hrs(PH[i]!.to!) });
  const titles = [W.ph1, W.ph2, W.ph3, W.ph4];
  const acts = [[a1, a2, a3, a4, a5, a6], [b1, b2], [d1, d2], [e1]];
  const [p1, p2, p3, p4] = PH.map((x) => x.id);
  return {
    phases: PH.map((x, i) => ({ ...x, title: titles[i]!, win: win(i), acts: acts[i]! })),
    rn: { title: W.rnTitle, note: W.rnNote, acts: [rn1] },
    flow: (F) => [
      F.P(p1!),
      F.D(
        `${p1}1`,
        W.fConfirm,
        [
          F.Br(
            W.yes,
            W.fContinue,
            confirmed ? true : glu0 !== null && osm0 !== null ? false : null,
          ),
          F.Br(
            W.fMixed,
            fill(W.fMixedSub, { n: CF.ketonesUnder }),
            mixed ? true : ket !== null ? false : null,
          ),
        ],
        osm0 !== null ? fill(W.fOsm, { v: osm0 }) : "",
      ),
      F.D(`${p1}2`, W.fSevere, [
        F.Br(W.yes, sev.length ? fill(W.fHduN, { n: sev.length }) : W.fHdu, sev.length > 0),
        F.Br(W.no, W.fWard, sev.length === 0),
      ]),
      F.D(
        `${p1}3`,
        fill(W.fShock, { n: SH.sbpUnder }),
        [
          F.Br(W.yes, fill(W.fBoluses, { ml: SH.bolusMl }), sbp !== null ? shocked : null),
          F.Br(W.no, W.fLitre, sbp !== null ? !shocked : null),
        ],
        sbp !== null ? fill(W.fSystolic, { v: sbp }) : "",
      ),
      F.D(`${p1}4`, fill(W.fIns, { n: I.ketonesOver }), [
        F.Br(
          W.yes,
          fill(W.fInsYes, { u: I.unitsPerKgH }),
          ket !== null || plateau ? !!insWhy : null,
        ),
        F.Br(W.no, W.fInsNo, ket !== null ? !insWhy : null),
      ]),
      F.D(
        `${p1}5`,
        W.fK,
        S.kBands.map((b) => F.Br(b.range, kText(b), kb ? b === kb : null)),
        k !== null ? fill(W.fLatest, { v: k }) : "",
      ),
      F.N(`${p1}6`, W.fTests),
      F.P(p2!),
      F.N(`${p2}1`, W.fBags),
      F.D(`${p2}2`, fill(W.fTargets, { m: tMet, n: targets.length }), [
        F.Br(W.yes, W.fKeep, tKnown === targets.length ? tMet === targets.length : null),
        F.Br(W.no, W.fOff, tKnown ? tMet < tKnown : null),
      ]),
      F.P(p3!),
      F.D(`${p3}1`, fill(W.fGluc, { n: G.addUnder }), [
        F.Br(W.yes, fill(W.fGlucYes, { r: G.mlH }), cbgNow !== null ? glucLow : null),
        F.Br(W.no, W.fGlucNo, cbgNow !== null ? !glucLow : null),
      ]),
      F.N(`${p3}2`, W.fReassess),
      F.P(p4!),
      F.D(`${p4}1`, fill(W.fResolved, { n: RS.osmUnder }), [
        F.Br(W.yes, W.fSc, resolved ? true : null),
        F.Br(
          W.no,
          fill(W.fOn, { n: RS.recoveryH }),
          resolved ? false : hNow >= PH[3]!.from ? true : null,
        ),
      ]),
    ],
    tasks: (add) => tasks.forEach(([key, title, sub, at, b]) => add(key, title, sub, at, b)),
    rows: [
      ["cbg", W.gCbg],
      ["osm", W.gOsm],
      ["na", W.gNa],
      ["k", W.gK],
      ["urea", W.gUrea],
      ["nacl", W.gNacl],
      ["ins", W.gIns],
      ["gluc", W.gGluc],
      ["uo", W.gUo],
    ],
    cellFlag,
    dueAt: (key, h) => ["na", "k", "urea", "osm"].includes(key) && isLab(h),
    form: [
      { key: "cbg", label: W.fmCbg, unit: "mmol/L", dflt: "" },
      { key: "nacl", label: W.fmNacl, unit: "ml/h", dflt: String(bagOf(K.nextH).mlH) },
      { key: "ins", label: W.fmIns, unit: "ml/h", dflt: T.insAt ? String(insMl) : "0" },
      { key: "gluc", label: W.fmGluc, unit: "ml/h", dflt: glucOn ? String(G.mlH) : "0" },
      { key: "uo", label: W.fmUo, unit: "ml", dflt: "" },
      { key: "na", label: W.fmNa, unit: "mmol/L", dflt: "", opt: !isLab(K.nextH) },
      { key: "k", label: W.fmK, unit: "mmol/L", dflt: "", opt: !isLab(K.nextH) },
      { key: "urea", label: W.fmUrea, unit: "mmol/L", dflt: "", opt: !isLab(K.nextH) },
    ],
    formReq: ["cbg"],
    labKeys: ["cbg", "na", "k", "urea"],
    // Osmolality on save: this slot's sodium and urea, else the latest ones (the prototype's rule).
    derive: (o): Record<string, string> => {
      if (o.na === undefined && o.urea === undefined) return {};
      const x = osmOf(
        numOrNull(o.na, K.latest("na")),
        numOrNull(o.cbg, null),
        numOrNull(o.urea, K.latest("urea")),
      );
      return x === null ? {} : { osm: String(x) };
    },
    recWhat: (h) => W.recWhat + (isLab(h) ? W.recLabs : ""),
    recHint: (h) => (isLab(h) ? W.recHintYes : W.recHintNo),
    panels: [
      {
        key: "cbg",
        name: W.pCbg,
        unit: "mmol/L",
        min: 0,
        max: 45,
        ticks: [0, 15, 30, 45],
        thr: [[G.addUnder, fill(W.thrGluc, { n: G.addUnder }), "amb"]],
        target: (p0) => K.tLine(p0, TG.glucoseFallMaxH, G.addUnder, -1),
        status: gF === null ? W.needs2 : gFast ? W.tooFast : W.onTarget,
        stLvl: gF === null ? "" : gFast ? "no" : "ok",
        bad: (x) => x < H.under,
      },
      {
        key: "osm",
        name: W.pOsm,
        unit: "mOsm/kg",
        min: 280,
        max: 380,
        ticks: [280, 320, 360],
        thr: [
          [CF.osmFrom, fill(W.thrOsm, { n: CF.osmFrom }), "amb"],
          [RS.osmUnder, fill(W.thrOsmOk, { n: RS.osmUnder }), "grn"],
        ],
        target: (p0) => K.tLine(p0, TG.osmFallMinH, RS.osmUnder, -1),
        status:
          oF === null
            ? W.needs2v
            : oFast
              ? W.tooFast
              : oF < TG.osmFallMinH
                ? W.tooSlow
                : W.onTarget,
        stLvl: oF === null ? "" : oFast || oF < TG.osmFallMinH ? "no" : "ok",
        bad: (x) => x > SV.osmOver,
      },
      {
        key: "na",
        name: W.pNa,
        unit: "mmol/L",
        min: 130,
        max: 170,
        ticks: [130, 150, 170],
        thr: naP.length ? [[naP[0]!.v - TG.naFallMax24h, W.thrNa, "amb"]] : [],
        status: naDrop === null ? W.needs2v : naFast ? W.naFastWord : W.within,
        stLvl: naDrop === null ? "" : naFast ? "no" : "ok",
        bad: (x) => x > SV.naOver,
      },
      {
        key: "k",
        name: W.pK,
        unit: "mmol/L",
        min: 2.5,
        max: 6.5,
        ticks: [3, 4.5, 6],
        thr: S.kBands.flatMap((b): [number, string, "amb"][] =>
          b.gt != null
            ? [[b.gt, fill(W.thrKHigh, { n: b.gt }), "amb"]]
            : b.lt != null
              ? [[b.lt, fill(W.thrKLow, { n: b.lt }), "amb"]]
              : [],
        ),
        bad: (x) => x < SV.kUnder || x > SV.kOver,
      },
    ],
    stats: [
      {
        k: W.sGlucose,
        v: cbgNow !== null ? `${cbgNow} mmol/L` : "—",
        s: lastCbg ? fill(W.hourN, { n: lastCbg.h }) : W.baseline,
      },
      {
        k: W.sOsmo,
        v: oL !== null ? String(oL) : "—",
        s: oP.length ? fill(W.hourN, { n: oP[oP.length - 1]!.h }) : W.baseline,
        ...(oL !== null && oL > SV.osmOver ? { cls: "warn" as const } : {}),
      },
      {
        k: W.sBal,
        v: `${signed(bal)} L`,
        s: fill(W.aimBy, { a: S.balance[0]!.fromL, b: S.balance[0]!.toL, h: S.balance[0]!.byH }),
        ...(lowBal ? { cls: "warn" as const } : {}),
      },
      {
        k: W.sIns,
        v: T.insAt ? fill(W.unitsH, { r: insR }) : W.none,
        s: T.insAt ? fill(W.sinceAt, { t: hh(T.insAt) }) : insWhy ? W.needed : W.notNeeded,
        ...(insWhy && !T.insAt ? { cls: "warn" as const } : {}),
      },
      {
        k: W.sResolved,
        v: resolved ? W.yes : W.notYetWord,
        s: fill(W.resolvedRule, { n: RS.osmUnder }),
        ...(resolved ? { cls: "ok" as const } : {}),
      },
    ],
    aims: [
      ...targets.map((t) => ({ word: t.word, ok: t.ok, known: t.r !== null })),
      ...S.balance.slice(0, 1).map((b) => ({
        word: fill(W.aimEach, { a: b.fromL, b: b.toL, h: b.byH }),
        ok: bal >= b.fromL,
        known: hoursNow >= b.byH,
      })),
    ],
    meds: supply.map((s) => ({ drug: s.drug, qty: s.qty ?? 0, why: s.doseText })),
    medsNote: W.medsNote,
    phRows,
    logWords: W.log,
  };
}

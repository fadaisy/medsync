/**
 * Lab Phase 3 copy (docs/lab/phase-3/gate-a-proposal.md §14, Appendix A, word for word). Every string a lab
 * user, nurse, clinician, lead or In-Charge reads in this slice lives here as a template: `{name}` marks a
 * value filled in by the caller, and `**…**` marks the words shown in bold. It is clinical-safety wording: while the
 * status is `draft`, all eight Phase 3 flags stay off in production (lib/lab/feature.ts, CF-3). The CSO signs
 * the whole set (the clinician-read lines are toFollow, overrideLine and deviceCheckNotDone) by setting status
 * "signed" with signedBy and signedOn.
 */
import type { SignedCopy } from "@/content/signed-copy";

export const LAB3_COPY_STATUS: SignedCopy = { status: "draft", signedBy: null, signedOn: null };

/** Each line's comment is who reads it (Appendix A "Read by"). */
export const LAB3 = {
  /** lab */
  holdBlock:
    "**{Analyte} release is held.** QC on {analyser} failed at {time} ({rules}). Rerun QC after the corrective action, or run this sample on another analyser that has passed QC today.",
  /** clinician */
  toFollow: "{Analyte} to follow: held for quality control.",
  /** clinician */
  overrideLine: "Released while QC had failed. The lab is reviewing this result.",
  /** lab */
  qcNotRun: "QC not run today for {analyte} on {analyser}.",
  /** lab */
  rejectedRun:
    "**Rejected: {rules} on {level}.** {meaning}. {Analyte} results from {analyser} will be held until a run passes.",
  /** lab */
  warningRun: "Warning: {rule} on {level}. The run is accepted and the warning recorded.",
  /** lab */
  ruleMeanings:
    "1-3s: a large random error or a big shift is likely. 2-2s: a systematic shift is likely. R-4s: random error within this run. 4-1s: a smaller systematic shift. 10-x: a sustained shift to one side. (Wording to be checked by the laboratory lead against the source.)",
  /** lab */
  provisionalTarget: "Target from the maker's range, provisional until this lab has {n} runs.",
  /** lab */
  lookBackEstimate: "Level {n} suggests results read about {bias} {unit} {high or low} (estimate).",
  /** lab */
  lookBackSort: "Flag might change · Critical limit nearby · Flag unchanged",
  /** lab, nurse */
  lotNotAccepted: "Lot {lot} has not been accepted yet. It cannot be used for patients.",
  /** lab, nurse */
  lotQuarantined:
    "Lot {lot} is quarantined after a failed control. It cannot be used until the laboratory lead releases it.",
  /** lab, nurse */
  useFirst: "Use first: the lot that expires first is offered first at the bench and the bedside.",
  /** lab */
  notEnoughHistory: "Not enough history to estimate monthly use.",
  /** lab */
  machineDown: '{Machine} is down since {time}. {Services} show "Referred" to doctors.',
  /** lab */
  backInServiceConditions: "Repair recorded · QC passed on every analyte after the repair",
  /** lab */
  temperatureOut:
    "{Point} read {value} at {time}, outside {range}. A nonconformity is open. Check the items stored here.",
  /** lab */
  readingMissing: "Reading not recorded for {point} at {time}.",
  /** lab */
  eqaTester: "EQA samples must be tested by staff who run patient samples for this test.",
  /** lab */
  noEqa: "{n} of {m} tests have no EQA. Each needs an alternative check until a scheme is found.",
  /** nurse */
  deviceBlocked:
    "{Device} failed its control check at {time}. It cannot be used until a check passes.",
  /** nurse, clinician (on the result) */
  deviceCheckNotDone: "Control check not done today.",
  /** nurse */
  competencyLapsed:
    "Your assessment for {test} lapsed on {date}. Ask the laboratory for reassessment.",
  /** lead, In-Charge. The HM-3 counting rules (§8.3), (a) to (i). */
  hmisCountingRules: [
    "Released results whose result time (form time for downtime) falls in the month, hospital-local",
    "Chemistry per analyte",
    "QC and EQA tests excluded from 10.2",
    "Rejected specimens counted in 10.7 only",
    "Referred-out tests in 10.4 or 10.5, never in 10.2",
    "Outside results never counted",
    "An amended result counts once, as its current version",
    "Bedside tests done here counted in their row, share stored",
    "Blank when not on the menu; 0 when on the menu with none done",
  ],
  /** lead, In-Charge */
  hmisChanged:
    "**{n} numbers changed after signing.** {reason}. The signed report is kept; a revision shows what changed.",
  /** lead */
  hmisManual: "{Section} is entered by hand until {module} is in MedSync.",
  /** lead, In-Charge */
  hmisDue: "HMIS 105 for {month} is due on {date}.",
  /** lab (print) */
  registerFooter:
    "Printed from MedSync records at {time}. Results are as released; later amendments appear on the day they were made.",
  /** lab (print) */
  registerHiv: "HIV tests are on their own register and are not printed here.",
  /** all */
  noData: "No data",
  // ── Added in Step 4 (not in Appendix A; draft, for the CSO with the rest) ──
  /** lab, nurse */
  lotExpired: "Lot {lot} is past its use-by date. It cannot be used for patients.",
  /** lab, nurse */
  lotRejected: "Lot {lot} was rejected. It cannot be used for patients.",
  /** lab, nurse */
  lotFinished: "Lot {lot} is finished. Choose another lot.",
  /** lab */
  noAcceptancePlan:
    "{Item} has no signed acceptance plan. The laboratory lead sets one before a new lot can be accepted.",
  // ── Added in Step 8 (not in Appendix A; draft, for the CSO with the rest) ──
  /** nurse */
  deviceCheckRequired:
    "A control check is needed before the next patient result on this device. Save the check first.",
  /** nurse */
  competencyNone: "You have no assessment for {test}. Ask the laboratory for an assessment.",
  /** nurse */
  stripLotNeedsCheck: "New strip lot: run the control check before the next patient result.",
} as const;

/**
 * Step 8's nurse labels for the device checks page (§5.10, artboard 10). Draft with the rest; the canvas's own
 * sentences (`rangesLine`, `caution`) are kept word for word.
 */
export const LAB3_BEDSIDE = {
  place: "Bedside tests",
  title: "Device checks",
  lede: "Run each meter's controls before patient tests: each day it is used, with each new strip lot or control vial, and after a drop or an error message.",
  notOperator:
    "Bedside testing is granted by the laboratory lead. Ask them to add you to the people who may record bedside tests.",
  noDevice: "No bedside device is in use here.",
  status: {
    blocked: "Failed · stopped",
    noRule: "No device rule",
    due: "Due today",
    done: "Checked",
  },
  noLot: "No strip lot is in use on this device. The laboratory sets one in use.",
  noRuleLine:
    "The laboratory has not signed a control rule for this test yet, so no check can be scored.",
  rangesLine:
    "The accepted ranges are printed on the strip vial and entered once per strip lot by the laboratory. Due each day the meter is used, with each new strip lot or control vial, and after a drop or an error message.",
  caution:
    'A failed check stops the meter. It cannot be chosen for patient tests until a check passes. Until today\'s check is saved, the bedside form says "Control check not done today".',
  stripLot: "Strip lot",
  controlLot: "Control vial",
  columns: ["Control", "Reading", "Accepted range for this strip lot", "Result"],
  inRange: "In range",
  outOfRange: "Out of range",
  noRanges: "The laboratory has not entered the accepted ranges for this strip lot yet.",
  save: "Save check",
  saved: "Saved.",
  incident: "Record a drop or error message",
  incidentLede: "A control check is then needed before the next patient result on this meter.",
  incidentKind: "What happened",
  kinds: { error: "An error message on the meter", drop: "The meter was dropped" },
  note: "Note (optional)",
  incidentSaved: "Recorded. Run the control check before the next patient result.",
  whoMay: "Who may record {test} here",
  you: "You",
  assessed: "Assessed",
  validTo: "valid to",
  grace: "grace period at switch-on",
} as const;

/** Fill a `{name}` template (the copy keeps its placeholders so the CSO reads them as written). */
export const fill = (t: string, v: Record<string, string | number>) =>
  t.replace(/\{([^}]+)\}/g, (m, k: string) => (k in v ? String(v[k]) : m));

/** D-LAB3-21: the HIV testing purpose on an HIV rapid-test order (HMIS 105 disaggregation). */
export const LAB3_HIV_PURPOSE = {
  label: "Purpose of this HIV test",
  required: "Choose the purpose of this HIV test.",
  words: {
    hct: "HIV testing services (HCT)",
    emtct: "eMTCT (antenatal and maternity)",
    clinical_diagnosis: "Clinical diagnosis",
    smc: "Safe male circumcision (SMC)",
    verification: "Verification before ART",
    recency: "Recency testing",
  },
} as const;

/**
 * Step 9's register labels (§5.12, artboard 12; GATE A §10). The columns are the canvas's defaults until the
 * lab lead replaces them from the paper registers (OA-3, D-LAB3-24). Draft with the rest.
 */
export const LAB3_REGISTER = {
  title: "Daily register",
  printTitle: "Laboratory daily register · {section}",
  hivTitle: "HIV testing register · {section}",
  classTitle: "{class} register · {section}",
  lede: "One section, one day: specimens received, results released and specimens rejected, in lab-number order, as released now. Print it for the bench file.",
  defaultsNote:
    "These are the default columns. The laboratory lead sets the columns of the paper register this lab keeps.",
  noAccess: "Only staff who release results may print this register.",
  none: "Nothing was received, released or rejected in this section on this day.",
  print: "Print",
  printed: "Print recorded.",
  checkedBy: "Checked by: ____________________ Date: ____________",
  page: "Page",
  registers: {
    general: "General",
    hiv: "HIV testing",
    tb: "TB",
    mental_health: "Mental health",
    sexual_reproductive_health: "Sexual and reproductive health",
  },
  columns: {
    labNo: "Lab no.",
    received: "Received",
    patient: "Patient",
    hospitalNo: "Hospital no.",
    age: "Age",
    sex: "Sex",
    ward: "OPD or ward",
    specimen: "Specimen",
    test: "Test",
    result: "Result",
    doneBy: "Done by",
    released: "Released",
    date: "Date",
    purpose: "Purpose",
    kit1: "Kit 1 (result)",
    kit2: "Kit 2",
    kit3: "Kit 3",
    outcome: "Outcome",
    tester: "Tester",
  },
  rejected: "Rejected: {reason}",
  opd: "OPD",
  editColumns: "Register columns",
  editLede:
    "Match the paper register: tick the columns it has, in its order, with its own headings. The laboratory lead signs the columns.",
  include: "Print this column",
  heading: "Heading",
  up: "Move up",
  down: "Move down",
  saveDraft: "Save draft",
  sign: "Sign the columns",
  signed: "Signed. The register prints with these columns.",
  draftWaiting: "A draft of these columns is waiting for the laboratory lead's signature.",
} as const;

/** Step 9's HMIS 105 labels (§5.11, artboard 11). Draft with the rest; HM-3's rules are `LAB3.hmisCountingRules`. */
export const LAB3_HMIS = {
  title: "HMIS 105 · laboratory",
  lede: "Section 10 and the laboratory rows of section 6, counted from released records for the month.",
  status: {
    none: "Not counted yet",
    draft: "Draft",
    checked: "Checked by the laboratory lead",
    signed: "Signed {date} by the In-charge",
    exported: "Signed {date} by the In-charge · exported",
    revision: "Revision {n}",
  },
  generate: "Count the month",
  recount: "Count again",
  generated: "Counted.",
  check: "Check",
  checked: "Checked. The In-charge signs it next.",
  sign: "Sign as In-charge",
  signedOk: "Signed. The numbers are frozen.",
  prepareRevision: "Prepare revision",
  revisionReady: "Revision prepared as a draft.",
  changedReason: {
    downtime: "Results from downtime were entered after signing",
    other: "Records changed after signing",
  },
  changeLine: "{cell}: {old} → {new}",
  tabs: {
    "10.1": "10.1 Visits",
    "10.2": "10.2 Routine tests",
    "10.3": "10.3 HIV tests",
    "10.4": "10.4 Referred",
    "10.5": "10.5 Not done here",
    "10.6": "10.6 AMR",
    "10.7": "10.7 Rejections",
    "6": "6 Tracer stock",
  },
  columns: ["Code", "Lab test", "Number done", "Number positive"],
  caption:
    "Every number opens the results it counts. A dash means the form has no positive column for that row.",
  captionAggregates: "Numbers only: the records behind them are open to laboratory staff.",
  positiveNotVerified: "Positive column not verified against eHMIS",
  bedside: "incl. {n} bedside",
  blank: "Blank: not on this hospital's menu",
  noRows:
    "The form file has no rows for this section yet (the antibiotic list was not transcribed, owner action OA-1).",
  unverified: "Rows not yet verified against eHMIS",
  howCounted: "How the numbers are counted",
  handEntered: "Still entered by hand",
  hand: [
    "10.6 AMR until microbiology is in MedSync.",
    "10.4 numbers referred, turnaround and pending results until referral tracking is built.",
    "10.3 repeat testers and DNA-confirmed tests.",
  ],
  enterHand: "Enter hand-counted numbers",
  handSaved: "Saved.",
  send: "Send",
  due: "Due on the 7th of the following month: {date}.",
  printForm: "Print form",
  csv: "Download CSV",
  csvNote:
    "eHMIS data-element ids are not yet in the form file: the CSV lists those cells as comments, with null ids.",
  unmapped: "Not mapped",
  unmappedLine: "{what} was met this month but is in no row of the mapping.",
  purposeNotRecorded:
    "Purpose not recorded: {n} HIV kit results from orders placed before the purpose was asked.",
  mappingUnsigned:
    "Counted with an unsigned mapping: it cannot be signed until the mapping is signed and the month counted again.",
  noMapping: "There is no HMIS mapping yet. The laboratory lead maps the form first.",
  mapping: "HMIS mapping",
  revisions: "Earlier revisions",
  records: "Records counted",
  restrictedHidden:
    "{n} restricted records are not listed: only staff who release results see them.",
  open: "{code} {label}, {column}, {value}, open the results",
  reminder: "HMIS 105 for {month} is due on {date} and is not signed yet.",
  cron: "Changed since signing is computed when the report is opened, and nightly.",
} as const;

/** Step 9's labels for the In-Charge, the focal person and the hospital admin (/hmis). Draft with the rest. */
export const LAB3_HMIS_DESK = {
  title: "HMIS 105 · laboratory",
  lede: "The laboratory's monthly HMIS 105 numbers. You see the counts; the records behind them stay with the laboratory.",
  notDesignated: "You are not designated for HMIS 105 at this hospital.",
  waiting: "Waiting for your signature",
  nothingWaiting: "Nothing waits for your signature.",
  mappingWaiting:
    "The laboratory lead signed the HMIS mapping. As HMIS focal person you check it against eHMIS and co-sign.",
  coSign: "Co-sign the mapping",
  coSigned: "Co-signed. The mapping is in force.",
  designations: "Designations",
  designationsLede:
    "The Health Unit In-Charge signs the HMIS 105; the HMIS focal person co-signs the mapping. Set by the hospital admin.",
  roles: { in_charge: "Health Unit In-Charge", focal: "HMIS focal person" },
  designate: "Designate",
  person: "Staff member",
  role: "Role",
  from: "From",
  end: "End",
  ended: "Ended.",
  saved: "Designated.",
  months: "Months",
} as const;

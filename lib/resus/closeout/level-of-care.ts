import type { Capability, CareLevel, CareUnit, LevelSuggestion } from "@/lib/resus/model";
import type { LevelRuleId } from "@/lib/resus/reference/levels-of-care";
import type { TimelineEvent } from "@/lib/resus/types";
import type { VitalSnapshot } from "@/lib/resus/vitals";
import type { AdultVitals } from "@/lib/triage/types";

import { buildAirwayActions } from "@/lib/resus/airway";
import { buildBreathingActions } from "@/lib/resus/breathing";
import {
  buildCirculationActions,
  identifyShockType,
  latestCirculationAssessment,
} from "@/lib/resus/circulation";
import { obeysCommands } from "@/lib/resus/closeout/post-rosc";
import {
  buildDisabilityActions,
  classifyDisability,
  gcsTotal,
  latestDisabilityAssessment,
} from "@/lib/resus/disability";
import { identifyExposureDiagnosis, latestExposureAssessment } from "@/lib/resus/exposure";
import { GCS_AIRWAY_THRESHOLD } from "@/lib/resus/reference/disability-catalog";
import {
  ADULT_MIN_AGE_YEARS,
  CARE_LEVEL_RANK,
  CLOSEOUT_REF,
  LEVEL_RULE_LEVEL,
  NEWS2_EMERGENCY_MIN,
  NEWS2_URGENT_MIN,
  REQUIRED_CAPABILITIES,
  RRT_RULE_IDS,
} from "@/lib/resus/reference/levels-of-care";
import { reconstructTimeline } from "@/lib/resus/timeline";
import { buildResusVitals } from "@/lib/resus/vitals";
import { scoreNews2 } from "@/lib/triage/scoring/news2";

/**
 * Level-of-care recommender (docs/clinical/resus-closeout-clinical-catalog.md
 * §2–§4, CO-R1..R16 + CO-DST-01..04) — PURE.
 *
 * The recommender SUGGESTS; the leader chooses. The suggestion is the highest
 * level any matching rule gives; no matching rule → no suggestion ("insufficient
 * data — choose"), never a silent Ward. NEWS2 reuses the triage `scoreNews2`
 * and is null (never guessed) when a parameter is missing or the patient is a
 * child.
 */

/* ─── Record codes the recommender reads (from the step + drug catalogs) ── */

/** Actions that put a tracheal tube / definitive airway in (state `performed`). */
export const ETT_ACTION_CODES: readonly string[] = [
  "a_plan_a_intubation",
  "a_burns_early_intubation",
  "a_plan_d_efona",
  "b_rsi_intubation",
  "d_definitive_airway",
];
/** Arrest `procedure` payload.arrestProcedure for a tracheal tube. */
export const ETT_ARREST_PROCEDURE = "airway_ett";
/** NIV / CPAP (state `performed` or `in_progress`). */
export const NIV_ACTION_CODES: readonly string[] = ["b_niv"];
/** Vasopressor actions (state `performed` or `in_progress`). */
export const VASOPRESSOR_ACTION_CODES: readonly string[] = ["c_noradrenaline", "c_vasopressin"];
/** Vasopressor drug events (payload.prescribing.drugKey). Dobutamine (inotrope) is not listed. */
export const VASOPRESSOR_DRUG_KEYS: readonly string[] = ["vasopressor", "vasopressin"];
/** IM adrenaline for anaphylaxis (payload.prescribing.drugId), counted for CO-R9. */
export const ANAPHYLAXIS_IM_DRUG_ID = "adrenaline_anaphylaxis_im";
/** CO-R9: "no improvement after 2 IM doses". */
export const REFRACTORY_ANAPHYLAXIS_IM_DOSES = 2;

/* ─── Input ─────────────────────────────────────────────────────────────── */

/** Clinician-entered on the close-out sheet (not derivable from the record). */
export interface LevelExtras {
  ageYears: number | null;
  /** Severe agitation / hyperactive delirium (CO-R4, CO-R6). */
  agitationDelirium?: boolean;
  /** At risk of escalation (CO-R4). */
  riskOfEscalation?: boolean;
  /** RRT needed (CO-R13, CO-R14). */
  rrtNeeded?: boolean;
  /** The patient is in a renal setting (CO-R14 applies only outside one). */
  renalSetting?: boolean;
  /** An IV adrenaline infusion is running (CO-R9) when not recorded as a drug event. */
  adrenalineInfusion?: boolean;
  /** A non-coronary arrest cause is suspected (CO-DST-04) beyond the cause tiles. */
  nonCoronaryCauseSuspected?: boolean;
}

export interface LevelInput {
  ageYears: number | null;
  /** No arrest in this episode (the "stabilised" mode; CO-R12). */
  stabilised: boolean;
  /** A ROSC with no later re-arrest. */
  postRosc: boolean;
  obeysCommands: boolean | null;
  ettInSitu: boolean;
  niv: boolean;
  vasopressor: boolean;
  agitationDelirium: boolean;
  riskOfEscalation: boolean;
  refractoryAnaphylaxis: boolean;
  gcsTotal: number | null;
  statusEpilepticus: boolean;
  news2: { total: number; hasSingleParameterThree: boolean } | null;
  rrtNeeded: boolean;
  renalSetting: boolean;
  bmiOver40: boolean;
  stemi: boolean;
  haemorrhage: boolean;
  pregnancyRelated: boolean;
  headInjury: boolean;
  nonCoronaryCause: boolean;
}

const ON = new Set(["performed", "in_progress"]);

function isPaediatric(ageYears: number | null): boolean {
  return ageYears !== null && ageYears < ADULT_MIN_AGE_YEARS;
}

/** NEWS2 on the latest vitals — null when any parameter is missing or for a child. */
export function news2FromVitals(v: VitalSnapshot, ageYears: number | null): LevelInput["news2"] {
  if (isPaediatric(ageYears)) return null;
  const adult: AdultVitals = {
    respiratoryRate: v.rr ?? null,
    spo2: v.spo2 ?? null,
    spo2Scale: "scale1",
    oxygen: v.oxygen ?? null,
    systolicBp: v.systolicBp ?? null,
    pulse: v.hr ?? null,
    consciousness: v.consciousness ?? null,
    temperature: v.temperature ?? null,
  };
  const r = scoreNews2(adult);
  return r.provisional
    ? null
    : { total: r.total, hasSingleParameterThree: r.hasSingleParameterThree };
}

function prescribing(e: TimelineEvent): { drugId?: unknown; drugKey?: unknown; route?: unknown } {
  const p = e.payload.prescribing;
  return p && typeof p === "object" ? (p as Record<string, unknown>) : {};
}

/** Derive the recommender input from the timeline + the close-out sheet extras. */
export function levelInputFromRecord(
  events: readonly TimelineEvent[],
  extras: LevelExtras,
): LevelInput {
  const tl = reconstructTimeline(events);

  let arrested = false;
  let postRosc = false;
  let flags: Record<string, unknown> = {};
  const causeState = new Map<string, { cause: unknown; state: unknown }>();
  for (const e of tl) {
    if (e.kind === "arrest_detected") [arrested, postRosc] = [true, false];
    if (e.kind === "rosc") postRosc = true;
    if (e.kind === "context" && e.payload.flags && typeof e.payload.flags === "object")
      flags = e.payload.flags as Record<string, unknown>;
    if (e.kind === "decision" && e.payload.decision === "reversible_cause")
      causeState.set(`${String(e.payload.arrestSeq)}:${String(e.payload.cause)}`, {
        cause: e.payload.cause,
        state: e.payload.state,
      });
  }

  const actions = [
    ...buildAirwayActions(tl),
    ...buildBreathingActions(tl),
    ...buildCirculationActions(tl),
    ...buildDisabilityActions(tl),
  ];
  const actionOn = (codes: readonly string[], states: ReadonlySet<string>) =>
    actions.some((a) => codes.includes(a.actionCode) && states.has(a.state));

  const drugs = tl.filter((e) => e.kind === "drug").map(prescribing);
  const imDoses = drugs.filter((p) => p.drugId === ANAPHYLAXIS_IM_DRUG_ID).length;
  const adrenalineInfusion =
    drugs.some((p) => p.drugKey === "adrenaline" && p.route === "infusion") ||
    !!extras.adrenalineInfusion;

  const ettInSitu =
    actionOn(ETT_ACTION_CODES, new Set(["performed"])) ||
    tl.some((e) => e.kind === "procedure" && e.payload.arrestProcedure === ETT_ARREST_PROCEDURE);
  const vasopressor =
    actionOn(VASOPRESSOR_ACTION_CODES, ON) ||
    drugs.some((p) => VASOPRESSOR_DRUG_KEYS.includes(String(p.drugKey)));

  const c = latestCirculationAssessment(tl);
  const d = latestDisabilityAssessment(tl);
  const x = latestExposureAssessment(tl);
  const pci = actionOn(["c_pci_activate"], ON);
  const prC05Done = tl.some(
    (e) =>
      e.kind === "decision" &&
      e.payload.decision === "post_rosc_item" &&
      e.payload.itemId === "PR-C-05" &&
      e.payload.state === "done",
  );
  const nonCoronaryTile = [...causeState.values()].some(
    (t) =>
      t.cause !== "thrombosis" && ["suspected", "treating", "treated"].includes(String(t.state)),
  );

  return {
    ageYears: extras.ageYears,
    stabilised: !arrested,
    postRosc,
    obeysCommands: obeysCommands(tl),
    ettInSitu,
    niv: actionOn(NIV_ACTION_CODES, ON),
    vasopressor,
    agitationDelirium: !!extras.agitationDelirium,
    riskOfEscalation: !!extras.riskOfEscalation,
    refractoryAnaphylaxis: imDoses >= REFRACTORY_ANAPHYLAXIS_IM_DOSES && adrenalineInfusion,
    gcsTotal: d ? gcsTotal(d.gcs) : null,
    statusEpilepticus: !!d && classifyDisability(d) === "active_seizure_status",
    news2: news2FromVitals(buildResusVitals(tl).latest, extras.ageYears),
    rrtNeeded: !!extras.rrtNeeded,
    renalSetting: !!extras.renalSetting,
    bmiOver40: flags.bmiOver40 === true,
    stemi: !!c?.present.includes("ecg_ischaemia") || pci || prC05Done,
    haemorrhage:
      (!!c && identifyShockType(c) === "hypovolaemic_haemorrhagic") ||
      (!!x && identifyExposureDiagnosis(x) === "occult_haemorrhage"),
    pregnancyRelated: flags.pregnancy === "confirmed" || flags.pregnancy === "postpartum",
    headInjury: flags.headInjury === true,
    nonCoronaryCause: nonCoronaryTile || !!extras.nonCoronaryCauseSuspected,
  };
}

/* ─── Recommender ───────────────────────────────────────────────────────── */

/** CO-R1..R16 conditions, transcribed from the catalog §4 table. */
const RULES: [LevelRuleId, (i: LevelInput) => boolean][] = [
  ["CO-R1", (i) => i.postRosc && (i.obeysCommands === false || i.ettInSitu)],
  ["CO-R2", (i) => i.postRosc && i.obeysCommands === true],
  ["CO-R3", (i) => i.ettInSitu],
  ["CO-R4", (i) => i.niv && i.vasopressor && (i.agitationDelirium || i.riskOfEscalation)],
  ["CO-R5", (i) => i.niv && i.vasopressor],
  ["CO-R6", (i) => (i.niv || i.vasopressor) && i.agitationDelirium],
  ["CO-R7", (i) => i.niv && !i.vasopressor],
  ["CO-R8", (i) => i.vasopressor && !i.niv],
  ["CO-R9", (i) => i.refractoryAnaphylaxis],
  [
    "CO-R10",
    (i) => (i.gcsTotal !== null && i.gcsTotal <= GCS_AIRWAY_THRESHOLD) || i.statusEpilepticus,
  ],
  ["CO-R11", (i) => i.news2 !== null && i.news2.total >= NEWS2_EMERGENCY_MIN],
  [
    "CO-R12",
    (i) =>
      i.stabilised &&
      !(i.niv || i.vasopressor || i.ettInSitu || i.rrtNeeded) &&
      i.news2 !== null &&
      i.news2.total < NEWS2_URGENT_MIN &&
      !i.news2.hasSingleParameterThree,
  ],
  ["CO-R13", (i) => i.rrtNeeded && (i.vasopressor || i.niv || i.ettInSitu)],
  ["CO-R14", (i) => i.rrtNeeded && !i.renalSetting && !(i.vasopressor || i.niv || i.ettInSitu)],
  // "or" = exactly one of the two; both → CO-R16.
  ["CO-R15", (i) => i.bmiOver40 && i.niv !== i.vasopressor],
  ["CO-R16", (i) => i.bmiOver40 && i.niv && i.vasopressor],
];

const DESTINATION_RULES: [
  string,
  LevelSuggestion["extraDestinations"][number]["destination"],
  (i: LevelInput) => boolean,
][] = [
  ["CO-DST-01", "cath_lab", (i) => i.stemi],
  ["CO-DST-02", "theatre", (i) => i.haemorrhage],
  ["CO-DST-03", "labour_ward", (i) => i.pregnancyRelated],
  ["CO-DST-04", "ct_first", (i) => i.headInjury || i.nonCoronaryCause],
];

export function suggestLevel(input: LevelInput, units: readonly CareUnit[]): LevelSuggestion {
  const reasons = RULES.filter(([, when]) => when(input)).map(([ruleId]) => ({
    ruleId,
    text: CLOSEOUT_REF[ruleId]!.text,
    level: LEVEL_RULE_LEVEL[ruleId],
    source: CLOSEOUT_REF[ruleId]!.source,
  }));
  const level = reasons.reduce<CareLevel | null>(
    (top, r) => (top === null || CARE_LEVEL_RANK[r.level] > CARE_LEVEL_RANK[top] ? r.level : top),
    null,
  );

  const extraDestinations = DESTINATION_RULES.filter(([, , when]) => when(input)).map(
    ([ruleId, destination]) => ({ ruleId, destination, reason: CLOSEOUT_REF[ruleId]!.text }),
  );

  if (level === null)
    return {
      level,
      reasons,
      extraDestinations,
      requiredCapabilities: [],
      qualifyingUnits: [],
      transferSuggested: false,
    };

  const requiredCapabilities: Capability[] = [...REQUIRED_CAPABILITIES[level]];
  if (reasons.some((r) => (RRT_RULE_IDS as readonly string[]).includes(r.ruleId)))
    requiredCapabilities.push("rrt");

  const ageGroup = isPaediatric(input.ageYears) ? "paediatric" : "adult";
  const qualifyingUnits = units.filter(
    (u) =>
      u.active &&
      (u.ageGroup === "all" || u.ageGroup === ageGroup) &&
      requiredCapabilities.every((c) => u.capabilities.includes(c)),
  );

  return {
    level,
    reasons,
    extraDestinations,
    requiredCapabilities,
    qualifyingUnits,
    transferSuggested: qualifyingUnits.length === 0,
  };
}

/** A reason is required only when the chosen level is below the suggestion. */
export function mismatchRequired(suggested: CareLevel | null, chosen: CareLevel): boolean {
  return suggested !== null && CARE_LEVEL_RANK[chosen] < CARE_LEVEL_RANK[suggested];
}

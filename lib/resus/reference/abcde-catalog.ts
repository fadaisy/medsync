import type { ResusDoseId } from "@/lib/resus/reference/doses";
import type { AbcdeLetter } from "@/lib/resus/types";

/**
 * The ABCDE assess→action catalog (GATE C) — reference data, not logic.
 *
 * Each step pairs what to ASSESS (look/listen/feel/measure) with its
 * DANGER SIGNS and the guideline-linked ACTIONS. Tapping an action logs
 * it to the immutable timeline as performed by the clinician — the app
 * never acts. Actions that carry a dose reference a cited constant in
 * lib/resus/reference/doses.ts (no dose is duplicated as a string here).
 *
 * CLINICAL-SAFETY ARTIFACT. Faithful to docs/resus-abcde-gate-a-proposal.md
 * §A.2/§A.4/§A.5 (CSO-signed 2026-06-02) + resuscitation-abcde-clinical-
 * reference.md. The full clinical detail lives in the reference document;
 * this is the in-app, tappable distillation.
 */

export const ABCDE_CATALOG_META = {
  verifiedOn: "2026-06-01",
  guidelineCycle: "2025",
  basis:
    "2025 AHA/ERC + ILCOR 2025 CoSTR + Resuscitation Council UK ABCDE + ATLS + Surviving Sepsis 2021 + NEWS2 (RCP 2017).",
} as const;

export interface LinkedAction {
  /** Stable code — logged onto the timeline. */
  id: string;
  /** Category-level label as it appears + logs. */
  label: string;
  whenIndicated: string;
  /** When set, this action carries a cited dose constant. */
  doseId?: ResusDoseId;
  /** Surfaced prominently — the emergency action for a flagged life-threat. */
  emergency?: boolean;
  source: string;
}

export interface StepCatalog {
  step: AbcdeLetter;
  title: string;
  /** look / listen / feel / measure prompts to capture. */
  assess: string[];
  dangerSigns: string[];
  actions: LinkedAction[];
  /** What to re-check after any intervention in this step. */
  reassess: string;
}

const RCUK = "Resuscitation Council UK — ABCDE approach";

export const ABCDE_CATALOG: Record<AbcdeLetter, StepCatalog> = {
  A: {
    step: "A",
    title: "Airway",
    assess: [
      "LOOK — see-saw/paradoxical movement, accessory muscles, central cyanosis (late), foreign body / vomit / blood, facial or neck trauma/swelling",
      "LISTEN — stridor (upper airway), gurgling (fluid), snoring (tongue), wheeze (lower airway), silence (complete obstruction / apnoea — ominous)",
      "FEEL — for airflow at mouth and nose",
      "The talking patient — full sentences = patent for now; hoarse/'hot-potato' voice or can't speak = threatened airway",
      "Trauma / possible C-spine injury? (determines head-tilt vs jaw-thrust)",
    ],
    dangerSigns: [
      "Complete obstruction — silent, no airflow, paradoxical effort",
      "Stridor (inspiratory) — upper-airway obstruction",
      "Progressive swelling — angioedema, burns, anaphylaxis",
      "GCS ≤ 8 — cannot protect the airway (route back to A)",
      "Active bleeding / vomiting into the airway",
    ],
    actions: [
      {
        id: "a_head_tilt_chin_lift",
        label: "Head-tilt / chin-lift",
        whenIndicated: "Obstructed/at-risk airway, NO suspected spinal injury",
        source: RCUK,
      },
      {
        id: "a_jaw_thrust",
        label: "Jaw thrust (C-spine-sparing)",
        whenIndicated:
          "Obstructed/at-risk airway with suspected spinal injury — airway patency takes precedence over strict immobilisation (RCUK Dec 2025)",
        source: `${RCUK} + RCUK 2025`,
      },
      {
        id: "a_suction",
        label: "Suction (rigid Yankauer)",
        whenIndicated: "Secretions/blood/vomit / gurgling",
        source: RCUK,
      },
      {
        id: "a_adjunct",
        label: "Airway adjunct — OPA / NPA",
        whenIndicated:
          "OPA if no gag/unconscious; NPA if gag present (caution in base-of-skull fracture)",
        source: RCUK,
      },
      {
        id: "a_high_flow_o2",
        label: "High-flow oxygen 15 L/min (reservoir mask)",
        whenIndicated: "Any critically ill patient once the airway is patent",
        doseId: "oxygen_critically_ill",
        source: RCUK,
      },
      {
        id: "a_recovery_position",
        label: "Recovery position",
        whenIndicated: "Unconscious, breathing, no trauma",
        source: RCUK,
      },
      {
        id: "a_advanced_airway",
        label: "Escalate to advanced airway (call anaesthetics/ICU)",
        whenIndicated: "Simple measures fail or airway protection needed",
        emergency: true,
        source: RCUK,
      },
      {
        id: "a_anaphylaxis_adrenaline",
        label: "Anaphylaxis → IM adrenaline",
        whenIndicated: "Airway swelling/stridor from anaphylaxis",
        doseId: "anaphylaxis_adrenaline_im",
        emergency: true,
        source: "RCUK Anaphylaxis / ERC 2025",
      },
      {
        id: "a_cspine",
        label: "Maintain C-spine immobilisation",
        whenIndicated:
          "Trauma with possible cervical-spine injury (airway patency takes precedence)",
        source: "ATLS + RCUK 2025",
      },
    ],
    reassess:
      "Return to LOOK/LISTEN/FEEL — re-confirm patency and air movement. Do NOT proceed to B until A is secure. Recheck SpO₂ against target after starting O₂. Any deterioration / falling GCS / new swelling → return to A.",
  },

  B: {
    step: "B",
    title: "Breathing",
    assess: [
      "RR (count a full minute) — the most sensitive deterioration sign",
      "SpO₂ + the inspired O₂ (room air vs device/flow)",
      "Work of breathing — accessory muscles, can they speak in sentences, tiring",
      "Chest expansion — depth, symmetry; tracheal position (deviation = tension pneumothorax/effusion)",
      "Percussion (hyper-resonant = pneumothorax; stony-dull = effusion/haemothorax); auscultate air entry + added sounds",
      "EtCO₂ / capnography where available",
    ],
    dangerSigns: [
      "RR ≥ 25 or ≤ 8 — either is a critical flag",
      "SpO₂ < 92% despite O₂ (< 88% if type-2 RF risk)",
      "Silent chest — life-threatening",
      "Tension pneumothorax — absent breath sounds + hyper-resonance + haemodynamic compromise (± tracheal deviation, distended neck veins)",
      "Exhaustion / falling rate / apnoea — impending respiratory arrest",
    ],
    actions: [
      {
        id: "b_high_conc_o2",
        label: "High-concentration oxygen (titrate to target)",
        whenIndicated: "Any hypoxic/critically ill patient",
        doseId: "oxygen_critically_ill",
        source: `${RCUK} + BTS 2017`,
      },
      {
        id: "b_needle_decompression",
        label: "Tension pneumothorax → needle/finger decompression, then chest drain",
        whenIndicated:
          "Tension-pneumothorax triad with compromise — CLINICAL diagnosis, do NOT wait for imaging",
        emergency: true,
        source: "ATLS",
      },
      {
        id: "b_nebulised_bronchodilator",
        label: "Nebulised bronchodilator (± ipratropium ± steroid)",
        whenIndicated: "Bronchospasm / wheeze (asthma, COPD)",
        doseId: "nebulised_bronchodilator",
        source: "BTS/SIGN asthma",
      },
      {
        id: "b_nebulised_adrenaline_upper",
        label: "Nebulised adrenaline (upper-airway oedema/stridor)",
        whenIndicated:
          "Laryngeal/upper-airway oedema — distinct from bronchospasm AND from systemic IM adrenaline",
        source: RCUK,
      },
      {
        id: "b_anaphylaxis_adrenaline",
        label: "Anaphylaxis → IM adrenaline",
        whenIndicated: "Wheeze/stridor/respiratory distress from anaphylaxis",
        doseId: "anaphylaxis_adrenaline_im",
        emergency: true,
        source: "RCUK Anaphylaxis / ERC 2025",
      },
      {
        id: "b_sit_up",
        label: "Sit upright / pulmonary-oedema support",
        whenIndicated:
          "Acute pulmonary oedema (O₂, positioning; circulatory drugs in C with senior input)",
        source: RCUK,
      },
      {
        id: "b_assisted_ventilation",
        label: "Assisted ventilation (BVM) + call for expert help",
        whenIndicated: "Inadequate/absent breathing or exhaustion",
        emergency: true,
        source: "ERC 2025 / RCUK",
      },
    ],
    reassess:
      "Return to A, then re-measure B: RR, SpO₂ (with the device now in use), expansion/symmetry, auscultation, EtCO₂. After O₂ confirm SpO₂ reaching target; after decompression reassess breath sounds + haemodynamics + arrange the chest drain; after nebuliser/adrenaline reassess wheeze + repeat-dose timing (anaphylaxis at 5 min); after assisted ventilation reassess chest rise + escalate.",
  },

  C: {
    step: "C",
    title: "Circulation",
    assess: [
      "Capillary refill (central), colour, peripheral vs central temperature",
      "Pulse — rate, rhythm, volume; central vs peripheral",
      "BP (systolic + diastolic), MAP, pulse pressure (narrow = hypovolaemia)",
      "Shock index (HR/SBP) — > 0.9 occult shock, ≥ 1.0 high-risk",
      "12-lead ECG; point-of-care lactate",
      "Bleeding survey — 'on the floor and four more' (chest, abdomen, pelvis, long bones, external)",
    ],
    dangerSigns: [
      "SBP ≤ 90 — shock until proven otherwise",
      "HR ≥ 131 or ≤ 40",
      "Compensated/occult shock — tachycardia + narrow pulse pressure + prolonged cap refill with still-normal BP (do not wait for hypotension)",
      "Cardiac tamponade — Beck's triad (hypotension + raised JVP + muffled heart sounds)",
      "Active / major haemorrhage; rising lactate",
    ],
    actions: [
      {
        id: "c_iv_access",
        label: "2× large-bore IV (or IO if access fails) + bloods",
        whenIndicated: "Any shock, haemorrhage, or anticipated fluids/blood/drugs",
        source: "RCUK / ATLS",
      },
      {
        id: "c_crystalloid_bolus",
        label: "Balanced crystalloid bolus — reassess after each",
        whenIndicated:
          "Hypoperfusion not due to uncontrolled haemorrhage; titrate to perfusion/MAP",
        source: "RCUK / Surviving Sepsis 2021",
      },
      {
        id: "c_sepsis_bundle",
        label: "Sepsis bundle (cultures → antibiotics → fluids; MAP ≥ 65)",
        whenIndicated: "Sepsis-induced hypoperfusion / septic shock",
        doseId: "sepsis_crystalloid",
        emergency: true,
        source: "Surviving Sepsis Campaign 2021",
      },
      {
        id: "c_haemorrhage_control",
        label: "Haemorrhage control (pressure / tourniquet / pelvic binder / splint)",
        whenIndicated: "Any compressible/identifiable bleeding source",
        emergency: true,
        source: "ATLS",
      },
      {
        id: "c_txa",
        label: "Tranexamic acid (trauma) — time-critical",
        whenIndicated: "Bleeding/at-risk trauma within 3 h of injury",
        doseId: "txa_trauma",
        emergency: true,
        source: "CRASH-2 / CRASH-3",
      },
      {
        id: "c_major_haemorrhage_protocol",
        label: "Activate major-haemorrhage protocol (blood products)",
        whenIndicated: "Major/uncontrolled haemorrhage; anticipated massive transfusion",
        emergency: true,
        source: "ATLS damage-control resuscitation",
      },
      {
        id: "c_stemi_pathway",
        label: "STEMI → emergent reperfusion (primary PCI)",
        whenIndicated: "12-lead ECG shows STEMI",
        source: "ESC 2023 ACS",
      },
      {
        id: "c_anaphylaxis_adrenaline",
        label: "Anaphylaxis → IM adrenaline + IV fluids",
        whenIndicated:
          "Distributive shock/hypotension from anaphylaxis (flat + legs up if hypotensive)",
        doseId: "anaphylaxis_adrenaline_im",
        emergency: true,
        source: "RCUK Anaphylaxis / ERC 2025",
      },
      {
        id: "c_tamponade",
        label: "Tamponade → pericardiocentesis (senior)",
        whenIndicated: "Obstructive shock from tamponade",
        emergency: true,
        source: "ATLS / RCUK",
      },
    ],
    reassess:
      "Return to A-B-C: recheck cap refill, pulse, HR, BP, MAP, shock index; trend lactate after each bolus/product/TXA/vasopressor. Confirm response before the next bolus (avoid under-/over-resuscitation); if perfusion fails to improve, escalate (major-haemorrhage protocol / senior) and re-survey for missed bleeding + tamponade. If pulse is lost → CPR + ALS module.",
  },

  D: {
    step: "D",
    title: "Disability",
    assess: [
      "Conscious level — ACVPU (Alert / new Confusion / Voice / Pain / Unresponsive) or GCS",
      "GCS ≤ 8 (or P/U) → airway at risk → route BACK to A",
      "Pupils — size, equality, reaction (unequal/fixed = focal cause/herniation)",
      "Capillary blood glucose on EVERY altered patient — 'Don't Ever Forget Glucose' (treat if < 4.0 mmol/L)",
      "Lateralising/focal signs → stroke / CT-head pathway; seizure activity",
      "Causes (reversible first): hypoxia, hypercapnia, hypoperfusion, hypoglycaemia, drugs/toxins, intracranial, post-ictal",
    ],
    dangerSigns: [
      "GCS ≤ 8 or falling conscious level",
      "New focal deficit; unequal/fixed/dilated pupils",
      "Cushing's response — hypertension + bradycardia + irregular breathing (raised ICP)",
      "Status epilepticus (≥ 5 min or recurrent without recovery)",
      "Hypoglycaemia; opioid toxidrome (pinpoint pupils + low RR + low GCS)",
    ],
    actions: [
      {
        id: "d_correct_abc_first",
        label: "Correct A/B/C first",
        whenIndicated:
          "Always — most reduced consciousness is hypoxia/hypoperfusion/hypoglycaemia, not primary brain pathology",
        source: RCUK,
      },
      {
        id: "d_return_to_a",
        label: "Route back to A — airway protection / senior airway",
        whenIndicated: "GCS ≤ 8, ACVPU P/U, or falling level (nurse lateral if not intubated)",
        emergency: true,
        source: "ATLS / RCUK",
      },
      {
        id: "d_iv_glucose",
        label: "Hypoglycaemia → IV glucose",
        whenIndicated: "CBG < 4.0 with reduced consciousness, IV access available",
        doseId: "hypoglycaemia_iv_glucose",
        emergency: true,
        source: "JBDS 2023 / RCUK",
      },
      {
        id: "d_glucagon",
        label: "Hypoglycaemia → IM glucagon (no IV access)",
        whenIndicated: "CBG < 4.0, unsafe to swallow, no IV access",
        doseId: "hypoglycaemia_glucagon_im",
        source: "JBDS 2023 / BNF",
      },
      {
        id: "d_oral_cho",
        label: "Hypoglycaemia → oral carbohydrate",
        whenIndicated: "CBG < 4.0, conscious and able to swallow safely",
        doseId: "hypoglycaemia_oral_cho",
        source: "JBDS 2023",
      },
      {
        id: "d_benzodiazepine",
        label: "Seizure → benzodiazepine first-line + status pathway",
        whenIndicated: "Active seizure / status epilepticus (check glucose alongside)",
        doseId: "seizure_benzodiazepine",
        emergency: true,
        source: "NICE NG217",
      },
      {
        id: "d_raised_icp",
        label: "Raised ICP → senior/neurosurgery + head-up",
        whenIndicated: "Declining GCS + pupillary change / Cushing's / mass-effect signs",
        emergency: true,
        source: "RCUK / ATLS",
      },
      {
        id: "d_naloxone",
        label: "Opioid toxicity → naloxone (titrate to ventilation)",
        whenIndicated: "Reduced RR + pinpoint pupils + reduced GCS — support ventilation first",
        doseId: "naloxone",
        source: "RCUK ALS",
      },
      {
        id: "d_flumazenil",
        label: "Flumazenil — caution, NOT routine",
        whenIndicated:
          "Confirmed isolated iatrogenic benzodiazepine effect only (senior/toxicology)",
        doseId: "flumazenil",
        source: "Toxicology/EM consensus",
      },
      {
        id: "d_ct_head",
        label: "Request urgent CT head",
        whenIndicated:
          "Unexplained reduced GCS / new focal deficit / suspected structural cause, once A/B/C stable",
        source: "RCUK / stroke pathways",
      },
    ],
    reassess:
      "Re-run ABCDE from A. Recheck CBG 10–15 min after glucose/glucagon (confirm > 4.0, give long-acting CHO); re-score ACVPU/GCS; after a benzodiazepine reassess RR/airway + seizure activity; after naloxone reassess RR/GCS (short-acting — may re-dose); re-examine pupils + for Cushing's. Persisting reduced GCS with normal glucose + corrected A/B/C → senior + urgent CT head.",
  },

  E: {
    step: "E",
    title: "Exposure",
    assess: [
      "Expose fully (preserve dignity, minimise heat loss); log-roll the back in trauma",
      "Rashes — NON-BLANCHING (meningococcal sepsis until proven otherwise); urticaria/angioedema (anaphylaxis)",
      "Wounds, bleeding, bruising, surgical sites, lines/drains, patches (occult drug cause)",
      "Abdomen (distension, peritonism, pulsatile mass = AAA); limbs (DVT, critical ischaemia)",
      "Core temperature — hypothermia (< 35 °C) or hyperpyrexia",
      "AMPLE history — Allergies, Medications, Past history, Last meal, Events",
    ],
    dangerSigns: [
      "Non-blanching rash (meningococcaemia)",
      "Anaphylaxis features (urticaria/angioedema + ABC compromise)",
      "Hypothermia (< 35 °C) or hyperpyrexia",
      "Major occult bleeding; peritonitis; pulsatile abdominal mass (?AAA)",
      "Limb-threatening acute ischaemia",
    ],
    actions: [
      {
        id: "e_anaphylaxis_adrenaline",
        label: "Anaphylaxis → IM adrenaline + adjuncts",
        whenIndicated: "Urticaria/angioedema + ABC compromise — often first recognised here",
        doseId: "anaphylaxis_adrenaline_im",
        emergency: true,
        source: "RCUK Anaphylaxis / ERC 2025",
      },
      {
        id: "e_meningococcal_sepsis",
        label: "Non-blanching rash → sepsis pathway + early antibiotics",
        whenIndicated: "Non-blanching rash ± fever — meningococcal until proven otherwise",
        doseId: "sepsis_crystalloid",
        emergency: true,
        source: "Surviving Sepsis / RCUK",
      },
      {
        id: "e_warming_cooling",
        label: "Active warming / cooling",
        whenIndicated:
          "Hypothermia (passive/active rewarming by severity) or hyperthermia (active cooling)",
        source: "ERC hypothermia consensus / NEWS2",
      },
      {
        id: "e_haemorrhage_surgical",
        label: "Control bleeding / manage surgical or vascular emergency",
        whenIndicated:
          "Occult/external haemorrhage, peritonitis, ?AAA, acute limb ischaemia found on exposure",
        emergency: true,
        source: "ATLS / RCUK",
      },
      {
        id: "e_cover",
        label: "Cover the patient (dignity + prevent hypothermia)",
        whenIndicated: "After the head-to-toe exposure (always)",
        source: RCUK,
      },
      {
        id: "e_ample_escalate",
        label: "Complete AMPLE history + escalate to definitive care",
        whenIndicated: "Every E step — then route to theatre/ICU/cath-lab/stroke/surgery",
        source: "RCUK / ATLS",
      },
    ],
    reassess:
      "After treating any finding — especially IM adrenaline, a fluid bolus, or warming/cooling — RETURN TO A and re-cycle. Anaphylaxis: reassess A/B/C at 5 min, repeat IM adrenaline if no improvement; after 2 IM doses treat as refractory (infusion + senior/ICU). Continue continuous monitoring; watch for biphasic reactions. Any deterioration is itself a return-to-A trigger.",
  },
};

/**
 * Anaphylaxis cross-cut — ONE protocol referenced from A/B/C/E (single
 * source of truth for the adrenaline constant + 5-min repeat + 2-dose →
 * refractory logic). §A.4.
 */
export const ANAPHYLAXIS_PROTOCOL = {
  recognition:
    "Acute onset + airway and/or breathing and/or circulation problem, usually with skin/mucosal changes (urticaria/angioedema/flushing), after a likely trigger.",
  firstLineDoseId: "anaphylaxis_adrenaline_im" as ResusDoseId,
  surfacesAt: ["A", "B", "C", "E"] as AbcdeLetter[],
  adjuncts: [
    "Remove the trigger",
    "High-flow oxygen",
    "Positioning — flat + legs up if hypotensive; sit up if breathing difficulty",
    "Early IV crystalloid bolus (volume clinician-titrated)",
    "Nebulised bronchodilator for persistent wheeze (adjunct only)",
  ],
  notRecommended:
    "Routine corticosteroids are NO LONGER recommended in acute anaphylaxis (ERC/RCUK 2025).",
  refractory:
    "No improvement after 2 appropriate IM doses → refractory: IV adrenaline INFUSION by experienced clinicians in a monitored setting + senior/ICU. Infusion rate is NOT shown here. Watch for biphasic reactions.",
  source: "RCUK Anaphylaxis guidance + ERC Guidelines 2025 Special Circumstances.",
} as const;

/**
 * Arrest-detection → stub seam (§A.5). The ONLY arrest logic in scope:
 * detect → prompt CPR → route to the ALS module + timestamp. No rhythm,
 * defibrillation, CPR-quality, arrest-drug, or 4Hs/4Ts logic here.
 */
export const ARREST_SEAM = {
  detectionCriteria:
    "Unresponsive AND not breathing normally (apnoea or agonal gasps — gasping is NOT normal breathing) and/or no central pulse / no signs of life. Checkable at any letter.",
  cprPrompt:
    "Start CPR now — begin chest compressions, call the resus team, get the defibrillator.",
  routeLabel: "ALS cardiac-arrest module — to follow",
  deferred:
    "Rhythm assessment, defibrillation/energy, CPR rate/depth/ratio, all arrest drug dosing (adrenaline-in-arrest, amiodarone), and 4Hs/4Ts are DEFERRED to the separately-signed-off ALS module.",
  source: "ERC Guidelines 2025 / AHA 2025 (full ALS algorithm deferred).",
} as const;

export function getStepCatalog(step: AbcdeLetter): StepCatalog {
  return ABCDE_CATALOG[step];
}

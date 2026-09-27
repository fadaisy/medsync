import type { Scenario } from "./exam-fixtures";
import type { SavedSet } from "@/lib/clerking/exam/compose";

import { everythingElseNormal, fillGrid, setChoice } from "@/lib/clerking/exam/answers";
import { rosierSignId } from "@/lib/clerking/exam/classifiers";
import { complain, ecat, gcs, negative, positive, scenario, tick } from "./exam-fixtures";

/**
 * The seven examination fixtures of PROMPT-CLERKING-EXAM-V2 §7 (synthetic patients). Each returns
 * the scenario and the saved vital-sign set the note reads.
 */

export interface Patient {
  s: Scenario;
  saved: SavedSet;
}

const saved = (s: Scenario, extra: Partial<SavedSet> = {}): SavedSet => ({
  values: s.vitals,
  arm: "right",
  position: "sitting",
  rhythm: "regular",
  site: "axillary",
  oxygen: s.exam.entries["ex.general.oxygen"]?.choice === "supplemental_oxygen" ? "oxygen" : "air",
  ...extra,
});

/** 1. Patient Three-3 (the prototype's default). */
export function three3(): Patient {
  const s = scenario({ patient: { ageYears: 76, sex: "male", pregnant: null } });
  complain(s, "sym.back_pain", { night_pain: "yes", weight_loss: "yes" });
  complain(s, "sym.diarrhoea");
  Object.assign(s.vitals, {
    sbp: 110,
    dbp: 70,
    pulse: 54,
    rr: 22,
    spo2: 95,
    temp: 35.8,
    glucose: 6.1,
  });
  gcs(s, 3, 4, 6, { acvpu: "C", orientation: { time: "no", place: "yes", person: "yes" } });
  s.exam = setChoice(ecat, s.exam, "ex.general.oxygen", "supplemental_oxygen");
  tick(s, "ex.general.oxygen", "modality", "cpap");
  positive(s, "ex.general.oxygen", { cpap_of_peep: 8, interface: "full_face_mask", fio2: 40 });
  positive(s, "ex.general.urinary_catheter", {
    route: "urethral",
    size: "16_fr",
    type: "2_way_foley",
    urine: "concentrated",
  });
  positive(s, "ex.general.distress", { type: ["respiratory", "pain"], pain_nrs: 6 });
  positive(s, "ex.respiratory.work_of_breathing", { signs: ["accessory_muscles"] });
  positive(s, "ex.general.hydration", {
    signs_present: ["lethargic_or_unconscious", "sunken_eyes", "drinks_poorly_or_not_able"],
  });
  positive(s, "ex.cardiovascular.murmurs", {
    timing: "pansystolic",
    loudest: "mitral_area_apex",
    grade_levine: "3_of_6",
    radiates: ["axilla"],
  });
  negative(s, "ex.cardiovascular.heart_sounds");
  positive(s, "ex.respiratory.crackles", {
    type: "fine",
    timing: "late_inspiratory",
    where: ["r_lower_back", "l_lower_back"],
  });
  negative(s, "ex.respiratory.trachea");
  positive(s, "ex.abdomen.tenderness", { where: ["right_iliac_fossa"], degree: "mild" });
  positive(s, "ex.abdomen.masses", {
    where: ["epigastrium"],
    consistency: "firm",
    mobility: "fixed",
  });
  positive(s, "ex.nervous.cn_vii", { type: "lower_motor_neuron", side: "left" });
  negative(s, "ex.nervous.cn_ii");
  positive(s, "ex.spine_joints.spinal_tenderness", { levels: ["l3"], elicited: "percussion" });
  s.exam = {
    ...s.exam,
    gate: {
      reason: "Back pain with red flags",
      consent: "verbal",
      chaperone: "present",
      name: "Sr N. Akello",
      role: "nurse",
      at: "2026-09-27T16:00:00Z",
      by: "doctor",
    },
  };
  positive(s, "ex.rectal_genital.prostate", {
    size: "moderately_enlarged",
    consistency: "firm",
    surface: "smooth",
    median_sulcus: "felt",
  });
  negative(s, "ex.rectal_genital.anal_tone");
  return { s, saved: saved(s, { oxygenModality: "CPAP" }) };
}

/** 2. Chest pain: 24 mmHg between the arms; absent left radial and femoral pulses. */
export function chestPain(): Patient {
  const s = scenario({ patient: { ageYears: 55, sex: "male", pregnant: null } });
  complain(s, "sym.chest_pain");
  Object.assign(s.vitals, { sbp: 162, dbp: 94, pulse: 96, rr: 18, spo2: 97, temp: 36.7 });
  s.exam = setChoice(ecat, s.exam, "ex.general.oxygen", "room_air");
  gcs(s, 4, 5, 6);
  s.exam = {
    ...s.exam,
    panels: { bothArms: { right: { sbp: 162, dbp: 94 }, left: { sbp: 138, dbp: 88 } } },
  };
  s.exam = fillGrid(s.exam, "pulses", ecat.grids.pulses, "present");
  s.exam.blocks.pulses!.Radial = { R: "present", L: "absent" };
  s.exam.blocks.pulses!.Femoral = { R: "present", L: "absent" };
  return { s, saved: saved(s) };
}

/** 3. Diabetic foot. */
export function diabeticFoot(): Patient {
  const s = scenario({ patient: { ageYears: 58, sex: "female", pregnant: null } });
  s.history.past.conditions.diabetes = { answer: "yes" };
  Object.assign(s.vitals, {
    sbp: 134,
    dbp: 82,
    pulse: 84,
    rr: 16,
    spo2: 98,
    temp: 36.9,
    glucose: 14.2,
  });
  positive(s, "ex.feet.ulcer", {
    site: "forefoot",
    side: "left",
    area: 2.5,
    depth: "skin_or_subcutaneous_only",
    infection_signs: ["local_warmth", "redness_2_cm_or_more"],
  });
  positive(s, "ex.feet.monofilament", { sites_not_felt_left: 2, sites_not_felt_right: 0 });
  positive(s, "ex.feet.foot_risk_history", { history: ["previous_foot_ulcer"] });
  s.exam = {
    ...s.exam,
    blocks: {
      ...s.exam.blocks,
      pulses: {
        "Dorsalis pedis": { R: "present", L: "absent" },
        "Posterior tibial": { R: "present", L: "present" },
      },
    },
  };
  return { s, saved: saved(s, { glucoseContext: "random" }) };
}

/** 4. Asthma: PEF 30%, SpO₂ 91%, speaks in words only. */
export function asthma(): Patient {
  const s = scenario({ patient: { ageYears: 24, sex: "female", pregnant: null } });
  complain(s, "sym.wheeze");
  s.history.past.conditions.asthma_or_copd = { answer: "yes" };
  Object.assign(s.vitals, { sbp: 124, dbp: 76, pulse: 118, rr: 28, spo2: 91, temp: 36.8 });
  s.exam = setChoice(ecat, s.exam, "ex.general.oxygen", "room_air");
  gcs(s, 4, 5, 6);
  positive(s, "ex.respiratory.wheeze");
  positive(s, "ex.respiratory.work_of_breathing", {
    signs: ["speaks_in_words_only", "accessory_muscles"],
  });
  s.exam = {
    ...s.exam,
    panels: {
      asthmaConfirmed: true,
      peakFlow: { best: 150, reference: 500, referenceKind: "predicted" },
    },
  };
  return { s, saved: saved(s) };
}

/** 5. Pneumonia: CRB65 4. */
export function pneumonia(): Patient {
  const s = scenario({ patient: { ageYears: 70, sex: "male", pregnant: null } });
  complain(s, "sym.cough");
  complain(s, "sym.fever");
  Object.assign(s.vitals, { sbp: 88, dbp: 58, pulse: 112, rr: 32, spo2: 93, temp: 38.9 });
  s.exam = setChoice(ecat, s.exam, "ex.general.oxygen", "room_air");
  gcs(s, 4, 4, 6, { acvpu: "C", orientation: { time: "no", place: "yes", person: "yes" } });
  positive(s, "ex.respiratory.crackles", { type: "coarse", where: ["r_lower", "r_lower_back"] });
  return { s, saved: saved(s) };
}

/** 6. Stroke: ROSIER +3. */
export function stroke(): Patient {
  const s = scenario({ patient: { ageYears: 67, sex: "female", pregnant: null } });
  complain(s, "sym.focal_weakness");
  Object.assign(s.vitals, {
    sbp: 172,
    dbp: 96,
    pulse: 88,
    rr: 16,
    spo2: 97,
    temp: 36.6,
    glucose: 6.2,
  });
  s.exam = setChoice(ecat, s.exam, "ex.general.oxygen", "room_air");
  gcs(s, 4, 5, 6);
  positive(s, "ex.nervous.cn_vii", { type: "upper_motor_neuron", side: "right" });
  positive(s, "ex.nervous.pronator_drift", { side: "right" });
  positive(s, "ex.nervous.speech", { type: ["expressive_dysphasia"] });
  s.exam = {
    ...s.exam,
    panels: {
      rosier: {
        syncope: "no",
        seizure: "no",
        newSigns: [
          "Asymmetric facial weakness",
          "Asymmetric arm weakness",
          "Speech disturbance",
        ].map(rosierSignId),
      },
    },
  };
  return { s, saved: saved(s, { glucoseContext: "random" }) };
}

/** 7. Meningococcal: fever, neck stiffness, non-blanching rash. */
export function meningococcal(): Patient {
  const s = scenario({ patient: { ageYears: 19, sex: "male", pregnant: null } });
  complain(s, "sym.fever");
  complain(s, "sym.headache");
  Object.assign(s.vitals, { sbp: 102, dbp: 64, pulse: 124, rr: 24, spo2: 96, temp: 39.4 });
  s.exam = setChoice(ecat, s.exam, "ex.general.oxygen", "room_air");
  gcs(s, 4, 5, 6);
  positive(s, "ex.nervous.neck_stiffness");
  positive(s, "ex.skin.petechiae_purpura", { blanching: "non_blanching" });
  const r = everythingElseNormal(ecat, s.exam, "nervous", { partId: "meninges", sex: "male" });
  s.exam = r.draft;
  return { s, saved: saved(s) };
}

export const PATIENTS = {
  three3,
  chestPain,
  diabeticFoot,
  asthma,
  pneumonia,
  stroke,
  meningococcal,
};

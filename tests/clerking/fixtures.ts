import type { History, HistoryHeader } from "@/lib/clerking/answers";
import type { Signoff } from "@/lib/clerking/flags";
import type { AdultVitals } from "@/lib/triage/types";

import raw from "@/data/clerking/clerking-history-catalogue.v1.json";
import { parseCatalogue } from "@/lib/clerking/catalogue";
import { scoreNews2 } from "@/lib/triage/scoring/news2";

/**
 * The prototype's two patients (Main.dc.html `base()`), in catalogue ids. Synthetic: "Patient
 * Three-3", 76, male. The chest-pain variant adds `last_episode: now`, which the prototype lacked.
 */

export const cat = parseCatalogue(raw);
export const SIGNED: Signoff = { flagRules: "all", referenceEntries: "all", withheld: [] };

export const header: HistoryHeader = { historian: "patient", language: "Luganda" };

export function patientThree3(): History {
  return {
    complaints: [
      {
        key: "pp",
        symptom: "sym.polyuria",
        duration: { value: 3, unit: "weeks" },
        props: {
          onset: "gradual",
          course: "worse",
          pattern: "large_volumes",
          nocturia: 4,
          associated: ["sym.weight_loss", "sym.blurred_vision"],
        },
        flags: {},
      },
      {
        key: "bp",
        symptom: "sym.back_pain",
        duration: { value: 2, unit: "months" },
        props: {
          site: "lower_back",
          onset: "gradual",
          character: "dull_aching",
          radiation: ["nowhere"],
          timing: ["constant", "worse_night"],
          relief: ["rest"],
          severity: 6,
        },
        flags: {
          night_pain: "yes",
          weight_loss: "yes",
          fever: "no",
          urine_difficulty: "no",
          leg_weakness: "no",
          cancer_history: "no",
          tb: "no",
        },
      },
    ],
    story:
      "Noticed about three weeks ago that he was passing far more urine and always thirsty; now wakes four times a night. His wife says his clothes have become loose. The back pain began before this and keeps him awake.",
    alsoAsked: {
      "sym.polyuria:diuretics": "no",
      "sym.polyuria:steroids": "no",
      "sym.polyuria:lithium": "no",
    },
    ros: {
      "sym.night_sweats": "no",
      "sym.loss_of_appetite": "yes",
      "sym.chest_pain": "no",
      "sym.palpitations": "no",
      "sym.breathless_exertion": "no",
      "sym.orthopnoea": "no",
      "sym.leg_swelling": "no",
      "sym.fainting": "no",
      "sym.cough": "no",
      "sym.sputum": "no",
      "sym.coughing_blood": "no",
      "sym.wheeze": "no",
      "sym.abdominal_pain": "no",
      "sym.nausea_vomiting": "no",
      "sym.bowel_change": "yes",
      "sym.rectal_bleeding": "no",
      "sym.dysuria": "no",
      "sym.haematuria": "no",
      "sym.joint_pain": "no",
      "sym.joint_swelling": "no",
      "sym.bone_pain": "yes",
      "sym.heat_intolerance": "no",
      "sym.neck_swelling": "no",
    },
    rosDetail: {
      "sym.bowel_change": {
        duration: { value: 3, unit: "weeks" },
        props: { onset: "gradual", change: "harder" },
        flags: {},
      },
      "sym.bone_pain": {
        duration: { value: 2, unit: "months" },
        props: {
          site: "ribs",
          character: "dull_aching",
          timing: ["constant", "worse_night"],
          severity: 7,
        },
        flags: {},
      },
    },
    past: {
      conditions: {
        hypertension: { answer: "yes", since: "over_5_years" },
        diabetes: { answer: "no" },
        kidney_disease: { answer: "no" },
        tuberculosis: { answer: "no" },
        cancer: { answer: "no" },
      },
      operations: "none",
    },
    family: {
      diabetes: { answer: "no" },
      hypertension: { answer: "yes", relations: ["mother"] },
      heart_disease: { answer: "no" },
      stroke: { answer: "no" },
      cancer: { answer: "no" },
    },
    social: {
      tobacco: "former",
      perDay: 10,
      years: 20,
      alcohol: "occasionally",
      drinks: ["local_brew"],
      living: "family",
      activity: "limited",
      occupation: "Retired teacher",
    },
  };
}

export function chestPainVariant(): History {
  const h = patientThree3();
  h.ros["sym.chest_pain"] = "yes";
  h.rosDetail["sym.chest_pain"] = {
    duration: { value: 2, unit: "hours" },
    props: {
      site: "central",
      onset: "sudden",
      character: "tight_pressing",
      radiation: ["left_arm", "jaw_neck"],
      timing: ["constant"],
      relief: ["nothing"],
      severity: 10,
      last_episode: "now",
    },
    flags: {
      exertional: "yes",
      sweating: "yes",
      breathlessness: "yes",
      fainting: "no",
      coughing_blood: "no",
    },
  };
  return h;
}

export const THREE3_VITALS: AdultVitals = {
  respiratoryRate: 12,
  spo2: 95,
  spo2Scale: "scale1",
  oxygen: null,
  systolicBp: 110,
  pulse: 54,
  consciousness: null,
  temperature: 32.5,
};

export const patient = { name: "Patient Three-3", ageYears: 76, sex: "male" as const };
export const medicines = [
  { name: "Amlodipine", frequency: "od", adherence: "sometimes_misses", source: "medicine_card" },
  { name: "Herbal medicine", frequency: "od", adherence: "as_prescribed", source: "patient" },
];
export const allergies = {
  status: "listed" as const,
  confirmedThisVisit: false,
  items: [{ name: "Cold", coded: false, reactions: [] as string[] }],
};
export const news2 = () => scoreNews2(THREE3_VITALS);

import type { Scenario } from "./exam-fixtures";
import type { DeskPayload } from "@/components/emr/desk/model";
import type { NoteContent } from "@/lib/emr/note-rules";

import { v2Payload } from "./fixtures";
import { chestPain, feverNeck, hypothermia, jaundiceFever } from "./si-fixtures";

/**
 * The prompt's patients 1 to 4 (§7) as whole v2 desk payloads, for the fixture route and the
 * end-to-end walks: the scenario's history, examination, vitals, medicines and patient on top of
 * the Patient Three-3 payload, with no diagnoses yet. Synthetic data only.
 */

export const SI_PATIENTS = {
  f1: { name: "Patient One-1", build: hypothermia },
  f2: { name: "Patient Two-2", build: chestPain },
  f3: { name: "Patient Three-7", build: feverNeck },
  f4: { name: "Patient Four-4", build: jaundiceFever },
} as const;
export type SiPatient = keyof typeof SI_PATIENTS;

// Medicines that name a restricted class (D-SI-18): held back from a viewer without access.
const RESTRICTED_MEDICINES = new Set(["Antiretrovirals"]);

export function scenarioPayload(
  s: Scenario,
  o: { name: string; canSeeRestricted?: boolean },
): DeskPayload {
  const p = v2Payload(s.history);
  const v = s.vitals;
  const sex = s.patient.sex;
  const age = s.patient.ageYears;
  const words = `${age} y · ${sex === "female" ? "Female" : "Male"}`;
  p.patient = { ...p.patient, name: o.name };
  p.safetyBar = { ...p.safetyBar, name: o.name, ageSex: words };
  p.diagnoses = [];
  p.draft = {
    ...p.draft!,
    content: { ...p.draft!.content, exam: s.exam as unknown as NoteContent["exam"] },
  };
  const k = p.clerking!;
  p.clerking = {
    ...k,
    sex,
    ageYears: age,
    canSeeRestricted: o.canSeeRestricted ?? true,
    vitals: {
      respiratoryRate: v.rr,
      spo2: v.spo2,
      spo2Scale: "scale1",
      oxygen: v.spo2 === null ? null : "air",
      systolicBp: v.sbp,
      pulse: v.pulse,
      consciousness: null,
      temperature: v.temp,
    },
    medicines: s.medicines.map((m, n) => ({
      statementId: `m${n + 1}`,
      name: m.name,
      doseText: null,
      frequencyCode: null,
      adherence: null,
      informant: "patient",
      restricted: RESTRICTED_MEDICINES.has(m.name),
      addedHere: false,
    })),
    exam: { ...k.exam, latest: { ...v }, pregnant: s.patient.pregnant },
  };
  return p;
}

export const siPatientPayload = (id: SiPatient, canSeeRestricted = true) =>
  scenarioPayload(SI_PATIENTS[id].build(), { name: SI_PATIENTS[id].name, canSeeRestricted });

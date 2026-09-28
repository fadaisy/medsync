/**
 * The only regimens MS-RX-CAT-001 ships with (ADR 0187 §5): the signed emergency formulary's
 * glucose, glucagon and crystalloid entries, laid over the catalogue drugs they name.
 *
 * Every quote is read from emergency-drug-catalog.ts at load, never retyped, so a value cannot
 * drift from what the CSO signed. The structured numbers below restate what each quote says;
 * tests/prescribing/formulary-regimens.test.ts fails unless every number appears in its quote.
 * The signed entries cite their sources by name, with no URL, and none is invented.
 *
 * Not carried: glucose's "75 mL of 20%" (no 20% entry in the catalogue; it stays a quote) and the
 * IO route (the catalogue fluids are IV only). No source gives an older-adult row; an older adult
 * is given the adult regimen with that said (lib/prescribing/formulary.ts).
 */
import type { EmergencyDrug } from "./emergency-drug-catalog";
import type { DrugDose, Regimen, RegimenSource } from "./formulary-types";

import { EMERGENCY_DRUG_CATALOG_META, getEmergencyDrug } from "./emergency-drug-catalog";

function entry(id: string): EmergencyDrug & { adult: NonNullable<EmergencyDrug["adult"]> } {
  const e = getEmergencyDrug(id);
  if (!e?.adult) throw new Error(`emergency formulary entry ${id} is missing its adult regimen`);
  return e as EmergencyDrug & { adult: NonNullable<EmergencyDrug["adult"]> };
}

const source = (e: EmergencyDrug, quote: string): RegimenSource => ({
  citation: e.source,
  quote,
  checkedAt: EMERGENCY_DRUG_CATALOG_META.verifiedOn,
});

const glucose = entry("glucose_iv");
const glucagon = entry("glucagon_im");
const crystalloid = entry("crystalloid_bolus");

/** Pulls the verbatim fragment out of a signed string; throws if the signed text changed. */
function fragment(text: string, part: string): string {
  if (!text.includes(part)) throw new Error(`signed text no longer contains "${part}": ${text}`);
  return part;
}

const glucoseRegimens: Regimen[] = [
  {
    id: "glucose_10.adult.hypoglycaemia",
    label: "Severe hypoglycaemia, with IV access",
    band: "adult",
    doseNum: 150,
    unit: "mL",
    strength: "10%",
    route: "iv",
    admin: fragment(glucose.adult.dose, "over 10–15 min"),
    freq: "stat",
    then: glucose.adult.interval,
    sources: [source(glucose, glucose.adult.dose)],
  },
  {
    id: "glucose_10.child.hypoglycaemia",
    label: "Severe hypoglycaemia, with IV access",
    band: "child",
    unit: "mL",
    strength: "10%",
    route: "iv",
    freq: "stat",
    perKg: { amount: 2, unit: "mL" },
    sources: [source(glucose, glucose.paediatric.note)],
  },
];

const glucagonRegimens: Regimen[] = [
  {
    id: "glucagon.adult.hypoglycaemia",
    label: "Severe hypoglycaemia, no IV access",
    band: "adult",
    doseNum: 1,
    unit: "mg",
    route: "im",
    method: "IM injection",
    freq: "stat",
    course: "single",
    then: glucagon.adult.interval,
    sources: [source(glucagon, glucagon.adult.dose)],
  },
  {
    id: "glucagon.child.younger",
    label: "Severe hypoglycaemia, no IV access",
    band: "child",
    doseNum: 500,
    unit: "µg",
    route: "im",
    method: "IM injection",
    freq: "stat",
    course: "single",
    appliesWhen: { ageYearsBelow: 8, weightKgBelow: 25 },
    sources: [source(glucagon, glucagon.paediatric.note)],
  },
  {
    id: "glucagon.child.older",
    label: "Severe hypoglycaemia, no IV access",
    band: "child",
    doseNum: 1,
    unit: "mg",
    route: "im",
    method: "IM injection",
    freq: "stat",
    course: "single",
    appliesWhen: { ageYearsAtLeast: 8, weightKgAtLeast: 25 },
    sources: [source(glucagon, glucagon.paediatric.note)],
  },
];

const bolusRegimens = (drugId: string): Regimen[] => [
  {
    id: `${drugId}.adult.bolus`,
    label: "Bolus for hypovolaemia or shock",
    band: "adult",
    doseRange: { low: 250, high: 500 },
    unit: "mL",
    route: "iv",
    freq: "stat",
    fluidPurpose: "bolus",
    then: crystalloid.adult.interval,
    sources: [source(crystalloid, crystalloid.adult.dose)],
  },
  {
    id: `${drugId}.child.bolus`,
    label: "Bolus for hypovolaemia or shock",
    band: "child",
    unit: "mL",
    route: "iv",
    freq: "stat",
    fluidPurpose: "bolus",
    perKg: { amount: 10, amountHigh: 20, unit: "mL" },
    sources: [source(crystalloid, crystalloid.paediatric.note)],
  },
];

const signed = (e: EmergencyDrug, regimens: Regimen[]): Omit<DrugDose, "verifyAt"> => ({
  status: "verified",
  csoSigned: true,
  origin: "emergency-formulary",
  regimens,
  bands: {
    adult: e.adult ? e.adult.dose : null,
    olderAdult: null,
    child: e.paediatric.note,
  },
  renal: null,
  hepatic: null,
  pregnancy: null,
  cautions: e.cautions,
});

/** Catalogue drug id → the signed dose laid over its `to-verify` shell. */
export const SIGNED_DOSES: Readonly<Record<string, Omit<DrugDose, "verifyAt">>> = {
  glucose_10: signed(glucose, glucoseRegimens),
  glucagon: signed(glucagon, glucagonRegimens),
  sodium_chloride_0_9: signed(crystalloid, bolusRegimens("sodium_chloride_0_9")),
  ringers_lactate: signed(crystalloid, bolusRegimens("ringers_lactate")),
};

/** The emergency formulary entry each signed catalogue drug came from. */
export const SIGNED_DOSE_ORIGIN: Readonly<Record<string, string>> = {
  glucose_10: glucose.id,
  glucagon: glucagon.id,
  sodium_chloride_0_9: crystalloid.id,
  ringers_lactate: crystalloid.id,
};

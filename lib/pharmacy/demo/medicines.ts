import type { DemoMedicine } from "./state";

import { drugById } from "@/lib/prescribing/formulary";

/**
 * The demo's shelf: medicines a national referral hospital stocks, by general formulary id (MS-RX-CAT-001). Names and
 * the controlled flag come from the formulary; the product name and issue unit are the demo's. No strengths, no doses.
 */
const SHELF: [id: string, form: string, unit: DemoMedicine["unit"]][] = [
  ["amoxicillin", "capsules", "capsule"],
  ["amoxicillin_clavulanic_acid", "tablets", "tablet"],
  ["ceftriaxone", "powder for injection", "vial"],
  ["metronidazole", "tablets", "tablet"],
  ["ciprofloxacin", "tablets", "tablet"],
  ["azithromycin", "tablets", "tablet"],
  ["doxycycline", "capsules", "capsule"],
  ["gentamicin", "injection", "ampoule"],
  ["co_trimoxazole", "tablets", "tablet"],
  ["flucloxacillin", "capsules", "capsule"],
  ["meropenem", "powder for injection", "vial"],
  ["vancomycin", "powder for injection", "vial"],
  ["rhze_fdc", "tablets", "tablet"],
  ["artemether_lumefantrine", "tablets", "tablet"],
  ["artesunate", "powder for injection", "vial"],
  ["fluconazole", "capsules", "capsule"],
  ["tld", "tablets", "tablet"],
  ["dolutegravir", "tablets", "tablet"],
  ["albendazole", "tablets", "tablet"],
  ["paracetamol", "tablets", "tablet"],
  ["ibuprofen", "tablets", "tablet"],
  ["diclofenac", "injection", "ampoule"],
  ["tramadol", "capsules", "capsule"],
  ["codeine", "tablets", "tablet"],
  ["morphine", "injection", "ampoule"],
  ["pethidine", "injection", "ampoule"],
  ["omeprazole", "capsules", "capsule"],
  ["metoclopramide", "tablets", "tablet"],
  ["ondansetron", "injection", "ampoule"],
  ["amlodipine", "tablets", "tablet"],
  ["enalapril", "tablets", "tablet"],
  ["losartan", "tablets", "tablet"],
  ["hydrochlorothiazide", "tablets", "tablet"],
  ["furosemide", "tablets", "tablet"],
  ["atorvastatin", "tablets", "tablet"],
  ["aspirin", "tablets", "tablet"],
  ["heparin_unfractionated", "injection", "vial"],
  ["enoxaparin", "injection", "ampoule"],
  ["salbutamol", "inhaler", "inhaler"],
  ["beclometasone", "inhaler", "inhaler"],
  ["metformin", "tablets", "tablet"],
  ["glibenclamide", "tablets", "tablet"],
  ["insulin_isophane", "injection", "vial"],
  ["insulin_soluble", "injection", "vial"],
  ["prednisolone", "tablets", "tablet"],
  ["hydrocortisone", "powder for injection", "vial"],
  ["dexamethasone", "injection", "ampoule"],
  ["phenytoin", "tablets", "tablet"],
  ["sodium_valproate", "tablets", "tablet"],
  ["carbamazepine", "tablets", "tablet"],
  ["phenobarbital", "tablets", "tablet"],
  ["diazepam", "injection", "ampoule"],
  ["lorazepam", "injection", "ampoule"],
  ["midazolam", "injection", "ampoule"],
  ["haloperidol", "injection", "ampoule"],
  ["amitriptyline", "tablets", "tablet"],
  ["ferrous_sulfate", "tablets", "tablet"],
  ["folic_acid", "tablets", "tablet"],
  ["oxytocin", "injection", "ampoule"],
  ["magnesium_sulfate", "injection", "ampoule"],
  ["sodium_chloride_0_9", "infusion", "bag"],
  ["ringers_lactate", "infusion", "bag"],
  ["glucose_50", "injection", "ampoule"],
  ["oral_rehydration_salts", "sachets", "sachet"],
  ["zinc_sulfate", "tablets", "tablet"],
  ["adrenaline", "injection", "ampoule"],
  ["naloxone", "injection", "ampoule"],
  ["tranexamic_acid", "injection", "ampoule"],
  ["potassium_chloride", "injection", "ampoule"],
  ["chlorphenamine", "tablets", "tablet"],
];

/** The shelf, keeping only ids the formulary has (a renamed id drops out rather than inventing a medicine). */
export function demoMedicines(): DemoMedicine[] {
  return SHELF.flatMap(([id, form, unit]) => {
    const d = drugById(id);
    return d ? [{ id, name: d.generic, product: `${d.generic} ${form}`, unit, controlled: d.flags.controlled }] : [];
  });
}

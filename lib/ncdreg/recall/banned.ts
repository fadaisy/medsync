/**
 * E4: an SMS never names a disease, a measurement, a medicine or the department. The banned list is
 * built from data, so a module or medicine added to the standard is banned without a code change:
 * the fixed words of E4, every medicine label, code and ATC code on the seeded list, and every module
 * label and `sms_banned_terms` entry in the condition catalogue. Client-safe (no server imports).
 */
import type { ConditionModule } from "../standard/types";
import { MEDICINE_LIST } from "../standard/code-lists";
import { CONDITION_CATALOGUE } from "../standard/conditions";

/**
 * E4's named words, plus a few measurement and department words the prompt's list implies. The two
 * condition names E4 lists come from the catalogue (module codes and labels), not from here (§5.6).
 */
const FIXED = [
  "diabetic",
  "sugar",
  "glucose",
  "pressure",
  "hypertensive",
  "insulin",
  "kidney",
  "NCD",
  "blood",
  "cholesterol",
  "HbA1c",
];

/** Lower case, anything not a letter or digit becomes one space. */
export const normaliseTerm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export function bannedTerms(catalogue: readonly ConditionModule[] = CONDITION_CATALOGUE): string[] {
  // The catch-all "Other" row names no medicine; banning the word "other" would ban plain English.
  const medicines = MEDICINE_LIST.medicines
    .filter((m) => m.group !== "other")
    .flatMap((m) => [m.label, m.code, m.atc]);
  const modules = catalogue.flatMap((m) => [m.label, m.code, ...m.sms_banned_terms]);
  return [...new Set([...FIXED, ...medicines, ...modules].map(normaliseTerm).filter((t) => t.length > 1))].sort();
}

/** Placeholders a template may carry; they are filled at send time and are not scanned as words. */
export const PLACEHOLDERS = ["[HOSPITAL NAME]", "[DATE]", "[CLINIC PHONE]"] as const;

/**
 * The banned terms a text contains, matched at the start of a word ("insulins" matches "insulin";
 * "pressured" matches "pressure"; "sugarcane" does too, which is the safe side).
 */
export function bannedTermsIn(text: string, terms: readonly string[] = bannedTerms()): string[] {
  let body = text;
  for (const p of PLACEHOLDERS) body = body.split(p).join(" ");
  const words = ` ${normaliseTerm(body)}`;
  return terms.filter((t) => words.includes(` ${t}`));
}

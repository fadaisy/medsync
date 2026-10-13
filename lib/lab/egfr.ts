/**
 * eGFR (Lab Phase 2 §6.3, rules EG-1 to EG-3; LD-10, D-LAB2-20; ADR 0254). Pure.
 *
 * Calculated, never typed: the race-free CKD-EPI 2021 creatinine equation, adults only, from an
 * IDMS-traceable creatinine, at a hospital that reports it. The code is the equation's shape only; every
 * constant (and the adult age) comes from the signed REF-EGFR-CKDEPI-2021 entry. Without a signed entry
 * there is no eGFR.
 *
 *   eGFR = a × min(Scr/κ, 1)^α × max(Scr/κ, 1)^b × ageBase^age × (femaleFactor if female)
 *   with Scr in mg/dL (µmol/L ÷ umolPerMgdl), κ and α by sex.
 */
import type { Sex } from "@/lib/lab/ranges";
import type { SignedConfig } from "@/lib/lab/signed-config";

import { isDecimal } from "@/lib/lab/catalogue";
import { inForce } from "@/lib/lab/signed-config";

export const EGFR_REF = "REF-EGFR-CKDEPI-2021";
export const EGFR_CONSTANTS = [
  "a",
  "kappaFemale",
  "kappaMale",
  "alphaFemale",
  "alphaMale",
  "b",
  "ageBase",
  "femaleFactor",
  "umolPerMgdl",
  "adultAgeYears",
] as const;

export type EgfrReason =
  | "no_signed_reference"
  | "not_released"
  | "unit_not_umol"
  | "under_adult_age"
  | "age_missing"
  | "sex_missing"
  | "method_not_traceable"
  | "not_reported_here";

export type EgfrResult =
  | { ok: true; value: string; refVersion: number }
  | { ok: false; reason: EgfrReason };

export interface EgfrInput {
  creatinine: string;
  unitUcum: string;
  released: boolean;
  ageYears: number | null;
  sex: Sex | null;
  idmsTraceable: boolean | null;
  reportEgfr: boolean;
  configs: readonly SignedConfig[];
  at: Date;
}

/** EG-1, EG-2: every condition, or the first that fails (the creatinine report says which). */
export function egfrFor(i: EgfrInput): EgfrResult {
  const ref = inForce(i.configs, "ref", EGFR_REF, i.at);
  const k = ref?.payload.constants;
  if (!ref || !k || EGFR_CONSTANTS.some((c) => !k[c]))
    return { ok: false, reason: "no_signed_reference" };
  if (!i.reportEgfr) return { ok: false, reason: "not_reported_here" };
  if (!i.released) return { ok: false, reason: "not_released" };
  if (i.unitUcum !== "umol/L" || !isDecimal(i.creatinine))
    return { ok: false, reason: "unit_not_umol" };
  if (i.idmsTraceable !== true) return { ok: false, reason: "method_not_traceable" };
  if (i.ageYears === null) return { ok: false, reason: "age_missing" };
  if (i.ageYears < Number(k.adultAgeYears)) return { ok: false, reason: "under_adult_age" };
  if (i.sex === null) return { ok: false, reason: "sex_missing" };
  const n = (c: (typeof EGFR_CONSTANTS)[number]) => Number(k[c]);
  const female = i.sex === "female";
  const scr = Number(i.creatinine) / n("umolPerMgdl");
  const ratio = scr / n(female ? "kappaFemale" : "kappaMale");
  const value =
    n("a") *
    Math.min(ratio, 1) ** n(female ? "alphaFemale" : "alphaMale") *
    Math.max(ratio, 1) ** n("b") *
    n("ageBase") ** i.ageYears *
    (female ? n("femaleFactor") : 1);
  return { ok: true, value: String(Math.round(value)), refVersion: ref.version };
}

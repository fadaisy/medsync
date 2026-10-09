import type { ExamContext, ResultFact } from "../exam/context";
import type { StageInputs } from "./stages";

import { egfr } from "@/lib/ncdreg/standard/calculations";
import { pregnancyState } from "../exam/context";
import { acvpuOf } from "../exam/scores";

/**
 * The record's values a severity stage reads (D-REL-14), from the desk's examination context. The
 * windows and the AKI baseline are build rulings STG-04/05 (signed with the build rulings): a value
 * older than its window counts as not recorded, and blank is never negative. Pure.
 */

/** The result concepts the stages need beyond what the desk already loads. */
export const STAGE_RESULT_CONCEPTS = ["obs.haemoglobin", "obs.urea"] as const;

const DAY = 86_400_000;

function newest(x: ExamContext, concept: string, days: number): ResultFact | null {
  const now = Date.parse(x.now ?? new Date().toISOString());
  return (
    (x.facts ?? [])
      .filter((f) => f.concept === concept && now - Date.parse(f.at) <= days * DAY)
      .sort((a, b) => b.at.localeCompare(a.at))[0] ?? null
  );
}

/** STG-04: the AKI baseline is the lowest creatinine in the 90 days before the current one. */
function baselineCreatinine(x: ExamContext, current: ResultFact): number | null {
  const at = Date.parse(current.at);
  const prior = (x.facts ?? []).filter(
    (f) =>
      f.concept === "obs.creatinine" && Date.parse(f.at) < at && at - Date.parse(f.at) <= 90 * DAY,
  );
  return prior.length ? Math.min(...prior.map((f) => f.value)) : null;
}

export function stageInputsFrom(
  x: ExamContext,
  pregnancy?: { gestationWeeks?: number | null } | null,
): StageInputs {
  const { ageYears, sex } = x.patient;
  const ps = pregnancyState(x);
  // STG-05 windows: haemoglobin 7 days, creatinine and urea 2 days (this illness), eGFR/ACR 365 days.
  const hb = newest(x, "obs.haemoglobin", 7);
  const cr = newest(x, "obs.creatinine", 2);
  const crChronic = newest(x, "obs.creatinine", 365);
  const acr = newest(x, "obs.uacr", 365);
  const urea = newest(x, "obs.urea", 2);
  const level = acvpuOf(x.exam.blocks?.consciousness);
  return {
    ageYears,
    sex,
    pregnant: ps === "current" ? true : ps === "not_pregnant" ? false : null,
    gestationWeeks: pregnancy?.gestationWeeks ?? null,
    hbGPerL: hb ? Math.round(hb.value * 10) : null, // canonical g/dL → g/L (WHO 2024 is in g/L)
    egfr:
      crChronic && ageYears !== null && sex !== null
        ? Math.round(egfr(crChronic.value, ageYears, sex))
        : null,
    acrMgPerMmol: acr?.value ?? null,
    creatinineUmol: cr?.value ?? null,
    baselineCreatinineUmol: cr ? baselineCreatinine(x, cr) : null,
    confusion: level === null ? null : level !== "A",
    ureaMmol: urea?.value ?? null,
    rr: x.vitals.rr,
    sbp: x.vitals.sbp,
    dbp: x.vitals.dbp,
  };
}

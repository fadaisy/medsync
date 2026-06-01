import type { DerivedMetrics, ParameterScore } from "../types";

import { ESI_V5_ADULT_DANGER, MEOWS } from "../constants";

/**
 * MEOWS obstetric scorer — pure, deterministic (CSO catalog Part D).
 *
 * Classifies each obstetric vital as its worst single colour (Red /
 * Yellow / normal) and returns the counts; meowsToAcuity maps them to
 * an acuity. Replaces the old "obstetric provisional, assess manually"
 * placeholder.
 *
 * Catalog-faithful design choices:
 *  - HYPERTENSION is the obstetric emergency: ≥140/90 Yellow, ≥160/110
 *    Red. There is NO low-BP and NO standalone-tachycardia trigger
 *    (pregnancy: HR +10–20 normal, BP falls 2nd trimester). Tachycardia
 *    contributes ONLY via the Modified Shock Index (needs low MAP too).
 *  - Temp ≥38 → Red (chorioamnionitis/sepsis deteriorates fast).
 *  - SpO₂ <95 → Yellow (reduced reserve / PE risk); <92 → Red (reuses
 *    ESI_V5_ADULT_DANGER.SPO2_LT, the same significant-hypoxaemia line).
 *  - MSI = HR/MAP > 1.7 → Red (concealed-haemorrhage catch).
 *  - Missing vitals → not_recorded + provisional, never silently normal.
 *
 * scoreAcuity is a worse-of FLOOR only: obstetric_severe_htn
 * (discriminator, minAcuity 1) still independently reaches L1, and
 * eclampsia / haemorrhage reach L1 via Step-0 — so severe HTN is never
 * under-called.
 */

export interface MeowsInput {
  systolicBp: number | null;
  diastolicBp: number | null;
  temperature: number | null;
  spo2: number | null;
  /** Modified Shock Index flag from derived metrics. */
  modifiedShockIndexFlag: DerivedMetrics["modifiedShockIndexFlag"];
}

export interface MeowsResult {
  ruleset: "obstetric_meows";
  redCount: number;
  yellowCount: number;
  parameters: ParameterScore[];
  missing: string[];
  provisional: boolean;
  reasons: string[];
}

export function scoreMeows(v: MeowsInput): MeowsResult {
  const parameters: ParameterScore[] = [];
  const missing: string[] = [];
  const reasons: string[] = [];
  let redCount = 0;
  let yellowCount = 0;

  // Blood pressure (systolic + diastolic each classified to its worst colour).
  if (v.systolicBp === null && v.diastolicBp === null) {
    missing.push("blood_pressure");
    parameters.push({
      parameter: "blood_pressure",
      present: false,
      value: null,
      points: 0,
      band: "not recorded",
    });
  } else {
    const sys = v.systolicBp;
    const dia = v.diastolicBp;
    const severe =
      (sys !== null && sys >= MEOWS.SEVERE_HTN_SYS_GTE) ||
      (dia !== null && dia >= MEOWS.SEVERE_HTN_DIA_GTE);
    const htn =
      (sys !== null && sys >= MEOWS.HTN_SYS_GTE) || (dia !== null && dia >= MEOWS.HTN_DIA_GTE);
    if (severe) {
      redCount++;
      parameters.push({
        parameter: "blood_pressure",
        present: true,
        value: sys ?? dia,
        points: 3,
        band: `BP ${sys ?? "—"}/${dia ?? "—"} ≥160/110 = severe (Red)`,
      });
      reasons.push(
        `Severe-range BP ${sys ?? "—"}/${dia ?? "—"} — pre-eclampsia/eclampsia/stroke risk.`,
      );
    } else if (htn) {
      yellowCount++;
      parameters.push({
        parameter: "blood_pressure",
        present: true,
        value: sys ?? dia,
        points: 2,
        band: `BP ${sys ?? "—"}/${dia ?? "—"} ≥140/90 = hypertension (Yellow)`,
      });
      reasons.push(`Hypertension ${sys ?? "—"}/${dia ?? "—"} in pregnancy.`);
    } else {
      parameters.push({
        parameter: "blood_pressure",
        present: true,
        value: sys ?? dia,
        points: 0,
        band: "normal",
      });
    }
  }

  // Temperature — ≥38 Red (sepsis).
  if (v.temperature === null) {
    missing.push("temperature");
    parameters.push({
      parameter: "temperature",
      present: false,
      value: null,
      points: 0,
      band: "not recorded",
    });
  } else if (v.temperature >= MEOWS.TEMP_SEPSIS_GTE) {
    redCount++;
    parameters.push({
      parameter: "temperature",
      present: true,
      value: v.temperature,
      points: 3,
      band: `Temp ${v.temperature}°C ≥38 = sepsis concern (Red)`,
    });
    reasons.push(
      `Temp ${v.temperature}°C — chorioamnionitis/sepsis; obstetric sepsis deteriorates fast.`,
    );
  } else {
    parameters.push({
      parameter: "temperature",
      present: true,
      value: v.temperature,
      points: 0,
      band: "normal",
    });
  }

  // SpO₂ — <92 Red, 92–94 Yellow.
  if (v.spo2 === null) {
    missing.push("spo2");
    parameters.push({
      parameter: "spo2",
      present: false,
      value: null,
      points: 0,
      band: "not recorded",
    });
  } else if (v.spo2 < ESI_V5_ADULT_DANGER.SPO2_LT) {
    redCount++;
    parameters.push({
      parameter: "spo2",
      present: true,
      value: v.spo2,
      points: 3,
      band: `SpO₂ ${v.spo2} <92 = significant hypoxaemia (Red)`,
    });
    reasons.push(
      `SpO₂ ${v.spo2}% — significant hypoxaemia; consider PE (pregnancy is prothrombotic).`,
    );
  } else if (v.spo2 < MEOWS.SPO2_CONCERN_LT) {
    yellowCount++;
    parameters.push({
      parameter: "spo2",
      present: true,
      value: v.spo2,
      points: 2,
      band: `SpO₂ ${v.spo2} <95 = reduced reserve (Yellow)`,
    });
  } else {
    parameters.push({ parameter: "spo2", present: true, value: v.spo2, points: 0, band: "normal" });
  }

  // Modified Shock Index — haemorrhage Red. Not "missing" if uncomputable;
  // surfaced as a note so a normal BP + rising HR isn't falsely reassuring.
  if (v.modifiedShockIndexFlag === "haemorrhage") {
    redCount++;
    parameters.push({
      parameter: "modified_shock_index",
      present: true,
      value: null,
      points: 3,
      band: "MSI >1.7 = obstetric haemorrhage (Red)",
    });
    reasons.push("Modified Shock Index >1.7 — early obstetric haemorrhage; may be concealed.");
  } else if (v.modifiedShockIndexFlag === null) {
    reasons.push(
      "MSI not computable (need HR + BP) — do not be reassured by a normal BP with rising HR.",
    );
  }

  const provisional = missing.length > 0;
  return {
    ruleset: "obstetric_meows",
    redCount,
    yellowCount,
    parameters,
    missing,
    provisional,
    reasons,
  };
}

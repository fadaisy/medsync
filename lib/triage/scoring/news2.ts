import type { AdultVitals, News2Result, ParameterScore } from "../types";

import {
  NEWS2_ACVPU_POINTS,
  NEWS2_OXYGEN_POINTS,
  NEWS2_PULSE,
  NEWS2_RESP_RATE,
  NEWS2_SPO2_SCALE1,
  NEWS2_SPO2_SCALE2_AIR,
  NEWS2_SPO2_SCALE2_OXYGEN,
  NEWS2_SYSTOLIC_BP,
  NEWS2_TEMPERATURE,
} from "../constants";
import { scoreBand } from "./bands";

/**
 * NEWS2 scorer — pure, deterministic, side-effect-free (kickoff §0.1).
 *
 * Computes the National Early Warning Score 2 from an adult vital set,
 * exactly per docs/clinical/triage-medical-research.md §3. Returns the
 * aggregate, the single-parameter-3 "red score" flag, a fully
 * transparent per-parameter breakdown (kickoff §0.2 — no black box),
 * and a provisional flag when any input is missing (research doc §10 —
 * a gap is never treated as normal).
 *
 * No randomness, no time, no I/O: the same AdultVitals always yields an
 * identical News2Result — medico-legally reproducible (kickoff §0.1).
 */
export function scoreNews2(v: AdultVitals): News2Result {
  const parameters: ParameterScore[] = [];
  const missing: string[] = [];

  // Respiratory rate
  parameters.push(
    scoreOne("respiratory_rate", v.respiratoryRate, NEWS2_RESP_RATE, "/min", missing),
  );

  // SpO₂ — scale 1 by default; scale 2 only when clinician-enabled
  // (research doc §3). On scale 2, the on-oxygen sub-bands apply when
  // the patient is on supplemental O₂.
  const spo2Bands =
    v.spo2Scale === "scale2"
      ? v.oxygen === "oxygen"
        ? NEWS2_SPO2_SCALE2_OXYGEN
        : NEWS2_SPO2_SCALE2_AIR
      : NEWS2_SPO2_SCALE1;
  parameters.push(scoreOne("spo2", v.spo2, spo2Bands, "%", missing));

  // Systolic BP
  parameters.push(scoreOne("systolic_bp", v.systolicBp, NEWS2_SYSTOLIC_BP, "mmHg", missing));

  // Pulse
  parameters.push(scoreOne("pulse", v.pulse, NEWS2_PULSE, "/min", missing));

  // Temperature
  parameters.push(scoreOne("temperature", v.temperature, NEWS2_TEMPERATURE, "°C", missing));

  // Consciousness (ACVPU) — discrete, not a band lookup
  parameters.push(scoreAcvpu(v.consciousness, missing));

  // Supplemental oxygen — an aggregate modifier, surfaced as its own
  // transparent line so the +2 is visible (research doc §3).
  const onOxygen = v.oxygen === "oxygen";
  if (v.oxygen === null) missing.push("oxygen");
  parameters.push({
    parameter: "supplemental_oxygen",
    present: v.oxygen !== null,
    value: v.oxygen,
    points: onOxygen ? NEWS2_OXYGEN_POINTS : 0,
    band: onOxygen ? "on oxygen = +2" : "on air = 0",
  });

  const total = parameters.reduce((sum, p) => sum + p.points, 0);
  // The "red score" rule looks only at the 0–3 per-parameter scores,
  // NOT the oxygen +2 modifier (which maxes at 2). Research doc §3.
  const hasSingleParameterThree = parameters.some(
    (p) => p.parameter !== "supplemental_oxygen" && p.points === 3,
  );

  return {
    ruleset: "adult_news2",
    total,
    hasSingleParameterThree,
    parameters,
    missing,
    provisional: missing.length > 0,
  };
}

function scoreOne(
  parameter: string,
  value: number | null,
  bands: Parameters<typeof scoreBand>[1],
  unit: string,
  missing: string[],
): ParameterScore {
  if (value === null) {
    missing.push(parameter);
    return { parameter, present: false, value: null, points: 0, band: "not recorded" };
  }
  const points = scoreBand(value, bands);
  if (points === null) {
    // Implausible value outside every band — treat as unscoreable, flag.
    missing.push(parameter);
    return { parameter, present: false, value, points: 0, band: "value out of range" };
  }
  return { parameter, present: true, value, points, band: `${value}${unit} = +${points}` };
}

function scoreAcvpu(
  consciousness: AdultVitals["consciousness"],
  missing: string[],
): ParameterScore {
  if (consciousness === null) {
    missing.push("consciousness");
    return {
      parameter: "consciousness",
      present: false,
      value: null,
      points: 0,
      band: "not recorded",
    };
  }
  const points = NEWS2_ACVPU_POINTS[consciousness] ?? 0;
  return {
    parameter: "consciousness",
    present: true,
    value: consciousness,
    points,
    band: consciousness === "A" ? "Alert = 0" : `${consciousness} = +${points}`,
  };
}

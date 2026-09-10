/** Formatting helpers. British English, units always shown. */

/**
 * The separator the design system uses between related values.
 *
 * Written as an escape rather than the literal character so that every source
 * file stays pure ASCII. The single-file preview build has no charset
 * declaration of its own, because the page embedding it supplies one, and a
 * literal middle dot decoded as Latin-1 renders as two wrong characters.
 */
export const DOT = "\u00B7";

import type { ArbitrationState, AutonomyLevel } from "../engine/types.ts";

/** Simulated seconds since implant, as "Day 3, 14:07". */
export function simTime(seconds: number): string {
  const day = Math.floor(seconds / 86_400);
  const rest = seconds % 86_400;
  const hour = Math.floor(rest / 3600);
  const minute = Math.floor((rest % 3600) / 60);
  return `Day ${day}, ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** Simulated seconds as a compact log timestamp, "003 14:07:22". */
export function logTime(seconds: number): string {
  const day = Math.floor(seconds / 86_400);
  const rest = seconds % 86_400;
  const hour = Math.floor(rest / 3600);
  const minute = Math.floor((rest % 3600) / 60);
  const second = Math.floor(rest % 60);
  return (
    `${String(day).padStart(3, "0")} ` +
    `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`
  );
}

export function num(value: number | null | undefined, digits = 1, fallback = "--"): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return fallback;
  return value.toFixed(digits);
}

export function pct(value: number, digits = 1): string {
  return `${value.toFixed(digits)} %`;
}

export const ARBITRATION_LABEL: Record<ArbitrationState, string> = {
  valid: "Valid",
  "doubtful-one": "Doubtful, one tip",
  invalid: "Invalid",
  bridged: "Bridged",
};

/**
 * The colour each arbitration state is drawn in.
 *
 * Red appears here for one reason only: invalid means the device has stopped
 * trusting its own readings. Nothing else on the bench is red except the
 * insulin path.
 */
export const ARBITRATION_COLOUR: Record<ArbitrationState, string> = {
  valid: "var(--color-teal-600)",
  "doubtful-one": "var(--color-amber)",
  invalid: "var(--color-red)",
  bridged: "var(--color-muted)",
};

export const AUTONOMY_DESCRIPTION: Record<AutonomyLevel, string> = {
  0: "No insulin is being delivered",
  1: "Fixed safe basal from the envelope. No modulation, no boluses",
  2: "Basal modulation only, on the trusted reading. No correction boluses",
  3: "Full closed loop inside the clinician envelope, corrections allowed",
};

/** What MedSync outside the body would be doing, given the device state. */
export function medsyncPosture(input: {
  arbitration: ArbitrationState;
  autonomy: AutonomyLevel;
  telemetryOk: boolean;
  phonePresent: boolean;
  silenceS: number;
  batteryLow: boolean;
}): string {
  if (!input.telemetryOk || !input.phonePresent) {
    const minutes = Math.floor(input.silenceS / 60);
    return `No telemetry for ${minutes} min. MedSync shows the last known reading and a silence warning. The loop inside the body is unaffected`;
  }
  if (input.arbitration === "invalid") {
    return "MedSync shows a suspended or fallback banner, asks for a finger-prick reading, and pages the on-call clinician if it persists";
  }
  if (input.arbitration === "bridged") {
    return "MedSync is relaying the external monitor and showing that the implants are not being trusted";
  }
  if (input.arbitration === "doubtful-one") {
    return "MedSync shows reduced autonomy with the reason, and schedules a review of the flagged tip";
  }
  if (input.batteryLow) return "MedSync is showing a battery warning and a recharge prompt";
  return "MedSync is logging readings and showing a normal closed loop";
}

/**
 * The emergency numbers Help dials (Tide v1 §8.7, PRD Q1).
 *
 * 112 is the general emergency line. 912 is the MoH ambulance short code
 * announced for late 2025; whether it is live is not verified, so the owner
 * decided (PRD Q1) that SOS dials 112 until the MoH and the CSO confirm 912.
 * Changing `dial` is that sign-off, not a build setting.
 */
export const EMERGENCY_NUMBERS = {
  general: "112",
  ambulance: "912",
  status: "pending-moh-cso",
} as const;

/** The number SOS dials. */
export const SOS_DIAL = EMERGENCY_NUMBERS.general;

/** Seconds between pressing SOS and the call, so a pocket press can be cancelled. */
export const SOS_COUNTDOWN_S = 3;

/** The danger interrupt's recheck wait. */
export const RECHECK_MINUTES = 5;

/** Help's symptom chips (§8.7). Keys go nowhere but the medic card on this screen. */
export const SYMPTOMS = [
  { key: "chest", label: "Chest pain" },
  { key: "breath", label: "Hard to breathe" },
  { key: "sugar", label: "Sugar very low or high" },
  { key: "faint", label: "Fainted or confused" },
  { key: "stroke", label: "Face, arm or speech weak" },
  { key: "other", label: "Something else" },
] as const;

export type SymptomKey = (typeof SYMPTOMS)[number]["key"];

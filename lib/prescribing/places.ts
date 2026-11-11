import type { AvailabilityOrigin } from "./pharmacy";

/**
 * The places that prescribe (prescribing kit F1). Each sets where the medicines are collected: the
 * pharmacy point whose stock the checks read (`origin`, the AV-2 word) and the words the dialog shows
 * when no live point names it. Resus is given from the cart first; the line only restocks it.
 */
export const PRESCRIBE_PLACES = [
  "clinic",
  "clerking",
  "ward",
  "resus",
  "ncd",
  "going_home",
] as const;
export type PrescribePlace = (typeof PRESCRIBE_PLACES)[number];

export const PLACE: Record<
  PrescribePlace,
  { label: string; origin: AvailabilityOrigin; collect: string }
> = {
  clinic: { label: "Clinic visit", origin: "window", collect: "Main window" },
  clerking: { label: "Clerking · Plan", origin: "wards", collect: "the ward" },
  ward: { label: "Ward round", origin: "wards", collect: "the ward" },
  resus: { label: "Resus", origin: "emergency", collect: "Resus cart" },
  ncd: { label: "NCD clinic", origin: "window", collect: "Main window" },
  going_home: { label: "Going home", origin: "window", collect: "Main window" },
};

/**
 * The place the encounter desk prescribes from: an inpatient visit is a ward round, any other visit a
 * clinic visit. Resus is only the resus page (given from the cart), never an emergency visit's desk.
 */
export const placeOfEncounter = (encounterType: string | null): PrescribePlace =>
  encounterType === "inpatient" ? "ward" : "clinic";

/** The prescriber's word for a placed line (kit F1). The pharmacy's own states arrive with P2. */
export function rxWord(
  r: { state: string; awaitingCosign: boolean; cosignWithheld: boolean },
  place: PrescribePlace,
): string {
  if (r.cosignWithheld) return "Co-sign withheld";
  if (r.awaitingCosign) return "Waiting for co-sign";
  if (r.state === "cancelled") return "Stopped";
  if (r.state === "administered") return "Given";
  if (r.state === "completed") return "Completed";
  return place === "resus" ? "Given from the cart" : "Waiting at pharmacy";
}

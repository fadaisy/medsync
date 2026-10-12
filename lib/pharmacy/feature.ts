import { PHARMACY_PHASE1_COPY, PHARMACY_SIGNED_COPY } from "@/content/pharmacy";
import { workspaceLiveFor } from "@/lib/workspace-access/flag";

/**
 * PHARMACY_WORKSPACE (Pharmacy Phase 0, Law 14): "1" or a comma-separated list of hospital ids.
 * Off by default; with it off, sign-in and /clinician behave as before and /pharmacy is not found.
 * CS-5: in production it stays off while any pharmacy safety wording is unsigned.
 */
export function pharmacyWorkspaceLiveFor(hospitalId: string): boolean {
  return workspaceLiveFor(
    process.env.PHARMACY_WORKSPACE,
    hospitalId,
    PHARMACY_SIGNED_COPY,
    "pharmacy_workspace",
  );
}

/**
 * Pharmacy Phase 1 (Law 15): four per-hospital flags, off by default, each inside the pharmacy
 * workspace. With all four off, /pharmacy and the prescriber's screens are the Phase 0 baseline.
 * Dispensing also goes live per dispensing point (RD-1, RD-2): a flag never switches a point on.
 * In production each stays off while the content it shows is unsigned (RD-4, D-PH1-03): until the
 * Phase 1 wording is signed, the notices list below is the gate.
 */
const live = (value: string | undefined, hospitalId: string, tag: string) =>
  workspaceLiveFor(value, hospitalId, PHARMACY_PHASE1_COPY, tag) &&
  pharmacyWorkspaceLiveFor(hospitalId);

export const pharmacyDispensingLiveFor = (hospitalId: string) =>
  live(process.env.PHARMACY_DISPENSING, hospitalId, "pharmacy_dispensing");
export const pharmacyStockAnswerLiveFor = (hospitalId: string) =>
  live(process.env.PHARMACY_STOCK_ANSWER, hospitalId, "pharmacy_stock_answer");
export const pharmacyPatientListLiveFor = (hospitalId: string) =>
  live(process.env.PHARMACY_PATIENT_LIST, hospitalId, "pharmacy_patient_list");
export const pharmacyDowntimeLiveFor = (hospitalId: string) =>
  live(process.env.PHARMACY_DOWNTIME, hospitalId, "pharmacy_downtime");

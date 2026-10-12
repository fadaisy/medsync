import { PHARMACY_SIGNED_COPY } from "@/content/pharmacy";
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

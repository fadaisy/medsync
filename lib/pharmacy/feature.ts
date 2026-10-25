import { PHARMACY_PHASE1_COPY, PHARMACY_SIGNED_COPY } from "@/content/pharmacy";
import { NATIONAL_LIST_COPY } from "@/content/pharmacy-catalogue";
import { PHARMACY_CLINICAL_COPY } from "@/content/pharmacy-clinical";
import { PHARMACY_STORES_COPY } from "@/content/pharmacy-stores";
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

/**
 * The national list from Stock (ADR 0282): where dispensing is live, and in production only once both
 * the Phase 1 wording and the page's own (NATIONAL_LIST_COPY) are signed.
 */
export const pharmacyNationalListLiveFor = (hospitalId: string) =>
  workspaceLiveFor(
    process.env.PHARMACY_DISPENSING,
    hospitalId,
    [...PHARMACY_PHASE1_COPY, NATIONAL_LIST_COPY],
    "pharmacy_national_list",
  ) && pharmacyWorkspaceLiveFor(hospitalId);

/**
 * Pharmacy Phase 2 (Law 14, D-PH2-24): six per-hospital flags, off by default, each inside the workspace. With all
 * six off, behaviour is the Phase 1 baseline. In production each stays off while the Phase 2 wording is draft.
 * Each location also goes live on its own (5.12): a flag never switches a location on.
 */
const stores = (value: string | undefined, hospitalId: string, tag: string) =>
  workspaceLiveFor(value, hospitalId, [PHARMACY_STORES_COPY], tag) &&
  pharmacyWorkspaceLiveFor(hospitalId);

export const pharmacyStoreLiveFor = (h: string) =>
  stores(process.env.PHARMACY_STORE, h, "pharmacy_store");
export const pharmacyWardStockLiveFor = (h: string) =>
  stores(process.env.PHARMACY_WARD_STOCK, h, "pharmacy_ward_stock");
export const pharmacyCartsLiveFor = (h: string) =>
  stores(process.env.PHARMACY_CARTS, h, "pharmacy_carts");
export const pharmacyRecallLiveFor = (h: string) =>
  stores(process.env.PHARMACY_RECALL, h, "pharmacy_recall");
export const pharmacyMonthEndLiveFor = (h: string) =>
  stores(process.env.PHARMACY_MONTH_END, h, "pharmacy_month_end");
export const pharmacyOrderingLiveFor = (h: string) =>
  stores(process.env.PHARMACY_ORDERING, h, "pharmacy_ordering");

export interface StoresFlags {
  store: boolean;
  wardStock: boolean;
  carts: boolean;
  recall: boolean;
  monthEnd: boolean;
  ordering: boolean;
}
export const storesFlagsFor = (h: string): StoresFlags => ({
  store: pharmacyStoreLiveFor(h),
  wardStock: pharmacyWardStockLiveFor(h),
  carts: pharmacyCartsLiveFor(h),
  recall: pharmacyRecallLiveFor(h),
  monthEnd: pharmacyMonthEndLiveFor(h),
  ordering: pharmacyOrderingLiveFor(h),
});

/**
 * Pharmacy Phase 3 (Law 14): five per-hospital flags, off by default, each inside the workspace. The first merge
 * builds `PHARMACY_INTERACTIONS` and `PHARMACY_INTERVENTION_REVIEW`. In production each stays off while the
 * Phase 3 wording is draft. With all off, behaviour matches the Phase 1 baseline, the notice included.
 */
const clinical = (value: string | undefined, hospitalId: string, tag: string) =>
  workspaceLiveFor(value, hospitalId, [PHARMACY_CLINICAL_COPY], tag) &&
  pharmacyWorkspaceLiveFor(hospitalId);

export const pharmacyInteractionsLiveFor = (h: string) =>
  clinical(process.env.PHARMACY_INTERACTIONS, h, "pharmacy_interactions");
export const pharmacyInterventionReviewLiveFor = (h: string) =>
  clinical(process.env.PHARMACY_INTERVENTION_REVIEW, h, "pharmacy_intervention_review");
export const pharmacyStewardshipLiveFor = (h: string) =>
  clinical(process.env.PHARMACY_STEWARDSHIP, h, "pharmacy_stewardship");
export const pharmacyReactionsLiveFor = (h: string) =>
  clinical(process.env.PHARMACY_REACTIONS, h, "pharmacy_reactions");
/** Clinical content shows when any Phase 3 flag is on (5.1). */
export const anyClinicalLiveFor = (h: string) =>
  pharmacyInteractionsLiveFor(h) ||
  pharmacyInterventionReviewLiveFor(h) ||
  pharmacyStewardshipLiveFor(h) ||
  pharmacyReactionsLiveFor(h);

import { PHARMACY_PHASE1_COPY, PHARMACY_SIGNED_COPY } from "@/content/pharmacy";
import { CATALOGUE_COPY, NATIONAL_LIST_COPY } from "@/content/pharmacy-catalogue";
import { PHARMACY_CLINICAL_COPY } from "@/content/pharmacy-clinical";
import { PHARMACY_NETWORK_COPY } from "@/content/pharmacy-network";
import { PHARMACY_RECONCILIATION_COPY } from "@/content/pharmacy-reconciliation";
import { PHARMACY_REWORK_COPY } from "@/content/pharmacy-rework";
import { PHARMACY_STORES_COPY } from "@/content/pharmacy-stores";
import { PHWS2_COPY_STATUS } from "@/content/pharmacy-workspace-v2";
import { pharmacyDevHospital } from "@/lib/pharmacy/access";
import { workspaceLiveFor as liveFor } from "@/lib/workspace-access/flag";

/** ADR 0468: a PHARMACY_DEV_HOSPITALS test hospital sees every pharmacy area in production while its wording is draft. */
const workspaceLiveFor = (...[value, hospitalId, notices, tag]: Parameters<typeof liveFor>) =>
  liveFor(value, hospitalId, pharmacyDevHospital(hospitalId) ? [] : notices, tag);

/**
 * Rework (L5): four pilot tiers replace the 21 flags. PHARMACY_CORE (dispensing, stock, store, counts, controls,
 * records), PHARMACY_WARDS (ward stock, carts, inpatients), PHARMACY_EPI (immunisation) and PHARMACY_INSIGHTS
 * (stewardship, reactions, reports). Each is "1" or hospital ids. The old flag is read only while its tier is unset,
 * so a deploy before the env change keeps today's behaviour.
 */
export type PharmacyTier = "CORE" | "WARDS" | "EPI" | "INSIGHTS";
export function tier(t: PharmacyTier, legacy?: string): string | undefined {
  return process.env[`PHARMACY_${t}`] ?? (legacy ? process.env[`PHARMACY_${legacy}`] : undefined);
}

/** The legacy flag each tier falls back to while its tier is unset. */
const TIER_LEGACY: Record<PharmacyTier, string | undefined> = {
  CORE: "WORKSPACE",
  WARDS: "WARD_STOCK",
  EPI: undefined,
  INSIGHTS: "STEWARDSHIP",
};

/** Which tiers are on for a hospital; the rework's own copy gates production (signed-content rule). */
export const pharmacyTiersFor = (hospitalId: string) => {
  const on = (t: PharmacyTier) =>
    workspaceLiveFor(
      tier(t, TIER_LEGACY[t]),
      hospitalId,
      [PHARMACY_REWORK_COPY],
      `pharmacy_${t.toLowerCase()}`,
    );
  const core = on("CORE");
  return {
    core,
    wards: core && on("WARDS"),
    epi: core && on("EPI"),
    insights: core && on("INSIGHTS"),
  };
};

/**
 * PHARMACY_WORKSPACE (Pharmacy Phase 0, Law 14): "1" or a comma-separated list of hospital ids.
 * Off by default; with it off, sign-in and /clinician behave as before and /pharmacy is not found.
 * CS-5: in production it stays off while any pharmacy safety wording is unsigned.
 */
export function pharmacyWorkspaceLiveFor(hospitalId: string): boolean {
  return workspaceLiveFor(
    tier("CORE", "WORKSPACE"),
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
  live(tier("CORE", "DISPENSING"), hospitalId, "pharmacy_dispensing");
export const pharmacyStockAnswerLiveFor = (hospitalId: string) =>
  live(tier("CORE", "STOCK_ANSWER"), hospitalId, "pharmacy_stock_answer");
export const pharmacyPatientListLiveFor = (hospitalId: string) =>
  live(tier("CORE", "PATIENT_LIST"), hospitalId, "pharmacy_patient_list");
export const pharmacyDowntimeLiveFor = (hospitalId: string) =>
  live(tier("CORE", "DOWNTIME"), hospitalId, "pharmacy_downtime");

/**
 * The national list from Stock (ADR 0282): where dispensing is live, and in production only once both
 * the Phase 1 wording and the page's own (NATIONAL_LIST_COPY) are signed.
 */
export const pharmacyNationalListLiveFor = (hospitalId: string) =>
  workspaceLiveFor(
    tier("CORE", "DISPENSING"),
    hospitalId,
    [...PHARMACY_PHASE1_COPY, NATIONAL_LIST_COPY],
    "pharmacy_national_list",
  ) && pharmacyWorkspaceLiveFor(hospitalId);

/**
 * The shared medicines catalogue in Set-up (ADR 0456): PHARMACY_CATALOGUE, "1" or hospital ids, off by default, inside
 * the workspace; needs migrations 0251–0253. In production it stays off while its wording (CATALOGUE_COPY) is draft.
 */
export const pharmacyCatalogueLiveFor = (hospitalId: string) =>
  workspaceLiveFor(tier("CORE", "CATALOGUE"), hospitalId, [CATALOGUE_COPY], "pharmacy_catalogue") &&
  pharmacyWorkspaceLiveFor(hospitalId);

/**
 * Pharmacy Phase 2 (Law 14, D-PH2-24): six per-hospital flags, off by default, each inside the workspace. With all
 * six off, behaviour is the Phase 1 baseline. In production each stays off while the Phase 2 wording is draft.
 * Each location also goes live on its own (5.12): a flag never switches a location on.
 */
const stores = (value: string | undefined, hospitalId: string, tag: string) =>
  workspaceLiveFor(value, hospitalId, [PHARMACY_STORES_COPY], tag) &&
  pharmacyWorkspaceLiveFor(hospitalId);

export const pharmacyStoreLiveFor = (h: string) =>
  stores(tier("CORE", "STORE"), h, "pharmacy_store");
export const pharmacyWardStockLiveFor = (h: string) =>
  stores(tier("WARDS", "WARD_STOCK"), h, "pharmacy_ward_stock");
export const pharmacyCartsLiveFor = (h: string) =>
  stores(tier("WARDS", "CARTS"), h, "pharmacy_carts");
export const pharmacyRecallLiveFor = (h: string) =>
  stores(tier("CORE", "RECALL"), h, "pharmacy_recall");
export const pharmacyMonthEndLiveFor = (h: string) =>
  stores(tier("CORE", "MONTH_END"), h, "pharmacy_month_end");
export const pharmacyOrderingLiveFor = (h: string) =>
  stores(tier("CORE", "ORDERING"), h, "pharmacy_ordering");

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
  clinical(tier("CORE", "INTERACTIONS"), h, "pharmacy_interactions");
export const pharmacyInterventionReviewLiveFor = (h: string) =>
  clinical(tier("CORE", "INTERVENTION_REVIEW"), h, "pharmacy_intervention_review");
export const pharmacyStewardshipLiveFor = (h: string) =>
  clinical(tier("INSIGHTS", "STEWARDSHIP"), h, "pharmacy_stewardship");
export const pharmacyReactionsLiveFor = (h: string) =>
  clinical(tier("INSIGHTS", "REACTIONS"), h, "pharmacy_reactions");
/** Step 9: also off in production while its own wording (the patient's sheet among it) is draft. */
export const pharmacyReconciliationLiveFor = (h: string) =>
  clinical(tier("WARDS", "RECONCILIATION"), h, "pharmacy_reconciliation") &&
  workspaceLiveFor(
    tier("WARDS", "RECONCILIATION"),
    h,
    [PHARMACY_RECONCILIATION_COPY],
    "pharmacy_reconciliation",
  );
/** Clinical content shows when any Phase 3 flag is on (5.1). */
export const anyClinicalLiveFor = (h: string) =>
  pharmacyReconciliationLiveFor(h) ||
  pharmacyInteractionsLiveFor(h) ||
  pharmacyInterventionReviewLiveFor(h) ||
  pharmacyStewardshipLiveFor(h) ||
  pharmacyReactionsLiveFor(h);

/**
 * Pharmacy Phase 4 (Law 15): per-hospital flags, off by default, each inside the workspace. The first merge builds
 * `PHARMACY_REPEATS` (the prescriber's Repeats step and renewal requests) and `PHARMACY_REFILLS` (refills at the
 * hospital). In production each stays off while the Phase 4 wording is draft. With all off, behaviour matches the
 * Phase 1 baseline. Each also does nothing useful while its Appendix D pack is unsigned (lib/pharmacy/network-packs.ts).
 */
const network = (value: string | undefined, hospitalId: string, tag: string) =>
  workspaceLiveFor(value, hospitalId, [PHARMACY_NETWORK_COPY], tag) &&
  pharmacyWorkspaceLiveFor(hospitalId);

export const pharmacyRepeatsLiveFor = (h: string) =>
  network(tier("CORE", "REPEATS"), h, "pharmacy_repeats");
/** Refills need repeats (a refill is supplied only against an authorisation, Law 2) and Phase 1's dispensing. */
export const pharmacyRefillsLiveFor = (h: string) =>
  network(tier("CORE", "REFILLS"), h, "pharmacy_refills") &&
  pharmacyRepeatsLiveFor(h) &&
  pharmacyDispensingLiveFor(h);

/**
 * Pharmacy Workspace v2 (docs/pharmacy/workspace-v2/gate-a-proposal.md, D-PW-09): "1" or a comma-separated list of
 * hospital ids. Off, /pharmacy is the Phase 1–4 interface exactly. In production it stays off while the v2 wording
 * (content/pharmacy-workspace-v2) is draft, as the lab's LAB_WORKSPACE_V2 did.
 */
export const pharmacyWorkspaceV2LiveFor = (h: string) =>
  workspaceLiveFor(tier("CORE", "WORKSPACE_V2"), h, [PHWS2_COPY_STATUS], "pharmacy_workspace_v2") &&
  pharmacyWorkspaceLiveFor(h);

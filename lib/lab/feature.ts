import { CRITICAL_FLAGGING_NOTICE } from "@/content/lab";
import { CRITICALS_COPY_STATUS } from "@/content/lab-criticals";
import { LAB2_COPY_STATUS } from "@/content/lab-phase-2";
import { LAB3_COPY_STATUS } from "@/content/lab-phase-3";
import { workspaceLiveFor } from "@/lib/workspace-access/flag";

/**
 * LAB_WORKSPACE (Lab Phase 0, Law 11): the lab front door — shell, section worklist, Released
 * today, Rejected and the critical-flagging notice. "1" turns it on everywhere, or a
 * comma-separated list of hospital ids turns it on there (the EMR_V1 form). Off by default; with it
 * off /lab is exactly what it was.
 *
 * CF-3: in production it stays off while the notice wording is unsigned, whatever the variable
 * says, so no hospital ever sees the workspace without signed safety wording.
 */
export function labWorkspaceLiveFor(hospitalId: string): boolean {
  return workspaceLiveFor(
    process.env.LAB_WORKSPACE,
    hospitalId,
    [CRITICAL_FLAGGING_NOTICE],
    "lab_workspace",
  );
}

/**
 * Lab Phase 1 (Law 14): three per-hospital flags, off by default, each inside the lab workspace.
 * With all three off, /lab and the doctor's screens are exactly the Phase 0 baseline. Production
 * readiness that depends on data — signed response times, a level-1 contact for every live
 * department, a unit on every orderable test — is checked where the database is at hand
 * (lib/lab/criticals/readiness.ts) and refuses the flag in production.
 */
export const labCriticalsLiveFor = (hospitalId: string) =>
  // S19: never in production while the alert wording (Appendix A) is a draft.
  workspaceLiveFor(
    process.env.LAB_CRITICALS,
    hospitalId,
    [CRITICALS_COPY_STATUS],
    "lab_criticals",
  ) && labWorkspaceLiveFor(hospitalId);
export const labUnitsRangesLiveFor = (hospitalId: string) =>
  workspaceLiveFor(process.env.LAB_UNITS_RANGES, hospitalId, [], "lab_units_ranges") &&
  labWorkspaceLiveFor(hospitalId);
export const labDowntimeLiveFor = (hospitalId: string) =>
  workspaceLiveFor(process.env.LAB_DOWNTIME, hospitalId, [], "lab_downtime") &&
  labWorkspaceLiveFor(hospitalId);

/**
 * Lab Phase 2 (one menu, one record; gate-a-proposal §8): eight per-hospital flags, off by default. Each
 * needs the lab workspace except the NCD feed, and all stay off in production while the Phase 2 copy
 * (Appendix A) is unsigned. With all eight off, behaviour is Phase 1's.
 */
const phase2 = (v: string | undefined, tag: string, hospitalId: string, needsLab = true) =>
  workspaceLiveFor(v, hospitalId, [LAB2_COPY_STATUS], tag) &&
  (!needsLab || labWorkspaceLiveFor(hospitalId));
export const labCatalogueV2LiveFor = (h: string) =>
  phase2(process.env.LAB_CATALOGUE_V2, "lab_catalogue_v2", h);
export const labOneMenuLiveFor = (h: string) => phase2(process.env.LAB_ONE_MENU, "lab_one_menu", h);
export const labPaymentLiveFor = (h: string) => phase2(process.env.LAB_PAYMENT, "lab_payment", h);
export const labCollectionCheckLiveFor = (h: string) =>
  phase2(process.env.LAB_COLLECTION_CHECK, "lab_collection_check", h);
export const labBenchLiveFor = (h: string) => phase2(process.env.LAB_BENCH, "lab_bench", h);
export const labHighRiskLiveFor = (h: string) =>
  phase2(process.env.LAB_HIGH_RISK, "lab_high_risk", h);
export const labBedsideLiveFor = (h: string) => phase2(process.env.LAB_BEDSIDE, "lab_bedside", h);
export const ncdLabFeedLiveFor = (h: string) =>
  phase2(process.env.NCD_LAB_FEED, "ncd_lab_feed", h, false);

/** §5.14: Lab settings holds catalogue v2, payment, high-risk and bedside settings: open with any of them. */
export const labSettingsLiveFor = (h: string) =>
  labCatalogueV2LiveFor(h) || labPaymentLiveFor(h) || labHighRiskLiveFor(h) || labBedsideLiveFor(h);

/**
 * Lab Phase 3 (registers, reports and quality; gate-a-proposal §13): eight per-hospital flags, off by default,
 * each inside the lab workspace and each off in production while the Phase 3 copy (Appendix A) is a draft.
 * With all eight off, behaviour is Phase 2's (bedside lots are read from the stock ledger, same ids).
 */
const phase3 = (v: string | undefined, tag: string, h: string) =>
  workspaceLiveFor(v, h, [LAB3_COPY_STATUS], tag) && labWorkspaceLiveFor(h);
export const labStockLiveFor = (h: string) => phase3(process.env.LAB_STOCK, "lab_stock", h);
export const labEquipmentLiveFor = (h: string) =>
  phase3(process.env.LAB_EQUIPMENT, "lab_equipment", h);
export const labQcLiveFor = (h: string) =>
  phase3(process.env.LAB_QC, "lab_qc", h) && labStockLiveFor(h) && labUnitsRangesLiveFor(h);
export const labQcHoldLiveFor = (h: string) =>
  phase3(process.env.LAB_QC_HOLD, "lab_qc_hold", h) && labQcLiveFor(h);
export const labEqaLiveFor = (h: string) => phase3(process.env.LAB_EQA, "lab_eqa", h);
export const labPoctQualityLiveFor = (h: string) =>
  phase3(process.env.LAB_POCT_QUALITY, "lab_poct_quality", h) &&
  labBedsideLiveFor(h) &&
  labStockLiveFor(h);
export const labHmisLiveFor = (h: string) => phase3(process.env.LAB_HMIS, "lab_hmis", h);
export const labReportsLiveFor = (h: string) => phase3(process.env.LAB_REPORTS, "lab_reports", h);

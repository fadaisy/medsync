import { CRITICAL_FLAGGING_NOTICE } from "@/content/lab";
import { CRITICALS_COPY_STATUS } from "@/content/lab-criticals";
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

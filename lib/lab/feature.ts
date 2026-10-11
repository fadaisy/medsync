import { CRITICAL_FLAGGING_NOTICE } from "@/content/lab";
import { CRITICALS_COPY_STATUS } from "@/content/lab-criticals";

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
  if (!envOn("LAB_WORKSPACE", hospitalId)) return false;
  return !blockedUnsigned();
}

/** "1", or a comma-separated list of hospital ids (the EMR_V1 form). */
function envOn(name: string, hospitalId: string): boolean {
  const value = process.env[name]?.trim();
  if (!value) return false;
  return value === "1" || value.split(",").some((id) => id.trim() === hospitalId);
}

/**
 * Lab Phase 1 (Law 14): three per-hospital flags, off by default, each inside the lab workspace.
 * With all three off, /lab and the doctor's screens are exactly the Phase 0 baseline. Production
 * readiness that depends on data — signed wording, signed response times, a level-1 contact for
 * every live department, a unit on every orderable test — is checked where the database is at hand
 * (lib/lab/criticals/readiness.ts, lib/lab/catalogue-readiness.ts) and refuses the flag in production.
 */
export const labCriticalsLiveFor = (hospitalId: string) =>
  envOn("LAB_CRITICALS", hospitalId) &&
  labWorkspaceLiveFor(hospitalId) &&
  // S19: never in production while the alert wording (Appendix A) is a draft.
  !(process.env.VERCEL_ENV === "production" && CRITICALS_COPY_STATUS.status !== "signed");
export const labUnitsRangesLiveFor = (hospitalId: string) =>
  envOn("LAB_UNITS_RANGES", hospitalId) && labWorkspaceLiveFor(hospitalId);
export const labDowntimeLiveFor = (hospitalId: string) =>
  envOn("LAB_DOWNTIME", hospitalId) && labWorkspaceLiveFor(hospitalId);

let warned = false;
function blockedUnsigned(): boolean {
  if (process.env.VERCEL_ENV !== "production") return false;
  if (CRITICAL_FLAGGING_NOTICE.status === "signed") return false;
  if (!warned) {
    warned = true;
    console.warn("lab_workspace.blocked_unsigned_notice");
  }
  return true;
}

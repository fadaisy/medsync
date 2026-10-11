import { CRITICAL_FLAGGING_NOTICE } from "@/content/lab";

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
  const value = process.env.LAB_WORKSPACE?.trim();
  if (!value) return false;
  if (value !== "1" && !value.split(",").some((id) => id.trim() === hospitalId)) return false;
  return !blockedUnsigned();
}

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

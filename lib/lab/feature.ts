import { CRITICAL_FLAGGING_NOTICE } from "@/content/lab";
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

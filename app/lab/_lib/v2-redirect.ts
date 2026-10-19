import "server-only";

import { permanentRedirect } from "next/navigation";

import { withQuery } from "@/lib/lab/redirects";
import { labV2 } from "./places";

export { withQuery };

export type SP = Record<string, string | string[] | undefined>;

/**
 * Lab Workspace v2 (prompt Section 8, D-UI-09): an old lab route answers 308 to its new home while the v2 flag
 * is on for the viewer's hospital, and renders as before while it is off. At Step 11 the old route files go
 * and the same map lives in next.config.ts `redirects()`.
 */
export async function redirectIfV2(target: string, sp?: SP | Promise<SP>): Promise<void> {
  if (!(await labV2()).live) return;
  permanentRedirect(withQuery(target, await sp));
}

import "server-only";

import { redirect } from "next/navigation";

import { pharmacyV2 } from "./v2";

type SP = Record<string, string | string[] | undefined>;

/**
 * D-PW-09: an old list page sends the viewer to its new home while PHARMACY_WORKSPACE_V2 is on. A temporary (307)
 * redirect, so switching the flag off brings the old page straight back; the query string is carried across.
 */
export async function toV2(target: string, sp?: SP) {
  if (!(await pharmacyV2()).live) return;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp ?? {}))
    for (const x of Array.isArray(v) ? v : v === undefined ? [] : [v]) q.append(k, x);
  const extra = q.toString();
  redirect(extra ? `${target}${target.includes("?") ? "&" : "?"}${extra}` : target);
}

import "server-only";

/**
 * Is Resus Desk v2 live?
 *
 * Migration 0068 is an owner action; until it is applied and this flag is set,
 * the resus routes render the v1 desk and board exactly as before. Set
 * `RESUS_DESK_V2=1` after `npm run db:migrate` to switch every resus route (nurse
 * and doctor) to v2 — and, with it, the v2 clinical content (the ALS console,
 * post-ROSC bundle, termination review, level-of-care suggestion). That content
 * reads only signed reference entries (Law 3): a test fails the build if any
 * entry reachable from v2 is not signed.
 */
export function resusDeskV2(): boolean {
  return process.env.RESUS_DESK_V2 === "1";
}

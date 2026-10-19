/**
 * Lab Workspace v2 redirect map (prompt Section 8, gate-a §3; ADR 0349). Every old lab route and its new home.
 * In `next.config.ts` `redirects()` form: `permanent: true` answers 308 and Next keeps the query string, adding
 * the destination's own parameters. `/lab` itself is not here: it lands by role (lead → Today, others → Bench).
 */
export interface LabRedirect {
  source: string;
  destination: string;
  permanent: true;
}

const r = (source: string, destination: string): LabRedirect => ({
  source,
  destination,
  permanent: true,
});

export const LAB_REDIRECTS: readonly LabRedirect[] = [
  r("/lab/results/:orderId", "/lab/bench/:orderId"),
  r("/lab/released", "/lab/bench?stage=released"),
  r("/lab/rejected", "/lab/bench?stage=rejected"),
  r("/lab/older", "/lab/bench/older"),
  r("/lab/criticals", "/lab/needs-you?filter=results"),
  r("/lab/criticals/:alertId", "/lab/needs-you/criticals/:alertId"),
  r("/lab/downtime", "/lab/bench/downtime"),
  r("/lab/downtime/print", "/lab/bench/downtime/print"),
  r("/lab/refer", "/lab/send-outs?tab=board"),
  r("/lab/refer/manifests/:id/print", "/lab/send-outs/manifests/:id/print"),
  r("/lab/referrals", "/lab/send-outs?tab=board"),
  r("/lab/referrals/:id/result", "/lab/send-outs/:id/result"),
  r("/lab/exchange", "/lab/send-outs?tab=connections"),
  r("/lab/exchange/partners", "/lab/send-outs?tab=partners"),
  r("/lab/exchange/matches", "/lab/send-outs?tab=match"),
  r("/lab/exchange/analysers", "/lab/setup/analysers"),
  r("/lab/quality/qc", "/lab/quality?tab=plans"),
  r("/lab/quality/eqa", "/lab/quality?tab=eqa"),
  r("/lab/quality/bedside", "/lab/quality?tab=bedside"),
  r("/lab/quality/nonconformities", "/lab/quality?tab=nc"),
  r("/lab/quality/nonconformities/:id", "/lab/quality/nc/:id"),
  r("/lab/stock", "/lab/quality?tab=stock"),
  r("/lab/stock/order", "/lab/quality/stock/order"),
  r("/lab/stock/receive", "/lab/quality/stock/receive"),
  r("/lab/equipment", "/lab/quality?tab=equipment"),
  r("/lab/register", "/lab/reports?tab=register"),
  r("/lab/hmis", "/lab/reports?tab=hmis"),
  r("/lab/hmis/print", "/lab/reports/hmis/print"),
  r("/lab/hmis/records", "/lab/reports/hmis/records"),
  r("/lab/hmis/mapping", "/lab/setup/hmis-mapping"),
];

/** Old routes that keep their path (the new place renders there): Quality today, Lab reports, QC run, set-up. */
export const LAB_KEPT_PATHS: readonly string[] = [
  "/lab/quality",
  "/lab/quality/qc/run",
  "/lab/reports",
  "/lab/reports/records",
  "/lab/setup/catalogue",
  "/lab/setup/criticals",
  "/lab/setup/delta",
  "/lab/setup/demo",
  "/lab/setup/drafts",
  "/lab/setup/limits",
  "/lab/setup/menu",
  "/lab/setup/patient-release",
  "/lab/setup/profiles",
  "/lab/setup/ranges",
  "/lab/setup/settings",
];

export type SP = Record<string, string | string[] | undefined>;

/** Joins a target with the old page's query: the target's own parameters win, the rest are kept (Law 3). */
export function withQuery(target: string, sp: SP = {}): string {
  const [path, query = ""] = target.split("?");
  const out = new URLSearchParams(query);
  for (const [k, v] of Object.entries(sp)) {
    if (v === undefined || out.has(k)) continue;
    for (const one of Array.isArray(v) ? v : [v]) out.append(k, one);
  }
  const q = out.toString();
  return q ? `${path}?${q}` : path!;
}

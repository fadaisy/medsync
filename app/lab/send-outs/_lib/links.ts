/**
 * Where a send-outs view links, in v2 (`/lab/send-outs?tab=…`) and in the old routes still served while the v2
 * flag is off (they go at Step 11). One map, so a view renders the same in both.
 */
export function soLinks(v2: boolean) {
  return {
    board: v2 ? "/lab/send-outs?tab=board" : "/lab/referrals",
    manifests: v2 ? "/lab/send-outs?tab=manifests" : "/lab/refer",
    match: v2 ? "/lab/send-outs?tab=match" : "/lab/exchange/matches",
    partners: v2 ? "/lab/send-outs?tab=partners" : "/lab/exchange/partners",
    connections: v2 ? "/lab/send-outs?tab=connections" : "/lab/exchange",
    print: (id: string) =>
      v2 ? `/lab/send-outs/manifests/${id}/print` : `/lab/refer/manifests/${id}/print`,
    result: (id: string) => (v2 ? `/lab/send-outs/${id}/result` : `/lab/referrals/${id}/result`),
  };
}
export type SoLinks = ReturnType<typeof soLinks>;

/** `base` with these query values set (null or "" removes one). */
export function hrefWith(base: string, params: Record<string, string | null | undefined>): string {
  const [path, query = ""] = base.split("?");
  const q = new URLSearchParams(query);
  for (const [k, v] of Object.entries(params)) {
    if (v) q.set(k, v);
    else q.delete(k);
  }
  const s = q.toString();
  return s ? `${path}?${s}` : path!;
}

import "server-only";

import type { labV2 } from "./places";
import { cache } from "react";

import { orderNeedsYou, scopeNeedsYou } from "@/lib/lab/needs-you";
import { loadNeedsYou } from "@/lib/lab/needs-you-read";
import { requestNow } from "@/lib/lab/page-data";

/** Needs you for this viewer, once per request: the top bar's count and the page read the same list (NY-4). */
export const needsYouFor = cache(async (v2: Awaited<ReturnType<typeof labV2>>) => {
  const { scope, flags } = v2;
  const p = scope.access.permissions;
  const items = await loadNeedsYou(
    scope.hospitalId,
    scope.userId,
    {
      criticals: !!flags.criticals,
      delta: !!flags.deltaChecks,
      qc: !!flags.qc,
      referral: !!flags.referral,
      stock: !!flags.stock,
      manage: p.has("lab.manage"),
    },
    requestNow(),
  );
  return orderNeedsYou(
    scopeNeedsYou(items, {
      manage: p.has("lab.manage"),
      resolveMatch: p.has("lab.match.resolve") || p.has("lab.manage"),
      stock: p.has("lab.stock.manage") || p.has("lab.manage"),
    }),
  );
});

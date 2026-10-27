import "server-only";

import type { PharmacyV2 } from "./v2";
import type { EmrDb } from "@/lib/emr/db";
import type { NeedsYouItem, NeedsYouKind, NeedsYouSources } from "@/lib/pharmacy/workspace-v2/needs-you";
import { cache } from "react";

import { db } from "@/db";
import { asClinicalReader } from "@/lib/emr/db";
import { logger } from "@/lib/logger";
import { listReports } from "@/lib/pharmacy/clinical/reaction-read";
import { listReconciliations } from "@/lib/pharmacy/clinical/reconciliation-read";
import { getControlledRegister } from "@/lib/pharmacy/controlled-read";
import { countSheetsToEnter } from "@/lib/pharmacy/downtime-store";
import { packRows } from "@/lib/pharmacy/stores/packs";
import { getDeliveriesPage, getIssuesPage } from "@/lib/pharmacy/stores/store-read";
import { getLookBack } from "@/lib/pharmacy/supply/read";
import { buildNeedsYou, needsYouKinds } from "@/lib/pharmacy/workspace-v2/needs-you";

/**
 * The Needs you list for this viewer (GATE A §7): only items someone with the viewer's permissions acts on, read
 * through the existing loaders (step-0/data-sources.md). The shell's count is the length of this same list.
 * ponytail: the shell runs these loaders on every pharmacy page; add count-only reads if the timings show it.
 */
export const needsYouFor = cache(async (v2: PharmacyV2): Promise<NeedsYouItem[]> => {
  const kinds = new Set(
    needsYouKinds({
      permissions: v2.permissions,
      tabs: new Set(v2.tabs.map((t) => `${t.place}.${t.key}`)),
      acting: !!v2.acting,
    }),
  );
  if (!kinds.size) return [];
  const { scope } = v2;
  const h = scope.hospitalId;
  const now = new Date();
  const on = (k: NeedsYouKind) => kinds.has(k);
  // The shell reads this on every pharmacy page: a source that fails is logged and left out, never the page.
  const read = <T,>(yes: boolean, kind: string, fn: () => Promise<T>): Promise<T | undefined> =>
    yes
      ? fn().catch((e: unknown) => {
          logger.error("pharmacy.needs_you.source_failed", { kind, error: String(e) });
          return undefined;
        })
      : Promise.resolve(undefined);
  const [controlled, lookBack, downtime, deliveries, issues, reactions, reconciliations, packs] =
    await Promise.all([
      read(on("controlled"), "controlled", () =>
        getControlledRegister(h, v2.acting!.id, null).then((r) => r.differences),
      ),
      read(on("lookBack"), "lookBack", () => getLookBack(h)),
      read(on("downtime"), "downtime", () => countSheetsToEnter(h)),
      read(on("delivery"), "delivery", () => getDeliveriesPage(scope).then((d) => d.deliveries)),
      read(on("requisition") || on("confirm"), "issues", () => getIssuesPage(scope)),
      read(on("reaction"), "reaction", () =>
        asClinicalReader(scope, (tx) => listReports(tx, h, now)),
      ),
      // On the app connection, as the Reconciliation page reads it (the clinical reader has no grant on admissions).
      read(on("reconciliation"), "reconciliation", () =>
        listReconciliations(db as unknown as EmrDb, h, now),
      ),
      read(on("pack"), "pack", () => asClinicalReader(scope, (tx) => packRows(tx, h))),
    ]);
  const sources: NeedsYouSources = {
    controlled,
    lookBack,
    downtime,
    deliveries,
    requisitions: on("requisition") ? issues?.requisitions : undefined,
    toConfirm: on("confirm") ? issues?.toConfirm : undefined,
    reactions,
    reconciliations,
    packs,
  };
  return buildNeedsYou(sources);
});

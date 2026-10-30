import "server-only";

import type { TodayItem, TodayKind, TodayRole } from "@/lib/pharmacy/derive/today-types";
import type { NeedsYouKind } from "@/lib/pharmacy/workspace-v2/needs-you";

import { TODAY } from "@/content/pharmacy-rework-daily";
import { fill } from "@/content/pharmacy-workspace-v2";
import { PHWS2_NEEDS_YOU as N } from "@/content/pharmacy-workspace-v2-needs-you";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import { managesPharmacy } from "@/lib/pharmacy/downtime-store";
import { countTab } from "@/lib/pharmacy/stores/count-sheet-read";
import { needsYouFor } from "../../_lib/needs-you";
import { pharmacyV2 } from "../../_lib/v2";

/** The existing needs-you sources, in the rework's item kinds. */
const KIND: Record<NeedsYouKind, TodayKind> = {
  controlled: "cd",
  lookBack: "paper",
  downtime: "sheet",
  delivery: "delivery",
  requisition: "req",
  confirm: "transit",
  reaction: "mar",
  reconciliation: "mar",
  pack: "approve",
};

const text = (k: NeedsYouKind, n: number) => {
  const t = N.text[k];
  return typeof t === "string" ? t : fill(n === 1 ? t.one : t.many, { n });
};

/** Every Today item from the daily-work areas, and the viewer's role (rework PRD §6.1). */
export async function todayFeed(): Promise<{ role: TodayRole; items: TodayItem[] }> {
  const actor = await requirePharmacyActor();
  const [v2, manages, counts] = await Promise.all([
    pharmacyV2(),
    managesPharmacy(actor.userId, actor.hospitalId),
    countTab(actor.hospitalId),
  ]);
  const needs = await needsYouFor(v2);
  const role: TodayRole = manages
    ? "incharge"
    : /STORE/i.test(actor.cadreCode)
      ? "storekeeper"
      : "pharmacist";
  const items: TodayItem[] = needs.map((n) => ({
    kind: KIND[n.kind],
    key: `${n.kind}:${n.id}`,
    title: text(n.kind, n.n),
    meta: n.detail ?? "",
    action: N.actions[n.kind],
    href: n.href,
    late: n.attention,
  }));
  for (const s of counts.sheets) {
    const run = s.status === "counting";
    if (!run && s.status !== "approval") continue;
    items.push({
      kind: run ? "countrun" : "approve",
      key: `count:${s.id}`,
      title: fill(run ? TODAY.count.run : TODAY.count.approve, { label: s.label }),
      meta: run ? TODAY.count.runMeta : TODAY.count.approveMeta,
      action: run ? TODAY.count.continue : TODAY.count.review,
      href: `/pharmacy/stock/store?tab=count&count=${s.id}`,
    });
  }
  return { role, items };
}

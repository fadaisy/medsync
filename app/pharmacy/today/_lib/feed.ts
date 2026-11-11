import "server-only";

import type { TodayItem, TodayKind, TodayRole } from "@/lib/pharmacy/derive/today-types";
import type { NeedsYouKind } from "@/lib/pharmacy/workspace-v2/needs-you";

import { fill } from "@/content/pharmacy-workspace-v2";
import { PHWS2_NEEDS_YOU as N } from "@/content/pharmacy-workspace-v2-needs-you";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import { controlsTodayItems } from "@/lib/pharmacy/cd/today";
import { coldTodayItems } from "@/lib/pharmacy/cold/read";
import { managesPharmacy } from "@/lib/pharmacy/downtime-store";
import { vaxTodayItems } from "@/lib/pharmacy/epi/read";
import { pharmacyTiersFor } from "@/lib/pharmacy/feature";
import { opTodayItems } from "@/lib/pharmacy/op/read";
import { recordsTodayItems } from "@/lib/pharmacy/reports/today";
import { marTodayItems } from "@/lib/pharmacy/wards/read";
import { needsYouFor } from "../../_lib/needs-you";
import { pharmacyV2 } from "../../_lib/v2";

/** The existing needs-you sources, in the rework's item kinds. */
const OWN_AREA = new Set<NeedsYouKind>(["controlled", "lookBack", "downtime"]);
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
  const h = actor.hospitalId;
  const tiers = pharmacyTiersFor(h);
  const none = Promise.resolve([] as TodayItem[]);
  const [v2, manages, ...areas] = await Promise.all([
    pharmacyV2(),
    managesPharmacy(actor.userId, h),
    controlsTodayItems({ hospitalId: h, userId: actor.userId, station: actor.pointId }),
    coldTodayItems(h),
    opTodayItems(h),
    recordsTodayItems(h),
    tiers.wards ? marTodayItems(h) : none,
    tiers.epi ? vaxTodayItems(h) : none,
  ]);
  const needs = await needsYouFor(v2);
  const role: TodayRole = manages
    ? "incharge"
    : /STORE/i.test(actor.cadreCode)
      ? "storekeeper"
      : "pharmacist";
  // Controls and Records bring their own items (P3, P5); the old controlled, look-back and downtime counts would
  // repeat them.
  const items: TodayItem[] = needs
    .filter((n) => !OWN_AREA.has(n.kind))
    .map((n) => ({
      kind: KIND[n.kind],
      key: `${n.kind}:${n.id}`,
      title: text(n.kind, n.n),
      meta: n.detail ?? "",
      action: N.actions[n.kind],
      href: n.href,
      late: n.attention,
    }));
  return { role, items: [...items, ...areas.flat()] };
}

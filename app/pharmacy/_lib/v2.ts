import "server-only";

import type { EmrDb } from "@/lib/emr/db";
import type { PharmacyNavFlags } from "@/lib/pharmacy/nav";
import { cookies } from "next/headers";
import { cache } from "react";

import { db } from "@/db";
import { dispensingMap } from "@/lib/pharmacy/access";
import { POINT_COOKIE } from "@/lib/pharmacy/actor";
import {
  pharmacyCatalogueLiveFor,
  pharmacyDispensingLiveFor,
  pharmacyDowntimeLiveFor,
  pharmacyInteractionsLiveFor,
  pharmacyInterventionReviewLiveFor,
  pharmacyNationalListLiveFor,
  pharmacyReactionsLiveFor,
  pharmacyReconciliationLiveFor,
  pharmacyRefillsLiveFor,
  pharmacyStewardshipLiveFor,
  pharmacyWorkspaceV2LiveFor,
  storesFlagsFor,
} from "@/lib/pharmacy/feature";
import { pharmacyNavFor, pharmacyNavPermissions } from "@/lib/pharmacy/nav";
import { actingPoint, pharmacyPointsFor } from "@/lib/pharmacy/points";
import { requirePharmacyScope } from "@/lib/pharmacy/scope";
import { supplyFlagOn } from "@/lib/pharmacy/stores/supply-action";
import { placesFor } from "@/lib/pharmacy/workspace-v2/places";

/** The pharmacy scope, once per request (the layout and the page both ask). */
export const pharmacyScope = cache(requirePharmacyScope);

/** Every pharmacy flag the navigation reads, once per request (the layout's set, shared with v2). */
export const pharmacyFlagsFor = cache(
  (h: string): PharmacyNavFlags => ({
    dispensing: pharmacyDispensingLiveFor(h),
    downtime: pharmacyDowntimeLiveFor(h),
    refills: pharmacyRefillsLiveFor(h),
    stores: storesFlagsFor(h),
    clinical: {
      interactions: pharmacyInteractionsLiveFor(h),
      interventionReview: pharmacyInterventionReviewLiveFor(h),
      stewardship: pharmacyStewardshipLiveFor(h),
      reactions: pharmacyReactionsLiveFor(h),
      reconciliation: pharmacyReconciliationLiveFor(h),
    },
  }),
);

/**
 * Pharmacy Workspace v2 context for a page (GATE A §3): scope, the v2 flag, the nav permissions, the viewer's
 * places and tabs (from the same nav registry the old sidebar reads), the points and the acting point.
 */
export const pharmacyV2 = cache(async () => {
  const scope = await pharmacyScope();
  const live = pharmacyWorkspaceV2LiveFor(scope.hospitalId);
  const flags = pharmacyFlagsFor(scope.hospitalId);
  const permissions = pharmacyNavPermissions(
    scope.access.permissions,
    scope.cadreCode,
    flags,
    dispensingMap(undefined, scope.hospitalId),
  );
  const navIds = pharmacyNavFor(permissions, flags).map((i) => i.id);
  const { places, tabs } = placesFor({
    navIds,
    dispensing: flags.dispensing,
    nationalList: pharmacyNationalListLiveFor(scope.hospitalId),
    packs: supplyFlagOn("packs", scope.hospitalId),
    catalogue: pharmacyCatalogueLiveFor(scope.hospitalId),
  });
  const points = flags.dispensing
    ? await pharmacyPointsFor(db as unknown as EmrDb, scope.userId, scope.hospitalId)
    : [];
  const acting = points.length
    ? actingPoint(points, (await cookies()).get(POINT_COOKIE)?.value)
    : null;
  return { scope, live, flags, permissions, navIds, places, tabs, points, acting };
});

export type PharmacyV2 = Awaited<ReturnType<typeof pharmacyV2>>;

/** A tab of a place exists for this viewer (pages use it to refuse a view the old nav would not show). */
export const hasTab = (v2: PharmacyV2, place: string, key: string) =>
  v2.tabs.some((t) => t.place === place && t.key === key);

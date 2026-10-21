import "server-only";

import type { EmrDb } from "@/lib/emr/db";

import { db } from "@/db";
import { pharmacyWardStockLiveFor } from "@/lib/pharmacy/feature";
import { recallNotices, wardsOf } from "@/lib/pharmacy/stores/ward-read";

/**
 * The nurse workspace's view of Pharmacy Phase 2 ward stock (5.4, 5.7; Appendix A): only with
 * `pharmacyWardStock` on, and only the wards the nurse holds a ward right at.
 */
export async function nurseHoldsWardRight(scope: { userId: string; hospitalId: string }) {
  if (!pharmacyWardStockLiveFor(scope.hospitalId)) return false;
  return (await wardsOf(db as unknown as EmrDb, scope.hospitalId, scope.userId)).length > 0;
}

/** Recall notices for the nurse's wards: product and batch, never a patient. */
export async function nurseWardNotices(scope: { userId: string; hospitalId: string }) {
  if (!pharmacyWardStockLiveFor(scope.hospitalId)) return [];
  const d = db as unknown as EmrDb;
  const wards = await wardsOf(d, scope.hospitalId, scope.userId);
  const notices = await recallNotices(
    d,
    scope.hospitalId,
    wards.map((w) => w.id),
  );
  return notices.map((n) => ({ ...n, ward: wards.find((w) => w.id === n.locationId)?.name ?? "" }));
}

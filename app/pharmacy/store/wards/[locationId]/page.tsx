import type { EmrDb } from "@/lib/emr/db";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/medsync/page-header";
import { PHARMACY } from "@/content/pharmacy";
import { WARDS } from "@/content/pharmacy-stores-wards";
import { db } from "@/db";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import { pharmacyWardStockLiveFor } from "@/lib/pharmacy/feature";
import {
  confirmersAt,
  getWardStockPage,
  hospitalProducts,
  manages,
} from "@/lib/pharmacy/stores/ward-read";
import { WardStockView } from "../_components/ward-stock-view";
import {
  attestWardSigner,
  raiseWardRequisition,
  recordWardCount,
  setWardLevels,
  setWardSupplyModel,
  signWardLevels,
} from "../actions";

export const dynamic = "force-dynamic";

/**
 * One ward's stock, for pharmacy staff (5.4). `pharmacy.stock` counts, `pharmacy.store` raises a
 * requisition, `pharmacy.manage` sets the supply model and the levels and signs them with the ward's nurse
 * in charge. Receipt and returns are the ward's (Appendix A). Behind `pharmacyWardStock`.
 */
export default async function WardStockPage({
  params,
  searchParams,
}: {
  params: Promise<{ locationId: string }>;
  searchParams: Promise<{ count?: string }>;
}) {
  const actor = await requirePharmacyActor();
  if (!pharmacyWardStockLiveFor(actor.hospitalId)) notFound();
  const { locationId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(locationId)) notFound();
  const d = db as unknown as EmrDb;
  const page = await getWardStockPage(d, actor.hospitalId, locationId, new Date());
  if (!page) notFound();
  const manage = await manages(d, actor.userId, actor.hospitalId);
  const [products, signers] = manage
    ? await Promise.all([
        hospitalProducts(d, actor.hospitalId),
        confirmersAt(d, actor.hospitalId, locationId, "ward_act"),
      ])
    : [[], []];
  const p = actor.access.permissions;
  const base = `/pharmacy/store/wards/${locationId}`;
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
      <PageHeader
        place={PHARMACY.place}
        placeInTopBar
        title={`${WARDS.title} · ${page.location.name}`}
      />
      <WardStockView
        page={page}
        base={base}
        mode={(await searchParams).count ? "count" : "page"}
        me={actor.userId}
        products={products}
        signers={signers}
        actions={{
          count: p.has("pharmacy.stock") ? recordWardCount : undefined,
          requisition: p.has("pharmacy.store") ? raiseWardRequisition : undefined,
          supply: manage ? setWardSupplyModel : undefined,
          levels: manage ? setWardLevels : undefined,
          attestSigner: manage ? attestWardSigner : undefined,
          sign: manage ? signWardLevels : undefined,
        }}
      />
    </div>
  );
}

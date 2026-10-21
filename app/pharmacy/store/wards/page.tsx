import type { EmrDb } from "@/lib/emr/db";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/medsync/page-header";
import { PHARMACY } from "@/content/pharmacy";
import { SUPPLY_MODEL, WARDS } from "@/content/pharmacy-stores-wards";
import { db } from "@/db";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import { pharmacyWardStockLiveFor } from "@/lib/pharmacy/feature";
import { listPlaces, manages, recallNotices, unplacedWards } from "@/lib/pharmacy/stores/ward-read";
import { AddPlaceDialog, TARGET } from "./_components/ward-dialogs";
import { createWardLocation } from "./actions";

export const metadata: Metadata = { title: "Ward stock · Pharmacy" };

export const dynamic = "force-dynamic";

/** 5.4: the wards that keep stock through MedSync, for pharmacy staff. Behind `pharmacyWardStock`. */
export default async function WardsPage() {
  const actor = await requirePharmacyActor();
  if (!pharmacyWardStockLiveFor(actor.hospitalId)) notFound();
  const d = db as unknown as EmrDb;
  const [wards, manage] = await Promise.all([
    listPlaces(d, actor.hospitalId, "ward"),
    manages(d, actor.userId, actor.hospitalId),
  ]);
  const [hubs, notices] = await Promise.all([
    manage ? unplacedWards(d, actor.hospitalId) : Promise.resolve([]),
    recallNotices(
      d,
      actor.hospitalId,
      wards.map((w) => w.id),
    ),
  ]);
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
      <PageHeader
        place={PHARMACY.place}
        placeInTopBar
        title={WARDS.title}
        right={
          manage ? <AddPlaceDialog kind="ward" hubs={hubs} action={createWardLocation} /> : null
        }
      />
      {wards.length === 0 ? (
        <p className="text-body-s text-muted-foreground">{WARDS.noWards}</p>
      ) : (
        <ul className="border-border bg-card divide-border divide-y rounded-lg border">
          {wards.map((w) => {
            const n = notices.filter((x) => x.locationId === w.id).length;
            return (
              <li
                key={w.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-2"
              >
                <span className="text-body-s flex flex-col">
                  <span className="text-foreground font-medium">{w.name}</span>
                  <span className="text-muted-foreground">
                    {w.supplyModel ? SUPPLY_MODEL[w.supplyModel] : WARDS.modeUnset} ·{" "}
                    {w.live ? WARDS.live : WARDS.notLive}
                    {n ? ` · ${WARDS.notices.title}: ${n}` : ""}
                  </span>
                </span>
                <Link
                  href={`/pharmacy/store/wards/${w.id}`}
                  className={`text-body-s text-primary inline-flex ${TARGET} items-center underline-offset-4 hover:underline`}
                >
                  {WARDS.open}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-body-s text-muted-foreground">{WARDS.notOnWard}</p>
    </div>
  );
}
